import { google } from 'googleapis';
import { config } from '../../utils/env.js';
import { decrypt } from '../../utils/crypto.js';
import { nanoid } from 'nanoid';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'openid',
  'email',
  'profile'
];

export function oauthClient() {
  const oAuth2Client = new google.auth.OAuth2(
    config.oauth.clientId(),
    config.oauth.clientSecret(),
    config.oauth.callbackUrl()
  );
  return oAuth2Client;
}

export function generateAuthUrl() {
  const client = oauthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });
}

export async function getTokensFromCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

export async function getUserInfo(accessToken: string) {
  const oauth2 = google.oauth2('v2');
  const res = await oauth2.userinfo.get({ access_token: accessToken });
  return res.data; // { id, email, given_name, family_name, picture, ... }
}

export async function createMeetWithRefreshToken(refreshTokenEnc: string): Promise<string> {
  const refreshToken = decrypt(refreshTokenEnc);
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: 'v3', auth: client });
  const requestId = nanoid();

  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour dummy event duration

  const res = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    requestBody: {
      summary: 'Ad-hoc Meeting',
      description: 'Created by Google Meet Middleware',
      start: { dateTime: now.toISOString() },
      end: { dateTime: end.toISOString() },
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    },
  });

  const event = res.data;
  const entryPoints = event.conferenceData?.entryPoints;
  const meetUrl = entryPoints?.find((e) => e.entryPointType === 'video')?.uri || event.hangoutLink;
  if (!meetUrl) throw new Error('Failed to get Meet URL from Google');
  return meetUrl;
}
