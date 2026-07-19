import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import path from 'node:path';
import morgan from 'morgan';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import SQLiteStoreFactory from 'connect-sqlite3';
import { rateLimit } from 'express-rate-limit';
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
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if ((err as { code?: string }).code === 'EBADCSRFTOKEN') {
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
  const { ensureActiveMeetForHost, resolveJoinableMeet, startWaitingRoomSweeper } = await import(
    './services/meetings.js'
  );
  const { closeAllSubscribers } = await import('./utils/sse.js');
  const authRouter = await import('./routes/auth.js');
  const meetRouter = await import('./routes/meet.js');

  // Session with real secret from config
  const sessionDbPath = env('SESSION_DB_FILE', 'sessions.sqlite');
  const sessionDbDir = path.dirname(sessionDbPath);
  const sessionDbFile = path.basename(sessionDbPath);

  app.use(
    session({
      store: new SQLiteStore({
        db: sessionDbFile,
        dir: sessionDbDir,
      }) as unknown as session.Store, // connect-sqlite3 types lag behind express-session
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
    csrfProtection(req, res, (err?: unknown) => {
      if (err) return next(err);
      res.locals.csrfToken = req.csrfToken();
      next();
    });
  });

  // Rate limiter for authentication endpoints ONLY. It must never see meet
  // pages or the SSE/status endpoints: a tripped limit there returns 429,
  // which EventSource treats as fatal and stops reconnecting — stranding
  // visitors on the waiting page forever.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      console.warn(`[Security] Rate limit on auth from IP: ${req.ip}`);
      res.status(429).send('Too many authentication attempts.');
    },
  });
  app.use(['/login', '/oauth2', '/logout'], authLimiter);

  // Home/Dashboard (with single-user mode support)
  app.get('/', async (req, res) => {
    const user = req.session.user;
    const setupCompleteQuery = req.query.setup === 'complete';

    // Single-user mode: treat root URL as the meeting URL
    if (config.singleUserMode()) {
      const singleUser = db.getFirstUser();

      // No users yet - show login page
      if (!singleUser) {
        if (!user) {
          return res.render('home', {
            user: null,
            baseUrl: env('BASE_URL'),
            setupComplete: setupCompleteQuery,
            singleUserMode: true,
          });
        }
        // User just logged in, they are the single user - show dashboard
        const personalUrl = env('BASE_URL');
        return res.render('dashboard', { user, personalUrl, singleUserMode: true });
      }

      const isHost = user && user.id === singleUser.id;

      if (isHost) {
        // Host visiting root: create meeting or join existing
        try {
          const meet = await ensureActiveMeetForHost(singleUser);
          return res.redirect(meet.meetUrl);
        } catch (err) {
          console.error('[Meet] Failed to create meeting (single-user):', err);
          return res.status(502).send('Failed to create Google Meet');
        }
      }

      // Visitor in single-user mode
      try {
        res.setHeader('Cache-Control', 'no-store');
        const meet = await resolveJoinableMeet(singleUser);
        if (meet) return res.redirect(meet.meetUrl);
        db.addWaitingSession(singleUser.slug, req.ip, req.headers['user-agent']);
        return res.render('waiting', { slug: '', singleUserMode: true });
      } catch (err) {
        console.error('[Meet] Visitor flow failed (single-user):', err);
        return res.status(500).send('Something went wrong');
      }
    }

    // Normal mode (not single-user)
    if (!user) {
      return res.render('home', {
        user: null,
        baseUrl: env('BASE_URL'),
        setupComplete: setupCompleteQuery,
        singleUserMode: false,
      });
    }
    const personalUrl = `${env('BASE_URL')}/${user.slug}`;
    return res.render('dashboard', { user, personalUrl, singleUserMode: false });
  });

  // Auth routes (rate-limited above by path)
  app.use('/', authRouter.default);

  // Meet routes (NO rate limiting - SSE needs unrestricted access)
  app.use('/', meetRouter.default);

  // Initialize DB tables on startup
  db.init();
  db.prune();

  // Safety net: periodically re-check waiting rooms so a missed broadcast or
  // a conference that went live late still redirects everyone.
  startWaitingRoomSweeper();

  // End open SSE streams on shutdown so browsers reconnect promptly instead
  // of hanging on a dead connection through a deploy.
  const shutdown = () => {
    closeAllSubscribers();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Error handler for CSRF and other errors
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if ((err as { code?: string }).code === 'EBADCSRFTOKEN') {
      console.warn(`[Security] CSRF validation failed from IP: ${req.ip} on ${req.path}`);
      return res.status(403).send('Invalid security token');
    }
    console.error('[Error]', err);
    res.status(500).send('Internal server error');
  });
}

// A single stray rejection (e.g. one dead socket) must not take down the
// process — that would silently disconnect every visitor waiting for a
// redirect. Log loudly instead.
process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] Unhandled rejection:', reason);
});

const port = Number(process.env.PORT || '3000');

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  if (!setupComplete) {
    console.log(`🔧 Setup URL: http://localhost:${port}/setup`);
  }
});
