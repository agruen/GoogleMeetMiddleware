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
    if (!code) return res.status(400).send('Missing code');
    const tokens = await getTokensFromCode(code);
    const access = tokens.access_token;
    const refresh = tokens.refresh_token;
    if (!access) return res.status(400).send('No access token');
    if (!refresh) {
      // In some cases Google may not send a refresh token if not prompting consent
      // Re-initiate auth forcing consent
      return res.redirect('/login');
    }
    const profile = await getUserInfo(access);
    const email = profile.email as string;
    const domain = config.allowedDomain();
    if (!email || !email.endsWith(`@${domain}`)) {
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

    req.session.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName ?? undefined,
      slug: user.slug,
      googleId: user.googleId,
    };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('OAuth failed');
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

export default router;

