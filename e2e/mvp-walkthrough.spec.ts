import { addIdea, expect, test } from './fixtures';

/**
 * MVP walkthrough E2E test
 * Requirements: 2.1, 2.4, 3.1, 4.2
 * Runs as a freshly registered user on /dashboard (see ./fixtures).
 *
 * Covers:
 *  - Adding the first idea to an empty canvas (there is no prompt card)
 *  - NodeEditor auto-opening on root creation (R2.4)
 *  - Editing the node title and verifying it appears in the card
 *  - Adding a child node and verifying two node cards appear on canvas
 */
test('MVP walkthrough — build a two-node tree', async ({ dashboard: page }) => {
  // ── Step 1: the fixture signed in a new user and opened their empty project ──

  // ── Step 2: Add the first idea from the header ──────────────────────────────
  await expect(page.locator('[data-testid^="node-card-"]')).toHaveCount(0);
  await addIdea(page);

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
  await page.getByTestId('node-editor-save').click();
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
