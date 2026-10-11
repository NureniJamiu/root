// @vitest-environment node
import { hashPassword as scryptHash } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../password';

describe('password hashing', () => {
  it('hashes with PBKDF2 and verifies only the right password', async () => {
    const hash = await hashPassword('correct horse');
    expect(hash).toMatch(/^pbkdf2\$100000\$/);
    expect(await hashPassword('correct horse')).not.toBe(hash); // salted
    expect(await verifyPassword({ hash, password: 'correct horse' })).toBe(true);
    expect(await verifyPassword({ hash, password: 'wrong horse' })).toBe(false);
  });

  it('still accepts passwords hashed before the switch (Better Auth scrypt)', async () => {
    const old = await scryptHash('older password');
    expect(await verifyPassword({ hash: old, password: 'older password' })).toBe(true);
    expect(await verifyPassword({ hash: old, password: 'nope' })).toBe(false);
  });

  it('refuses a malformed or overly costly hash', async () => {
    expect(await verifyPassword({ hash: 'pbkdf2$abc', password: 'x' })).toBe(false);
    expect(await verifyPassword({ hash: 'pbkdf2$99999999$AAAA$AAAA', password: 'x' })).toBe(false);
  });
});
