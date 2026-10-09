import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Shared e2e fixtures.
 *
 * `dashboard` is a page that is already signed in as a brand-new user and
 * showing that user's first (empty) project. Every test gets its own user, so
 * tests are isolated from each other and from earlier runs; the user's
 * projects are deleted through the projects API when the test ends.
 */

const PASSWORD = 'e2e-password-123!';

function appOrigin(baseURL: string | undefined): string {
  return new URL(baseURL ?? 'http://localhost:5273').origin;
}

/** Delete every project of the signed-in user. */
export async function deleteAllProjects(page: Page): Promise<void> {
  const list = await page.request.get('/api/projects');
  if (!list.ok()) return;
  const projects = (await list.json()) as Array<{ id: string }>;
  for (const project of projects) {
    await page.request.delete(`/api/projects/${project.id}`);
  }
}

export async function openDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await expect(page.getByTestId('canvas-view')).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as { __ROOT_INITIALIZED__?: boolean }).__ROOT_INITIALIZED__ === true,
    undefined,
    { timeout: 15_000 },
  );
}

/** Add an idea with the header button (an unconnected one when nothing is selected). */
export async function addIdea(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Add Idea/i }).click();
}

/** Wait until the inspector's save indicator says everything is on the server. */
export async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
}

export const test = base.extend<{ dashboard: Page }>({
  dashboard: async ({ page, baseURL }, use) => {
    const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const response = await page.request.post('/api/auth/sign-up/email', {
      data: { name: 'E2E User', email, password: PASSWORD },
      headers: { Origin: appOrigin(baseURL) },
    });
    expect(response.ok(), `sign-up failed: ${response.status()} ${await response.text()}`).toBeTruthy();

    await openDashboard(page);
    await use(page);
    await deleteAllProjects(page);
  },
});

export { expect };
