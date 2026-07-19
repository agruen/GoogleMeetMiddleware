// NOTE: this file must stay a script (no top-level import/export). With a
// top-level export it becomes a module, and "declare module" would then be a
// module augmentation instead of an ambient declaration — leaving the csurf
// import untyped.
declare module '@dr.pogodin/csurf' {
  import { Request, RequestHandler } from 'express';

  interface CsrfOptions {
    cookie?:
      | boolean
      | {
          key?: string;
          path?: string;
          signed?: boolean;
          secure?: boolean;
          maxAge?: number;
          httpOnly?: boolean;
          sameSite?: boolean | 'lax' | 'strict' | 'none';
        };
    ignoreMethods?: string[];
    sessionKey?: string;
    value?: (req: Request) => string;
  }

  function csrf(options?: CsrfOptions): RequestHandler;

  export = csrf;
}

declare namespace Express {
  interface Request {
    csrfToken(): string;
  }
}
