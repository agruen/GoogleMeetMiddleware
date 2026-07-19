import { isReservedSlug, isValidSlug, nextAvailableSlug, toSlugBase } from '../../src/utils/slug';

describe('slug utils', () => {
  test('toSlugBase uses first name', () => {
    expect(toSlugBase('John', 'john@x.com')).toBe('john');
  });
  test('toSlugBase falls back to email local part', () => {
    expect(toSlugBase('', 'Jane.Doe+1@x.com')).toBe('jane-doe-1');
  });
  test('nextAvailableSlug appends number', () => {
    const existing = new Set(['john', 'john2', 'john3']);
    const slug = nextAvailableSlug('john', (s) => existing.has(s));
    expect(slug).toBe('john4');
  });
  test('reserved slugs are never assigned bare', () => {
    expect(isReservedSlug('login')).toBe(true);
    expect(isReservedSlug('api')).toBe(true);
    expect(isReservedSlug('john')).toBe(false);
    // A user named "Login" must not shadow the /login route.
    expect(nextAvailableSlug('login', () => false)).toBe('login2');
  });
  test('isValidSlug enforces charset and length', () => {
    expect(isValidSlug('john')).toBe(true);
    expect(isValidSlug('john-doe2')).toBe(true);
    expect(isValidSlug('John')).toBe(false);
    expect(isValidSlug('favicon.ico')).toBe(false);
    expect(isValidSlug('-john')).toBe(false);
    expect(isValidSlug('')).toBe(false);
    expect(isValidSlug('a'.repeat(51))).toBe(false);
  });
});

