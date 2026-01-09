# Multi-User Google Meet Link Generator with Waiting Room

A minimal, production‑ready web app for generating on‑demand Google Meet links with a 5‑minute sharing window and a simple waiting room for external visitors.

---

## 🎯 What This Does (Simple Explanation)

**GoogleMeetMiddleware** helps employees share Google Meet links with visitors in a smart, controlled way.

### The Problem It Solves

Instead of creating a new Meet link every time you need a video call and texting/emailing it to people, this app gives you a **personal permanent URL** (like `meet.yourcompany.com/john`) that you can share once and use forever.

### How It Works

1. **Employees log in** with their company Google account
2. **They get a personal link** (e.g., `meet.yourcompany.com/john`)
3. **They share this link** with visitors/clients (can even print it on a business card!)
4. When a **visitor clicks the link**, they see a "waiting room" page
5. When **you (the host) click your own link**, it:
   - Creates a fresh Google Meet
   - Automatically sends the meet link to any waiting visitors
   - Redirects you to the meeting
6. **Visitors get automatically redirected** to join you in real-time (no refresh needed!)

### Key Benefits

- **One permanent link per employee** - No more creating and sharing new Meet links
- **5-minute window** - The Meet link stays valid for 5 minutes after creation
- **Real-time updates** - Visitors don't need to refresh; they're automatically redirected
- **Secure & controlled** - Only company employees can be hosts
- **Easy setup** - Web-based configuration wizard (no manual editing needed)

Think of it as a smart "receptionist" for your Google Meets - visitors wait in the lobby, and when you arrive, they're automatically let in!

---

## 🏢 Deployment Options

The app supports three deployment modes depending on your needs:

### Enterprise Mode (Default)
**Best for**: Companies with Google Workspace

- Set `ALLOWED_DOMAIN=yourcompany.com` to restrict login to your organization
- Each employee gets a personal meeting link (e.g., `/john`, `/jane`)
- Requires Google Workspace admin to create OAuth credentials (or delegate to users with the right roles)

### Personal/Team Mode
**Best for**: Personal Gmail accounts or small teams without Workspace admin access

- Set `ALLOW_ANY_DOMAIN=true` to allow any Google account
- Multiple users can each have their own meeting link
- Each user creates their own Google Cloud project for OAuth credentials
- OAuth consent screen set to "External" mode (limited to 100 test users until verified)

### Single-User Mode
**Best for**: Individual users who want the simplest possible setup

- Set `SINGLE_USER_MODE=true` along with `ALLOW_ANY_DOMAIN=true`
- Only the first person to log in can use the app
- The root URL (`/`) becomes your meeting link - no personal slug needed!
- Visitors go to your base URL and see the waiting room
- When you visit, a meeting is created and visitors are redirected automatically

---

## 🔧 Technical Overview

- **Backend**: Node.js + Express (TypeScript)
- **Auth**: Google OAuth 2.0 (flexible: domain-restricted, any account, or single-user)
- **Meet creation**: Google Meet API (`meetings.create`)
- **Persistence**: SQLite (file‑based)
- **Sessions**: express‑session + connect-sqlite3
- **Real-time**: Server-Sent Events (SSE) for instant notifications
- **UI**: EJS templates with minimal CSS
- **Container**: Dockerfile + docker-compose (ARM/Raspberry Pi‑friendly)
- **🆕 Easy Setup Mode**: Web-based configuration interface for first-time setup

## ✨ Features

- ✅ Google OAuth with flexible domain control:
  - Restrict to a specific domain (e.g., `yourcompany.com`)
  - Allow any Google account (`ALLOW_ANY_DOMAIN=true`)
  - Single-user mode for personal deployments (`SINGLE_USER_MODE=true`)
- ✅ Personal persistent Meet endpoint per user (e.g., `/john`)
- ✅ **Single-user mode**: Root URL (`/`) acts as the meeting link - no slug needed
- ✅ Host visit creates a new Meet if no active window; redirects host automatically
- ✅ External visitors within window join same Meet; else see a waiting room
- ✅ Waiting room uses Server‑Sent Events (SSE) for instant notifications (no polling)
- ✅ Configurable meet window duration via `MEET_WINDOW_MS` (default 5 minutes)
- ✅ Long‑lived sessions using refresh tokens (stored encrypted at rest with AES-256-GCM)
- ✅ Healthcheck endpoint at `/healthz` for monitoring
- ✅ CSRF protection, rate limiting, and security headers (Helmet)
- ✅ Docker deployment with volume persistence and permission checks
- ✅ **Web-based setup wizard** with automatic configuration

## 📁 Project Layout

```
src/
  index.ts                 # Main application entry point
  adapters/google-meet/    # Google API integration
  middleware/              # Auth checks, session handling
  routes/                  # API endpoints (auth, meet, setup)
  utils/                   # DB, encryption, config, SSE
  views/                   # EJS templates
  public/                  # Static CSS/JS assets
config/                    # Application configuration
tests/                     # Unit tests
```

---

## 🚀 Quick Start (Recommended)

The easiest way to get started is with the **web-based setup mode**:

### 1. Start the Application

```bash
# With Docker (recommended)
docker compose up --build -d

# Or locally with Node.js
npm install
npm run dev
```

### 2. Open Setup Interface

Visit **http://localhost:3000** (or **http://localhost:8014** if using the default docker-compose.yml port mapping) in your browser. Since no configuration exists yet, you'll automatically be redirected to the setup page.

### 3. Follow the Setup Wizard

The setup interface will guide you through:
- Configuring your base URL and allowed domain
- Setting up Google OAuth credentials (with detailed instructions)
- Generating a secure session secret
- Optional advanced settings

### 4. Complete Setup

After saving your configuration:
- **Docker**: Restart with `docker compose restart app`
- **Local**: Restart the app (Ctrl+C and `npm run dev`)

The configuration is saved to `config/app-config.json` and automatically loaded on startup.

That's it! Your application is ready to use. Visit http://localhost:3000 to log in.

---

## 📋 Prerequisites

- Google Cloud project with OAuth consent screen configured for your Workspace
- OAuth 2.0 Client ID (Web app) + secret
- Google Meet API enabled for the project
- Redirect URI pointing to your app's callback, e.g. `https://meet.example.com/oauth2/callback`

**💡 Don't have Google Cloud set up yet?** No problem! The setup interface includes a detailed guide with step-by-step instructions. Just start the app and click "Setup Instructions" when you get to the setup page.

---

## ⚙️ Manual Configuration (Advanced)

If you prefer to configure manually or already have your credentials ready, you can use environment variables or directly edit the config file.

### Google Cloud Setup

If you have never configured Google Cloud before, follow the step-by-step guide in
`docs/google-cloud-setup.md`. It covers creating the project, enabling the Google Meet API, configuring
the OAuth consent screen, and obtaining your credentials.

Already familiar with the basics? Here's the fast checklist:
- Create/select a Google Cloud project that belongs to your Workspace organization.
- Configure the OAuth consent screen (Internal is recommended) with scopes `openid`, `email`,
  `profile`, and `https://www.googleapis.com/auth/meetings.space.created`.
- Enable the Google Meet API for the project.
- Create an OAuth **Web application** client with redirect URIs
  `<BASE_URL>/oauth2/callback` and `http://localhost:3000/oauth2/callback` for local testing.
- Copy the client ID, secret, and callback URL for use in configuration.
- Launch the app and sign in once to persist the encrypted refresh token in SQLite.

### Configuration Options

The app supports two configuration methods (environment variables take precedence):

#### Option 1: Environment Variables (.env)
Copy `.env.example` to `.env` and fill in values:

- `BASE_URL`: Public URL (e.g., `https://meet.example.com`).
- `ALLOWED_DOMAIN`: Workspace domain (e.g., `yourcompany.com`). **Optional** - leave empty if using `ALLOW_ANY_DOMAIN`.
- `ALLOW_ANY_DOMAIN`: Set to `true` to allow any Google account (ignores `ALLOWED_DOMAIN`).
- `SINGLE_USER_MODE`: Set to `true` for single-user deployments where only the first login can use the app.
- `SESSION_SECRET`: Random 32+ char secret (32+ characters).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL`.
- `MEET_WINDOW_MS`: Window in ms (default 300000).
- `DB_FILE` and `SESSION_DB_FILE`: SQLite file paths (use `/data/app.sqlite` and `/data/sessions.sqlite` for Docker).

#### Option 2: Config File (Docker deployments)
When using Docker, configuration is stored in `config/app-config.json`. The setup wizard creates this file automatically, or you can create it manually:

```json
{
  "BASE_URL": "https://meet.example.com",
  "ALLOWED_DOMAIN": "yourcompany.com",
  "ALLOW_ANY_DOMAIN": "false",
  "SINGLE_USER_MODE": "false",
  "GOOGLE_CLIENT_ID": "your-client-id.apps.googleusercontent.com",
  "GOOGLE_CLIENT_SECRET": "GOCSPX-...",
  "GOOGLE_CALLBACK_URL": "https://meet.example.com/oauth2/callback",
  "SESSION_SECRET": "your-random-secret-32plus-chars",
  "PORT": "3000",
  "MEET_WINDOW_MS": "300000",
  "DB_FILE": "/data/app.sqlite",
  "SESSION_DB_FILE": "/data/sessions.sqlite",
  "NODE_ENV": "production"
}
```

**Single-user mode example** (for personal use):
```json
{
  "BASE_URL": "https://meet.mysite.com",
  "ALLOWED_DOMAIN": "",
  "ALLOW_ANY_DOMAIN": "true",
  "SINGLE_USER_MODE": "true",
  "GOOGLE_CLIENT_ID": "your-client-id.apps.googleusercontent.com",
  "GOOGLE_CLIENT_SECRET": "GOCSPX-...",
  "GOOGLE_CALLBACK_URL": "https://meet.mysite.com/oauth2/callback",
  "SESSION_SECRET": "your-random-secret-32plus-chars",
  "PORT": "3000",
  "MEET_WINDOW_MS": "300000",
  "DB_FILE": "/data/app.sqlite",
  "SESSION_DB_FILE": "/data/sessions.sqlite",
  "NODE_ENV": "production"
}
```

**Important for Docker**: Ensure `DB_FILE` and `SESSION_DB_FILE` use absolute paths pointing to `/data/` to match the volume mount in `docker-compose.yml`.

---

## 💻 Local Development

```bash
npm install
npm run dev
# Visit http://localhost:3000
```

---

## 🐳 Docker Deployment

Build and run with Docker Compose:

```bash
docker compose up --build -d
```

- Uses `node:20-bookworm-slim` with native build tools in builder stage.
- Persists SQLite DBs under `./data` on the host.
- Persists configuration in `./config/app-config.json` on the host.
- Exposes port `3000` internally (mapped to `8014` by default in docker-compose.yml).
- Configuration is loaded from `config/app-config.json` (created by setup wizard) or environment variables.

If building directly with Docker for a specific ARM platform:

```bash
docker buildx build --platform linux/arm64 -t google-meet-middleware:arm64 .
```

---

## 🔄 Reverse Proxy (nginx example)

The app assumes it runs behind a reverse proxy that terminates TLS. The server is configured with `app.set('trust proxy', 1)` and uses `secure: 'auto'` session cookies so HTTPS cookies are set correctly when `X-Forwarded-Proto` is `https`.

```nginx
server {
  listen 80;
  server_name meet.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    # Recommended for SSE (disable buffering)
    proxy_buffering off;
  }
}
```

---

## 📖 Usage

### Multi-User Mode (Default)

1. Visit `/` and log in with your allowed Google account
2. Dashboard shows your personal URL, e.g., `https://meet.example.com/john`
3. **As host**: Visit your URL to create a Meet and be redirected automatically
4. **External visitors**: Visit the same URL
   - If within 5 minutes of host creation → Auto-redirect to the Meet
   - Otherwise → Waiting page with real-time notifications until host joins

### Single-User Mode

1. Visit `/` and log in - you become the only authorized user
2. Your meeting link is simply your base URL (e.g., `https://meet.example.com`)
3. **As host**: Visit `/` to create a Meet and be redirected automatically
4. **External visitors**: Visit your base URL
   - If within 5 minutes of host creation → Auto-redirect to the Meet
   - Otherwise → Waiting page with real-time notifications until you join

---

## 🔒 Security Notes

- Refresh tokens are encrypted at rest using AES‑256‑GCM derived from `SESSION_SECRET`
- Domain restriction options:
  - `ALLOWED_DOMAIN`: Only users with emails ending in `@ALLOWED_DOMAIN` can authenticate
  - `ALLOW_ANY_DOMAIN`: Any Google account can authenticate (use with caution)
  - `SINGLE_USER_MODE`: Only the first authenticated user can use the app
- CSRF protection on all forms (API endpoints exempted for SSE compatibility)
- Rate limiting on authentication endpoints to prevent brute-force attacks
- Session regeneration after login to prevent session fixation
- Security headers via Helmet middleware (X-Frame-Options, Referrer-Policy, etc.)
- HTTPOnly, Secure, SameSite cookies
- Docker container runs as non-root user for improved isolation
- Audit logging for security events
- No PII is logged beyond essentials; avoid adding sensitive logs

---

## 🛠️ Scripts

- `npm run dev`: Start dev server with live reload
- `npm run build`: TypeScript build to `dist/`
- `npm start`: Run the compiled server
- `npm test`: Run unit tests (basic utils coverage included)

---

## 🧪 Tests

Minimal unit tests for utilities (slug + crypto). API/adapter tests should mock Google APIs. Extend under `tests/` as needed; avoid network calls.

---

## 📝 Notes

- Meeting events are created with a 1‑hour duration solely to obtain a Meet URL; the app's active window for sharing is governed independently by `MEET_WINDOW_MS`
- If multiple visitors arrive concurrently, only the host visit triggers meet creation; others will be redirected once active
- To rotate secrets/tokens, re‑authenticate users and update `.env` as required
- The waiting room uses Server-Sent Events (SSE) for push notifications - no polling overhead!
- Personal slugs are auto-generated from first names (e.g., "John Doe" → `/john`); duplicates get numeric suffixes

---

## 📄 License

MIT

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.
