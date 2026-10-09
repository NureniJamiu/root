import type { Locator, Page } from '@playwright/test';

import { addIdea, expect, test } from './fixtures';

async function rootWithChildren(page: Page, titles: string[]): Promise<{ cards: Locator; root: Locator }> {
  await addIdea(page);
  await page.getByTestId('node-editor-title').fill('Root question');
  await page.getByTestId('node-editor-save').click();
  const cards = page.locator('[data-testid^="node-card-"]');
  const root = cards.first();
  for (const title of titles) {
    await root.hover();
    await root.getByTestId('btn-add-child').click();
    await page.getByTestId('node-editor-title').fill(title);
    await page.getByTestId('node-editor-save').click();
  }
  await expect(cards).toHaveCount(titles.length + 1);
  return { cards, root };
}

/** Open the card's list and pick the idea titled `title`; the list closes. */
async function pick(page: Page, root: Locator, title: string): Promise<void> {
  await root.hover();
  await root.getByTestId('btn-reveal-menu').click();
  const menu = page.getByTestId('child-reveal-menu');
  await expect(menu).toBeVisible();
  await menu.locator('[role="menuitemcheckbox"]').filter({ hasText: title }).click();
  await expect(menu).toHaveCount(0);
}

test('reveal connected ideas one at a time, in any order, from the card', async ({ dashboard: page }) => {
  const { cards, root } = await rootWithChildren(page, ['Finding A', 'Finding B', 'Finding C']);
  const connectors = page.locator('g[data-testid^="connector-"]');

  await root.hover();
  await root.getByTestId('btn-collapse').click();
  await expect(cards).toHaveCount(1);
  await expect(connectors).toHaveCount(0);

  // The list names every connected idea, all hidden for now.
  await root.hover();
  await root.getByTestId('btn-reveal-menu').click();
  const items = page.getByTestId('child-reveal-menu').locator('[role="menuitemcheckbox"]');
  await expect(items).toHaveCount(3);
  await expect(items.filter({ hasText: 'Finding B' })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');

  // Reveal the second finding first: only it and its connector appear.
  await pick(page, root, 'Finding B');
  await expect(cards).toHaveCount(2);
  await expect(connectors).toHaveCount(1);
  await expect(cards.filter({ hasText: 'Finding B' })).toHaveCount(1);
  await expect(root.getByTestId('collapse-badge')).toContainText('+2 hidden');

  // Then the third, then hide the second again.
  await pick(page, root, 'Finding C');
  await expect(cards).toHaveCount(3);
  await pick(page, root, 'Finding B');
  await expect(cards).toHaveCount(2);
  await expect(cards.filter({ hasText: 'Finding B' })).toHaveCount(0);
  await expect(cards.filter({ hasText: 'Finding C' })).toHaveCount(1);
  await expect(connectors).toHaveCount(1);

  // The card's own button still shows everything in one click.
  await root.hover();
  await root.getByTestId('btn-expand').click();
  await expect(cards).toHaveCount(4);
  await expect(connectors).toHaveCount(3);
  await expect(root.getByTestId('collapse-badge')).toHaveCount(0);

  // Undo steps back through the reveals.
  await page.keyboard.press('Control+z');
  await expect(cards).toHaveCount(2);
});

test('revealing every child by name leaves the card fully expanded', async ({ dashboard: page }) => {
  const { cards, root } = await rootWithChildren(page, ['One', 'Two']);
  await root.hover();
  await root.getByTestId('btn-collapse').click();
  await expect(cards).toHaveCount(1);

  await pick(page, root, 'Two');
  await pick(page, root, 'One');
  await expect(cards).toHaveCount(3);
  await root.hover();
  await expect(root.getByTestId('btn-collapse')).toBeVisible();
  await expect(root.getByTestId('collapse-badge')).toHaveCount(0);

  // A click elsewhere closes the list without changing anything.
  await root.getByTestId('btn-reveal-menu').click();
  await expect(page.getByTestId('child-reveal-menu')).toBeVisible();
  await page.mouse.click(20, 400);
  await expect(page.getByTestId('child-reveal-menu')).toHaveCount(0);
  await expect(cards).toHaveCount(3);
});

test('the list of connected ideas works from the keyboard', async ({ dashboard: page }) => {
  const { cards, root } = await rootWithChildren(page, ['One', 'Two']);
  await root.hover();
  await root.getByTestId('btn-collapse').click();
  await expect(cards).toHaveCount(1);

  await root.hover();
  await root.getByTestId('btn-reveal-menu').click();
  const menu = page.getByTestId('child-reveal-menu');
  const items = menu.locator('[role="menuitemcheckbox"]');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(cards).toHaveCount(2);
  await expect(menu).toHaveCount(0);
  await expect(root.getByTestId('btn-reveal-menu')).toBeFocused();

  // Reopen from the keyboard and reveal the other one with Space.
  await page.keyboard.press('Enter');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press(' ');
  await expect(cards).toHaveCount(3);
  await expect(menu).toHaveCount(0);

  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(root.getByTestId('btn-reveal-menu')).toBeFocused();
});

test('picking a hidden idea selects it and opens the inspector on it', async ({ dashboard: page }) => {
  const { cards, root } = await rootWithChildren(page, ['One', 'Two']);
  await root.hover();
  await root.getByTestId('btn-collapse').click();
  await expect(cards).toHaveCount(1);

  // Start with the inspector closed.
  const rail = page.getByTestId('node-inspector-rail');
  const toggle = page.getByTestId('btn-toggle-inspector');
  if ((await toggle.getAttribute('aria-label')) === 'Hide inspector') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-label', 'Show inspector');

  await pick(page, root, 'Two');
  const two = cards.filter({ hasText: 'Two' });
  await expect(two).toHaveAttribute('data-selected', 'true');
  await expect(toggle).toHaveAttribute('aria-label', 'Hide inspector');
  await expect(rail.getByTestId('inspector-title')).toHaveText('Two');
});
