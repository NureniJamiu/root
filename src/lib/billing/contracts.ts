/**
 * What `/api/billing` answers with. Dependency-free so the server and the
 * browser share it.
 */

import type { Plan } from '../ai/plans';

export interface BillingStatus {
  /** Stripe is set up on the server, so people can upgrade. */
  readonly enabled: boolean;
  /** Stripe is on a test key: no real card is ever charged. */
  readonly testMode: boolean;
  readonly plan: Plan;
  /** Stripe's subscription status (active, past_due, canceled…), or null with no subscription. */
  readonly status: string | null;
  /** When the paid period ends: the renewal date, or the last day when cancelling. */
  readonly periodEnd: string | null;
  /** Pro stops at `periodEnd` instead of renewing. */
  readonly cancelAtPeriodEnd: boolean;
  /** They have paid before, so the billing portal has something to show. */
  readonly hasBillingAccount: boolean;
}

/** The Pro price as Stripe has it, for the pricing page. */
export interface BillingPrice {
  /** In the currency's smallest unit (cents). */
  readonly amount: number;
  readonly currency: string;
  readonly interval: string;
}

export type BillingErrorCode = 'disabled' | 'already-subscribed' | 'no-account' | 'stripe' | 'invalid';
