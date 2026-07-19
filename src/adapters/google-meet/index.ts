import { google } from 'googleapis';
import { config } from '../../utils/env.js';
import { decrypt } from '../../utils/crypto.js';

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

export type CreatedMeet = {
  meetUrl: string;
  // Meet API resource name ("spaces/{space}"), used later to check whether
  // the space still has an active conference. Null if Google omitted it.
  spaceName: string | null;
};

const SPACE_NAME_RE = /^spaces\/[A-Za-z0-9_-]+$/;

function authedClient(refreshTokenEnc: string) {
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(refreshTokenEnc) });
  return client;
}

export async function createMeetWithRefreshToken(refreshTokenEnc: string): Promise<CreatedMeet> {
  const client = authedClient(refreshTokenEnc);

  try {
    const response = await client.request<{
      name?: string;
      meetingUri?: string;
      meetingCode?: string;
    }>({
      url: 'https://meet.googleapis.com/v2/spaces',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {},
    });

    const { name, meetingUri, meetingCode } = response.data;
    const spaceName = name && SPACE_NAME_RE.test(name) ? name : null;
    if (meetingUri) return { meetUrl: meetingUri, spaceName };
    if (meetingCode) return { meetUrl: `https://meet.google.com/${meetingCode}`, spaceName };
    throw new Error('Missing meetingUri and meetingCode in Google Meet API response');
  } catch (error) {
    const maybeResponse = (error as { response?: { status?: number; data?: unknown } }).response;
    if (maybeResponse?.status === 403) {
      throw new Error(
        'Google Meet API returned 403. Enable the Meet API and request the ' +
          'meetings.space.created scope.'
      );
    }
    throw error;
  }
}

/**
 * Whether the space currently has a conference in progress (someone is in the
 * call). Requires only the meetings.space.created scope for spaces this app
 * created. Throws on API errors so callers can decide how to degrade.
 */
export async function spaceHasActiveConference(
  refreshTokenEnc: string,
  spaceName: string
): Promise<boolean> {
  if (!SPACE_NAME_RE.test(spaceName)) {
    throw new Error(`Invalid Meet space name: ${spaceName}`);
  }
  const client = authedClient(refreshTokenEnc);
  const response = await client.request<{ activeConference?: { conferenceRecord?: string } }>({
    url: `https://meet.googleapis.com/v2/${spaceName}`,
    method: 'GET',
  });
  return Boolean(response.data.activeConference?.conferenceRecord);
}
