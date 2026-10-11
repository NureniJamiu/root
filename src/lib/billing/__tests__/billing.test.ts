// @vitest-environment node
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { memorySql } from '../../__tests__/memory-sql';
import { createSqlAiStore } from '../../ai/ai-store';
import { createSqlBillingStore } from '../billing-store';
import { createBillingRouter, planForStatus } from '../routes';
import { createStripeClient, encodeForm, signWebhook, verifyWebhook, WebhookSignatureError } from '../stripe';
import type { StripeCheckoutSession, StripeClient, StripeSubscription } from '../stripe';

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

const WEBHOOK_SECRET = 'whsec_test';
const PERIOD_END = 1_800_000_000;

/** A Stripe that keeps everything in memory and records what was asked of it. */
function fakeStripe() {
  const subscriptions = new Map<string, StripeSubscription>();
  const sessions = new Map<string, StripeCheckoutSession>();
  const created: Array<Record<string, unknown>> = [];
  let customers = 0;
  const client: StripeClient = {
    testMode: true,
    createCustomer: async () => ({ id: `cus_${++customers}` }),
    createCheckoutSession: async (params) => {
      created.push(params);
      return { id: 'cs_1', url: 'https://checkout.stripe.test/cs_1', mode: 'subscription', customer: null, subscription: null, client_reference_id: null };
    },
    getCheckoutSession: async (id) => {
      const s = sessions.get(id);
      if (!s) throw new Error('no such session');
      return s;
    },
    createPortalSession: async ({ customer }) => ({ url: `https://billing.stripe.test/${customer}` }),
    getSubscription: async (id) => {
      const s = subscriptions.get(id);
      if (!s) throw new Error('no such subscription');
      return s;
    },
    getPrice: async (id) => ({ id, unit_amount: 800, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } }),
  };
  const subscribe = (id: string, customer: string, status: string, extra: Partial<StripeSubscription> = {}) =>
    subscriptions.set(id, { id, customer, status, cancel_at_period_end: false, items: { data: [{ current_period_end: PERIOD_END }] }, ...extra });
  return { client, subscriptions, sessions, created, subscribe };
}

async function start({ stripe = fakeStripe(), configured = true } = {}) {
  const sql = memorySql();
  const ai = createSqlAiStore(sql);
  const store = createSqlBillingStore(sql);
  const app = express();
  app.use(
    '/api/billing',
    createBillingRouter({
      stripe: configured ? stripe.client : null,
      env: { secretKey: 'sk_test_x', webhookSecret: WEBHOOK_SECRET, proPriceId: configured ? 'price_pro' : undefined },
      store,
      ai,
      defaultPlan: 'free',
      currentUser: async (req) => {
        const id = req.header('x-user');
        return id ? { id, email: `${id}@example.com`, name: id } : null;
      },
      appUrl: () => 'https://root.test',
    }),
  );
  const server = app.listen(0);
  servers.push(server);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/billing`;
  const call = (path: string, init: { method?: string; body?: unknown; user?: string | null } = {}) =>
    fetch(`${base}${path}`, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: { 'content-type': 'application/json', ...(init.user === null ? {} : { 'x-user': init.user ?? 'user-1' }) },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
  const webhook = async (event: unknown, signature?: string) => {
    const payload = JSON.stringify(event);
    return fetch(`${base}/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'stripe-signature': signature ?? (await signWebhook(payload, WEBHOOK_SECRET)) },
      body: payload,
    });
  };
  return { stripe, ai, store, call, webhook };
}

describe('Stripe helpers', () => {
  it('form-encodes nested params the way Stripe reads them', () => {
    expect(
      decodeURIComponent(encodeForm({ mode: 'subscription', line_items: [{ price: 'p', quantity: 1 }], metadata: { userId: 'u' }, skip: undefined })),
    ).toBe('mode=subscription&line_items[0][price]=p&line_items[0][quantity]=1&metadata[userId]=u');
  });

  it('accepts a correctly signed event and rejects tampered, stale or unsigned ones', async () => {
    const payload = JSON.stringify({ id: 'evt_1', type: 'x', data: { object: {} } });
    const now = 1_700_000_000_000;
    const header = await signWebhook(payload, WEBHOOK_SECRET, now / 1000);
    await expect(verifyWebhook(payload, header, WEBHOOK_SECRET, { now })).resolves.toMatchObject({ id: 'evt_1' });
    await expect(verifyWebhook(payload.replace('evt_1', 'evt_2'), header, WEBHOOK_SECRET, { now })).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(verifyWebhook(payload, header, 'whsec_other', { now })).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(verifyWebhook(payload, header, WEBHOOK_SECRET, { now: now + 10 * 60_000 })).rejects.toThrow('too old');
    await expect(verifyWebhook(payload, undefined, WEBHOOK_SECRET, { now })).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it('tells test keys from live ones', () => {
    expect(createStripeClient('sk_test_1').testMode).toBe(true);
    expect(createStripeClient('sk_live_1').testMode).toBe(false);
  });

  it('keeps Pro while a subscription is paid or being retried', () => {
    expect(planForStatus('active')).toBe('pro');
    expect(planForStatus('trialing')).toBe('pro');
    expect(planForStatus('past_due')).toBe('pro');
    expect(planForStatus('canceled')).toBe('free');
    expect(planForStatus('unpaid')).toBe('free');
    expect(planForStatus('incomplete')).toBe('free');
    expect(planForStatus(null)).toBe('free');
  });
});

describe('/api/billing', () => {
  it('needs a signed-in person, except for the webhook and the price', async () => {
    const { call } = await start();
    expect((await call('', { user: null })).status).toBe(401);
    expect((await call('/checkout', { method: 'POST', user: null })).status).toBe(401);
    expect(await (await call('/price', { user: null })).json()).toEqual({ amount: 800, currency: 'usd', interval: 'month' });
  });

  it('says billing is off until Stripe is set up', async () => {
    const { call } = await start({ configured: false });
    expect(await (await call('')).json()).toMatchObject({ enabled: false, plan: 'free' });
    const res = await call('/checkout', { method: 'POST' });
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('disabled');
  });

  it('starts Checkout for Pro with a customer of their own', async () => {
    const { call, stripe, store } = await start();
    const res = await call('/checkout', { method: 'POST' });
    expect(await res.json()).toEqual({ url: 'https://checkout.stripe.test/cs_1' });
    expect(stripe.created[0]).toMatchObject({
      mode: 'subscription',
      customer: 'cus_1',
      client_reference_id: 'user-1',
      line_items: [{ price: 'price_pro', quantity: 1 }],
      success_url: 'https://root.test/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}',
    });
    expect((await store.byUser('user-1'))?.customerId).toBe('cus_1');

    // A second try reuses the same customer.
    await call('/checkout', { method: 'POST' });
    expect(stripe.created[1]).toMatchObject({ customer: 'cus_1' });
  });

  it('moves them to Pro when Stripe confirms the subscription, and back to Free when it ends', async () => {
    const { call, stripe, ai, webhook } = await start();
    await call('/checkout', { method: 'POST' });
    stripe.subscribe('sub_1', 'cus_1', 'active');

    const done = await webhook({
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: { object: { mode: 'subscription', subscription: 'sub_1', client_reference_id: 'user-1', customer: 'cus_1' } },
    });
    expect(done.status).toBe(200);
    expect(await ai.getPlan('user-1')).toBe('pro');
    expect(await (await call('')).json()).toMatchObject({
      plan: 'pro',
      status: 'active',
      periodEnd: new Date(PERIOD_END * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      hasBillingAccount: true,
      testMode: true,
    });

    // Cancelled in the portal: still Pro until the period ends.
    stripe.subscribe('sub_1', 'cus_1', 'active', { cancel_at_period_end: true });
    await webhook({ id: 'evt_2', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } });
    expect(await (await call('')).json()).toMatchObject({ plan: 'pro', cancelAtPeriodEnd: true });

    stripe.subscribe('sub_1', 'cus_1', 'canceled');
    await webhook({ id: 'evt_3', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
    expect(await ai.getPlan('user-1')).toBe('free');
  });

  it('reads the subscription back from Stripe, so a stale or replayed event cannot grant Pro', async () => {
    const { call, stripe, ai, webhook } = await start();
    await call('/checkout', { method: 'POST' });
    stripe.subscribe('sub_1', 'cus_1', 'canceled');
    // The event body claims "active", but Stripe says canceled.
    await webhook({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1', status: 'active' } } });
    expect(await ai.getPlan('user-1')).toBe('free');
  });

  it('refuses events that are not signed by Stripe', async () => {
    const { call, stripe, ai, webhook } = await start();
    await call('/checkout', { method: 'POST' });
    stripe.subscribe('sub_1', 'cus_1', 'active');
    const res = await webhook({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } }, 't=1,v1=bad');
    expect(res.status).toBe(400);
    expect(await ai.getPlan('user-1')).toBeNull();
  });

  it('ignores events it has no use for', async () => {
    const { webhook } = await start();
    const res = await webhook({ id: 'evt_1', type: 'invoice.paid', data: { object: { id: 'in_1' } } });
    expect(res.status).toBe(200);
  });

  it('confirms a finished Checkout straight away, only for the person who paid', async () => {
    const { call, stripe, ai } = await start();
    await call('/checkout', { method: 'POST' });
    stripe.subscribe('sub_1', 'cus_1', 'active');
    stripe.sessions.set('cs_paid', { id: 'cs_paid', url: null, mode: 'subscription', customer: 'cus_1', subscription: 'sub_1', client_reference_id: 'user-1' });

    expect((await call('/sync', { body: { sessionId: 'cs_paid' }, user: 'user-2' })).status).toBe(404);
    expect(await ai.getPlan('user-2')).toBeNull();
    expect((await call('/sync', { body: { sessionId: 'not a session' } })).status).toBe(400);

    const res = await call('/sync', { body: { sessionId: 'cs_paid' } });
    expect(await res.json()).toMatchObject({ plan: 'pro', status: 'active' });
    expect(await ai.getPlan('user-1')).toBe('pro');
  });

  it('will not start a second subscription', async () => {
    const { call, stripe, webhook } = await start();
    await call('/checkout', { method: 'POST' });
    stripe.subscribe('sub_1', 'cus_1', 'active');
    await webhook({ id: 'evt_1', type: 'customer.subscription.created', data: { object: { id: 'sub_1' } } });
    const res = await call('/checkout', { method: 'POST' });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('already-subscribed');
  });

  it('opens the billing portal for people who have paid', async () => {
    const { call } = await start();
    expect((await call('/portal', { method: 'POST' })).status).toBe(404);
    await call('/checkout', { method: 'POST' });
    expect(await (await call('/portal', { method: 'POST' })).json()).toEqual({ url: 'https://billing.stripe.test/cus_1' });
  });
});
