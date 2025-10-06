import { nextAvailableSlug, toSlugBase } from '../../src/utils/slug';

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
});

