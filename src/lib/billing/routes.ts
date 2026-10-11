/**
 * Paying for Pro, through Stripe.
 *
 *   GET  /api/billing           the person's plan and subscription
 *   GET  /api/billing/price     the Pro price, for the pricing page (public)
 *   POST /api/billing/checkout  start Stripe Checkout; answers { url }
 *   POST /api/billing/sync      after Checkout: confirm the session right away
 *   POST /api/billing/portal    open Stripe's billing portal; answers { url }
 *   POST /api/billing/webhook   Stripe tells us a subscription changed
 *
 * Stripe is the source of truth. Every change, whichever way it arrives, is
 * applied by reading the subscription back from Stripe and setting the plan
 * from its status, so events arriving twice or out of order do no harm.
 */

import express from 'express';

import type { AiStore } from '../ai/ai-store';
import type { Plan } from '../ai/plans';
import type { BillingStore } from './billing-store';
import type { BillingErrorCode, BillingPrice, BillingStatus } from './contracts';
import { periodEndOf, StripeError, verifyWebhook, WebhookSignatureError } from './stripe';
import type { StripeClient, StripeSubscription } from './stripe';

export interface BillingUser {
  readonly id: string;
  readonly email: string;
  readonly name?: string;
}

export interface BillingEnv {
  readonly secretKey: string | undefined;
  readonly webhookSecret: string | undefined;
  /** The Stripe price (price_…) people subscribe to for Pro. */
  readonly proPriceId: string | undefined;
}

export function readBillingEnv(env: Readonly<Record<string, string | undefined>>): BillingEnv {
  return {
    secretKey: env.STRIPE_SECRET_KEY || undefined,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || undefined,
    proPriceId: env.STRIPE_PRICE_PRO || undefined,
  };
}

export interface BillingRouterOptions {
  /** Null when Stripe is not set up: billing answers "disabled" and nothing changes. */
  readonly stripe: StripeClient | null;
  readonly env: BillingEnv;
  readonly store: BillingStore;
  /** Where plans live. */
  readonly ai: Pick<AiStore, 'getPlan' | 'setPlan'>;
  readonly defaultPlan: Plan;
  /** The signed-in person, or null. */
  readonly currentUser: (req: express.Request) => Promise<BillingUser | null>;
  /** The app's public URL, for Stripe to send people back to. */
  readonly appUrl: (req: express.Request) => string;
}

/** Subscriptions in these states keep Pro. Past due keeps it while Stripe retries the card. */
const PAID_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function planForStatus(status: string | null): Plan {
  return status && PAID_STATUSES.has(status) ? 'pro' : 'free';
}

export function createBillingRouter(opts: BillingRouterOptions): express.Router {
  const router = express.Router();
  const { stripe, env, store } = opts;
  const ready = Boolean(stripe && env.proPriceId);

  function fail(res: express.Response, status: number, code: BillingErrorCode, error: string): express.Response {
    return res.status(status).json({ error, code });
  }

  function sendError(res: express.Response, err: unknown, what: string): express.Response {
    console.error(what, err);
    if (err instanceof StripeError) return fail(res, 502, 'stripe', `Stripe: ${err.message}`);
    return fail(res, 500, 'stripe', what);
  }

  /** Read the subscription back from Stripe and set their plan from it. */
  async function applySubscription(userId: string, sub: StripeSubscription): Promise<void> {
    await store.saveSubscription(userId, sub.customer, {
      subscriptionId: sub.id,
      status: sub.status,
      periodEnd: periodEndOf(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    });
    await opts.ai.setPlan(userId, planForStatus(sub.status));
  }

  async function statusFor(userId: string): Promise<BillingStatus> {
    const account = await store.byUser(userId);
    return {
      enabled: ready,
      testMode: stripe?.testMode ?? false,
      plan: (await opts.ai.getPlan(userId)) ?? opts.defaultPlan,
      status: account?.status ?? null,
      periodEnd: account?.periodEnd ?? null,
      cancelAtPeriodEnd: account?.cancelAtPeriodEnd ?? false,
      hasBillingAccount: Boolean(account),
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Webhook: before any JSON parsing, since the signature covers raw bytes   */
  /* ------------------------------------------------------------------------ */

  router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    if (!stripe || !env.webhookSecret) return fail(res, 503, 'disabled', 'Billing is not set up');
    const payload = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    let event;
    try {
      event = await verifyWebhook(payload, req.header('stripe-signature'), env.webhookSecret);
    } catch (err) {
      if (err instanceof WebhookSignatureError) return fail(res, 400, 'invalid', err.message);
      return fail(res, 400, 'invalid', 'Unreadable event');
    }

    try {
      const object = event.data.object;
      let subscriptionId: string | null = null;
      let userHint: string | null = null;
      if (event.type === 'checkout.session.completed' && object.mode === 'subscription') {
        subscriptionId = typeof object.subscription === 'string' ? object.subscription : null;
        userHint = typeof object.client_reference_id === 'string' ? object.client_reference_id : null;
      } else if (event.type.startsWith('customer.subscription.')) {
        subscriptionId = typeof object.id === 'string' ? object.id : null;
      }
      // Anything else (invoices, payments) changes nothing here: the subscription events cover it.
      if (!subscriptionId) return res.json({ received: true });

      const sub = await stripe.getSubscription(subscriptionId);
      const userId = (await store.byCustomer(sub.customer))?.userId ?? sub.metadata?.userId ?? userHint;
      if (!userId) {
        console.warn(`Stripe ${event.type}: no Root account for customer ${sub.customer}`);
        return res.json({ received: true });
      }
      await applySubscription(userId, sub);
      return res.json({ received: true });
    } catch (err) {
      // A 500 makes Stripe retry later.
      return sendError(res, err, 'Failed to apply Stripe event');
    }
  });

  /* ------------------------------------------------------------------------ */
  /* Public                                                                   */
  /* ------------------------------------------------------------------------ */

  let price: Promise<BillingPrice | null> | null = null;
  router.get('/price', async (_req, res) => {
    if (!ready) return res.json(null);
    price ??= stripe!
      .getPrice(env.proPriceId!)
      .then((p) =>
        p.unit_amount === null ? null : { amount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval ?? 'month' },
      )
      .catch((err: unknown) => {
        price = null; // ask again next time
        console.error('Failed to read the Pro price', err);
        return null;
      });
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json(await price);
  });

  /* ------------------------------------------------------------------------ */
  /* Signed in                                                                */
  /* ------------------------------------------------------------------------ */

  const json = express.json({ limit: '10kb' });

  router.use(async (req, res, next) => {
    const user = await opts.currentUser(req);
    if (!user) {
      res.status(401).json({ error: 'Not signed in' });
      return;
    }
    res.locals.user = user;
    next();
  });

  router.get('/', async (_req, res) => {
    try {
      return res.json(await statusFor((res.locals.user as BillingUser).id));
    } catch (err) {
      return sendError(res, err, 'Failed to read billing');
    }
  });

  router.post('/checkout', async (req, res) => {
    if (!ready) return fail(res, 503, 'disabled', 'Payments are not set up yet');
    const user = res.locals.user as BillingUser;
    try {
      let account = await store.byUser(user.id);
      if (account && planForStatus(account.status) === 'pro') {
        return fail(res, 409, 'already-subscribed', 'You are already on Pro. Manage it from billing.');
      }
      if (!account) {
        const customer = await stripe!.createCustomer({ email: user.email, name: user.name, userId: user.id });
        await store.saveCustomer(user.id, customer.id);
        account = await store.byUser(user.id);
      }
      const base = opts.appUrl(req);
      const session = await stripe!.createCheckoutSession({
        mode: 'subscription',
        customer: account!.customerId,
        client_reference_id: user.id,
        line_items: [{ price: env.proPriceId, quantity: 1 }],
        subscription_data: { metadata: { userId: user.id } },
        allow_promotion_codes: true,
        success_url: `${base}/dashboard?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/dashboard?billing=cancelled`,
      });
      return res.json({ url: session.url });
    } catch (err) {
      return sendError(res, err, 'Failed to start checkout');
    }
  });

  // Back from Checkout: apply it now rather than waiting for the webhook.
  router.post('/sync', json, async (req, res) => {
    if (!ready) return fail(res, 503, 'disabled', 'Payments are not set up yet');
    const user = res.locals.user as BillingUser;
    const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId : '';
    if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return fail(res, 400, 'invalid', 'Unknown checkout session');
    try {
      const session = await stripe!.getCheckoutSession(sessionId);
      if (session.client_reference_id !== user.id) return fail(res, 404, 'invalid', 'Unknown checkout session');
      if (session.subscription) await applySubscription(user.id, await stripe!.getSubscription(session.subscription));
      return res.json(await statusFor(user.id));
    } catch (err) {
      return sendError(res, err, 'Failed to confirm checkout');
    }
  });

  router.post('/portal', async (req, res) => {
    if (!stripe) return fail(res, 503, 'disabled', 'Payments are not set up yet');
    const user = res.locals.user as BillingUser;
    try {
      const account = await store.byUser(user.id);
      if (!account) return fail(res, 404, 'no-account', 'You have no billing history yet.');
      const portal = await stripe.createPortalSession({ customer: account.customerId, return_url: `${opts.appUrl(req)}/dashboard?billing=portal` });
      return res.json({ url: portal.url });
    } catch (err) {
      return sendError(res, err, 'Failed to open billing');
    }
  });

  return router;
}
