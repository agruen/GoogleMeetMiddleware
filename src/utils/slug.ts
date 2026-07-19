/**
 * Validate that a slug contains only safe characters
 * Slugs must be 1-50 chars, lowercase alphanumeric and hyphens only
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$/.test(slug);
}

// Top-level paths owned by the app. A user slug matching one of these would
// make the personal meeting URL unreachable (e.g. a user named "Login").
export const RESERVED_SLUGS = new Set([
  'api',
  'healthz',
  'public',
  'login',
  'logout',
  'oauth2',
  'setup',
  'admin',
  'assets',
  'static',
  'favicon',
  'robots',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug);
}

export function toSlugBase(firstName: string, email: string): string {
  const base = (firstName || email.split('@')[0] || 'user')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'user';
}

export function nextAvailableSlug(
  desired: string,
  exists: (slug: string) => boolean
): string {
  if (!isReservedSlug(desired) && !exists(desired)) return desired;
  let n = 2;
  while (exists(`${desired}${n}`)) n++;
  return `${desired}${n}`;
}
