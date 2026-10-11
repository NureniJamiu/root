/**
 * Who pays for what: each person's Stripe customer and the state of their
 * subscription, as last heard from Stripe. The plan itself stays in
 * `user_plan` (see `../ai/ai-store.ts`), which is what every paywall reads.
 */

import type { Sql } from '../sql';

export interface BillingAccount {
  readonly userId: string;
  readonly customerId: string;
  readonly subscriptionId: string | null;
  readonly status: string | null;
  readonly periodEnd: string | null;
  readonly cancelAtPeriodEnd: boolean;
}

export interface SubscriptionState {
  readonly subscriptionId: string;
  readonly status: string;
  readonly periodEnd: string | null;
  readonly cancelAtPeriodEnd: boolean;
}

export interface BillingStore {
  byUser(userId: string): Promise<BillingAccount | null>;
  byCustomer(customerId: string): Promise<BillingAccount | null>;
  /** Remember `customerId` as theirs (keeps any subscription already known). */
  saveCustomer(userId: string, customerId: string): Promise<void>;
  saveSubscription(userId: string, customerId: string, sub: SubscriptionState): Promise<void>;
}

interface Row {
  userId: string;
  customerId: string;
  subscriptionId: string | null;
  status: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: number;
}

const COLUMNS = '"userId", "customerId", "subscriptionId", "status", "periodEnd", "cancelAtPeriodEnd"';

function toAccount(row: Row | null): BillingAccount | null {
  return row ? { ...row, cancelAtPeriodEnd: row.cancelAtPeriodEnd === 1 } : null;
}

/** The store on `sql`; its table is in `../schema.ts`. */
export function createSqlBillingStore(sql: Sql): BillingStore {
  return {
    async byUser(userId) {
      return toAccount(await sql.first<Row>(`SELECT ${COLUMNS} FROM "billing_account" WHERE "userId" = ?`, userId));
    },
    async byCustomer(customerId) {
      return toAccount(await sql.first<Row>(`SELECT ${COLUMNS} FROM "billing_account" WHERE "customerId" = ?`, customerId));
    },
    async saveCustomer(userId, customerId) {
      await sql.run(
        `INSERT INTO "billing_account" ("userId", "customerId", "updatedAt") VALUES (?, ?, ?)
         ON CONFLICT ("userId") DO UPDATE SET "customerId" = excluded."customerId", "updatedAt" = excluded."updatedAt"`,
        userId,
        customerId,
        new Date().toISOString(),
      );
    },
    async saveSubscription(userId, customerId, sub) {
      await sql.run(
        `INSERT INTO "billing_account"
           ("userId", "customerId", "subscriptionId", "status", "periodEnd", "cancelAtPeriodEnd", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT ("userId") DO UPDATE SET
           "customerId" = excluded."customerId", "subscriptionId" = excluded."subscriptionId",
           "status" = excluded."status", "periodEnd" = excluded."periodEnd",
           "cancelAtPeriodEnd" = excluded."cancelAtPeriodEnd", "updatedAt" = excluded."updatedAt"`,
        userId,
        customerId,
        sub.subscriptionId,
        sub.status,
        sub.periodEnd,
        sub.cancelAtPeriodEnd ? 1 : 0,
        new Date().toISOString(),
      );
    },
  };
}
