import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

const CONCLUSION = 'c0000000-0000-4000-8000-000000000001';
const QUESTION = 'c0000000-0000-4000-8000-000000000002';
const FINDING = 'c0000000-0000-4000-8000-000000000003';
const EDGE = 'c0000000-0000-4000-8000-0000000000e1';

/** A conclusion resting on an unanswered question, and a finding off on its own. */
async function seed(page: Page): Promise<void> {
  await page.evaluate(
    ({ ids }) => {
      const store = (window as unknown as {
        __ROOT_CANVAS_STORE__: { getState(): { canvas: object }; setState(p: object): void };
      }).__ROOT_CANVAS_STORE__;
      const ts = new Date().toISOString();
      const card = (id: string, type: string, title: string, x: number) => ({
        id, type, title, body: '', position: { x, y: 200 }, collapsed: false, images: [], createdAt: ts, updatedAt: ts,
      });
      store.setState({
        canvas: {
          ...store.getState().canvas,
          nodes: [
            card(ids.conclusion, 'conclusion', 'Lead with annual', 80),
            card(ids.question, 'question', 'Keep a free tier?', 480),
            card(ids.finding, 'finding', 'Annual wins 3 to 1', 880),
          ],
          edges: [{
            id: ids.edge, source: ids.conclusion, target: ids.question, sourceSide: 'right', targetSide: 'left',
            sourcePinned: false, targetPinned: false,
          }],
        },
        selection: { nodeId: null, edgeId: null },
        editor: { openNodeId: null },
      });
    },
    { ids: { conclusion: CONCLUSION, question: QUESTION, finding: FINDING, edge: EDGE } },
  );
}

const card = (page: Page, id: string) => page.getByTestId(`node-card-${id}`);

test('evidence checks flag gaps on cards and in the inspector, and clear once resolved', async ({ dashboard: page }) => {
  await seed(page);

  await expect(card(page, CONCLUSION).getByTestId('node-evidence-badge')).toHaveText('No evidence · Open question');
  await expect(card(page, FINDING).getByTestId('node-evidence-badge')).toHaveText('Not used');
  await expect(card(page, QUESTION).getByTestId('node-evidence-badge')).toHaveCount(0);

  // Nothing selected: the inspector lists every check.
  const overview = page.getByTestId('evidence-overview');
  await expect(overview.getByTestId('evidence-group-unbacked')).toContainText('Lead with annual');
  await expect(overview.getByTestId('evidence-group-dangling')).toContainText('Annual wins 3 to 1');

  // Pick the conclusion from the list, then follow its open question.
  await overview.getByTestId('evidence-group-unbacked').getByTestId('evidence-idea-link').click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Lead with annual');
  await expect(page.getByTestId('evidence-issue-unbacked')).toBeVisible();
  await page.getByTestId('evidence-issue-open-question').getByTestId('evidence-idea-link').click();
  await expect(page.getByTestId('inspector-title')).toHaveText('Keep a free tier?');

  // Answer the question with the finding: every check clears.
  await page.evaluate(({ question, finding }) => {
    const store = (window as unknown as {
      __ROOT_CANVAS_STORE__: { getState(): { canvas: { edges: object[] } }; setState(p: object): void };
    }).__ROOT_CANVAS_STORE__;
    const canvas = store.getState().canvas;
    store.setState({
      canvas: {
        ...canvas,
        edges: [...canvas.edges, {
          id: 'c0000000-0000-4000-8000-0000000000e2', source: question, target: finding,
          sourceSide: 'right', targetSide: 'left', sourcePinned: false, targetPinned: false,
        }],
      },
      selection: { nodeId: null, edgeId: null },
    });
  }, { question: QUESTION, finding: FINDING });

  await expect(page.getByTestId('node-evidence-badge')).toHaveCount(0);
  await expect(page.getByTestId('evidence-all-clear')).toBeVisible();
});
