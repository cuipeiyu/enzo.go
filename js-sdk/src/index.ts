import EventEmitter from 'eventemitter3';

export declare interface Plugin {
  readonly pluginName: string;
  install: (a1: Enzo, a2: messageType) => void;
}

export declare interface Options {
  /** The server address e.g: ws://localhost */
  address: string;

  autoConnect?: boolean;

  /** Automatically try to reconnect when disconnected. default: true */
  alwaysReconnect?: boolean;
}

export const defaults: Options = {
  address: '',
  autoConnect: true,
  alwaysReconnect: true,
};

export enum messageType {
  CloseMessage = 0x01,

  PingMessage = 0x14,
  PongMessage = 0x15,
  PluginMessage = 0x16,

  PostMessage = 0x28,
  BackMessage = 0x29,
}

interface payload {
  messageType: messageType;
  messageId: Uint8Array;
  /** long time operation ? */
  longtime: boolean;
  key?: string;
  data?: Uint8Array;
}

export type Handle = (p: any) => void | Promise<void>;

export class Enzo {
  #opt: Options;

  #ee: EventEmitter;

  #socket: WebSocket;

  #timers: Record<string, number>;

  #heartbeatTimer: number;

  #forceClose: boolean;

  #reconnect: boolean;

  #reconnectAttempts: number;

  #reconnectInterval: number;

  #maxReconnectInterval: number;

  #reconnectDecay: number;

  constructor(opt?: Options) {
    this.#connected = false;
    this.#forceClose = false;

    this.#reconnect = false;
    this.#reconnectAttempts = 0;
    this.#reconnectInterval = 2000;
    this.#maxReconnectInterval = 10 * 1000;
    this.#reconnectDecay = 1.5;

    this.#opt = {
      ...defaults,
      ...opt,
    };

    this.#timers = {};

    this.#ee = new EventEmitter();
    this.offAll();

    if (this.#opt.autoConnect) {
      this.connect();
    }
  }

  public on(key: string, handle: Handle) {
    this.#ee.on(key, handle);
  }

  public off(key: string, handle: Handle) {
    this.#ee.removeListener(key, handle);
  }

  public offAll() {
    this.#ee.removeAllListeners();
    this.#ee.on('ws_open', this.#wsopen.bind(this));
    this.#ee.on('ws_error', this.#wserror.bind(this));
    this.#ee.on('ws_close', this.#wsclose.bind(this));
    this.#ee.on('ws_message', this.#wsmessage.bind(this));
  }

  // make message frame
  // * | base: (1+1+10=4=16) | messageType(1) | longtime(1) | messageId(10) | allLength(4) |
  // ? | data: (4+x+4+x=y)   | keyLength(4)   | key(x)      | dataLength(4) | dataBody(x)  |
  write(msgType: messageType, longtime: boolean, callback: (e: Context | Error) => void, msgId?: Uint8Array, key?: string, data?: any) {
    if (!msgId) msgId = crypto.getRandomValues(new Uint8Array(10));
    const msgid = bufid2string(msgId);

    if (msgType === messageType.PingMessage) {
      this.waitMessageReturn(msgid, longtime ? 0 : 6000, callback);
      this.#socket.send(new Uint8Array([msgType, 0, ...msgId, 0, 0, 0, 0]));
      return;
    }

    let keyBuf: Uint8Array | undefined;
    let dataBuf: Uint8Array | undefined;

    if (key) {
      keyBuf = string2buffer(key);

      if (data) {
        if (data instanceof Uint8Array) {
          dataBuf = data;
        } else if (typeof data === 'string') {
          dataBuf = string2buffer(data);
        } else {
          try {
            dataBuf = string2buffer(JSON.stringify(data));
          } catch (err) {
            return;
          }
        }
      }
    }

    let baseLength = 1 + 1 + 10 + 4;
    let dataLength = 0;

    if (keyBuf) {
      dataLength += 4 + keyBuf.byteLength;

      dataLength += 4;
      if (dataBuf) {
        dataLength += dataBuf?.byteLength;
      }
    }

    let offset = 0;
    let buf = new Uint8Array(baseLength + dataLength);

    // =============
    // base
    // =============

    // message type
    buf.set([msgType], 0);
    offset += 1;

    // longtime
    buf.set([longtime ? 0x1 : 0x0], offset);
    offset += 1;

    // msgid
    buf.set(msgId, offset);
    offset += msgId.byteLength;

    // allLength
    let al = new Uint32Array([dataLength]);
    buf.set(al, offset);
    offset += al.byteLength;

    // =============
    // data
    // =============

    if (keyBuf) {
      // keylen
      let kl = new Uint32Array([keyBuf!.byteLength]);
      buf.set(kl, offset);
      offset += kl.byteLength;

      // key
      buf.set(keyBuf, offset);
      offset += keyBuf.byteLength;

      // datalen
      let dl = new Uint32Array([dataBuf?.byteLength || 0]);
      buf.set(dl, offset);
      offset += dl.byteLength;

      // data
      if (dataBuf) {
        buf.set(dataBuf, offset);
      }
    }

    if (msgType === messageType.PostMessage || msgType === messageType.PluginMessage) {
      this.waitMessageReturn(msgid, longtime ? 0 : 6000, callback);
    }
    this.#socket.send(buf);
  }

  waitMessageReturn(msgid: string, timeout: number, callback: (e: Context | Error) => void) {
    let replyid = msgid;
    let replied = false;

    // set timer
    if (timeout > 0) {
      this.#timers[replyid] = window.setTimeout(() => {
        // ! big problem, receipt not received

        // remove listener
        this.#ee.removeListener(msgid);

        // remove timer
        if (msgid in this.#timers) {
          clearTimeout(this.#timers[msgid]);
          delete this.#timers[msgid];
        }

        this.#doReconnect();

        // return an error
        if (!replied) callback(new Error('timeout'));
      }, timeout);
    }

    // waiting back
    this.#ee.once(replyid, (res: Context | Error) => {
      replied = true;

      // remove timer
      if (msgid in this.#timers) {
        clearTimeout(this.#timers[msgid]);
        delete this.#timers[msgid];
      }

      // success
      callback(res);
    });
  }

  public emit(key: string, data: any, cb?: (res: Context) => void): Promise<any> {
    const self = this;
    return new Promise((resolve, reject) => {
      self.write(messageType.PostMessage, false, (res: Context | Error) => {
        if (res instanceof Error) {
          reject(res);
        } else {
          if (cb) cb(res);
          resolve(res);
        }
      }, void 0, key, data);
    });
  }

  public longtimeEmit(key: string, data: any, cb?: (res: Context) => void): Promise<any> {
    const self = this;
    return new Promise((resolve, reject) => {
      self.write(messageType.PostMessage, true, (res: Context | Error) => {
        if (res instanceof Error) {
          reject(res);
        } else {
          if (cb) cb(res);
          resolve(res);
        }
      }, void 0, key, data);
    });
  }

  #connected: boolean;

  #connectTimer: number;

  get connected() {
    return this.#connected;
  }

  public connect() {
    const self = this;
    self.#forceClose = false;

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        if (self.#connected) return resolve(self);

        if (self.#connectTimer) clearTimeout(self.#connectTimer);
        self.#connectTimer = window.setTimeout(() => {
          if (self.#connected) return;

          reject(new Error('timeout'));
          self.#doReconnect();
        }, 2000);

        if (self.#socket) self.#socket.close(1000);
        self.#socket = new WebSocket(self.#opt.address, ['enzo-v0']);

        self.#socket.binaryType = 'arraybuffer';

        self.#socket.onerror = function (e: Event) {
          reject(e);

          self.#ee.emit('ws_error', e);
        };

        self.#socket.onopen = function () {
          setTimeout(() => {
            self.#connected = self.#socket.readyState === WebSocket.OPEN;

            if (self.#connectTimer) clearTimeout(self.#connectTimer);

            self.#socket.onclose = function (e: CloseEvent) {
              if (self.#connectTimer) clearTimeout(self.#connectTimer);

              if (!self.#reconnect) self.#ee.emit('ws_close', e);
            };

            self.#socket.onmessage = function (e: MessageEvent) {
              if (self.#connectTimer) clearTimeout(self.#connectTimer);

              self.#ee.emit('ws_message', e);
            };

            // test
            self.write(messageType.PingMessage, false, (e: Context | Error) => {
              if (e instanceof Error) {
                reject(e);
                return;
              }

              self.#ee.emit('ws_open');

              resolve(self);
            });
          }, 100);
        };
      }, 200);
    });
  }

  public async disconnect() {
    this.#forceClose = true;

    this.#clearHeartbeatTimer();

    // Close code https://www.rfc-editor.org/rfc/rfc6455.html#section-7.1.5
    this.#socket.close(1000);
  }

  public reconnect() {
    if (this.#connected) return;

    // Close code https://www.rfc-editor.org/rfc/rfc6455.html#section-7.1.5
    this.#socket.close(1000);
    return this.connect();
  }

  #setConnected(on: boolean, emit?: boolean) {
    this.#connected = on;

    if (emit === true) {
      if (on) {
        this.#ee.emit('connect');
      } else {
        this.#ee.emit('disconnect');
      }
    }
  }

  #wsopen() {
    this.#reconnect = false;
    this.#reconnectAttempts = 0;
    this.#reconnectInterval = 2000;
    this.#maxReconnectInterval = 10 * 1000;
    this.#reconnectDecay = 1.5;

    this.#setConnected(true, true);
    this.#resetHeartbeatTimer(false);
  }

  #wsmessage(e: MessageEvent<ArrayBuffer>) {
    this.#setConnected(true);
    this.#resetHeartbeatTimer(false);

    if (e.data.byteLength < 16) {
      // TODO
      // mismatched body length
      console.error('mismatched body length');
      return;
    }

    let offset = 0;

    const _mt = new Uint8Array(e.data.slice(offset, (offset += 1)));
    const mt = _mt.at(0);

    if (!mt || !(mt in messageType)) {
      this.#ee.emit('error', new Error('incomplete message, invalid messageType'));
      return;
    }

    let res: payload = {
      messageType: mt,
      messageId: new Uint8Array(0),
      longtime: false,
    };

    // longtime
    const _lt = e.data.slice(offset, (offset += 1));
    const _ltView = new Uint8Array(_lt);
    res.longtime = _ltView.at(0) === 1;

    // msg id
    res.messageId = new Uint8Array(e.data.slice(offset, (offset += 10)));
    let msgid = bufid2string(res.messageId);

    // all length
    let _allLen = e.data.slice(offset, (offset += 4));
    let _allLenView = new DataView(_allLen, 0);
    let allLength = _allLenView.getUint32(0, true);

    if (!allLength || !(allLength - offset)) {
      if (res.messageType === messageType.PongMessage) {
        this.#ee.emit(msgid, new Context(this, res));
        return;
      }
      // get back
      if (res.messageType === messageType.BackMessage) {
        this.#ee.emit(msgid, new Context(this, res));
        return;
      }
      // ! unhandled
      console.error('unhandled');
      return;
    }

    if ((e.data.byteLength - 16) !== allLength - offset) {
      // TODO
      // mismatched body length
      console.error('mismatched body length');
      return;
    }

    // keylen
    let _keylen = e.data.slice(offset, (offset += 4));
    let _keyLenView = new DataView(_keylen, 0);
    let keyLength = _keyLenView.getUint32(0, true);

    // key
    let _key = new Uint8Array(e.data.slice(offset, (offset += keyLength)));
    res.key = buffer2string(_key);

    // bodylen
    let _bodylen = e.data.slice(offset, (offset += 4));
    let _bodyLenView = new DataView(_bodylen, 0);
    let bodyLength = _bodyLenView.getUint32(0, true);

    // data
    res.data = new Uint8Array(e.data.slice(offset, (offset += bodyLength)));

    // get back
    if (res.messageType === messageType.BackMessage) {
      this.#ee.emit(msgid, new Context(this, res));
      return;
    }

    this.#ee.emit(res.key, new Context(this, res));
  }

  #wserror(_e: Event) {
  }

  #wsclose(_e: CloseEvent) {
    const self = this;

    self.#setConnected(false, true);
    self.#clearHeartbeatTimer();

    if (self.#forceClose) {
      self.#ee.emit('close');
      return;
    }

    // set reconnect
    this.#doReconnect();
  }

  #doReconnect() {
    if (this.#opt.alwaysReconnect !== true) return;

    this.#reconnect = true;

    this.#setConnected(false, true);
    this.#clearHeartbeatTimer();

    let timeout = this.#reconnectInterval * (this.#reconnectDecay ** this.#reconnectAttempts);
    setTimeout(() => {
      this.#reconnectAttempts++;
      this.connect()
        .catch((err: Error) => {
          if (err.message === 'timeout') {
            this.#doReconnect();
          }
        });
    }, Math.min(this.#maxReconnectInterval, timeout));
  }

  #startHeartbeatTimer(immediate = false) {
    const self = this;

    // exists
    if (self.#heartbeatTimer) return;

    if (immediate) {
      self.write(messageType.PingMessage, false, (e) => {
        if (e instanceof Error) {
        }
      });
    }

    self.#heartbeatTimer = window.setInterval(() => {
      self.write(messageType.PingMessage, false, (e) => {
        if (e instanceof Error) {
        }
      });
    }, 15e3);
  }

  #clearHeartbeatTimer() {
    const self = this;

    if (self.#heartbeatTimer) clearInterval(self.#heartbeatTimer);
    self.#heartbeatTimer = 0;
  }

  #resetHeartbeatTimer(immediate = false) {
    this.#clearHeartbeatTimer();
    this.#startHeartbeatTimer(immediate);
  }

  /** install plugin */
  use(...args: Plugin[]) {
    for (let plugin of args) {
      if (plugin.install) {
        console.log('register plugin:', plugin.pluginName);
        plugin.install(this, messageType.PluginMessage);
      }
    }
  }

  string2buffer: (a1: string) => Uint8Array;

  buffer2string: (a1: Uint8Array) => string;
}

export class Context {
  #enzo: Enzo;

  #payload: payload;

  #replied: boolean;

  #replyTimer: number;

  constructor(enzo: Enzo, payload: payload) {
    this.#enzo = enzo;
    this.#payload = payload;
    this.#replied = false;

    if (this.#payload.messageType === messageType.PostMessage && !payload.longtime) {
      this.#replyTimer = window.setTimeout(() => {
        clearTimeout(this.#replyTimer);
        if (this.#replied) return;

        // reply default message
        this.#replied = true;

        this.#enzo.write(messageType.BackMessage, false, () => { }, this.#payload.messageId, this.#payload.key, new Uint8Array(0));
      }, 3000);
    }
  }

  get messageId() {
    return bufid2string(this.#payload.messageId);
  }

  get data() {
    return this.#payload.data;
  }

  public write(data: any) {
    this.#replied = true;
    this.#enzo.write(messageType.BackMessage, false, () => { }, this.#payload.messageId, this.#payload.key, data);
  }

  public emit(key: string, data: string, cb?: (res: any) => void): Promise<any> {
    return this.#enzo.emit(key, data, cb);
  }

  public longtimeEmit(key: string, data: string, cb?: (res: any) => void): Promise<any> {
    return this.#enzo.longtimeEmit(key, data, cb);
  }
}

const string2buffer = (str: string): Uint8Array => new TextEncoder().encode(str);

const buffer2string = (buf: Uint8Array): string => new TextDecoder('utf-8').decode(buf);

// const mergeBuffer = (...args: Uint8Array[]): Uint8Array => {
//   // sum of individual array lengths
//   let len = 0;
//   for (const i of args) {
//     len += i.byteLength;
//   }

//   let mergedArray = new Uint8Array(len);

//   for (const idx in args) {
//     const i = Number(idx);
//     mergedArray.set(args[i], args[i - 1]?.byteLength || 0);
//   }

//   return mergedArray;
// };

const bufid2string = (buf: Uint8Array) => buf.reduce((id, byte) => {
  byte &= 63;
  if (byte < 36) {
    id += byte.toString(36);
  } else if (byte < 62) {
    id += (byte - 26).toString(36).toUpperCase();
  } else if (byte > 62) {
    id += '-';
  } else {
    id += '_';
  }
  return id;
}, '');

export default { Enzo, Context };

Object.defineProperty(Enzo.prototype, 'string2buffer', {
  value: string2buffer,
});

Object.defineProperty(Enzo.prototype, 'buffer2string', {
  value: buffer2string,
});

if (window) {
  Object.defineProperty(window, 'Enzo', {
    value: Enzo,
  });
}
