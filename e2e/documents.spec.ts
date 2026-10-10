import { addIdea, expect, test, waitForSaved } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * E2E: research documents next to the canvas.
 *
 *   - Open the Write view, start a document, type, cite an idea with @, and
 *     find the text, the citation and the backlinks again after a reload.
 *   - Keys typed in the document never reach the canvas shortcuts (N adds an
 *     idea there).
 *   - Select text and "Make idea" to send it to the canvas.
 */

async function addNamedIdea(page: Page, title: string): Promise<void> {
  await addIdea(page);
  const editor = page.getByTestId('node-editor');
  await expect(editor).toBeVisible();
  await page.getByTestId('node-editor-title').fill(title);
  await page.getByTestId('node-editor-save').click();
  await expect(editor).not.toBeVisible();
}

async function waitForDocSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('doc-save-status')).toHaveAttribute('data-status', 'saved', { timeout: 10_000 });
}

test('write a document that cites an idea, and find it again after reload', async ({ dashboard: page }) => {
  await addNamedIdea(page, 'Sleep improves memory');
  await waitForSaved(page);
  const ideaCount = await page.locator('[data-testid^="node-card-"]').count();

  // Split view, new blank document.
  await page.getByTestId('view-mode-split').click();
  await expect(page.getByTestId('document-pane')).toBeVisible();
  await page.getByTestId('doc-template-blank').click();
  const prose = page.getByTestId('doc-editor');
  await expect(prose).toBeVisible();

  await page.getByTestId('doc-title-input').fill('Sleep and learning');
  await prose.click();
  // "n" must not add an idea while typing in the document.
  await page.keyboard.type('Notes on sleep. Evidence: ');
  await page.keyboard.type('@Sleep');
  await expect(page.getByTestId('doc-suggestion-menu')).toBeVisible();
  await expect(page.getByTestId('doc-suggestion-menu')).toContainText('Sleep improves memory');
  await page.keyboard.press('Enter');
  await expect(prose.getByTestId('idea-ref')).toHaveText(/Sleep improves memory/);
  await page.keyboard.type('is the strongest finding.');

  await expect(page.locator('[data-testid^="node-card-"]')).toHaveCount(ideaCount);
  await waitForDocSaved(page);
  await expect(page.getByTestId('doc-word-count')).toContainText('words');

  // The card shows the backlink.
  await expect(page.getByTestId('node-doc-count')).toHaveText(/In 1 doc/);

  await page.reload();
  await page.waitForFunction(
    () => (window as unknown as { __ROOT_INITIALIZED__?: boolean }).__ROOT_INITIALIZED__ === true,
  );

  // Split view and the open document are remembered.
  await expect(page.getByTestId('doc-title-input')).toHaveValue('Sleep and learning');
  await expect(page.getByTestId('doc-editor')).toContainText('Notes on sleep. Evidence:');
  await expect(page.getByTestId('doc-editor').getByTestId('idea-ref')).toHaveText(/Sleep improves memory/);
  await expect(page.getByTestId('node-doc-count')).toHaveText(/In 1 doc/);

  // The document is listed in the sidebar.
  await expect(page.getByTestId('rail-documents')).toContainText('Sleep and learning');

  // Clicking the citation selects the idea on the canvas, and the inspector lists the document.
  await page.getByTestId('doc-editor').getByTestId('idea-ref').click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Sleep improves memory');
  await expect(page.getByTestId('inspector-document-link')).toHaveText(/Sleep and learning/);
});

test('turn selected document text into a connected idea', async ({ dashboard: page }) => {
  await addNamedIdea(page, 'Remote work');
  await waitForSaved(page);

  await page.getByTestId('view-mode-write').click();
  await page.getByTestId('doc-template-blank').click();
  const prose = page.getByTestId('doc-editor');
  await prose.click();
  await page.keyboard.type('@Remote');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Commutes are replaced by focus time');

  // Select the sentence after the citation.
  for (let i = 0; i < 'Commutes are replaced by focus time'.length; i += 1) await page.keyboard.press('Shift+ArrowLeft');
  await expect(page.getByTestId('doc-bubble')).toBeVisible();
  await page.getByTestId('doc-make-idea').click();

  await expect(prose.getByTestId('idea-ref')).toHaveCount(2);
  await waitForDocSaved(page);

  // Back on the canvas: a new idea, connected from the cited one.
  await page.getByTestId('view-mode-canvas').click();
  await expect(page.locator('[data-testid^="node-card-"]')).toHaveCount(2);
  await expect(page.locator('[data-testid^="node-card-"]', { hasText: 'Commutes are replaced by focus time' })).toBeVisible();
  const edges = await page.evaluate(
    () =>
      (
        window as unknown as { __ROOT_CANVAS_STORE__: { getState: () => { canvas: { edges: unknown[] } } } }
      ).__ROOT_CANVAS_STORE__.getState().canvas.edges.length,
  );
  expect(edges).toBe(1);
});

test('draft a document from a branch, with slash commands', async ({ dashboard: page }) => {
  await addNamedIdea(page, 'Main question');
  const root = page.locator('[data-testid^="node-card-"]').first();
  await root.hover();
  await root.getByTestId('btn-add-child').click();
  await page.getByTestId('node-editor-title').fill('First angle');
  await page.getByTestId('node-editor-save').click();
  await waitForSaved(page);

  await root.click();
  await page.getByTestId('btn-draft-from-branch').click();
  const prose = page.getByTestId('doc-editor');
  await expect(prose).toBeVisible();
  await expect(page.getByTestId('doc-title-input')).toHaveValue('Main question');
  await expect(prose.locator('h2')).toContainText('First angle');
  await expect(page.getByTestId('doc-outline')).toContainText('First angle');

  // Slash menu: add a checklist at the end.
  await prose.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type('/check');
  await expect(page.getByTestId('doc-suggestion-menu')).toContainText('Checklist');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Find two more sources');
  await expect(prose.locator('ul[data-type="taskList"]')).toContainText('Find two more sources');

  // Shift+Enter in the @ menu embeds the card; typing afterwards goes below it.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('@First');
  await expect(page.getByTestId('doc-suggestion-menu')).toContainText('First angle');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('After the card');
  await expect(prose.getByTestId('idea-card')).toHaveCount(1);
  await expect(prose.getByTestId('idea-card')).toContainText('First angle');
  await expect(prose).toContainText('After the card');
  await waitForDocSaved(page);
});
