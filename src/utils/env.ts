export function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function envMs(name: string, fallbackMs: number): number {
  const raw = env(name, String(fallbackMs));
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`[Config] Invalid ${name}="${raw}", falling back to ${fallbackMs}ms`);
    return fallbackMs;
  }
  return parsed;
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
  // Grace window after creation during which a meeting is assumed joinable
  // without asking Google (the conference may not have started yet).
  meetWindowMs: () => envMs('MEET_WINDOW_MS', 5 * 60 * 1000),
  // Hard upper bound on how long a stored meeting can be offered to anyone.
  // Between the grace window and this age, joins require a live conference.
  meetMaxAgeMs: () => envMs('MEET_MAX_AGE_MS', 8 * 60 * 60 * 1000),
};

