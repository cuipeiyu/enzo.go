import type { Enzo, Context, Plugin } from '../../index';

// export declare interface SessionsOptions {
//   some?: string;
// }

// export const sessionsDefaults: SessionsOptions = {};

export class Sessions implements Plugin {
  // #opt: SessionsOptions;

  #enzo: Enzo;

  #messageType: number;

  // constructor(opt?: SessionsOptions) {
  //   this.#opt = {
  //     ...sessionsDefaults,
  //     ...opt,
  //   };
  // }

  get pluginName() {
    return 'sessions';
  }

  install(enzo: Enzo, messageType: number) {
    this.#enzo = enzo;

    this.#messageType = messageType;
  }

  // 0x01 == normal
  // 0x02 == error
  parseResponse(raw: Uint8Array): Uint8Array | Error | undefined {
    let offset = 0;

    const stats = raw.at(offset);
    offset += 1;

    const _bodyLen = new Uint8Array(raw.slice(offset, offset += 4));
    const _bodyView = new DataView(_bodyLen.buffer, 0);
    const bodyLen = _bodyView.getUint32(0, true);

    const body = raw.slice(offset, (offset += bodyLen));

    if (stats === 0x01) {
      return body;
    }
    if (stats === 0x02) {
      const msg = this.#enzo.buffer2string(body);
      return new Error(msg);
    }
    return void 0;
  }

  getRaw(key: string, cb?: (a1: Uint8Array|undefined) => void): Promise<Uint8Array|undefined> {
    return new Promise((resolve, reject) => {
      // keylen + key
      let allLength = 0;
      // key
      let keyBuf = this.#enzo.string2buffer(key);
      // keylen
      let kl = new Uint32Array([keyBuf.byteLength]);
      allLength += kl.byteLength + keyBuf.byteLength;

      // write

      const buf = new Uint8Array(allLength);
      let offset = 0;

      // key length
      buf.set(kl, offset);
      offset += kl.byteLength;

      // key body
      buf.set(keyBuf, offset);
      offset += keyBuf.byteLength;

      this.#enzo.write(this.#messageType, false, (e: Context | Error) => {
        if (e instanceof Error) {
          reject(e);
        } else if (e.data) {
          const b = this.parseResponse(e.data);
          if (b instanceof Error) {
            reject(b);
          } else {
            cb && cb(b);
            resolve(b);
          }
        } else {
          reject(new Error('empty'));
        }
      }, void 0, this.pluginName + '|get', buf);
    });
  }

  async getNumber(key: string, cb?: (a1: number|undefined) => void): Promise<number|undefined> {
    const buf = await this.getRaw(key);
    if (!buf || !buf.byteLength) {
      cb && cb(void 0);
      return void 0;
    }

    const view = new DataView(buf, 0);
    const num = view.getInt32(0, true);
    cb && cb(num);
    return num;
  }

  async getString(key: string, cb?: (a1: string|undefined) => void): Promise<string|undefined> {
    const buf = await this.getRaw(key);
    if (!buf || !buf.byteLength) {
      cb && cb(void 0);
      return void 0;
    }

    const str = this.#enzo.buffer2string(buf);
    cb && cb(str);
    return str;
  }

  async getBoolean(key: string, cb?: (a1: boolean|undefined) => void): Promise<boolean|undefined> {
    const buf = await this.getRaw(key);
    if (!buf || !buf.byteLength) {
      cb && cb(void 0);
      return void 0;
    }

    const t = buf.at(0) === 0x01;

    cb && cb(t);
    return t;
  }

  async getJSON(key: string, cb?: (a1: any|undefined) => void): Promise<any|undefined> {
    const str = await this.getString(key);
    if (str === void 0) {
      cb && cb(str);
      return str;
    }

    let tmp;
    try {
      tmp = JSON.parse(str);
    } catch (err) {
      return Promise.reject(new Error('unknown data'));
    }

    cb && cb(tmp);
    return tmp;
  }

  setRaw(key: string, data: Uint8Array, ttl?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // ttl + keylen + key + datalen + data
      let allLength = 0;
      // ttl
      let t = new Int32Array([ttl || 0]);
      allLength += t.byteLength;
      // key
      let keyBuf = this.#enzo.string2buffer(key);
      // keylen
      let kl = new Uint32Array([keyBuf!.byteLength]);
      allLength += kl.byteLength + keyBuf.byteLength;
      // data
      let dl = new Uint32Array([data.byteLength]);

      allLength += dl.byteLength + data.byteLength;

      // write

      const buf = new Uint8Array(allLength);
      let offset = 0;
      // ttl
      buf.set(t, offset);
      offset += t.byteLength;

      // key length
      buf.set(kl, offset);
      offset += kl.byteLength;

      // key body
      buf.set(keyBuf, offset);
      offset += keyBuf.byteLength;

      // datalen
      buf.set(dl, offset);
      offset += dl.byteLength;

      // data
      buf.set(data, offset);

      this.#enzo.write(this.#messageType, false, (e: Context | Error) => {
        if (e instanceof Error) {
          reject(e);
        } else if (e.data) {
          const b = this.parseResponse(e.data);

          if (b instanceof Error) {
            reject(b);
          } else {
            resolve();
          }
        } else {
          reject(new Error('empty'));
        }
      }, void 0, this.pluginName + '|set', buf);
    });
  }

  async setNumber(key: string, val: number, ttl?: number, cb?: () => void): Promise<void> {
    const data = new Uint8Array(new Int32Array([val]));
    await this.setRaw(key, data, ttl);

    cb && cb();
  }

  async setString(key: string, val: string, ttl?: number, cb?: () => void): Promise<void> {
    const data = this.#enzo.string2buffer(val);
    await this.setRaw(key, data, ttl);
    cb && cb();
  }

  async setBoolean(key: string, val: boolean, ttl?: number, cb?: () => void): Promise<void> {
    const data = new Uint8Array([val ? 0x01 : 0x00]);
    await this.setRaw(key, data, ttl);
    cb && cb();
  }

  async setJSON(key: string, val: any, ttl?: number, cb?: () => void): Promise<void> {
    let str = '';
    try {
      str = JSON.stringify(val);
    } catch (err) {
      return Promise.reject(new Error('unknown data'));
    }
    await this.setString(key, str, ttl, cb);
  }

  ttl(key: string, ttl: number): Promise<void> {
    return new Promise((resolve, reject) => {
      // ttl + keylen + key
      let allLength = 0;
      // ttl
      let t = new Uint8Array(new Int32Array([ttl || 0]));
      // key
      let keyBuf = this.#enzo.string2buffer(key);
      // keylen
      let kl = new Uint8Array(new Uint32Array([keyBuf.byteLength]));
      allLength += kl.byteLength + keyBuf.byteLength;

      // write

      const buf = new Uint8Array(allLength);
      let offset = 0;

      // ttl
      buf.set(t, offset);
      offset += 4;

      // key length
      buf.set(kl, offset);
      offset += kl.byteLength;

      // key body
      buf.set(keyBuf, offset);
      offset += keyBuf.byteLength;

      this.#enzo.write(this.#messageType, false, (e: Context | Error) => {
        if (e instanceof Error) {
          reject(e);
        } else {
          resolve();
        }
      }, void 0, this.pluginName + '|ttl', buf);
    });
  }

  del(key: string) {
    return this.setRaw(key, new Uint8Array(0), -1);
  }

  clean(cb?: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#enzo.write(this.#messageType, false, (e: Context | Error) => {
        if (e instanceof Error) {
          reject(e);
        } else {
          cb && cb();
          resolve();
        }
      }, void 0, this.pluginName + '|clean');
    });
  }
}

export default { Sessions };

if (window) {
  Object.defineProperty(window, 'EnzoSessions', {
    value: Sessions,
  });
}
