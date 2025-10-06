import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'node:path';
import morgan from 'morgan';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bodyParser from 'body-parser';
import SQLiteStoreFactory from 'connect-sqlite3';

import { env } from './utils/env.js';
import { db } from './utils/db.js';
import { requireDomainUser, setLocalsFromSession } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import meetRouter from './routes/meet.js';

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
app.use(
  session({
    store: new SQLiteStore({
      db: env('SESSION_DB_FILE', 'sessions.sqlite'),
      dir: '.',
    }),
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

app.use('/public', express.static(path.join(process.cwd(), 'src', 'public')));
app.use(setLocalsFromSession);

// Health
app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// Home/Dashboard
app.get('/', (req, res) => {
  const user = req.session.user;
  if (!user) {
    return res.render('home', { user: null, baseUrl: env('BASE_URL') });
  }
  const personalUrl = `${env('BASE_URL')}/${user.slug}`;
  return res.render('dashboard', { user, personalUrl });
});

// Auth routes
app.use('/', authRouter);

// Meet routes (slug handling and status)
app.use('/', meetRouter);

const port = Number(env('PORT', '3000'));

// Initialize DB tables on startup
db.init();

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
