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
        fields: {}, provenance: { origin: 'researcher', edited: false },
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
            sourcePinned: false, targetPinned: false, relationType: 'related-to', provenance: { origin: 'researcher', edited: false },
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
          relationType: 'related-to', provenance: { origin: 'researcher', edited: false },
        }],
      },
      selection: { nodeId: null, edgeId: null },
    });
  }, { question: QUESTION, finding: FINDING });

  await expect(page.getByTestId('node-evidence-badge')).toHaveCount(0);
  await expect(page.getByTestId('evidence-all-clear')).toBeVisible();
});

test('a canvas saved before schema v2 opens with the same cards, connectors and badges', async ({ dashboard: page }) => {
  const projectId = crypto.randomUUID();
  const ts = new Date().toISOString();
  // Stored the way the app saved canvases before v2: no schemaVersion, no
  // fields, provenance or relation types.
  const v1Card = (id: string, type: string, title: string, x: number) => ({
    id, type, title, body: '', position: { x, y: 200 }, collapsed: false, images: [], createdAt: ts, updatedAt: ts,
  });
  const v1 = {
    id: projectId, title: 'Before v2', updatedAt: ts,
    nodes: [
      v1Card(CONCLUSION, 'conclusion', 'Lead with annual', 80),
      v1Card(QUESTION, 'question', 'Keep a free tier?', 480),
      v1Card(FINDING, 'finding', 'Annual wins 3 to 1', 880),
    ],
    edges: [{
      id: EDGE, source: CONCLUSION, target: QUESTION, sourceSide: 'right', targetSide: 'left',
      sourcePinned: false, targetPinned: false,
    }],
  };
  const created = await page.request.post('/api/projects', { data: { id: projectId, title: v1.title, canvas: v1 } });
  expect(created.ok()).toBeTruthy();
  await page.evaluate((id) => localStorage.setItem('root-ui:active-project-id', id), projectId);
  await page.reload();

  await expect(page.locator('[data-testid^="node-card-"]')).toHaveCount(3, { timeout: 15_000 });
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(card(page, CONCLUSION).getByTestId('node-evidence-badge')).toHaveText('No evidence · Open question');
  await expect(card(page, FINDING).getByTestId('node-evidence-badge')).toHaveText('Not used');
  await expect(card(page, QUESTION).getByTestId('node-evidence-badge')).toHaveCount(0);
  await expect(card(page, CONCLUSION).getByTestId('node-title')).toHaveText('Lead with annual');

  // The stored canvas is now v2, with nothing inferred for the old items.
  const stored = (await (await page.request.get(`/api/projects/${projectId}`)).json()) as {
    canvas: { schemaVersion: number; nodes: Array<{ provenance: { origin: string } }>; edges: Array<{ relationType: string }> };
  };
  expect(stored.canvas.schemaVersion).toBe(2);
  expect(stored.canvas.nodes.map((n) => n.provenance.origin)).toEqual(['unrecorded', 'unrecorded', 'unrecorded']);
  expect(stored.canvas.edges.map((e) => e.relationType)).toEqual(['related-to']);
});

test('a research question with no objective is flagged until it addresses one', async ({ dashboard: page }) => {
  const OBJECTIVE = 'c0000000-0000-4000-8000-000000000011';
  const RQ = 'c0000000-0000-4000-8000-000000000012';
  const setCanvas = (edges: object[]) =>
    page.evaluate(
      ({ ids, edges }) => {
        const store = (window as unknown as {
          __ROOT_CANVAS_STORE__: { getState(): { canvas: object }; setState(p: object): void };
        }).__ROOT_CANVAS_STORE__;
        const ts = new Date().toISOString();
        const card = (id: string, type: string, title: string, x: number) => ({
          id, type, title, body: '', position: { x, y: 200 }, collapsed: false, images: [], createdAt: ts, updatedAt: ts,
          fields: {}, provenance: { origin: 'researcher', edited: false },
        });
        store.setState({
          canvas: {
            ...store.getState().canvas,
            nodes: [card(ids.objective, 'objective', 'Measure churn drivers', 80), card(ids.rq, 'research-question', 'What drives churn?', 480)],
            edges,
          },
          selection: { nodeId: null, edgeId: null },
          editor: { openNodeId: null },
        });
      },
      { ids: { objective: OBJECTIVE, rq: RQ }, edges },
    );

  await setCanvas([]);
  await expect(card(page, RQ).getByTestId('node-evidence-badge')).toHaveText('No objective');
  await expect(card(page, OBJECTIVE).getByTestId('node-evidence-badge')).toHaveText('No research question');
  const overview = page.getByTestId('evidence-overview');
  await expect(overview.getByTestId('evidence-group-rq-without-objective')).toContainText('What drives churn?');

  // Drawn from the objective to the question: the relation still reads "question addresses objective".
  await setCanvas([{
    id: 'c0000000-0000-4000-8000-0000000000e3', source: OBJECTIVE, target: RQ, sourceSide: 'right', targetSide: 'left',
    sourcePinned: false, targetPinned: false, relationType: 'addresses', provenance: { origin: 'researcher', edited: false },
  }]);
  await expect(page.getByTestId('node-evidence-badge')).toHaveCount(0);
  await expect(page.getByTestId('evidence-all-clear')).toBeVisible();
});
