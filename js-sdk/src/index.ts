export declare interface EnzoOption {
  /** server address e.g: ws://localhost */
  address: string;
}

export class Enzo {
  // private opt: EnzoOption;
  constructor(opt: EnzoOption) {
    console.log(opt);
  }
}
