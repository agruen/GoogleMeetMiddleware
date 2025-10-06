# Multi-User Google Meet Link Generator with Waiting Room

A minimal, production‑ready web app for generating on‑demand Google Meet links with a 5‑minute sharing window and a simple waiting room for external visitors.

- Backend: Node.js + Express (TypeScript)
- Auth: Google OAuth 2.0 (Workspace domain‑restricted)
- Meet creation: Google Calendar API (conferenceData createRequest)
- Persistence: SQLite (file‑based)
- Sessions: express‑session + connect-sqlite3
- UI: EJS templates with minimal CSS
- Container: Dockerfile + docker-compose (ARM/Raspberry Pi‑friendly)

## Features
- Google OAuth restricted to `ALLOWED_DOMAIN` (e.g., `workingpaper.co`).
- Personal persistent Meet endpoint per user (e.g., `/john`).
- Host visit creates a new Meet if no active window; redirects host.
- External visitors within window join same Meet; else see a waiting room.
- Waiting room uses Server‑Sent Events (SSE) to be notified when the host starts a meet, then redirects immediately (no polling).
- Configurable meet window duration via `MEET_WINDOW_MS` (default 5 minutes).
- Long‑lived sessions using refresh tokens (stored encrypted at rest).
- Healthcheck endpoint at `/healthz`.

## Project Layout
```
src/
  index.ts
  adapters/google-meet/
  middleware/
  routes/
  utils/
  views/
  public/
config/
tests/
```

## Prerequisites
- Google Cloud project with OAuth consent screen configured for your Workspace.
- OAuth 2.0 Client ID (Web app) + secret.
- Calendar API enabled for the project.
- Redirect URI pointing to your app’s callback, e.g. `https://meet.example.com/oauth2/callback`.

## Google Cloud Setup
If you have never configured Google Cloud before, follow the step-by-step guide in
`docs/google-cloud-setup.md`. It covers creating the project, enabling the Calendar API, configuring
the OAuth consent screen, and mapping credentials into your environment variables.

Already familiar with the basics? Here's the fast checklist:
- Create/select a Google Cloud project that belongs to your Workspace organization.
- Configure the OAuth consent screen (Internal is recommended) with scopes `openid`, `email`,
  `profile`, and `https://www.googleapis.com/auth/calendar.events`.
- Enable the Google Calendar API for the project.
- Create an OAuth **Web application** client with redirect URIs
  `<BASE_URL>/oauth2/callback` and `http://localhost:3000/oauth2/callback` for local testing.
- Copy the client ID, secret, and callback URL into `.env` (`GOOGLE_CLIENT_ID`,
  `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL`).
- Launch the app and sign in once to persist the encrypted refresh token in SQLite.

## Configuration (.env)
Copy `.env.example` to `.env` and fill in values:

- `BASE_URL`: Public URL (e.g., `https://meet.example.com`).
- `ALLOWED_DOMAIN`: Workspace domain (e.g., `workingpaper.co`).
- `SESSION_SECRET`: Random 32+ char secret.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL`.
- `MEET_WINDOW_MS`: Window in ms (default 300000).
- `DB_FILE` and `SESSION_DB_FILE`: SQLite file paths (overridden in compose to `/data/*`).

## Local Development
```
npm i
npm run dev
# visit http://localhost:3000
```

## Docker (Raspberry Pi / ARM)
Build and run with compose:
```
docker-compose up --build -d
```
- Uses `node:20-bookworm-slim` with native build tools in builder stage.
- Persists SQLite DBs under `./data` on the host.
- Exposes port `3000` by default.

If building directly with Docker for a specific ARM platform:
```
docker buildx build --platform linux/arm64 -t google-meet-middleware:arm64 .
```

## Reverse Proxy (nginx example)
The app assumes it runs behind a reverse proxy that terminates TLS. The server is configured with `app.set('trust proxy', 1)` and uses `secure: 'auto'` session cookies so HTTPS cookies are set correctly when `X-Forwarded-Proto` is `https`.

```
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

## Usage
- Visit `/` and log in with your `@ALLOWED_DOMAIN` account.
- Dashboard shows your personal URL, e.g., `https://meet.example.com/john`.
- As host: visit your URL to create a Meet and be redirected.
- External visitors: visit the same URL; if within 5 minutes of host creation, auto‑redirect to the Meet; otherwise, a waiting page polls until a meet is active.

## Security Notes
- Refresh tokens are encrypted at rest using AES‑256‑GCM derived from `SESSION_SECRET`.
- Only users with emails ending in `@ALLOWED_DOMAIN` can authenticate.
- No PII is logged beyond essentials; avoid adding sensitive logs.

## Scripts
- `npm run dev`: Start dev server with live reload.
- `npm run build`: TypeScript build to `dist/`.
- `npm start`: Run the compiled server.
- `npm test`: Run unit tests (basic utils coverage included).

## Tests
Minimal unit tests for utilities (slug + crypto). API/adapter tests should mock Google APIs. Extend under `tests/` as needed; avoid network calls.

## Notes
- Meeting events are created with a 1‑hour duration solely to obtain a Meet URL; the app’s active window for sharing is governed independently by `MEET_WINDOW_MS`.
- If multiple visitors arrive concurrently, only the host visit triggers meet creation; others will be redirected once active.
- To rotate secrets/tokens, re‑authenticate users and update `.env` as required.
