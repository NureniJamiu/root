/**
 * The small part of Stripe's API that billing uses, over plain `fetch`, so
 * the same code runs on Node and on Workers without the Stripe SDK.
 *
 *   - Customers, Checkout Sessions and Billing Portal sessions (create)
 *   - Subscriptions, Checkout Sessions and Prices (read)
 *   - Webhook signatures (checked with Web Crypto)
 *
 * Test mode or live mode is decided by the key: `sk_test_…` never moves money.
 */

const API = 'https://api.stripe.com/v1';

export class StripeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'StripeError';
  }
}

/** Only the fields billing reads. */
export interface StripeSubscription {
  readonly id: string;
  readonly customer: string;
  readonly status: string;
  readonly cancel_at_period_end: boolean;
  /** Older API versions put the period end here; newer ones on each item. */
  readonly current_period_end?: number;
  readonly items?: { readonly data: ReadonlyArray<{ readonly current_period_end?: number; readonly price?: { readonly id: string } }> };
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface StripeCheckoutSession {
  readonly id: string;
  readonly url: string | null;
  readonly mode: string;
  readonly customer: string | null;
  readonly subscription: string | null;
  readonly client_reference_id: string | null;
}

export interface StripePrice {
  readonly id: string;
  readonly unit_amount: number | null;
  readonly currency: string;
  readonly recurring: { readonly interval: string; readonly interval_count: number } | null;
}

export interface StripeEvent {
  readonly id: string;
  readonly type: string;
  readonly data: { readonly object: Record<string, unknown> };
}

type Params = Record<string, unknown>;

/** Stripe's form encoding: `line_items[0][price]=…`, `metadata[userId]=…`. */
export function encodeForm(params: Params, prefix = ''): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item !== null && typeof item === 'object') parts.push(encodeForm(item as Params, `${name}[${i}]`));
        else parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === 'object') {
      parts.push(encodeForm(value as Params, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join('&');
}

export interface StripeClient {
  readonly testMode: boolean;
  createCustomer(params: { email: string; name?: string | undefined; userId: string }): Promise<{ id: string }>;
  createCheckoutSession(params: Params): Promise<StripeCheckoutSession>;
  getCheckoutSession(id: string): Promise<StripeCheckoutSession>;
  createPortalSession(params: { customer: string; return_url: string }): Promise<{ url: string }>;
  getSubscription(id: string): Promise<StripeSubscription>;
  getPrice(id: string): Promise<StripePrice>;
}

export function createStripeClient(secretKey: string, fetchImpl: typeof fetch = fetch): StripeClient {
  async function call<T>(method: 'GET' | 'POST', path: string, params?: Params, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}` };
    let body: string | null = null;
    if (method === 'POST') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = encodeForm(params ?? {});
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    }
    const res = await fetchImpl(`${API}${path}`, { method, headers, body });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } } & T;
    if (!res.ok) throw new StripeError(json.error?.message ?? `Stripe answered ${res.status}`, res.status, json.error?.code);
    return json;
  }

  return {
    testMode: /^(sk|rk)_test_/.test(secretKey),
    createCustomer: ({ email, name, userId }) =>
      // One customer per person even if they click Upgrade twice at once.
      call('POST', '/customers', { email, name, metadata: { userId } }, `root-customer-${userId}`),
    createCheckoutSession: (params) => call('POST', '/checkout/sessions', params),
    getCheckoutSession: (id) => call('GET', `/checkout/sessions/${encodeURIComponent(id)}`),
    createPortalSession: (params) => call('POST', '/billing_portal/sessions', params),
    getSubscription: (id) => call('GET', `/subscriptions/${encodeURIComponent(id)}`),
    getPrice: (id) => call('GET', `/prices/${encodeURIComponent(id)}`),
  };
}

/** When the subscription's paid period ends, as an ISO date, whichever API version answered. */
export function periodEndOf(sub: StripeSubscription): string | null {
  const seconds = sub.current_period_end ?? sub.items?.data[0]?.current_period_end;
  return typeof seconds === 'number' ? new Date(seconds * 1000).toISOString() : null;
}

/* -------------------------------------------------------------------------- */
/* Webhook signatures                                                         */
/* -------------------------------------------------------------------------- */

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookSignatureError';
  }
}

const encoder = new TextEncoder();

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(payload)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The `Stripe-Signature` header for `payload`, as Stripe would send it. For tests. */
export async function signWebhook(payload: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex(secret, `${timestamp}.${payload}`)}`;
}

/**
 * Check that `payload` came from Stripe, signed with `secret` no more than
 * `toleranceSeconds` ago, and return the event in it.
 */
export async function verifyWebhook(
  payload: string,
  header: string | undefined,
  secret: string,
  { toleranceSeconds = 300, now = Date.now() }: { toleranceSeconds?: number; now?: number } = {},
): Promise<StripeEvent> {
  if (!header) throw new WebhookSignatureError('No Stripe-Signature header');
  let timestamp = NaN;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=', 2);
    if (k === 't') timestamp = Number(v);
    else if (k === 'v1' && v) signatures.push(v);
  }
  if (!Number.isFinite(timestamp) || signatures.length === 0) throw new WebhookSignatureError('Malformed Stripe-Signature header');
  if (Math.abs(now / 1000 - timestamp) > toleranceSeconds) throw new WebhookSignatureError('Signature is too old');
  const expected = await hmacHex(secret, `${timestamp}.${payload}`);
  if (!signatures.some((s) => sameText(s, expected))) throw new WebhookSignatureError('Signature does not match');
  return JSON.parse(payload) as StripeEvent;
}
