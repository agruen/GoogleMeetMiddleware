declare module '@dr.pogodin/csurf' {
  import { RequestHandler } from 'express';

  interface CsrfOptions {
    cookie?: boolean | {
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
    value?: (req: any) => string;
  }

  function csrf(options?: CsrfOptions): RequestHandler;

  export = csrf;
}

declare global {
  namespace Express {
    interface Request {
      csrfToken(): string;
    }
  }
}

export {};
