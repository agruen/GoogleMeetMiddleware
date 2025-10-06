import { decrypt, encrypt } from '../../src/utils/crypto';

process.env.SESSION_SECRET = 'test-secret-1234567890';

describe('crypto utils', () => {
  test('encrypt/decrypt roundtrip', () => {
    const input = 'hello-world';
    const enc = encrypt(input);
    expect(enc).not.toBe(input);
    const dec = decrypt(enc);
    expect(dec).toBe(input);
  });
});

