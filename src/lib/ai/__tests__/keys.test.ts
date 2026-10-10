// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { deriveKeyFromSecret, lastFour, openKey, sealKey } from '../keys';

describe('user API key sealing', () => {
  it('round-trips and never stores the plain key', async () => {
    const key = await deriveKeyFromSecret('test-secret');
    const sealed = await sealKey(key, 'user-1', 'AIzaSyExampleKey1234');
    expect(sealed.ciphertext).not.toContain('AIzaSy');
    expect(await openKey(key, 'user-1', sealed)).toBe('AIzaSyExampleKey1234');
    expect(lastFour(' AIzaSyExampleKey1234 ')).toBe('1234');
  });

  it('refuses another user, another secret or a tampered value', async () => {
    const key = await deriveKeyFromSecret('test-secret');
    const sealed = await sealKey(key, 'user-1', 'secret-value');
    await expect(openKey(key, 'user-2', sealed)).rejects.toThrow();
    await expect(openKey(await deriveKeyFromSecret('other'), 'user-1', sealed)).rejects.toThrow();
    const flipped = { ...sealed, ciphertext: `A${sealed.ciphertext.slice(1)}` };
    if (flipped.ciphertext !== sealed.ciphertext) await expect(openKey(key, 'user-1', flipped)).rejects.toThrow();
  });

  it('uses a fresh nonce each time', async () => {
    const key = await deriveKeyFromSecret('s');
    const a = await sealKey(key, 'u', 'same');
    const b = await sealKey(key, 'u', 'same');
    expect(a.iv).not.toBe(b.iv);
  });
});
