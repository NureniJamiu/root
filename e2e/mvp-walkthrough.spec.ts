import { test, expect } from '@playwright/test';

/**
 * MVP walkthrough E2E test
 * Requirements: 2.1, 2.4, 3.1, 4.2
 *
 * Covers:
 *  - Creating the root node via the empty-canvas affordance
 *  - NodeEditor auto-opening on root creation (R2.4)
 *  - Editing the node title and verifying it appears in the card
 *  - Adding a child node and verifying two node cards appear on canvas
 */
test('MVP walkthrough — build a two-node tree', async ({ page }) => {
  // Clear any persisted state so we always start from an empty canvas.
  await page.addInitScript(() => {
    localStorage.clear();
  });

  // ── Step 1: Navigate to the app ──────────────────────────────────────────
  await page.goto('/');

  // ── Step 2: Click "Create root node" button ──────────────────────────────
  const createRootBtn = page.getByTestId('btn-create-root');
  await expect(createRootBtn).toBeVisible();
  await createRootBtn.click();

  // ── Step 3: Assert a node card appeared on the canvas ───────────────────
  const firstNodeCard = page.locator('[data-testid^="node-card-"]').first();
  await expect(firstNodeCard).toBeVisible();

  // ── Step 4: NodeEditor should auto-open (R2.4) ──────────────────────────
  const nodeEditor = page.getByTestId('node-editor');
  await expect(nodeEditor).toBeVisible();

  // ── Step 5: Fill in the title ────────────────────────────────────────────
  const titleInput = page.getByTestId('node-editor-title');
  await expect(titleInput).toBeFocused();
  await titleInput.fill('Root Research');

  // ── Step 6: Close the editor ─────────────────────────────────────────────
  await page.keyboard.press('Escape');
  await expect(nodeEditor).not.toBeVisible();

  // ── Step 7: Assert the node card's title shows "Root Research" ───────────
  // node-title lives inside the first node card
  const nodeTitle = firstNodeCard.getByTestId('node-title');
  await expect(nodeTitle).toContainText('Root Research');

  // ── Step 8: Add a child node via the hover toolbar ───────────────────────
  // The toolbar has opacity-0 group-hover:opacity-100 so we must hover first.
  await firstNodeCard.hover();

  const addChildBtn = firstNodeCard.getByTestId('btn-add-child');
  await expect(addChildBtn).toBeVisible();
  await addChildBtn.click();

  // ── Step 9 & 10: Wait for the second node card and assert count is 2 ─────
  const allNodeCards = page.locator('[data-testid^="node-card-"]');
  await expect(allNodeCards).toHaveCount(2);
});
