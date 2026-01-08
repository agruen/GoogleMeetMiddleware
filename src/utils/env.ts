export function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const config = {
  allowedDomain: () => env('ALLOWED_DOMAIN', ''),
  allowAnyDomain: () => env('ALLOW_ANY_DOMAIN', 'false') === 'true',
  singleUserMode: () => env('SINGLE_USER_MODE', 'false') === 'true',
  baseUrl: () => env('BASE_URL'),
  oauth: {
    clientId: () => env('GOOGLE_CLIENT_ID'),
    clientSecret: () => env('GOOGLE_CLIENT_SECRET'),
    callbackUrl: () => env('GOOGLE_CALLBACK_URL'),
  },
  meetWindowMs: () => Number(env('MEET_WINDOW_MS', String(5 * 60 * 1000))),
};

