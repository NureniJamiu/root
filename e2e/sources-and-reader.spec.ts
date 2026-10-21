import { readFile } from 'node:fs/promises';

import { addIdea, expect, test, waitForSaved } from './fixtures';

/**
 * E2E: sources. Read a page in the reader, lift a passage onto the canvas
 * as a cited Finding, record a source by hand in the editor, and export a
 * document with an APA reference list.
 *
 * The page fetch (`/api/reader`) is answered by the test, so no network is used.
 */

const PAGE = {
  url: 'https://news.example.com/sleep',
  title: 'Sleep and memory',
  authors: ['Ada Lovelace'],
  published: '2024-03-18',
  siteName: 'Science Daily',
  doi: null,
  kind: 'web',
  blocks: [
    { kind: 'heading', text: 'Sleep and memory' },
    { kind: 'paragraph', text: 'People who slept after learning remembered 20% more the next day.' },
  ],
};

test('extract a passage from the reader as a cited finding', async ({ dashboard: page }) => {
  let asked = '';
  await page.route('**/api/reader', async (route) => {
    asked = (route.request().postDataJSON() as { url: string }).url;
    await route.fulfill({ json: PAGE });
  });

  await page.getByTestId('btn-reader').click();
  await page.getByTestId('source-reader-url').fill('news.example.com/sleep');
  await page.getByTestId('source-reader-go').click();
  await expect(page.getByTestId('source-reader-title')).toHaveText('Sleep and memory');
  expect(asked).toBe('https://news.example.com/sleep');

  await page.getByTestId('source-reader-text').getByText('People who slept').click({ clickCount: 3 });
  await page.getByTestId('source-reader-extract-finding').click();
  await expect(page.getByTestId('source-reader-status')).toContainText('1 card added');

  const card = page.locator('[data-testid^="node-card-"]');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('node-title')).toHaveText('People who slept after learning remembered 20% more the next day.');
  await expect(card.getByTestId('node-source-badge')).toHaveText('Science Daily');
  await waitForSaved(page);

  await page.getByTestId('source-reader-close').click();
  await card.click();
  await expect(page.getByTestId('inspector-source-reference')).toHaveText(
    'Lovelace, A. (2024, March 18). Sleep and memory. Science Daily. https://news.example.com/sleep',
  );

  // Survives a reload: the source is saved with the canvas.
  await page.reload();
  await expect(page.locator('[data-testid^="node-card-"]').getByTestId('node-source-badge')).toHaveText('Science Daily');
});

test('record a source by hand and export with an APA reference list', async ({ dashboard: page }) => {
  await addIdea(page);
  await page.getByTestId('node-editor-title').fill('Sleep consolidates memory');
  await page.getByTestId('node-editor-add-source').click();
  await page.getByTestId('node-editor-source-kind-book').click();
  await page.getByTestId('node-editor-source-title').fill('Why We Sleep');
  await page.getByTestId('node-editor-source-authors').fill('Matthew Walker');
  await page.getByTestId('node-editor-source-container').fill('Scribner');
  await page.getByTestId('node-editor-source-published').fill('2017');
  await page.getByTestId('node-editor-save').click();
  await waitForSaved(page);

  await page.getByTestId('view-mode-split').click();
  await page.getByTestId('doc-template-blank').click();
  const prose = page.getByTestId('doc-editor');
  await prose.click();
  await page.keyboard.type('As shown, ');
  await page.keyboard.type('@Sleep');
  await expect(page.getByTestId('doc-suggestion-menu')).toContainText('Sleep consolidates memory');
  await page.keyboard.press('Enter');

  await page.getByTestId('btn-doc-export').click();
  await page.getByTestId('btn-citations-apa').click();
  const pending = page.waitForEvent('download');
  await page.getByTestId('btn-export-markdown').click();
  const text = await readFile((await (await pending).path())!, 'utf8');
  expect(text).toContain('## References\n\nWalker, M. (2017). *Why We Sleep.* Scribner.');
  expect(text).toContain('[^1]: Walker, M. (2017). *Why We Sleep.* Scribner.');

  await page.getByTestId('btn-doc-export').click();
  const bib = page.waitForEvent('download');
  await page.getByTestId('btn-export-bibtex').click();
  const bibText = await readFile((await (await bib).path())!, 'utf8');
  expect(bibText).toContain('@book{walker2017sleep,');
});

test('paste text from a site the reader cannot open', async ({ dashboard: page }) => {
  await page.route('**/api/reader', (route) =>
    route.fulfill({ status: 422, json: { error: 'This site checks for a real browser before showing the page, so the reader cannot open it. Open it in your browser and paste the text instead.' } }),
  );
  await page.getByTestId('btn-reader').click();
  await page.getByTestId('source-reader-url').fill('https://journal.example.org/paper');
  await page.getByTestId('source-reader-go').click();
  await expect(page.getByTestId('source-reader-error')).toContainText('checks for a real browser');

  await page.getByTestId('source-reader-paste-open').click();
  await page.getByTestId('source-reader-paste-text').fill('Intro paragraph.\n\nDoes sleep help older adults remember as much as younger ones?');
  await page.getByTestId('source-reader-paste-go').click();
  await page.getByTestId('source-reader-text').getByText('Does sleep help').click({ clickCount: 3 });
  await page.getByTestId('source-reader-extract-question').click();

  const card = page.locator('[data-testid^="node-card-"]');
  await expect(card).toHaveAttribute('data-node-type', 'question');
  await expect(card.getByTestId('node-source-badge')).toHaveText('journal.example.org');
});

const PAPER = [
  { text: 'Sleep and Memory in Older Adults', y: 720, size: 20 },
  { text: 'Older adults who napped after learning recalled more of the', y: 680 },
  { text: 'word list the next morning than those who stayed awake.', y: 666 },
  { text: 'Results held after controlling for age. doi:10.5555/sleep.2023.42', y: 630 },
];

test('open a PDF from the computer and extract a passage', async ({ dashboard: page }) => {
  const { makePdf } = await import('./pdf');
  await page.getByTestId('btn-reader').click();
  await page.getByTestId('source-reader-file').setInputFiles({
    name: 'older-adults.pdf',
    mimeType: 'application/pdf',
    buffer: makePdf(PAPER, { title: 'Sleep and Memory in Older Adults', author: 'Grace Hopper; Alan Turing', created: '20230512' }),
  });
  await expect(page.getByTestId('source-reader-title')).toHaveText('Sleep and Memory in Older Adults');
  const text = page.getByTestId('source-reader-text');
  await expect(text).toContainText('Older adults who napped after learning recalled more of the word list the next morning');

  await text.getByText('Older adults who napped').click({ clickCount: 3 });
  await page.getByTestId('source-reader-extract-finding').click();
  await page.getByTestId('source-reader-close').click();

  const card = page.locator('[data-testid^="node-card-"]');
  await expect(card).toHaveCount(1);
  await card.click();
  await expect(page.getByTestId('inspector-source-reference')).toHaveText(
    'Hopper, G., & Turing, A. (2023). Sleep and Memory in Older Adults. https://doi.org/10.5555/sleep.2023.42',
  );
});

test('read a PDF link through the server', async ({ dashboard: page }) => {
  const { makePdf } = await import('./pdf');
  await page.route('**/api/reader', (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/pdf', 'x-reader-url': 'https://example.org/papers/older-adults.pdf' },
      body: makePdf(PAPER),
    }),
  );
  await page.getByTestId('btn-reader').click();
  await page.getByTestId('source-reader-url').fill('https://example.org/papers/older-adults.pdf');
  await page.getByTestId('source-reader-go').click();
  // No title in the PDF's information: the largest type on the first page stands in.
  await expect(page.getByTestId('source-reader-title')).toHaveText('Sleep and Memory in Older Adults');
  await expect(page.getByTestId('source-reader-text')).toContainText('Results held after controlling for age.');
});
