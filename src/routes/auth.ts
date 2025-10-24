import { Router } from 'express';
import { config } from '../utils/env.js';
import { db } from '../utils/db.js';
import { encrypt } from '../utils/crypto.js';
import { generateAuthUrl, getTokensFromCode, getUserInfo } from '../adapters/google-meet/index.js';
import { nextAvailableSlug, toSlugBase } from '../utils/slug.js';

const router = Router();

router.get('/login', (_req, res) => {
  const url = generateAuthUrl();
  res.redirect(url);
});

router.get('/oauth2/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    if (!code) {
      console.warn('[Auth] OAuth callback missing authorization code');
      return res.status(400).send('Missing code');
    }
    const tokens = await getTokensFromCode(code);
    const access = tokens.access_token;
    const refresh = tokens.refresh_token;
    if (!access) {
      console.warn('[Auth] OAuth callback received no access token');
      return res.status(400).send('No access token');
    }
    if (!refresh) {
      console.warn('[Auth] OAuth callback missing refresh token, re-initiating consent');
      // In some cases Google may not send a refresh token if not prompting consent
      // Re-initiate auth forcing consent
      return res.redirect('/login');
    }
    const profile = await getUserInfo(access);
    const email = profile.email as string;
    const domain = config.allowedDomain();
    if (!email || !email.endsWith(`@${domain}`)) {
      console.warn(`[Auth] Login attempt from unauthorized domain: ${email}`);
      return res.status(403).send('Email domain not allowed');
    }
    const googleId = profile.id as string;
    const firstName = (profile.given_name as string) || email.split('@')[0];
    const lastName = (profile.family_name as string) || '';

    let user = db.findUserByGoogleId(googleId) || db.findUserByEmail(email);
    const refreshTokenEnc = encrypt(refresh);
    if (!user) {
      const desired = toSlugBase(firstName, email);
      const slug = nextAvailableSlug(desired, (s) => !!db.findUserBySlug(s));
      user = db.insertUser({
        googleId,
        email,
        firstName,
        lastName,
        slug,
        refreshTokenEnc,
      });
    } else {
      db.updateUserRefreshToken(user.id, refreshTokenEnc);
    }

    // Regenerate session to prevent session fixation attacks
    const userData = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName ?? undefined,
      slug: user.slug,
      googleId: user.googleId,
    };

    req.session.regenerate((err) => {
      if (err) {
        console.error('[Auth] Session regeneration failed:', err);
        return res.status(500).send('Authentication failed');
      }

      req.session.user = userData;
      console.log(`[Auth] User ${userData.email} logged in successfully`);
      res.redirect('/');
    });
  } catch (err) {
    console.error('[Auth] OAuth error:', err);
    res.status(500).send('OAuth failed');
  }
});

router.post('/logout', (req, res) => {
  const userEmail = req.session.user?.email;
  req.session.destroy(() => {
    if (userEmail) {
      console.log(`[Auth] User ${userEmail} logged out`);
    }
    res.redirect('/');
  });
});

export default router;

