import { addIdea, expect, test } from './fixtures';

test('collapse all, then walk through the ideas one at a time', async ({ dashboard: page }) => {
  await addIdea(page);
  await page.getByTestId('node-editor-title').fill('Root question');
  await page.getByTestId('node-editor-save').click();
  const cards = page.locator('[data-testid^="node-card-"]');
  const root = cards.first();
  for (const title of ['Finding A', 'Finding B', 'Finding C']) {
    await root.hover();
    await root.getByTestId('btn-add-child').click();
    await page.getByTestId('node-editor-title').fill(title);
    await page.getByTestId('node-editor-save').click();
  }
  await expect(cards).toHaveCount(4);

  // Nothing selected: the controls act on every idea.
  await page.getByTestId('canvas-view').press('Escape');
  await expect(page.getByTestId('btn-scope-all')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('btn-collapse-scope').click();
  await expect(cards).toHaveCount(1);

  await page.getByTestId('btn-walkthrough').click();
  await expect(page.getByTestId('walkthrough-bar')).toBeVisible();
  await expect(page.getByTestId('walkthrough-progress')).toHaveText('0 / 3');

  await page.keyboard.press('ArrowRight');
  await expect(cards).toHaveCount(2);
  await page.keyboard.press('ArrowRight');
  await expect(cards).toHaveCount(3);
  await page.keyboard.press('ArrowLeft');
  await expect(cards).toHaveCount(2);

  await page.getByTestId('btn-walkthrough-next').click();
  await page.getByTestId('btn-walkthrough-next').click();
  await expect(cards).toHaveCount(4);
  await expect(page.getByTestId('walkthrough-progress')).toHaveText('All shown');

  // Finishing keeps everything expanded.
  await page.getByTestId('btn-walkthrough-end').click();
  await expect(page.getByTestId('walkthrough-bar')).toHaveCount(0);
  await expect(cards).toHaveCount(4);
});

test('collapse and expand only the selected ideas', async ({ dashboard: page }) => {
  await addIdea(page);
  await page.getByTestId('node-editor-save').click();
  const cards = page.locator('[data-testid^="node-card-"]');
  const root = cards.first();
  await root.hover();
  await root.getByTestId('btn-add-child').click();
  await page.getByTestId('node-editor-save').click();
  await expect(cards).toHaveCount(2);

  await root.click();
  await expect(page.getByTestId('btn-scope-selected')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('btn-collapse-scope').click();
  await expect(cards).toHaveCount(1);
  await page.getByTestId('btn-expand-scope').click();
  await expect(cards).toHaveCount(2);
});
