/* eslint-disable max-classes-per-file */
import EventEmitter from 'eventemitter3';
import { nanoid } from 'nanoid';

export declare interface EnzoOption {
  /** server address e.g: ws://localhost */
  address: string;
}

// export declare interface Payload {
//   id: string;
// }

// export declare interface Response {
// }

interface payload {
  msgid: string;
  key: string;
  way: 'post' | 'back';
  data?: any;
}

export type Handle = (p: any) => void | Promise<void>;

class Enzo {
  #opt: EnzoOption;

  #ee: EventEmitter;

  #socket: WebSocket;

  // private events: Record<string, Handle>;
  #eventTimers: Record<string, number>;

  #heartbeatTimer: number;

  constructor(opt: EnzoOption) {
    // this.events = {};
    // console.log(nanoid());

    this.#opt = opt;

    this.#eventTimers = {};

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

  public emit(key: string, data: string, cb?: (res: any) => void): Promise<any> {
    const _this = this;
    const msgid = nanoid(10);
    const eventid = msgid + '_response';
    return new Promise((resolve, reject) => {
      let back = false;

      _this.#socket.send(JSON.stringify({
        msgid,
        way: 'post',
        key,
        data,
      } as payload));

      // set timer
      _this.#eventTimers[eventid] = window.setTimeout(() => {
        _this.#ee.removeListener(eventid);
        if (!back) reject(new Error('Timeout'));
      }, 5000);

      // waiting back
      _this.#ee.once(eventid, (res: payload) => {
        back = true;

        if (eventid in _this.#eventTimers) {
          console.log('clear event timer', eventid);

          clearTimeout(_this.#eventTimers[eventid]);
          delete _this.#eventTimers[eventid];
        }
        if (cb) cb(res.data);

        resolve(res.data);
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

      _this.#socket = new WebSocket(_this.#opt.address);
      // _this.#socket.binaryType = 'arraybuffer';
      // _this.#socket.addEventListener('open', _this.#onopen);
      // _this.#socket.addEventListener('message', _this.#onmessage);
      // _this.#socket.addEventListener('error', _this.#onerror);
      // _this.#socket.addEventListener('close', _this.#onclose);
      _this.#socket.onopen = function (e: Event) {
        console.log('WebSocket onopen', e);
        resolve(_this);

        _this.#ee.emit('ws_open', e);
      };

      _this.#socket.onerror = function (e: Event) {
        console.log('WebSocket error: ', e);
        reject(e);

        _this.#ee.emit('ws_error', e);
      };

      _this.#socket.onclose = function (e: Event) {
        console.log('WebSocket close: ', e);

        _this.#ee.emit('ws_close', e);
      };

      _this.#socket.onmessage = function (e: MessageEvent) {
        console.log('WebSocket onmessage', e);

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
    this.#socket.send('hi');
    this.#setConnected(true, true);
  }

  #wsmessage(e: MessageEvent) {
    this.#setConnected(true);
    this.#resetHeartbeatTimer();

    let res: payload;
    try {
      res = JSON.parse(e.data);

      if (!res) return;
    } catch (error) {
      console.error('unknown response body');
      return;
    }

    // 消息回复
    if (res.way === 'back') {
      this.#ee.emit(res.msgid + '_response', e);
    }

    this.#ee.emit(res.key, new Context(this, res, this.#socket));
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
      _this.#socket.send(new Uint8Array([0x9]));
      // _this.emit('ping', '', () => {
      //   console.log('pong');
      // });
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

  #socket: WebSocket;

  constructor(enzo: Enzo, payload: payload, socket: WebSocket) {
    this.#enzo = enzo;
    this.#payload = payload;
    this.#socket = socket;
  }

  get data() {
    return this.#payload.data;
  }

  public write(data: string) {
    this.#socket.send(JSON.stringify({
      msgid: this.#payload.msgid,
      way: 'back',
      data,
    }));
  }

  public emit(key: string, data: string, cb?: (res: any) => void): Promise<any> {
    return this.#enzo.emit(key, data, cb);
  }
}

export default Enzo;
