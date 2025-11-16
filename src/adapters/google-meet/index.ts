import { google } from 'googleapis';
import { config } from '../../utils/env.js';
import { decrypt } from '../../utils/crypto.js';
import { nanoid } from 'nanoid';

const SCOPES = [
  'https://www.googleapis.com/auth/meetings.space.created',
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
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const res = await oauth2.userinfo.get();
  return res.data; // { id, email, given_name, family_name, picture, ... }
}

export async function createMeetWithRefreshToken(refreshTokenEnc: string): Promise<string> {
  const refreshToken = decrypt(refreshTokenEnc);
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const requestId = nanoid();

  try {
    const response = await client.request<{ meetingUri?: string; meetingCode?: string }>({
      url: 'https://meet.googleapis.com/v2/spaces',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {},
    });

    const { meetingUri, meetingCode } = response.data;
    if (meetingUri) return meetingUri;
    if (meetingCode) return `https://meet.google.com/${meetingCode}`;
    throw new Error('Missing meetingUri and meetingCode in Google Meet API response');
  } catch (error) {
    const maybeResponse = (error as { response?: { status?: number; data?: unknown } }).response;
    if (maybeResponse?.status === 403) {
      throw new Error(
        'Google Meet API returned 403. Enable the Meet API and request the meetings.space.created scope.'
      );
    }
    throw error;
  }
}
