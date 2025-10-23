import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'node:path';
import morgan from 'morgan';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import SQLiteStoreFactory from 'connect-sqlite3';

import { isSetupComplete, loadConfig } from './utils/config-manager.js';
import { env } from './utils/env.js';
import setupRouter from './routes/setup.js';

const app = express();
const SQLiteStore = SQLiteStoreFactory(session);

app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'src', 'views'));
// Trust reverse proxy (for req.secure, X-Forwarded-Proto/IP)
app.set('trust proxy', 1);

app.use(helmet());
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

  // Minimal session for setup (uses temporary secret)
  app.use(
    session({
      secret: 'temporary-setup-secret-' + Date.now(),
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

  // Setup routes
  app.use('/', setupRouter);

  // Redirect all other routes to setup
  app.get('*', (_req, res) => {
    res.redirect('/setup');
  });
} else {
  // NORMAL MODE: Load configuration and run app
  console.log('✅ Configuration loaded, starting application...');

  // Load configuration into environment
  loadConfig();

  // Now import modules that depend on env vars (after config is loaded)
  const { db } = await import('./utils/db.js');
  const { setLocalsFromSession } = await import('./middleware/auth.js');
  const authRouter = await import('./routes/auth.js');
  const meetRouter = await import('./routes/meet.js');

  // Session with real secret from config
  app.use(
    session({
      store: new SQLiteStore({
        db: env('SESSION_DB_FILE', 'sessions.sqlite'),
        dir: '.',
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

  // Home/Dashboard
  app.get('/', (req, res) => {
    const user = req.session.user;
    const setupComplete = req.query.setup === 'complete';
    if (!user) {
      return res.render('home', { user: null, baseUrl: env('BASE_URL'), setupComplete });
    }
    const personalUrl = `${env('BASE_URL')}/${user.slug}`;
    return res.render('dashboard', { user, personalUrl });
  });

  // Auth routes
  app.use('/', authRouter.default);

  // Meet routes (slug handling and status)
  app.use('/', meetRouter.default);

  // Initialize DB tables on startup
  db.init();
}

const port = Number(process.env.PORT || '3000');

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  if (!setupComplete) {
    console.log(`🔧 Setup URL: http://localhost:${port}/setup`);
  }
});
