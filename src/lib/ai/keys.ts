/**
 * Encrypting the API keys people add in AI settings.
 *
 * Keys are sealed with AES-256-GCM before they reach the database and opened
 * only on the server, just before a call. The browser never receives a key
 * back: settings show its last four characters.
 *
 * Uses WebCrypto (`crypto.subtle`), which Node and other JavaScript runtimes
 * share, so nothing here is Node-only.
 */

export interface SealedKey {
  /** Base64 ciphertext with its GCM tag. */
  readonly ciphertext: string;
  /** Base64 12-byte nonce. */
  readonly iv: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * The AES key, derived from a server secret with HKDF so the secret itself
 * (which may also sign sessions) is never used as a key directly.
 */
export async function deriveKeyFromSecret(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error('An encryption secret is required.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('root.ai.user-keys.v1'), info: new Uint8Array() },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Seal `plain` for the user it belongs to; the user id is bound as associated data. */
export async function sealKey(key: CryptoKey, userId: string, plain: string): Promise<SealedKey> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(userId) },
    key,
    encoder.encode(plain),
  );
  return { ciphertext: toBase64(new Uint8Array(data)), iv: toBase64(iv) };
}

/** Open a sealed key. Throws when it was tampered with or sealed for another user. */
export async function openKey(key: CryptoKey, userId: string, sealed: SealedKey): Promise<string> {
  const data = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.iv), additionalData: encoder.encode(userId) },
    key,
    fromBase64(sealed.ciphertext),
  );
  return decoder.decode(data);
}

/** The part of a key settings may show. */
export function lastFour(apiKey: string): string {
  return apiKey.trim().slice(-4);
}
