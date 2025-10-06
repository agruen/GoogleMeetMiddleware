# Google Cloud Setup Guide

Use this guide to create the Google Cloud resources that power the Google Meet middleware. It walks you through every screen you will touch, assuming no prior Google Cloud experience.

> **Goal:** By the end you will have a Google Cloud project with OAuth credentials, the Calendar API enabled, and environment variables ready to paste into `.env`.

## 1. Prerequisites
- A Google Workspace account on the domain you plan to allow (for example `you@yourcompany.com`).
- Permission to create projects and OAuth credentials in Google Cloud. Workspace super admins already have this; if you are not an admin, ask one to grant you the **Project Creator** and **OAuth Config Editor** roles or create the resources for you.
- (Optional but recommended) Access to the public DNS for your production domain so you can verify it during the OAuth consent setup.

## 2. Create a Google Cloud project
1. Visit <https://console.cloud.google.com/> and sign in with your Workspace account.
2. In the top navigation bar next to the Google Cloud logo, open the **project selector**.
3. Click **New Project**.
4. Enter a **Project name** (for example `meet-middleware-prod`).
5. Select your organization if prompted.
6. Click **Create**. Google will provision the project (usually within a few seconds).
7. When the notification "Project created" appears, click **Select project** to switch into it.

> If this is your first project, you may be prompted to enable billing. Enabling billing does not incur charges for the Google Calendar API, but Google requires a billing account to use many services. Follow the on-screen steps if prompted.

## 3. Enable required APIs
1. Inside the new project, open the left-hand navigation menu (☰) and choose **APIs & Services → Library**.
2. Search for **Google Calendar API**.
3. Click the **Google Calendar API** result, then click **Enable**. Wait for the confirmation banner.
4. Optional: search for **People API** and enable it if you plan to show additional profile data. The core app does not require it.

## 4. Prepare the OAuth consent screen
The consent screen is what your users see the first time they sign in.

1. Still in **APIs & Services**, click **OAuth consent screen** in the left sidebar.
2. For **User Type** select **Internal** if everyone signing in belongs to your Workspace domain. Choose **External** only if you must allow non-Workspace accounts. (External apps must be verified by Google before they can be used publicly.)
3. Click **Create**.
4. Fill out the **App information** section:
   - **App name**: e.g. `Meet Link Generator`.
   - **User support email**: choose your email or a shared inbox.
   - **Developer contact information**: provide at least one email so Google can reach you about the app.
5. Under **Scopes**, click **Add or Remove Scopes** and check:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
   - `https://www.googleapis.com/auth/calendar.events`
   Scroll down and click **Update**.
6. If you selected the **External** user type, add any Workspace test users who need to log in before verification is complete.
7. Click **Save and Continue** until you reach the summary page, then click **Back to Dashboard**.

### Verify your custom domain (optional but recommended)
If you plan to host the app on a custom domain such as `https://meet.example.com`, verify the domain now so you can list it on the consent screen branding page.

1. In the **OAuth consent screen** settings, open the **Branding** tab and click **Add domain**.
2. Follow the prompt to open the **Search Console** verification flow.
3. Choose **Domain** verification and follow the DNS instructions (usually adding a TXT record). Verification can take a few minutes once the DNS record is in place.
4. After verification succeeds, add the domain (for example `meet.example.com`) to the branding settings and save.

## 5. Create OAuth credentials (Web client)
1. Navigate to **APIs & Services → Credentials**.
2. Click **Create credentials → OAuth client ID**.
3. Choose **Web application**.
4. Name the client (e.g. `Meet middleware web client`).
5. Under **Authorized JavaScript origins** add every base URL that will host the app:
   - For production: `https://meet.example.com`
   - For local development: `http://localhost:3000`
6. Under **Authorized redirect URIs** add the callback paths:
   - Production: `https://meet.example.com/oauth2/callback`
   - Local development: `http://localhost:3000/oauth2/callback`
7. Click **Create**.
8. A modal appears displaying your **Client ID** and **Client secret**. Click **Download JSON** and store it securely, or copy the values to a password manager. You can always return to the credential later to regenerate the secret if needed.

## 6. Map values into environment variables
Copy `.env.example` in the repository to `.env` (and `.env.local` for local overrides) and populate the following entries using the credential you created.

| Variable | Value | Example |
| --- | --- | --- |
| `BASE_URL` | The public base URL for the deployed app | `https://meet.example.com` |
| `ALLOWED_DOMAIN` | Workspace domain allowed to sign in | `yourcompany.com` |
| `SESSION_SECRET` | 32+ character random string | generate with a password manager |
| `GOOGLE_CLIENT_ID` | The client ID from Google Cloud | `1234.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | The client secret from Google Cloud | `GOCSPX-...` |
| `GOOGLE_CALLBACK_URL` | The redirect URI you set above | `https://meet.example.com/oauth2/callback` |
| `MEET_WINDOW_MS` | (Optional) window in milliseconds | `300000` for 5 minutes |
| `DB_FILE` / `SESSION_DB_FILE` | SQLite file paths | For Docker, leave defaults |

For local development, set `BASE_URL=http://localhost:3000` and `GOOGLE_CALLBACK_URL=http://localhost:3000/oauth2/callback` in your local `.env` file.

## 7. Run the app locally to confirm
1. Install dependencies: `npm install`.
2. Start the dev server: `npm run dev`.
3. Visit <http://localhost:3000> and click **Sign in with Google**.
4. Sign in with a Workspace account on the allowed domain and approve the requested scopes.
5. After consent, you should be redirected into the app. A refresh token is stored automatically in the SQLite database.

If you encounter errors during login:
- `redirect_uri_mismatch`: Double-check that the URI in Google Cloud matches `GOOGLE_CALLBACK_URL` exactly (including protocol and trailing slash).
- `Error 403: access_denied`: Make sure the signing-in user belongs to `ALLOWED_DOMAIN` and was added as a test user if the app type is External.
- `unauthorized_client`: Verify you created a **Web application** client, not another type.

## 8. Deploying in production
1. Provision hosting for the Node.js app (for example Docker behind nginx as described in the README).
2. Set the environment variables from step 6 in your hosting environment (Docker secrets, Kubernetes config map, etc.).
3. Ensure the reverse proxy forwards the `X-Forwarded-Proto` header so secure cookies are issued correctly.
4. Confirm that the public HTTPS URL matches `BASE_URL`.

When deploying for the first time, sign in once as a host user to seed the encrypted refresh token. Subsequent logins reuse the stored token until revoked.

## 9. Rotating credentials
- If you regenerate the client secret, update `GOOGLE_CLIENT_SECRET` and restart the application.
- To revoke all refresh tokens, delete the rows in the `tokens` table (or the SQLite database file) and have users sign in again.

## 10. Troubleshooting reference
- **Need multiple environments (dev/staging/prod):** Create a separate OAuth client per environment so that callback URLs stay simple. Copy each set of credentials into the matching `.env` file.
- **Waiting for domain verification:** DNS changes can take up to an hour. Verification happens automatically once Google sees the TXT record.
- **Accidentally created in the wrong project:** Open the project selector, switch to the intended project, and recreate the credentials. Delete unused credentials to avoid confusion.
- **Lost client secret:** Edit the OAuth client in Google Cloud and click **Reset secret**. Remember to update environment variables wherever the app runs.

Once the above steps are complete, your Google Cloud project is ready and the application can authenticate users and create Google Meet links through the Calendar API.
