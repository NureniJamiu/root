import { expect, openDashboard, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * E2E: paying for Pro, with `/api/billing` answered by the test so no Stripe
 * account is needed (the server side, webhook included, has its own tests).
 *
 *   - AI settings offers Upgrade to Pro, which asks the server for Checkout.
 *   - Coming back from Checkout confirms the payment and shows Pro.
 *   - A cancelled Checkout says nothing was charged.
 */

const free = {
  enabled: true,
  testMode: true,
  plan: 'free',
  status: null,
  periodEnd: null,
  cancelAtPeriodEnd: false,
  hasBillingAccount: false,
};
const pro = { ...free, plan: 'pro', status: 'active', periodEnd: '2099-01-15T00:00:00.000Z', hasBillingAccount: true };

async function mockBilling(page: Page, status: typeof free | typeof pro = free): Promise<{ checkouts: number; syncs: string[] }> {
  const seen = { checkouts: 0, syncs: [] as string[] };
  await page.route('**/api/billing', (route) => route.fulfill({ json: status }));
  await page.route('**/api/billing/checkout', (route) => {
    seen.checkouts += 1;
    // Stand-in for Stripe Checkout: a page on the app itself.
    return route.fulfill({ json: { url: '/pricing' } });
  });
  await page.route('**/api/billing/sync', (route) => {
    seen.syncs.push(String(route.request().postDataJSON()?.sessionId));
    return route.fulfill({ json: pro });
  });
  return seen;
}

async function openAiSettings(page: Page): Promise<void> {
  await page.getByTestId('btn-ai-menu').click();
  await page.getByTestId(/btn-ai-(settings|setup)/).click();
  await expect(page.getByTestId('ai-settings')).toBeVisible();
}

test('upgrade to Pro from AI settings goes to Checkout', async ({ dashboard: page }) => {
  const seen = await mockBilling(page);
  await openDashboard(page);
  await openAiSettings(page);

  const billing = page.getByTestId('billing-section');
  await expect(billing).toContainText('Pro adds drafting');
  await expect(page.getByTestId('billing-test-mode')).toBeVisible();
  await page.getByTestId('billing-upgrade').click();
  await expect(page).toHaveURL(/\/pricing$/);
  expect(seen.checkouts).toBe(1);
});

test('coming back from Checkout confirms the payment and shows Pro', async ({ dashboard: page }) => {
  const seen = await mockBilling(page);
  await page.goto('/dashboard?billing=success&session_id=cs_test_123');
  await expect(page.getByTestId('ai-settings')).toBeVisible();
  await expect(page.getByText('Welcome to Pro.')).toBeVisible();
  await expect(page.getByTestId('billing-section')).toContainText('Pro renews on');
  await expect(page.getByTestId('billing-manage')).toBeVisible();
  expect(seen.syncs).toEqual(['cs_test_123']);
  // The query string is gone, so a reload does not confirm it again.
  expect(new URL(page.url()).search).toBe('');
});

test('a cancelled Checkout says nothing was charged', async ({ dashboard: page }) => {
  await mockBilling(page);
  await page.goto('/dashboard?billing=cancelled');
  await expect(page.getByText('Checkout cancelled. You have not been charged.')).toBeVisible();
});

test('billing stays out of sight until Stripe is set up', async ({ dashboard: page }) => {
  await openDashboard(page);
  await openAiSettings(page);
  await expect(page.getByTestId('ai-allowance')).toBeVisible();
  await expect(page.getByTestId('billing-section')).toHaveCount(0);
});
