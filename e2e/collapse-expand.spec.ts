import { test, expect } from '@playwright/test';

/**
 * E2E: Collapse and expand a subtree
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 *
 * Scenario:
 *   - Build a root → child → grandchild tree (three nodes, two levels)
 *   - Collapse the root node → child and grandchild cards disappear from DOM,
 *     CollapseBadge appears on root showing count of hidden descendants
 *   - Expand the root node → child and grandchild cards reappear
 *
 * The collapse/expand affordance is the ▼/▶ button in the HoverToolbar,
 * only visible on hover when the node has children (R6.1) or is collapsed (R6.3).
 */
test('collapse and expand a subtree', async ({ page }) => {
  // Start from a clean slate every time.
  await page.addInitScript(() => {
    localStorage.clear();
  });

  // ── Step 1: Navigate to the app ─────────────────────────────────────────
  await page.goto('/');

  // ── Step 2: Create the root node ────────────────────────────────────────
  const createRootBtn = page.getByTestId('btn-create-root');
  await expect(createRootBtn).toBeVisible();
  await createRootBtn.click();

  // Close the auto-opened editor so subsequent hover interactions work cleanly.
  const nodeEditor = page.getByTestId('node-editor');
  await expect(nodeEditor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(nodeEditor).not.toBeVisible();

  // ── Step 3: Add a child node ─────────────────────────────────────────────
  const rootCard = page.locator('[data-testid^="node-card-"]').first();
  await expect(rootCard).toBeVisible();
  await rootCard.hover();

  const addChildBtn = rootCard.getByTestId('btn-add-child');
  await expect(addChildBtn).toBeVisible();
  await addChildBtn.click();

  // Close the editor that opens for the new child.
  await expect(nodeEditor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(nodeEditor).not.toBeVisible();

  // Confirm we have 2 node cards.
  const allCards = page.locator('[data-testid^="node-card-"]');
  await expect(allCards).toHaveCount(2);

  // ── Step 4: Add a grandchild node (child of the child) ──────────────────
  // The child card is the second one.
  const childCard = allCards.nth(1);
  await expect(childCard).toBeVisible();
  await childCard.hover();

  const addGrandchildBtn = childCard.getByTestId('btn-add-child');
  await expect(addGrandchildBtn).toBeVisible();
  await addGrandchildBtn.click();

  // Close the grandchild editor.
  await expect(nodeEditor).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(nodeEditor).not.toBeVisible();

  // Confirm we have 3 node cards.
  await expect(allCards).toHaveCount(3);

  // ── Step 5: Collapse root node ───────────────────────────────────────────
  // Hover the root card to reveal the toolbar.
  await rootCard.hover();

  // The collapse button (▼) appears when the node has children and isn't collapsed.
  const collapseBtn = rootCard.getByTestId('btn-collapse');
  await expect(collapseBtn).toBeVisible();
  await collapseBtn.click();

  // R6.2: child and grandchild cards must disappear from the DOM.
  await expect(allCards).toHaveCount(1);

  // R6.5: CollapseBadge must appear on the root card showing the hidden count.
  const collapseBadge = rootCard.getByTestId('collapse-badge');
  await expect(collapseBadge).toBeVisible();
  // Root has 2 hidden descendants (child + grandchild).
  await expect(collapseBadge).toContainText('2');

  // ── Step 6: Expand root node ─────────────────────────────────────────────
  // Hover the root card again to reveal the toolbar (now shows ▶ expand button).
  await rootCard.hover();

  const expandBtn = rootCard.getByTestId('btn-expand');
  await expect(expandBtn).toBeVisible();
  await expandBtn.click();

  // R6.4: child and grandchild cards must reappear.
  await expect(allCards).toHaveCount(3);

  // R6.5: CollapseBadge must be gone after expand.
  await expect(collapseBadge).not.toBeVisible();
});

test('collapse badge shows correct descendant count', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });

  await page.goto('/');

  // Create root.
  await page.getByTestId('btn-create-root').click();
  const nodeEditor = page.getByTestId('node-editor');
  await expect(nodeEditor).toBeVisible();
  await page.keyboard.press('Escape');

  // Add 3 children to root.
  const allCards = page.locator('[data-testid^="node-card-"]');
  const rootCard = allCards.first();

  for (let i = 0; i < 3; i++) {
    await rootCard.hover();
    await rootCard.getByTestId('btn-add-child').click();
    await expect(nodeEditor).toBeVisible();
    await page.keyboard.press('Escape');
  }

  await expect(allCards).toHaveCount(4);

  // Collapse root — should hide 3 children.
  await rootCard.hover();
  await rootCard.getByTestId('btn-collapse').click();

  // Only root remains.
  await expect(allCards).toHaveCount(1);

  // Badge should show +3.
  const badge = rootCard.getByTestId('collapse-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('3');
});
