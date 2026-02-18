import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'node:path';
import morgan from 'morgan';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import SQLiteStoreFactory from 'connect-sqlite3';
import { rateLimit } from 'express-rate-limit';
// @ts-ignore - Type definitions for @dr.pogodin/csurf are in src/types/csrf.d.ts
import csrf from '@dr.pogodin/csurf';
import crypto from 'node:crypto';

import { isSetupComplete, loadConfig } from './utils/config-manager.js';
import { env } from './utils/env.js';
import setupRouter from './routes/setup.js';

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);

app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'src', 'views'));
// Trust reverse proxy (for req.secure, X-Forwarded-Proto/IP)
app.set('trust proxy', 1);

// Keep Helmet simple - don't add CSP that breaks SSE
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable default CSP - we'll use custom one on HTML pages only
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

app.use(morgan('dev'));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());

app.use('/public', express.static(path.join(process.cwd(), 'src', 'public')));

// Health check (always available)
app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// Check if setup is complete
const setupComplete = isSetupComplete();

if (!setupComplete) {
  // SETUP MODE: Only serve setup routes
  console.log('⚙️  Setup mode: Configuration required');
  console.log('📋 Please visit http://localhost:3000/setup to configure the application');

  // Minimal session for setup (uses cryptographically random secret)
  app.use(
    session({
      secret: crypto.randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        maxAge: 1000 * 60 * 30, // 30 minutes
      },
    })
  );

  // Rate limiter for setup
  const setupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: 'Too many setup attempts, please try again later.',
  });

  // CSRF protection for setup
  const setupCsrf = csrf({ cookie: false });

  // Setup routes with protection
  app.use('/', setupLimiter, setupCsrf, setupRouter);

  // Redirect all other routes to setup
  app.get('*', (_req, res) => {
    res.redirect('/setup');
  });

  // Error handler for setup mode
  app.use((err: any, req: any, res: any, next: any) => {
    if (err.code === 'EBADCSRFTOKEN') {
      console.warn(`[Security] CSRF validation failed in setup from IP: ${req.ip}`);
      return res.status(403).send('Invalid CSRF token. Please refresh and try again.');
    }
    console.error('[Setup Error]', err);
    res.status(500).send('Setup error occurred');
  });
} else {
  // NORMAL MODE: Load configuration and run app
  console.log('✅ Configuration loaded, starting application...');

  // Load configuration into environment
  loadConfig();

  // Now import modules that depend on env vars (after config is loaded)
  const { db } = await import('./utils/db.js');
  const { config } = await import('./utils/env.js');
  const { setLocalsFromSession } = await import('./middleware/auth.js');
  const { createMeetWithRefreshToken } = await import('./adapters/google-meet/index.js');
  const { subscribe, broadcast } = await import('./utils/sse.js');
  const authRouter = await import('./routes/auth.js');
  const meetRouter = await import('./routes/meet.js');
  const dayjs = await import('dayjs');

  // Session with real secret from config
  const sessionDbPath = env('SESSION_DB_FILE', 'sessions.sqlite');
  const sessionDbDir = path.dirname(sessionDbPath);
  const sessionDbFile = path.basename(sessionDbPath);

  app.use(
    session({
      store: new SQLiteStore({
        db: sessionDbFile,
        dir: sessionDbDir,
      }) as any, // Type compatibility workaround for connect-sqlite3
      secret: env('SESSION_SECRET'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // With trust proxy, 'auto' uses req.secure (X-Forwarded-Proto)
        secure: 'auto',
        maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
      },
    })
  );

  app.use(setLocalsFromSession);

  // CSRF protection - applied to all routes EXCEPT /api/*
  const csrfProtection = csrf({ cookie: false });
  app.use((req, res, next) => {
    // Skip CSRF for API routes (SSE)
    if (req.path.startsWith('/api/')) {
      return next();
    }
    // Apply CSRF to everything else
    csrfProtection(req, res, (err: any) => {
      if (err) return next(err);
      res.locals.csrfToken = (req as any).csrfToken();
      next();
    });
  });

  // Rate limiters
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      console.warn(`[Security] Rate limit on auth from IP: ${req.ip}`);
      res.status(429).send('Too many authentication attempts.');
    },
  });

  // SSE stream for single-user mode (root URL)
  app.get('/api/wait/stream', (req, res) => {
    if (!config.singleUserMode()) {
      res.status(404).send('Not found');
      return;
    }

    // Get the single user (first user)
    const users = db.getAllUsers();
    if (users.length === 0) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write('event: error\n');
      res.write('data: {"message":"no-user"}\n\n');
      return res.end();
    }

    const singleUser = users[0];
    const active = db.getActiveMeet(singleUser.id);
    if (active) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      res.write('event: active\n');
      res.write(`data: ${JSON.stringify({ meetUrl: active.meetUrl })}\n\n`);
      return res.end();
    }

    db.upsertWaitingSession(singleUser.slug, req.ip, req.headers['user-agent']);
    subscribe(req, res, `wait:${singleUser.slug}`);
  });

  // Home/Dashboard (with single-user mode support)
  app.get('/', async (req, res) => {
    const user = req.session.user;
    const setupCompleteQuery = req.query.setup === 'complete';

    // Single-user mode: treat root URL as the meeting URL
    if (config.singleUserMode()) {
      const users = db.getAllUsers();

      // No users yet - show login page
      if (users.length === 0) {
        if (!user) {
          return res.render('home', { user: null, baseUrl: env('BASE_URL'), setupComplete: setupCompleteQuery, singleUserMode: true });
        }
        // User just logged in, they are the single user - show dashboard
        const personalUrl = env('BASE_URL');
        return res.render('dashboard', { user, personalUrl, singleUserMode: true });
      }

      const singleUser = users[0];
      const isHost = user && user.id === singleUser.id;
      const active = db.getActiveMeet(singleUser.id);

      if (isHost) {
        // Host visiting root: create meeting or join existing
        if (!active) {
          try {
            console.log(`[Meet] Single-user host creating new meeting`);
            const meetUrl = await createMeetWithRefreshToken(singleUser.refreshTokenEnc);
            const expiresAt = dayjs.default().add(config.meetWindowMs(), 'millisecond').toISOString();
            db.createMeet(singleUser.id, meetUrl, expiresAt);
            console.log(`[Meet] Meeting created: ${meetUrl}`);
            broadcast(`wait:${singleUser.slug}`, 'active', { meetUrl });
            return res.redirect(meetUrl);
          } catch (err) {
            console.error(err);
            return res.status(502).send('Failed to create Google Meet');
          }
        }
        console.log(`[Meet] Single-user host joining existing meeting: ${active.meetUrl}`);
        return res.redirect(active.meetUrl);
      }

      // Visitor in single-user mode
      if (active) {
        return res.redirect(active.meetUrl);
      }

      // Show waiting room for root URL
      db.upsertWaitingSession(singleUser.slug, req.ip, req.headers['user-agent']);
      return res.render('waiting', { slug: '', singleUserMode: true });
    }

    // Normal mode (not single-user)
    if (!user) {
      return res.render('home', { user: null, baseUrl: env('BASE_URL'), setupComplete: setupCompleteQuery, singleUserMode: false });
    }
    const personalUrl = `${env('BASE_URL')}/${user.slug}`;
    return res.render('dashboard', { user, personalUrl, singleUserMode: false });
  });

  // Auth routes with rate limiting
  app.use('/', authLimiter, authRouter.default);

  // Meet routes (NO rate limiting - SSE needs unrestricted access)
  app.use('/', meetRouter.default);

  // Initialize DB tables on startup
  db.init();

  // Error handler for CSRF and other errors
  app.use((err: any, req: any, res: any, next: any) => {
    if (err.code === 'EBADCSRFTOKEN') {
      console.warn(`[Security] CSRF validation failed from IP: ${req.ip} on ${req.path}`);
      return res.status(403).send('Invalid security token');
    }
    console.error('[Error]', err);
    res.status(500).send('Internal server error');
  });
}

const port = Number(process.env.PORT || '3000');

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  if (!setupComplete) {
    console.log(`🔧 Setup URL: http://localhost:${port}/setup`);
  }
});
