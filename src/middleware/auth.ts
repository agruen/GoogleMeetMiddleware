import type { Request, Response, NextFunction } from 'express';
import { config } from '../utils/env.js';

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: number;
      email: string;
      firstName: string;
      lastName?: string | null;
      slug: string;
      googleId: string;
    };
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.user) return next();
  return res.redirect('/login');
}

export function requireDomainUser(req: Request, res: Response, next: NextFunction) {
  const user = req.session.user;
  const domain = config.allowedDomain();
  if (user && user.email.endsWith(`@${domain}`)) return next();
  return res.status(403).send('Forbidden');
}

export function setLocalsFromSession(req: Request, res: Response, next: NextFunction) {
  res.locals.user = req.session.user || null;
  next();
}

