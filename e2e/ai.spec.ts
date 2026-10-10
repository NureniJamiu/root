import { addIdea, expect, openDashboard, test, waitForSaved } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * E2E: AI features in the browser, with `/api/ai` answered by the test so no
 * model or key is needed (the server side has its own tests).
 *
 *   - Map a topic from the empty canvas: suggestions appear as ghost cards,
 *     one is left out, Add puts the rest on the canvas as one undo step.
 *   - Expand an idea from its hover toolbar.
 *   - Rewrite selected document text and replace it.
 *   - Ask the project a question; a citation chip leads to the idea.
 *   - Make ideas from selected document text.
 */

const allowance = { used: 1, limit: 1000, resetsAt: '2099-01-01T00:00:00.000Z' };
const meta = { model: { id: 'google:gemini-3.8-flash', label: 'Gemini 3.8 Flash' }, allowance, ownKey: false };

async function mockAi(page: Page): Promise<void> {
  await page.route('**/api/ai/config', (route) =>
    route.fulfill({
      json: {
        enabled: true,
        plan: 'pro',
        planLabel: 'Pro',
        features: ['ai.map', 'ai.expand', 'ai.rewrite', 'ai.ask', 'ai.capture', 'ai.tidy', 'ai.draft', 'ai.review', 'models.premium'],
        allowance: { ...allowance, used: 0 },
        models: [],
        selectedModelId: null,
        activeModels: { fast: 'google:gemini-3.8-flash', smart: 'google:gemini-3.8-flash' },
        keys: [],
        appProviders: ['google'],
        acceptRates: [],
        semanticSearch: true,
      },
    }),
  );
  await page.route('**/api/ai/map', (route) =>
    route.fulfill({
      json: {
        ...meta,
        ideas: [
          { key: 'i1', title: 'Sleep and memory', body: 'The topic.', type: 'topic', parent: null },
          { key: 'i2', title: 'REM sleep consolidates skills', body: '', type: 'finding', parent: 'i1' },
          { key: 'i3', title: 'Do naps help as much?', body: '', type: 'question', parent: 'i1' },
        ],
      },
    }),
  );
  await page.route('**/api/ai/expand', (route) =>
    route.fulfill({
      json: {
        ...meta,
        ideas: [
          { key: 'e1', title: 'What does the evidence say?', body: '', type: 'question', parent: null },
          { key: 'e2', title: 'Practical takeaway', body: '', type: 'conclusion', parent: null },
        ],
      },
    }),
  );
  await page.route('**/api/ai/capture', (route) =>
    route.fulfill({
      json: {
        ...meta,
        ideas: [
          { key: 'c1', title: 'Sleep strengthens memory', body: '', type: 'finding', parent: null },
          { key: 'c2', title: 'How much sleep is enough?', body: '', type: 'question', parent: 'c1' },
        ],
      },
    }),
  );
  await page.route('**/api/ai/feedback', (route) => route.fulfill({ status: 204, body: '' }));
  await page.route('**/api/ai/rewrite', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: 'Sleep helps memory.' }),
  );
}

const cards = (page: Page) => page.locator('[data-testid^="node-card-"]');

test('map a topic into suggested ideas and keep some of them', async ({ dashboard: page }) => {
  await mockAi(page);
  await openDashboard(page);

  await page.getByTestId('ai-start-input').fill('How sleep affects memory');
  await page.getByTestId('ai-start-submit').click();

  await expect(page.getByTestId('ghost-card-i1')).toBeVisible();
  await expect(page.getByTestId('ai-review-bar')).toContainText('3 suggested ideas');
  await expect(cards(page)).toHaveCount(0);

  await page.getByTestId('ghost-card-i3').click();
  await expect(page.getByTestId('ai-accept')).toHaveText('Add 2');
  await page.getByTestId('ai-accept').click();

  await expect(cards(page)).toHaveCount(2);
  await expect(page.getByTestId('ai-review-bar')).toHaveCount(0);
  await expect(page.locator('[data-testid^="ghost-card-"]')).toHaveCount(0);
  await waitForSaved(page);

  await page.keyboard.press('Control+z');
  await expect(cards(page)).toHaveCount(0);
});

test('expand an idea from its toolbar', async ({ dashboard: page }) => {
  await mockAi(page);
  await openDashboard(page);
  await addIdea(page);
  await page.getByTestId('node-editor-title').fill('Sleep');
  await page.getByTestId('node-editor-save').click();

  const card = cards(page).first();
  await card.hover();
  await card.getByTestId('btn-expand-ai').click();

  await expect(page.getByTestId('ghost-card-e1')).toBeVisible();
  await page.getByTestId('ai-accept').click();
  await expect(cards(page)).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
});

test('discard leaves the canvas untouched', async ({ dashboard: page }) => {
  await mockAi(page);
  await openDashboard(page);
  await page.getByTestId('ai-start-input').fill('Anything');
  await page.getByTestId('ai-start-submit').click();
  await expect(page.getByTestId('ghost-card-i1')).toBeVisible();
  await page.getByTestId('ai-discard').click();
  await expect(page.locator('[data-testid^="ghost-card-"]')).toHaveCount(0);
  await expect(cards(page)).toHaveCount(0);
});

test('rewrite selected document text', async ({ dashboard: page }) => {
  await mockAi(page);
  await openDashboard(page);
  await page.getByTestId('view-mode-write').click();
  await page.getByTestId('doc-template-blank').click();
  const prose = page.getByTestId('doc-editor');
  await prose.click();
  await page.keyboard.type('Sleep is really very good for helping memory work well.');
  await page.keyboard.press('Shift+Home');

  await page.getByTestId('doc-ai-menu').click();
  await page.getByTestId('doc-ai-shorten').click();
  await expect(page.getByTestId('doc-ai-text')).toHaveText('Sleep helps memory.');
  await page.getByTestId('doc-ai-apply').click();

  await expect(prose).toContainText('Sleep helps memory.');
  await expect(prose).not.toContainText('really very good');
  await expect(page.getByTestId('doc-ai-panel')).toHaveCount(0);
});

test('ask the project and follow a citation to the idea', async ({ dashboard: page }) => {
  await mockAi(page);
  await openDashboard(page);
  await addIdea(page);
  await page.getByTestId('node-editor-title').fill('REM sleep consolidates skills');
  await page.getByTestId('node-editor-save').click();
  await waitForSaved(page);
  const ideaId = await page.evaluate(() => {
    const store = (window as unknown as Record<string, { getState(): { canvas: { nodes: Array<{ id: string }> } } }>)
      .__ROOT_CANVAS_STORE__!;
    return store.getState().canvas.nodes[0]!.id;
  });
  await page.route('**/api/ai/ask', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      headers: { 'X-AI-Model': 'Gemini%203.8%20Flash', 'X-AI-Search': 'whole' },
      body: `Yes, REM sleep helps [[idea:${ideaId}]].`,
    }),
  );
  // Nothing selected, so the citation is what selects the idea.
  await page.evaluate(() =>
    (window as unknown as Record<string, { select(id: null): void }>).__ROOT_CANVAS_ACTIONS__!.select(null),
  );

  await page.getByTestId('btn-ai-menu').click();
  await page.getByTestId('ai-open-ask').click();
  await page.getByTestId('ai-ask-input').fill('Does sleep help skills?');
  await page.getByTestId('ai-ask-submit').click();

  const chip = page.getByTestId('ai-source-idea');
  await expect(chip).toHaveText('REM sleep consolidates skills');
  await expect(page.getByTestId('ai-panel')).toContainText('read the whole project');
  await chip.click();
  await expect(page.getByTestId(`node-card-${ideaId}`)).toHaveAttribute('data-selected', 'true');
});

test('make ideas from selected document text', async ({ dashboard: page }) => {
  await mockAi(page);
  await openDashboard(page);
  await page.getByTestId('view-mode-write').click();
  await page.getByTestId('doc-template-blank').click();
  const prose = page.getByTestId('doc-editor');
  await prose.click();
  await page.keyboard.type('Sleep strengthens memory, but nobody knows how much sleep is enough.');
  await page.keyboard.press('Shift+Home');

  await page.getByTestId('doc-ai-menu').click();
  await page.getByTestId('doc-ai-capture').click();

  await expect(page.getByTestId('ghost-card-c1')).toBeVisible();
  await page.getByTestId('ai-accept').click();
  await expect(cards(page)).toHaveCount(2);
});
