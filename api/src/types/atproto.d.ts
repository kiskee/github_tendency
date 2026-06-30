declare module "@atproto/api" {
  export class BskyAgent {
    constructor(opts: { service: string });
    login(opts: { identifier: string; password: string }): Promise<void>;
    post(opts: { text: string }): Promise<{ uri: string }>;
  }
}
