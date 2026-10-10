import { expect, test } from '@playwright/test';

/**
 * E2E: forgotten password.
 *
 * Ask for a link, open it from the (development) mailbox, choose a new
 * password, and sign in with it. The old password stops working.
 */
test('reset a forgotten password from the emailed link', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://localhost:5273').origin;
  const email = `reset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const signUp = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'Reset User', email, password: 'old-password-123' },
    headers: { Origin: origin },
  });
  expect(signUp.ok()).toBeTruthy();
  await page.context().clearCookies();

  await page.goto('/auth/login');
  await page.getByRole('button', { name: 'Forgot?' }).click();
  await expect(page).toHaveURL(/\/auth\/forgot-password$/);
  await page.getByLabel('Email Address').fill(email);
  await page.getByRole('button', { name: 'Send Reset Link' }).click();
  await expect(page.getByTestId('forgot-password-sent')).toBeVisible();

  const mailbox = await page.request.get(`/api/dev/mailbox?to=${encodeURIComponent(email)}`);
  expect(mailbox.ok()).toBeTruthy();
  const mail = (await mailbox.json()) as { subject: string; text: string };
  expect(mail.subject).toContain('Reset your Root password');
  const link = /https?:\/\/\S+/.exec(mail.text)?.[0];
  expect(link).toBeTruthy();

  await page.goto(link!);
  await expect(page).toHaveURL(/\/auth\/reset-password\?token=/);
  await page.getByLabel('New Password', { exact: true }).fill('new-password-456');
  await page.getByLabel('Repeat New Password').fill('new-password-456');
  await page.getByRole('button', { name: 'Change Password' }).click();
  await expect(page.getByTestId('reset-password-done')).toBeVisible();

  // The link is spent.
  await page.goto(link!);
  await expect(page.getByTestId('reset-password-invalid')).toBeVisible();

  // The old password no longer works; the new one does.
  const oldSignIn = await page.request.post('/api/auth/sign-in/email', {
    data: { email, password: 'old-password-123' },
    headers: { Origin: origin },
  });
  expect(oldSignIn.ok()).toBeFalsy();

  await page.goto('/auth/login');
  await page.getByPlaceholder('you@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill('new-password-456');
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId('canvas-view')).toBeVisible();

  await page.request.post('/api/auth/sign-out', { headers: { Origin: origin } });
});
