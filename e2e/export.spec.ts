import { readFile } from 'node:fs/promises';

import JSZip from 'jszip';
import type { Page } from '@playwright/test';

import { addIdea, expect, test, waitForSaved } from './fixtures';

/**
 * E2E: export the open document as Markdown and Word, with the ideas it
 * cites turned into footnotes. Exports what is on screen, unsaved typing
 * included.
 */

async function writeCitingDocument(page: Page): Promise<void> {
  await addIdea(page);
  await page.getByTestId('node-editor-title').fill('Sleep improves memory');
  await page.getByTestId('node-editor-save').click();
  await waitForSaved(page);

  await page.getByTestId('view-mode-split').click();
  await page.getByTestId('doc-template-blank').click();
  const prose = page.getByTestId('doc-editor');
  await expect(prose).toBeVisible();
  await page.getByTestId('doc-title-input').fill('Sleep and learning');
  await prose.click();
  await page.keyboard.type('Evidence: ');
  await page.keyboard.type('@Sleep');
  await expect(page.getByTestId('doc-suggestion-menu')).toContainText('Sleep improves memory');
  await page.keyboard.press('Enter');
  await page.keyboard.type('is the strongest finding.');
}

async function download(page: Page, format: 'markdown' | 'docx'): Promise<{ name: string; data: Buffer }> {
  await page.getByTestId('btn-doc-export').click();
  const pending = page.waitForEvent('download');
  await page.getByTestId(`btn-export-${format}`).click();
  const file = await pending;
  return { name: file.suggestedFilename(), data: await readFile((await file.path())!) };
}

test('export a document as Markdown and Word with footnotes', async ({ dashboard: page }) => {
  await writeCitingDocument(page);

  const md = await download(page, 'markdown');
  expect(md.name).toBe('Sleep and learning.md');
  const text = md.data.toString('utf8');
  expect(text).toContain('# Sleep and learning');
  expect(text).toMatch(/Evidence: Sleep improves memory\[\^1\]\s?is the strongest finding\./);
  expect(text).toContain('[^1]: Sleep improves memory (Topic).');

  const word = await download(page, 'docx');
  expect(word.name).toBe('Sleep and learning.docx');
  const zip = await JSZip.loadAsync(word.data);
  expect(await zip.file('word/document.xml')!.async('string')).toContain('w:footnoteReference');
  expect(await zip.file('word/footnotes.xml')!.async('string')).toContain('Sleep improves memory (Topic).');
});
