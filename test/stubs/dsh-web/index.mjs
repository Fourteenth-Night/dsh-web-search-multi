export class WebError extends Error {
  constructor(message, code, opts) { super(message); this.name = "WebError"; this.code = code; if (opts && opts.cause !== undefined) this.cause = opts.cause; }
}
