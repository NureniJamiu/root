import type { Page } from '@playwright/test';

import { addIdea, expect, openDashboard, test, waitForSaved } from './fixtures';

/**
 * Project switching and the save pipeline, end to end against the real API
 * and SQLite database (AUDIT §1).
 */

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

interface ApiProject {
  id: string;
  title: string;
  nodeCount: number;
  canvas: { nodes: Array<{ title: string; images: Array<{ id: string; dataUrl: string }> }> };
}

async function listProjects(page: Page): Promise<Array<{ id: string; title: string }>> {
  const res = await page.request.get('/api/projects');
  return (await res.json()) as Array<{ id: string; title: string }>;
}

async function getProject(page: Page, id: string): Promise<ApiProject> {
  const res = await page.request.get(`/api/projects/${id}`);
  return (await res.json()) as ApiProject;
}

async function createRootTitled(page: Page, title: string): Promise<void> {
  await addIdea(page);
  await page.getByTestId('node-editor-title').fill(title);
  await page.keyboard.press('Escape');
}

test('switching projects keeps each canvas in its own project', async ({ dashboard: page }) => {
  await createRootTitled(page, 'Only in the first project');
  await waitForSaved(page);

  await page.getByTestId('btn-new-project').click();
  await expect(page.locator('[data-testid^="node-card-"]')).toHaveCount(0);
  await expect(page.getByTestId('empty-canvas-affordance')).toHaveCount(0);

  // Switch back and forth quickly, then check what the server holds.
  const projects = await listProjects(page);
  expect(projects).toHaveLength(2);
  const [first, second] = [...projects].sort((a, b) => a.title.localeCompare(b.title));
  await page.getByTestId(`project-item-${first!.id}`).click();
  await page.getByTestId(`project-item-${second!.id}`).click();
  await page.getByTestId(`project-item-${first!.id}`).click();
  await expect(page.locator('[data-testid="node-title"]')).toHaveText('Only in the first project');
  await waitForSaved(page);

  const a = await getProject(page, first!.id);
  const b = await getProject(page, second!.id);
  const titles = [a, b].map((p) => p.canvas.nodes.map((n) => n.title));
  expect(titles.flat()).toEqual(['Only in the first project']); // exactly one copy, nothing duplicated
  expect(titles.filter((t) => t.length > 0)).toHaveLength(1);
});

test('new projects get unused names, and a deleted project stays deleted', async ({ dashboard: page }) => {
  await page.getByTestId('btn-new-project').click();
  await page.getByTestId('btn-new-project').click();
  await expect.poll(async () => (await listProjects(page)).length).toBe(3);

  const names = (await listProjects(page)).map((p) => p.title);
  expect(new Set(names).size).toBe(3);

  const victim = (await listProjects(page)).find((p) => p.title === 'Project 2')!;
  await page.getByTestId(`project-item-${victim.id}`).hover();
  await page.getByTestId(`btn-delete-project-${victim.id}`).click();
  await page.getByTestId(`btn-confirm-delete-project-${victim.id}`).click();
  await expect(page.getByTestId(`project-item-${victim.id}`)).toHaveCount(0);

  await page.reload();
  await openDashboard(page);
  await expect(page.getByTestId(`project-item-${victim.id}`)).toHaveCount(0);

  await page.getByTestId('btn-new-project').click();
  await expect.poll(async () => (await listProjects(page)).map((p) => p.title)).toContain('Project 2');
});

test('images survive later edits and a reload without being re-uploaded', async ({ dashboard: page }) => {
  await createRootTitled(page, 'With a picture');
  await waitForSaved(page);

  await page.evaluate((dataUrl) => {
    const store = (window as unknown as { __ROOT_CANVAS_STORE__: { getState(): { canvas: { nodes: Array<{ id: string }> } } } })
      .__ROOT_CANVAS_STORE__;
    const actions = (window as unknown as { __ROOT_CANVAS_ACTIONS__: { addImage(id: string, image: unknown): void } })
      .__ROOT_CANVAS_ACTIONS__;
    const nodeId = store.getState().canvas.nodes[0]!.id;
    actions.addImage(nodeId, { id: crypto.randomUUID(), dataUrl, addedAt: new Date().toISOString() });
  }, PIXEL);
  await waitForSaved(page);

  // Edit something else: the image must not be sent again, and must not be lost.
  const bodies: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'PUT' && req.url().includes('/api/projects/')) bodies.push(req.postData() ?? '');
  });
  await page.locator('[data-testid^="node-card-"]').first().click();
  await page.getByLabel('Notes and details').fill('Edited after the image was saved');
  await waitForSaved(page);
  expect(bodies.length).toBeGreaterThan(0);
  expect(bodies.every((b) => !b.includes('iVBORw0KGgo'))).toBe(true);

  await page.reload();
  await openDashboard(page);
  const [project] = await listProjects(page);
  const saved = await getProject(page, project!.id);
  expect(saved.canvas.nodes[0]!.images).toHaveLength(1);
  expect(saved.canvas.nodes[0]!.images[0]!.dataUrl).toBe(PIXEL);
  await expect(page.locator('[data-testid^="node-card-"] img')).toHaveCount(1);
});

test('a failed save is shown as not saved, then recovers on its own', async ({ dashboard: page }) => {
  await createRootTitled(page, 'Before the outage');
  await waitForSaved(page);

  await page.route('**/api/projects/*', (route) =>
    route.request().method() === 'PUT' ? route.abort() : route.continue(),
  );
  await page.locator('[data-testid^="node-card-"]').first().click();
  await page.getByLabel('Idea title').fill('Typed during the outage');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'error', { timeout: 10_000 });
  await expect(page.getByTestId('toast').first()).toContainText(/Not saved/);

  await page.unroute('**/api/projects/*');
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });

  const [project] = await listProjects(page);
  expect((await getProject(page, project!.id)).canvas.nodes[0]!.title).toBe('Typed during the outage');
});

test('closing the page right after an edit does not lose it', async ({ dashboard: page }) => {
  await createRootTitled(page, 'Seed');
  await waitForSaved(page);
  await page.locator('[data-testid^="node-card-"]').first().click();
  await page.getByLabel('Idea title').fill('Last words');

  // Navigate away before the debounce could possibly have fired.
  await page.goto('/');
  const [project] = await listProjects(page);
  await expect
    .poll(async () => (await getProject(page, project!.id)).canvas.nodes[0]!.title, { timeout: 5000 })
    .toBe('Last words');
});
