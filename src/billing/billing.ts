/**
 * Paying for Pro from the browser: the person's billing status, and the two
 * ways out to Stripe (Checkout to upgrade, the billing portal to manage or
 * cancel). The server decides everything; this only shows it.
 */

import { create } from 'zustand';

import type { BillingErrorCode, BillingPrice, BillingStatus } from '../lib/billing/contracts';

const API_BASE = '/api/billing';

export class BillingError extends Error {
  constructor(
    message: string,
    readonly code: BillingErrorCode | 'network',
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  } catch {
    throw new BillingError('Could not reach the server.', 'network');
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: BillingErrorCode } & T;
  if (!res.ok) throw new BillingError(body.error ?? 'That did not work. Try again.', body.code ?? 'stripe');
  return body;
}

export const billingApi = {
  status: () => request<BillingStatus>(''),
  price: () => request<BillingPrice | null>('/price'),
  checkout: () => request<{ url: string }>('/checkout', { method: 'POST' }),
  portal: () => request<{ url: string }>('/portal', { method: 'POST' }),
  sync: (sessionId: string) => request<BillingStatus>('/sync', { method: 'POST', body: { sessionId } }),
};

export interface BillingState {
  status: BillingStatus | null;
  /** Leaving for Stripe, or confirming a payment. */
  busy: boolean;
  error: string | null;
}

export const useBillingStore = create<BillingState>(() => ({ status: null, busy: false, error: null }));

async function goTo(get: () => Promise<{ url: string }>): Promise<void> {
  useBillingStore.setState({ busy: true, error: null });
  try {
    window.location.assign((await get()).url);
    // Stay busy: the page is about to change.
  } catch (err) {
    useBillingStore.setState({ busy: false, error: err instanceof BillingError ? err.message : 'That did not work. Try again.' });
  }
}

let inflight: Promise<void> | null = null;

export const billingActions = {
  /** Load the status once; later calls reuse it unless `force` is set. */
  load(force = false): Promise<void> {
    if (!force && useBillingStore.getState().status) return Promise.resolve();
    if (!force && inflight) return inflight;
    const request = billingApi
      .status()
      .then((status) => useBillingStore.setState({ status }))
      .catch(() => {
        /* billing stays hidden */
      })
      .finally(() => {
        if (inflight === request) inflight = null;
      });
    inflight = request;
    return request;
  },
  /** Off to Stripe Checkout to pay for Pro. */
  upgrade: (): Promise<void> => goTo(billingApi.checkout),
  /** Off to Stripe's billing portal: card, invoices, cancel. */
  manage: (): Promise<void> => goTo(billingApi.portal),
  /** Back from Checkout: apply the payment now instead of waiting for Stripe's webhook. */
  async confirm(sessionId: string): Promise<BillingStatus | null> {
    useBillingStore.setState({ busy: true, error: null });
    try {
      const status = await billingApi.sync(sessionId);
      useBillingStore.setState({ status, busy: false });
      return status;
    } catch (err) {
      useBillingStore.setState({ busy: false, error: err instanceof BillingError ? err.message : null });
      return null;
    }
  },
};

/** What Stripe sent them back to the dashboard after, read from and then removed from the URL. */
export function takeBillingReturn(): { kind: 'success' | 'cancelled' | 'portal'; sessionId: string | null } | null {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('billing');
  if (kind !== 'success' && kind !== 'cancelled' && kind !== 'portal') return null;
  const sessionId = params.get('session_id');
  params.delete('billing');
  params.delete('session_id');
  const rest = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
  return { kind, sessionId };
}

/** "$8", "€12.50": a price in the currency's smallest unit. */
export function formatPrice(price: BillingPrice): string {
  const amount = price.amount / 100;
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  }).format(amount);
}
