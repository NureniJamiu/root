-- Stripe customers and subscriptions (src/lib/billing/billing-store.ts).

CREATE TABLE IF NOT EXISTS "billing_account" (
  "userId"            TEXT PRIMARY KEY NOT NULL,
  "customerId"        TEXT NOT NULL UNIQUE,
  "subscriptionId"    TEXT,
  "status"            TEXT,
  "periodEnd"         TEXT,
  "cancelAtPeriodEnd" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"         TEXT NOT NULL
);
