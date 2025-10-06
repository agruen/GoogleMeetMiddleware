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
  if (!exists(desired)) return desired;
  let n = 2;
  while (exists(`${desired}${n}`)) n++;
  return `${desired}${n}`;
}
