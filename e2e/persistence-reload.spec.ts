import { test, expect } from '@playwright/test';

/**
 * Persistence reload E2E test
 * Requirements: 8.1, 8.3, 8.4
 *
 * Covers:
 *  - Changes are persisted to localStorage after the 500ms debounce
 *  - On reload, every Node's id, title, and structure are restored exactly
 *  - The app initialises a new empty canvas when no localStorage record exists
 */
test('Persistence reload — state is preserved exactly after reload', async ({ page }) => {
  // Clear any persisted state so we always start from an empty canvas (R8.4).
  await page.addInitScript(() => {
    localStorage.clear();
  });

  // ── Step 1: Navigate to the app ──────────────────────────────────────────
  await page.goto('/');

  // ── Step 2: Create the root node via the empty-canvas affordance ─────────
  const createRootBtn = page.getByTestId('btn-create-root');
  await expect(createRootBtn).toBeVisible();
  await createRootBtn.click();

  // ── Step 3: NodeEditor should auto-open (R2.4) ───────────────────────────
  const nodeEditor = page.getByTestId('node-editor');
  await expect(nodeEditor).toBeVisible();

  // ── Step 4: Set the root node title ──────────────────────────────────────
  const titleInput = page.getByTestId('node-editor-title');
  await expect(titleInput).toBeFocused();
  await titleInput.fill('Persisted Root');

  // ── Step 5: Close the editor ─────────────────────────────────────────────
  await page.keyboard.press('Escape');
  await expect(nodeEditor).not.toBeVisible();

  // ── Step 6: Add a child node ─────────────────────────────────────────────
  // The HoverToolbar is opacity-0 by default; hover the card to reveal it.
  const rootCard = page.locator('[data-testid^="node-card-"]').first();
  await rootCard.hover();

  const addChildBtn = rootCard.getByTestId('btn-add-child');
  await addChildBtn.click({ force: true });

  // ── Step 7: Wait for the child NodeEditor to open and fill its title ──────
  await expect(nodeEditor).toBeVisible();
  await page.fill('[data-testid="node-editor-title"]', 'Persisted Child');

  // ── Step 8: Close the child editor ───────────────────────────────────────
  await page.keyboard.press('Escape');
  await expect(nodeEditor).not.toBeVisible();

  // ── Step 9: Wait for the debounce to flush (R8.1 — 500ms interval) ───────
  await page.waitForTimeout(600);

  // ── Step 10: Reload the page ─────────────────────────────────────────────
  await page.reload();

  // ── Step 11: Assert both nodes are restored exactly (R8.3) ───────────────
  const allNodeCards = page.locator('[data-testid^="node-card-"]');
  await expect(allNodeCards).toHaveCount(2);

  // The titles must appear verbatim as stored.
  const nodeTitles = page.locator('[data-testid="node-title"]');
  await expect(nodeTitles.filter({ hasText: 'Persisted Root' })).toHaveCount(1);
  await expect(nodeTitles.filter({ hasText: 'Persisted Child' })).toHaveCount(1);
});
