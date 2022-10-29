import EventEmitter from 'eventemitter3';
import { nanoid } from 'nanoid';

export declare interface EnzoOption {
  /** server address e.g: ws://localhost */
  address: string;
}

export declare interface Payload {
  id: string;
}

// export declare interface Response {
// }

interface internalResponse {
  msgid: string;
  status: number;
  data?: any;
}

export type Handle = (p: Payload) => void | Promise<void>;

export default class Enzo {
  private opt: EnzoOption;

  private ee: EventEmitter;

  private socket: WebSocket;

  // TODO readonly
  public connected: boolean;

  // private events: Record<string, Handle>;

  // private heartbeatTimer: Node.Tim;

  constructor(opt: EnzoOption) {
    // this.events = {};
    console.log(nanoid());

    this.opt = opt;

    this.ee = new EventEmitter();
  }

  public on(key: string, handle: Handle) {
    this.ee.on(key, handle);
  }

  public off(key: string, handle: Handle) {
    this.ee.removeListener(key, handle);
  }

  public offAll() {
    this.ee.removeAllListeners();
  }

  public emit(key: string, data: any, cb?: (res: any) => void): Promise<any> {
    const _this = this;
    const msgid = nanoid();
    return new Promise((resolve, reject) => {
      _this.socket.send(JSON.stringify({
        msgid,
        key,
        data,
      }));

      // waiting back
      _this.ee.once(msgid + '_response', (res: internalResponse) => {
        if (cb) cb(res.data);
        if (res.status === 1) {
          resolve(res.data);
        }
      });
      setTimeout(() => {
        _this.ee.removeListener(msgid + '_response');
        reject(new Error('Timeout'));
      }, 5000);
    });
  }

  private inited: boolean;

  public connect() {
    const _this = this;
    return new Promise((resolve, reject) => {
      if (_this.inited) return resolve(_this);

      _this.socket = new WebSocket(_this.opt.address);
      // _this.socket.binaryType = 'arraybuffer';
      _this.socket.addEventListener('open', _this.onopen);
      _this.socket.addEventListener('message', _this.onmessage);
      _this.socket.addEventListener('error', _this.onerror);
      _this.socket.addEventListener('close', _this.onclose);
      _this.socket.onopen = function () {
        resolve(_this);
        _this.socket.send('hi');
      };
      _this.socket.onerror = function (e) {
        console.log('WebSocket error: ', e);
        reject(e);
      };
      _this.inited = true;
    });
  }

  public async disconnect() {
    this.socket.close();
  }

  private onopen(e: Event) {
    console.log('onopen', e);

    this.connected = true;
  }

  private onmessage(e: MessageEvent) {
    console.log('onmessage', e);

    this.connected = true;

    // var raw = new Uint8Array(e.data);
    // var message = msgpack.decode(raw);
  }

  private onerror(e: Event) {
    console.log('onerror', e);
  }

  private onclose(e: Event) {
    console.log('onclose', e);
  }
}
