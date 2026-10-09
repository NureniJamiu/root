import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

interface StoredEdge {
  id: string;
  source: string;
  target: string;
  sourceSide: string;
  targetSide: string;
  sourcePinned: boolean;
  targetPinned: boolean;
}

interface StoredNode {
  id: string;
  position: { x: number; y: number };
}

interface CanvasStoreHandle {
  getState(): {
    canvas: { nodes: StoredNode[]; edges: StoredEdge[] };
    selection: { nodeId: string | null; edgeId: string | null };
  };
  setState(partial: Record<string, unknown>): void;
}

declare global {
  interface Window {
    __ROOT_CANVAS_STORE__: CanvasStoreHandle;
    __ROOT_CANVAS_ACTIONS__: { undo(): void };
    __ROOT_INITIALIZED__?: boolean;
  }
}

export const NODE_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const NODE_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const NODE_C_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EDGE_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

type EdgeSeed = Partial<Omit<StoredEdge, 'id'>> & { source?: string; target?: string };

interface SetupOptions {
  posA?: { x: number; y: number };
  posB?: { x: number; y: number };
  posC?: { x: number; y: number } | null;
  /** Connect A to B with these ends. */
  edge?: EdgeSeed | null;
}

/** Put two (or three) cards, and optionally a connector from A to B, on the canvas. */
async function setup(page: Page, options: SetupOptions = {}): Promise<void> {
  const { posA = { x: 80, y: 200 }, posB = { x: 480, y: 200 }, posC = null, edge = null } = options;
  await page.evaluate(
    ({ posA, posB, posC, edge, ids }) => {
      const store = window.__ROOT_CANVAS_STORE__;
      const current = store.getState().canvas;
      const ts = new Date().toISOString();
      const card = (id: string, type: string, title: string, position: { x: number; y: number }) => ({
        id, type, title, body: `${title} notes.`, position, collapsed: false, images: [], createdAt: ts, updatedAt: ts,
      });
      const nodes = [
        card(ids.a, 'topic', 'Node Alpha', posA),
        card(ids.b, 'finding', 'Node Beta', posB),
        ...(posC ? [card(ids.c, 'question', 'Node Gamma', posC)] : []),
      ];
      const edges = edge
        ? [{
            id: ids.edge, source: ids.a, target: ids.b, sourceSide: 'right', targetSide: 'left',
            sourcePinned: false, targetPinned: false, ...edge,
          }]
        : [];
      store.setState({
        canvas: { ...current, nodes, edges },
        selection: { nodeId: null, edgeId: null },
        editor: { openNodeId: null },
      });
    },
    { posA, posB, posC, edge, ids: { a: NODE_A_ID, b: NODE_B_ID, c: NODE_C_ID, edge: EDGE_ID } },
  );
  await expect(page.locator(`[data-testid="node-card-${NODE_A_ID}"]`)).toBeVisible();
  // Let the viewport settle (the app fits the view shortly after a project opens),
  // then work at 100% so screen pixels and canvas units agree.
  await page.waitForTimeout(600);
  await page.getByTestId('zoom-percent').click();
  await page.waitForTimeout(400);
}

const card = (page: Page, id: string) => page.locator(`[data-testid="node-card-${id}"]`);

async function edges(page: Page): Promise<StoredEdge[]> {
  return page.evaluate(() => window.__ROOT_CANVAS_STORE__.getState().canvas.edges);
}

async function nodePosition(page: Page, id: string): Promise<{ x: number; y: number }> {
  return page.evaluate((nodeId) => {
    return window.__ROOT_CANVAS_STORE__.getState().canvas.nodes.find((n) => n.id === nodeId)!.position;
  }, id);
}

async function centerOf(locator: ReturnType<Page['locator']>): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** The handle dot that starts a connector on `side` of card `id` (also a valid drop target). */
const sourceHandle = (page: Page, id: string, side: string) =>
  card(page, id).locator(`[data-testid="handle-source-${side}"]`);

/** Drag from a point to a point with the pointer, in a number of steps. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  steps = 12,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

/** Drag a new connector out of a handle on `fromSide` of A onto the handle on `toSide` of `toId`. */
async function connectHandles(page: Page, fromId: string, fromSide: string, toId: string, toSide: string): Promise<void> {
  await card(page, fromId).hover();
  const from = await centerOf(sourceHandle(page, fromId, fromSide));
  await card(page, toId).hover();
  const to = await centerOf(sourceHandle(page, toId, toSide));
  await drag(page, from, to);
}

/** Select a connector by clicking its curve; a selected connector sits above the cards so its ends can be grabbed. */
async function selectConnector(page: Page, edgeId: string): Promise<void> {
  const mid = await edgeMidpoint(page, edgeId);
  await page.mouse.click(mid.x, mid.y);
  await expect(page.locator(`[data-testid="connector-${edgeId}"]`)).toHaveAttribute('data-selected', 'true');
}

/** A point on the middle of a connector's curve, in screen coordinates. */
async function edgeMidpoint(page: Page, edgeId: string): Promise<{ x: number; y: number }> {
  return page.evaluate((id) => {
    const path = document.querySelector<SVGPathElement>(`[data-testid="connector-${id}"] .react-flow__edge-path`)!;
    const p = path.getPointAtLength(path.getTotalLength() / 2);
    const m = path.getScreenCTM()!;
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  }, edgeId);
}

test.describe.configure({ mode: 'serial' });

test.describe('E2E: canvas connectors', () => {
  test('1. Drag from A\'s right dot to B\'s left dot: exactly one connector, on those sides', async ({ dashboard: page }) => {
    await setup(page);
    await connectHandles(page, NODE_A_ID, 'right', NODE_B_ID, 'left');

    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    const [edge] = await edges(page);
    expect(edge).toMatchObject({
      source: NODE_A_ID, target: NODE_B_ID, sourceSide: 'right', targetSide: 'left', sourcePinned: true, targetPinned: true,
    });
  });

  test('2. A connector can leave any side and arrive at any side of another card', async ({ dashboard: page }) => {
    const pairs = [
      ['top', 'bottom'], ['bottom', 'top'], ['left', 'right'], ['right', 'right'], ['top', 'top'], ['left', 'left'],
    ] as const;
    for (const [fromSide, toSide] of pairs) {
      await setup(page, { posA: { x: 80, y: 260 }, posB: { x: 520, y: 260 } });
      await connectHandles(page, NODE_A_ID, fromSide, NODE_B_ID, toSide);
      const stored = await edges(page);
      expect(stored, `${fromSide} -> ${toSide}`).toHaveLength(1);
      expect(stored[0]).toMatchObject({ source: NODE_A_ID, target: NODE_B_ID, sourceSide: fromSide, targetSide: toSide });
    }
  });

  test('3. A card can have several connectors: to different cards, to the same card on another side, and back', async ({ dashboard: page }) => {
    await setup(page, { posA: { x: 80, y: 200 }, posB: { x: 520, y: 80 }, posC: { x: 520, y: 480 } });

    await connectHandles(page, NODE_A_ID, 'right', NODE_B_ID, 'left');
    await connectHandles(page, NODE_A_ID, 'right', NODE_C_ID, 'left'); // A has two connectors on the same side
    await connectHandles(page, NODE_A_ID, 'top', NODE_B_ID, 'top'); // second connector between A and B
    await connectHandles(page, NODE_B_ID, 'bottom', NODE_A_ID, 'bottom'); // and one back the other way

    await expect(page.locator('.react-flow__edge')).toHaveCount(4);
    const stored = await edges(page);
    expect(stored).toHaveLength(4);
    expect(stored.filter((e) => e.source === NODE_A_ID)).toHaveLength(3);
    expect(stored.filter((e) => e.target === NODE_A_ID)).toHaveLength(1);
  });

  test('4. Repeating a connector that already exists adds nothing', async ({ dashboard: page }) => {
    await setup(page);
    await connectHandles(page, NODE_A_ID, 'right', NODE_B_ID, 'left');
    await connectHandles(page, NODE_A_ID, 'right', NODE_B_ID, 'left');
    expect(await edges(page)).toHaveLength(1);
  });

  test('5. Dropping a connector on a card body attaches it to the nearest side', async ({ dashboard: page }) => {
    await setup(page);
    await card(page, NODE_A_ID).hover();
    const from = await centerOf(sourceHandle(page, NODE_A_ID, 'right'));
    const box = (await card(page, NODE_B_ID).boundingBox())!;

    // Near B's bottom edge, away from its dot.
    await drag(page, from, { x: box.x + box.width * 0.3, y: box.y + box.height - 6 });

    const [edge] = await edges(page);
    expect(edge).toMatchObject({ source: NODE_A_ID, target: NODE_B_ID, sourceSide: 'right', targetSide: 'bottom', targetPinned: true });
  });

  test('6. While dragging, the side a drop on the card body would use lights up', async ({ dashboard: page }) => {
    await setup(page);
    await card(page, NODE_A_ID).hover();
    const from = await centerOf(sourceHandle(page, NODE_A_ID, 'right'));
    const box = (await card(page, NODE_B_ID).boundingBox())!;

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + 8, box.y + box.height / 2, { steps: 10 });

    await expect(page.locator(`.react-flow__node[data-id="${NODE_B_ID}"]`)).toHaveAttribute('data-drop-side', 'left');
    await page.mouse.up();
    await expect(page.locator(`.react-flow__node[data-id="${NODE_B_ID}"]`)).not.toHaveAttribute('data-drop-side', /.+/);
  });

  test('7. Move a connector end to another side of the same card; it stays pinned there', async ({ dashboard: page }) => {
    await setup(page, { edge: {} });
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    await selectConnector(page, EDGE_ID);

    const updater = await centerOf(page.locator('.react-flow__edgeupdater-target').first());
    const topDot = await centerOf(sourceHandle(page, NODE_B_ID, 'top'));
    await drag(page, updater, topDot);

    let [edge] = await edges(page);
    expect(edge).toMatchObject({ target: NODE_B_ID, targetSide: 'top', targetPinned: true, sourcePinned: false });

    // Other interactions do not disturb it.
    await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } });
    await card(page, NODE_A_ID).click();
    [edge] = await edges(page);
    expect(edge).toMatchObject({ targetSide: 'top', targetPinned: true });
  });

  test('8. Move a connector end to a different card', async ({ dashboard: page }) => {
    await setup(page, { posA: { x: 80, y: 200 }, posB: { x: 520, y: 60 }, posC: { x: 520, y: 480 }, edge: {} });

    await selectConnector(page, EDGE_ID);
    const updater = await centerOf(page.locator('.react-flow__edgeupdater-target').first());
    await drag(page, updater, await centerOf(sourceHandle(page, NODE_C_ID, 'left')));

    const stored = await edges(page);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: EDGE_ID, source: NODE_A_ID, target: NODE_C_ID, targetSide: 'left' });
  });

  test('9. Drop a connector end on empty canvas: it goes back to where it was', async ({ dashboard: page }) => {
    await setup(page, { edge: {} });
    await selectConnector(page, EDGE_ID);
    const updater = await centerOf(page.locator('.react-flow__edgeupdater-target').first());

    await drag(page, updater, { x: 700, y: 760 });

    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    const [edge] = await edges(page);
    expect(edge).toMatchObject({ source: NODE_A_ID, target: NODE_B_ID, targetSide: 'left' });
  });

  test('10. A dragged connector that is dropped on empty canvas adds nothing', async ({ dashboard: page }) => {
    await setup(page);
    await card(page, NODE_A_ID).hover();
    const from = await centerOf(sourceHandle(page, NODE_A_ID, 'bottom'));
    await drag(page, from, { x: 700, y: 760 });
    expect(await edges(page)).toHaveLength(0);
    await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  });

  test('11. Click a connector to select it; Delete removes it and undo brings it back', async ({ dashboard: page }) => {
    await setup(page, { edge: {} });
    const mid = await edgeMidpoint(page, EDGE_ID);

    await page.mouse.click(mid.x, mid.y);
    await expect(page.locator(`[data-testid="connector-${EDGE_ID}"]`)).toHaveAttribute('data-selected', 'true');
    expect(await page.evaluate(() => window.__ROOT_CANVAS_STORE__.getState().selection)).toEqual({ nodeId: null, edgeId: EDGE_ID });
    await expect(page.getByTestId('connector-panel')).toBeVisible();

    await page.keyboard.press('Delete');
    await expect(page.locator('.react-flow__edge')).toHaveCount(0);
    expect(await edges(page)).toHaveLength(0);
    await expect(card(page, NODE_A_ID)).toBeVisible();
    await expect(card(page, NODE_B_ID)).toBeVisible();

    await page.keyboard.press('Control+z');
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  });

  test('12. Hover a connector to reveal its remove button', async ({ dashboard: page }) => {
    await setup(page, { edge: {} });
    const remove = page.getByTestId(`connector-remove-${EDGE_ID}`);
    await expect(remove).toHaveCount(0);

    const mid = await edgeMidpoint(page, EDGE_ID);
    await page.mouse.move(mid.x, mid.y);
    await expect(remove).toBeVisible();

    await remove.click();
    await expect(page.locator('.react-flow__edge')).toHaveCount(0);
    expect(await edges(page)).toHaveLength(0);
  });

  test('13. A connector can be removed from the inspector too', async ({ dashboard: page }) => {
    await setup(page, { edge: {} });
    await card(page, NODE_A_ID).click();
    await expect(page.getByTestId(`connection-row-${EDGE_ID}`)).toBeVisible();
    await page.getByTestId(`connection-remove-${EDGE_ID}`).click();
    expect(await edges(page)).toHaveLength(0);
  });

  test('14. Escape clears the selection; clicking empty canvas deselects a connector', async ({ dashboard: page }) => {
    await setup(page, { edge: {} });
    const mid = await edgeMidpoint(page, EDGE_ID);
    await page.mouse.click(mid.x, mid.y);
    await page.keyboard.press('Escape');
    expect((await page.evaluate(() => window.__ROOT_CANVAS_STORE__.getState().selection)).edgeId).toBeNull();

    await page.mouse.click(mid.x, mid.y);
    await page.locator('.react-flow__pane').click({ position: { x: 40, y: 700 } });
    expect((await page.evaluate(() => window.__ROOT_CANVAS_STORE__.getState().selection)).edgeId).toBeNull();
    expect(await edges(page)).toHaveLength(1);
  });

  test('15. Deleting a card removes the connectors attached to it', async ({ dashboard: page }) => {
    await setup(page, { posC: { x: 520, y: 480 }, edge: {} });
    await card(page, NODE_C_ID).click();
    await page.keyboard.press('Delete'); // nothing hangs from C: no prompt
    await expect(card(page, NODE_C_ID)).toHaveCount(0);
    expect(await edges(page)).toHaveLength(1);

    await card(page, NODE_A_ID).click();
    await page.keyboard.press('Delete');
    await page.getByTestId('btn-delete-node-only').click();
    await expect(card(page, NODE_A_ID)).toHaveCount(0);
    expect(await edges(page)).toHaveLength(0);
    await expect(card(page, NODE_B_ID)).toBeVisible();
  });
});

test.describe('E2E: moving cards', () => {
  test('16. Any part of a card drags it, and the card follows the pointer while the button is held', async ({ dashboard: page }) => {
    await setup(page, { edge: {} });
    const before = (await card(page, NODE_B_ID).boundingBox())!;
    const storeBefore = await nodePosition(page, NODE_B_ID);

    // Grab the card by its body text, not its top bar.
    const grab = { x: before.x + 60, y: before.y + before.height / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 120, grab.y + 140, { steps: 8 });

    // Mid-drag: the card has already moved on screen, the store still holds the old position.
    const during = (await card(page, NODE_B_ID).boundingBox())!;
    expect(Math.round(during.x - before.x)).toBe(120);
    expect(Math.round(during.y - before.y)).toBe(140);
    expect(await nodePosition(page, NODE_B_ID)).toEqual(storeBefore);

    await page.mouse.up();
    const after = await nodePosition(page, NODE_B_ID);
    expect(after.x - storeBefore.x).toBe(120);
    expect(after.y - storeBefore.y).toBe(140);
  });

  test('17. Dragging is free (no 20px grid steps); holding Shift snaps to the grid', async ({ dashboard: page }) => {
    await setup(page, { posA: { x: 80, y: 200 }, posB: { x: 520, y: 200 } });
    const box = (await card(page, NODE_A_ID).boundingBox())!;
    const grab = { x: box.x + 60, y: box.y + box.height / 2 };

    await drag(page, grab, { x: grab.x + 13, y: grab.y + 7 }, 6);
    const free = await nodePosition(page, NODE_A_ID);
    expect(free).toEqual({ x: 93, y: 207 });

    const box2 = (await card(page, NODE_A_ID).boundingBox())!;
    const grab2 = { x: box2.x + 60, y: box2.y + box2.height / 2 };
    await page.keyboard.down('Shift');
    await drag(page, grab2, { x: grab2.x + 13, y: grab2.y + 7 }, 6);
    await page.keyboard.up('Shift');
    const snapped = await nodePosition(page, NODE_A_ID);
    expect(snapped.x % 20).toBe(0);
    expect(snapped.y % 20).toBe(0);
  });

  test('18. Connectors follow a card as it is dragged', async ({ dashboard: page }) => {
    await setup(page, { posA: { x: 80, y: 120 }, posB: { x: 480, y: 120 }, edge: { sourcePinned: true, targetPinned: true } });
    const pathBefore = await page.locator('.react-flow__edge-path').first().getAttribute('d');
    const box = (await card(page, NODE_B_ID).boundingBox())!;

    await page.mouse.move(box.x + 60, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 60, box.y + box.height / 2 + 200, { steps: 8 });

    expect(await page.locator('.react-flow__edge-path').first().getAttribute('d')).not.toBe(pathBefore);
    await page.mouse.up();
  });

  test('19. Click a card: the inspector shows its data, and clicking does not move it', async ({ dashboard: page }) => {
    await setup(page, { edge: {} });
    const posBefore = await nodePosition(page, NODE_B_ID);
    await card(page, NODE_B_ID).click();

    await expect(page.getByTestId('node-inspector-rail')).toBeVisible();
    await expect(page.locator('input[placeholder="Give this idea a clear, simple title..."]')).toHaveValue('Node Beta');
    await expect(page.getByTestId('node-inspector-connections')).toBeVisible();
    expect(await nodePosition(page, NODE_B_ID)).toEqual(posBefore);
  });

  test('20. Dragging a card so it ends up below another re-routes its automatic connector bottom -> top', async ({ dashboard: page }) => {
    await setup(page, { posA: { x: 80, y: 120 }, posB: { x: 480, y: 120 }, edge: {} });
    const boxA = (await card(page, NODE_A_ID).boundingBox())!;
    const boxB = (await card(page, NODE_B_ID).boundingBox())!;

    await drag(
      page,
      { x: boxB.x + 40, y: boxB.y + 40 },
      { x: boxA.x + 40, y: boxA.y + boxA.height + 190 },
      15,
    );

    const [edge] = await edges(page);
    expect((await nodePosition(page, NODE_B_ID)).y).toBeGreaterThan(300);
    expect(edge).toMatchObject({ sourceSide: 'bottom', targetSide: 'top', sourcePinned: false, targetPinned: false });
  });

  test('21. A side the user pinned does not change when the card moves', async ({ dashboard: page }) => {
    await setup(page, {
      posA: { x: 80, y: 120 }, posB: { x: 480, y: 120 },
      edge: { sourceSide: 'right', targetSide: 'top', targetPinned: true },
    });
    const boxA = (await card(page, NODE_A_ID).boundingBox())!;
    const boxB = (await card(page, NODE_B_ID).boundingBox())!;

    await drag(page, { x: boxB.x + 40, y: boxB.y + 40 }, { x: boxA.x + 40, y: boxA.y + boxA.height + 190 }, 15);

    const [edge] = await edges(page);
    expect(edge).toMatchObject({ targetSide: 'top', targetPinned: true, sourceSide: 'bottom', sourcePinned: false });
  });

  test('22. Double-clicking a connector hands it back to automatic routing', async ({ dashboard: page }) => {
    await setup(page, {
      edge: { sourceSide: 'top', targetSide: 'bottom', sourcePinned: true, targetPinned: true },
    });
    const mid = await edgeMidpoint(page, EDGE_ID);

    await page.mouse.dblclick(mid.x, mid.y);

    const [edge] = await edges(page);
    expect(edge).toMatchObject({ sourceSide: 'right', targetSide: 'left', sourcePinned: false, targetPinned: false });
  });

  test('23. Tidy layout leaves no overlap and keeps every connector', async ({ dashboard: page }) => {
    await setup(page, { posA: { x: 80, y: 150 }, posB: { x: 100, y: 160 }, posC: { x: 90, y: 155 }, edge: {} });
    await page.getByTestId('btn-auto-layout').click();
    await page.waitForTimeout(300);

    const { nodes, edgeCount } = await page.evaluate(() => {
      const c = window.__ROOT_CANVAS_STORE__.getState().canvas;
      return { nodes: c.nodes, edgeCount: c.edges.length };
    });
    expect(edgeCount).toBe(1);
    const a = nodes.find((n) => n.id === NODE_A_ID)!.position;
    const b = nodes.find((n) => n.id === NODE_B_ID)!.position;
    expect(b.y).toBeGreaterThanOrEqual(a.y + 120);
    const [edge] = await edges(page);
    expect(edge).toMatchObject({ sourceSide: 'bottom', targetSide: 'top' });
    const spots = new Set(nodes.map((n) => `${n.position.x},${n.position.y}`));
    expect(spots.size).toBe(nodes.length);
  });
});

test.describe('E2E: empty canvas and new ideas', () => {
  test('24. A new project is an empty canvas: no card, no prompt, visible dot background', async ({ dashboard: page }) => {
    await expect(page.locator('[data-testid^="node-card-"]')).toHaveCount(0);
    await expect(page.getByTestId('empty-canvas-affordance')).toHaveCount(0);
    await expect(page.getByText('What are you planning today?')).toHaveCount(0);
    await expect(page.getByTestId('node-editor')).toHaveCount(0);

    // Two layers of dots, both drawn clearly enough to see.
    const dots = await page.evaluate(() =>
      Array.from(document.querySelectorAll<SVGCircleElement>('.react-flow__background pattern circle')).map((c) => ({
        r: Number(c.getAttribute('r')),
        fill: c.getAttribute('fill'),
      })),
    );
    expect(dots.length).toBe(2);
    expect(Math.max(...dots.map((d) => d.r))).toBeGreaterThanOrEqual(1.2);
  });

  test('25. Double-click empty canvas adds an idea there and opens its editor', async ({ dashboard: page }) => {
    const pane = page.locator('.react-flow__pane');
    const box = (await pane.boundingBox())!;
    await page.mouse.dblclick(box.x + 500, box.y + 300);

    await expect(page.locator('[data-testid^="node-card-"]')).toHaveCount(1);
    await expect(page.getByTestId('node-editor')).toBeVisible();
    const cardBox = (await page.locator('[data-testid^="node-card-"]').first().boundingBox())!;
    // Centred on the click, within a snap or two.
    expect(Math.abs(cardBox.x + cardBox.width / 2 - (box.x + 500))).toBeLessThan(40);
    expect(Math.abs(cardBox.y + cardBox.height / 2 - (box.y + 300))).toBeLessThan(120);
    expect(await edges(page)).toHaveLength(0);
  });

  test('26. Ideas can be added anywhere, unconnected, as many as wanted', async ({ dashboard: page }) => {
    const pane = page.locator('.react-flow__pane');
    const box = (await pane.boundingBox())!;
    for (const [x, y] of [[250, 200], [650, 220], [450, 520]]) {
      await page.mouse.dblclick(box.x + x, box.y + y);
      // Save from the keyboard straight away, before the view refits around the first idea.
      await page.keyboard.press('Control+Enter');
    }
    await expect(page.locator('[data-testid^="node-card-"]')).toHaveCount(3);
    expect(await edges(page)).toHaveLength(0);
  });
});

test.describe('E2E: projects saved before connectors were first-class', () => {
  test('27. A canvas saved with parentId opens with its cards connected', async ({ dashboard: page }) => {
    const list = await (await page.request.get('/api/projects')).json() as Array<{ id: string }>;
    const projectId = list[0]!.id;
    const ts = new Date().toISOString();
    const node = (id: string, title: string, parentId: string | null, x: number) => ({
      id, parentId, title, body: '', images: [], type: 'topic', position: { x, y: 200 }, collapsed: false, createdAt: ts, updatedAt: ts,
    });
    const legacy = {
      id: projectId, title: 'Old project', updatedAt: ts,
      nodes: [node(NODE_A_ID, 'Old root', null, 80), node(NODE_B_ID, 'Old child', NODE_A_ID, 480)],
    };
    const put = await page.request.put(`/api/projects/${projectId}`, { data: { title: 'Old project', canvas: legacy } });
    expect(put.ok()).toBeTruthy();

    await page.reload();
    await expect(page.locator('[data-testid^="node-card-"]')).toHaveCount(2, { timeout: 15_000 });
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);
    const [edge] = await edges(page);
    expect(edge).toMatchObject({ source: NODE_A_ID, target: NODE_B_ID, sourceSide: 'right', targetSide: 'left' });
  });
});
