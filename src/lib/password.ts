/**
 * Password hashing for Better Auth that fits Cloudflare's CPU limit.
 *
 * Better Auth's default is scrypt in JavaScript, which can take longer than
 * the 10 ms of CPU a request gets on Workers' free plan (sign-ups and
 * sign-ins then fail). PBKDF2-SHA256 through WebCrypto runs natively on
 * Workers and in Node. 100,000 iterations is the most Workers allow.
 *
 * Stored as `pbkdf2$<iterations>$<salt b64>$<hash b64>`. Hashes made before
 * this (Better Auth's scrypt `salt:key`) still verify, so existing local
 * accounts keep working; they are not re-hashed.
 */

import { verifyPassword as verifyScrypt } from 'better-auth/crypto';

const PREFIX = 'pbkdf2';
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return [PREFIX, ITERATIONS, toBase64(salt), toBase64(hash)].join('$');
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const parts = hash.split('$');
  if (parts[0] !== PREFIX) return verifyScrypt({ hash, password });
  if (parts.length !== 4) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > ITERATIONS) return false;
  const expected = fromBase64(parts[3]!);
  const actual = await derive(password, fromBase64(parts[2]!), iterations);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}
