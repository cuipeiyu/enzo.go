import EventEmitter from 'eventemitter3';

export declare interface EnzoOption {
  /** server address e.g: ws://localhost */
  address: string;
}

// export declare interface Payload {
//   id: string;
// }

// export declare interface Response {
// }

enum messageType {
  PingMessage = 0x1,
  PongMessage = 0x2,
  PostMessage = 0x28,
  BackMessage = 0x29,
}

interface payload {
  messageType: messageType;
  messageId: Uint8Array;
  key?: string;
  data?: any;
}

export type Handle = (p: any) => void | Promise<void>;

export default class Enzo {
  #opt: EnzoOption;

  #ee: EventEmitter;

  #socket: WebSocket;

  #timers: Record<string, number>;

  #heartbeatTimer: number;

  constructor(opt: EnzoOption) {
    // this.events = {};
    // console.log(nanoid());

    this.#opt = opt;

    this.#timers = {};

    this.#ee = new EventEmitter();
    this.offAll();
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
  // | base: (5)       | messageType(1) | allLength(5)  |
  // | header: (11)    | messageId(10)  |
  // | data: (4+x+4+x) | keyLength(4)   | key(x)        | dataLength(4) | dataBody(x) |
  write(type: messageType, msgId?: Uint8Array, key?: string, data?: any, callback?: (res: Context | Error) => void) {
    // ping & pong
    if (
      type === messageType.PingMessage
      || type === messageType.PongMessage
    ) {
      this.#socket.send(new Uint8Array([type, 0, 0, 0, 0]));
      return;
    }

    let allLength = 1 + 4;

    if (!msgId) msgId = crypto.getRandomValues(new Uint8Array(10));

    allLength += 10;

    let keyBuf: Uint8Array | undefined;
    let dataBuf: Uint8Array | undefined;

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

    if (key) {
      keyBuf = string2buffer(key);
      allLength += 4 + keyBuf.byteLength;
    }

    if (dataBuf) {
      allLength += 4 + dataBuf?.byteLength;
    }

    let offset = 0;
    let buf = new Uint8Array(allLength);

    // message type
    buf.set([type], 0);
    offset += 1;

    // allLength
    let al = new Uint32Array([allLength]);

    buf.set(al, offset);
    offset += al.byteLength;

    // msgid
    let msgid = bufid2string(msgId);
    buf.set(msgId, offset);
    offset += msgId.byteLength;

    if (keyBuf) {
      // keylen
      let kl = new Uint32Array([keyBuf!.byteLength]);
      buf.set(kl, offset);
      offset += kl.byteLength;

      // key
      buf.set(keyBuf, offset);
      offset += keyBuf.byteLength;
    }

    if (dataBuf) {
      // datalen
      let dl = new Uint32Array([dataBuf!.byteLength]);
      buf.set(dl, offset);
      offset += dl.byteLength;

      // data
      buf.set(dataBuf, offset);
    }

    this.#socket.send(buf);

    if (!callback) return;

    let back = false;

    // set timer
    this.#timers[msgid] = window.setTimeout(() => {
      // remove listener
      this.#ee.removeListener(msgid);

      // remove timer
      if (msgid in this.#timers) {
        clearTimeout(this.#timers[msgid]);
        delete this.#timers[msgid];
      }

      // return an error
      if (!back) callback(new Error('Timeout'));
    }, 5000);

    // waiting back
    this.#ee.once(msgid, (res: payload) => {
      back = true;

      // remove timer
      if (msgid in this.#timers) {
        clearTimeout(this.#timers[msgid]);
        delete this.#timers[msgid];
      }

      // success
      callback(new Context(this, res));
    });
  }

  public emit(key: string, data: any, cb?: (res: Context) => void): Promise<any> {
    const _this = this;
    return new Promise((resolve, reject) => {
      _this.write(messageType.PostMessage, void 0, key, data, (res: Context | Error) => {
        if (res instanceof Error) {
          reject(res);
        } else {
          if (cb) cb(res);
          resolve(res);
        }
      });
    });
  }

  #inited: boolean;

  #connected = false;

  get connected() {
    return this.#connected;
  }

  public connect() {
    const _this = this;
    return new Promise((resolve, reject) => {
      if (_this.#inited) return resolve(_this);

      _this.#socket = new WebSocket(_this.#opt.address, ['enzo-v0']);
      _this.#socket.binaryType = 'arraybuffer';
      // _this.#socket.addEventListener('open', _this.#onopen);
      // _this.#socket.addEventListener('message', _this.#onmessage);
      // _this.#socket.addEventListener('error', _this.#onerror);
      // _this.#socket.addEventListener('close', _this.#onclose);
      _this.#socket.onopen = function (e: Event) {
        // console.log('WebSocket onopen', e);
        resolve(_this);

        _this.#ee.emit('ws_open', e);
      };

      _this.#socket.onerror = function (e: Event) {
        // console.log('WebSocket error: ', e);
        reject(e);

        _this.#ee.emit('ws_error', e);
      };

      _this.#socket.onclose = function (e: Event) {
        // console.log('WebSocket close: ', e);

        _this.#ee.emit('ws_close', e);
      };

      _this.#socket.onmessage = function (e: MessageEvent) {
        // console.log('WebSocket onmessage', e);

        _this.#ee.emit('ws_message', e);
      };

      _this.#inited = true;
    });
  }

  public async disconnect() {
    this.#clearHeartbeatTimer();

    this.#socket.close();
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

  #wsopen(_e: Event) {
    this.#startHeartbeatTimer();
    this.#setConnected(true, true);
  }

  #wsmessage(e: MessageEvent<ArrayBuffer>) {
    this.#setConnected(true);
    this.#resetHeartbeatTimer();

    const _mt = e.data.slice(0, 1);
    const view = new Uint8Array(_mt);
    const mt = view.at(0);

    if (!mt || !(mt in messageType)) {
      this.#ee.emit('error', new Error('incomplete message, invalid messageType'));
      return;
    }

    if (mt === messageType.PingMessage) {
      this.write(messageType.PongMessage);
      this.#ee.emit('ping');
      return;
    }
    if (mt === messageType.PongMessage) {
      // skip
      return;
    }

    let res: payload = {
      messageType: mt,
      messageId: new Uint8Array(0),
    };

    let offset = 1;

    // all length
    let _allLen = e.data.slice(offset, (offset += 4));
    let _allLenView = new DataView(_allLen, 0);
    let allLength = _allLenView.getUint32(0, true);

    // msg id
    res.messageId = new Uint8Array(e.data.slice(offset, (offset += 10)));

    let msgid = bufid2string(res.messageId);

    // no key & data
    if (offset === allLength) {
      // get back
      if (res.messageType === messageType.BackMessage) {
        this.#ee.emit(msgid, res);
        return;
      }
      // ! unhandled
      // no key
      if (res.messageType === messageType.PongMessage) {
        //
      }
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
    let _data = new Uint8Array(e.data.slice(offset, (offset += bodyLength)));
    res.data = buffer2string(_data);

    // get back
    if (res.messageType === messageType.BackMessage) {
      this.#ee.emit(msgid, res);
      return;
    }

    this.#ee.emit(res.key, new Context(this, res));
  }

  #wserror(_e: Event) {
  }

  #wsclose(_e: Event) {
    this.#setConnected(false, true);
    this.#clearHeartbeatTimer();
  }

  #startHeartbeatTimer() {
    const _this = this;

    // exits
    if (_this.#heartbeatTimer) return;

    _this.#heartbeatTimer = window.setInterval(() => {
      _this.write(messageType.PingMessage);
    }, 15e3);
  }

  #clearHeartbeatTimer() {
    const _this = this;

    if (_this.#heartbeatTimer) clearInterval(_this.#heartbeatTimer);
    _this.#heartbeatTimer = 0;
  }

  #resetHeartbeatTimer() {
    this.#clearHeartbeatTimer();
    this.#startHeartbeatTimer();
  }
}

class Context {
  #enzo: Enzo;

  #payload: payload;

  constructor(enzo: Enzo, payload: payload) {
    this.#enzo = enzo;
    this.#payload = payload;
  }

  get data() {
    return this.#payload.data;
  }

  public write(data: any) {
    this.#enzo.write(this.#payload.messageType, this.#payload.messageId, this.#payload.key, data);
  }

  public emit(key: string, data: string, cb?: (res: any) => void): Promise<any> {
    return this.#enzo.emit(key, data, cb);
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
