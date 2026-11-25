/**
 * Milestone 0 exit check (`.agents/tasks/m0-plan.md` §1): a student creates
 * a project through the intake, makes typed research objects, sees a
 * deterministic structural warning with no AI involved, connects the objects
 * with a typed relation that clears it, and finds it all after a reload.
 */
import type { Locator, Page } from '@playwright/test';

import { addIdea, expect, openDashboard, test, waitForSaved } from './fixtures';

const cards = (page: Page) => page.locator('[data-testid^="node-card-"]');
const cardTitled = (page: Page, title: string) => cards(page).filter({ hasText: title });

async function idOf(card: Locator): Promise<string> {
  const testId = await card.getAttribute('data-testid');
  return testId!.replace('node-card-', '');
}

async function centerOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Drag a connector out of `from`'s right handle and drop it on `to`. */
async function connectCards(page: Page, from: Locator, to: Locator): Promise<void> {
  await from.hover();
  const start = await centerOf(from.locator('[data-testid="handle-source-right"]'));
  const end = await centerOf(to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 12 });
  await page.mouse.up();
}

test('intake, typed objects, a deterministic warning, a typed relation, and a reload', async ({ dashboard: page }) => {
  // Structural checks need no model: count every AI call the page makes.
  const aiCalls: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/api/ai/') && !req.url().endsWith('/api/ai/config')) aiCalls.push(req.url());
  });

  // 1. A new project starts with the intake; "I have a topic" seeds a topic card.
  await page.getByTestId('btn-new-project').click();
  await page.getByTestId('intake-has-topic').click();
  await page.getByTestId('intake-topic').fill('Remote work and team trust');
  await page.getByTestId('intake-continue').click();
  await expect(page.getByTestId('intake')).toHaveCount(0);
  await expect(cardTitled(page, 'Remote work and team trust')).toHaveCount(1);

  // The problem stage is in focus, next steps beside it, every stage one click away.
  await expect(page.getByTestId('stage-problem')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('next-step-add-objective')).toBeVisible();
  await expect(page.getByTestId('stage-topic')).toHaveAttribute('data-state', 'in-progress');
  await expect(page.locator('.react-flow__node.root-dimmed')).toHaveCount(1); // the topic sits outside the stage

  // 2. An objective from the next steps, a research question from the type picker.
  await page.getByTestId('next-step-add-objective-action').click();
  await page.getByTestId('node-editor-title').fill('Explain how remote work affects trust');
  await page.getByTestId('node-editor-save').click();
  await addIdea(page);
  await page.getByTestId('node-editor-type-research-question').click();
  await page.getByTestId('node-editor-title').fill('Does remote work lower trust?');
  await page.getByTestId('node-editor-save').click();

  const objective = cardTitled(page, 'Explain how remote work affects trust');
  const question = cardTitled(page, 'Does remote work lower trust?');
  await expect(objective.getByTestId('node-type-label')).toHaveText(/objective/i);
  await expect(question.getByTestId('node-type-label')).toHaveText(/research question/i);

  // 3. The deterministic warning, on the card and in the next steps.
  await expect(question.getByTestId('node-evidence-badge')).toHaveText('No objective');
  await expect(page.getByTestId('next-step-issue-rq-without-objective')).toContainText(
    'A research question is not linked to an objective.',
  );
  await expect(page.getByTestId('stage-problem-issues')).toHaveText('2');

  // 4. Connect them: the connector starts as "addresses" and the warning clears.
  await connectCards(page, question, objective);
  await expect(page.locator('[data-testid^="connector-label-"]')).toHaveText('addresses');
  await expect(question.getByTestId('node-evidence-badge')).toHaveCount(0);
  await expect(objective.getByTestId('node-evidence-badge')).toHaveCount(0);
  await expect(page.getByTestId('stage-problem-issues')).toHaveCount(0);

  // "All stages" shows the whole canvas again.
  await page.getByTestId('stage-all').click();
  await expect(page.locator('.react-flow__node.root-dimmed')).toHaveCount(0);
  await page.getByTestId('stage-problem').click();
  expect(aiCalls).toEqual([]);

  // 5. After a reload: types, the relation, provenance and the intake state are all kept.
  const questionId = await idOf(question);
  await waitForSaved(page);
  await page.reload();
  await openDashboard(page);
  await expect(cardTitled(page, 'Does remote work lower trust?').getByTestId('node-type-label')).toHaveText(
    /research question/i,
  );
  await expect(page.locator('[data-testid^="connector-label-"]')).toHaveText('addresses');
  await expect(page.getByTestId('stage-problem')).toHaveAttribute('aria-pressed', 'true');

  const projectId = await page.evaluate(() => localStorage.getItem('root-ui:active-project-id'));
  const stored = (await (await page.request.get(`/api/projects/${projectId}`)).json()) as {
    canvas: {
      nodes: Array<{ id: string; type: string; provenance: { origin: string } }>;
      edges: Array<{ source: string; relationType: string; provenance: { origin: string } }>;
      workspace: { intake: { answer: string }; focusStage: string };
    };
  };
  expect(stored.canvas.nodes.map((n) => n.type).sort()).toEqual(['objective', 'research-question', 'topic']);
  expect(stored.canvas.nodes.every((n) => n.provenance.origin === 'researcher')).toBe(true);
  expect(stored.canvas.edges).toEqual([
    expect.objectContaining({ source: questionId, relationType: 'addresses', provenance: expect.objectContaining({ origin: 'researcher' }) }),
  ]);
  expect(stored.canvas.workspace).toMatchObject({ intake: { answer: 'has-topic' }, focusStage: 'problem' });
});

test('skipping the intake leaves a blank canvas with no stage panel, and it can be run later', async ({ dashboard: page }) => {
  await page.getByTestId('btn-new-project').click();
  await page.getByTestId('intake-skip').click();
  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByTestId('stage-panel')).toHaveCount(0);

  const projectId = await page.evaluate(() => localStorage.getItem('root-ui:active-project-id'));
  await page.getByTestId(`project-item-${projectId}`).hover();
  await page.getByTestId(`btn-starting-point-${projectId}`).click();
  await expect(page.getByText('Starting point')).toBeVisible();
  await page.getByTestId('intake-writing-up').click();
  await expect(page.getByTestId('stage-documentation')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('next-step-later-documentation')).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
});
