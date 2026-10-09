import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

interface StoredNode {
  id: string;
  parentId: string | null;
  sourceSide?: string;
  targetSide?: string;
  sourcePinned?: boolean;
  targetPinned?: boolean;
  position: { x: number; y: number };
}

interface CanvasStoreHandle {
  getState(): {
    canvas: { nodes: StoredNode[] };
    selection: { nodeId: string | null };
  };
  setState(partial: Record<string, unknown>): void;
}


declare global {
  interface Window {
    __ROOT_CANVAS_STORE__: CanvasStoreHandle;
    __ROOT_INITIALIZED__?: boolean;
  }
}

export const NODE_A_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const NODE_B_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function setupTwoNodes(
  page: Page,
  posA = { x: 80, y: 200 },
  posB = { x: 420, y: 200 },
  connected = false,
  connectionSides?: { sourceSide?: string; targetSide?: string; sourcePinned?: boolean; targetPinned?: boolean }
) {
  await page.evaluate(
    ({ posA, posB, connected, connectionSides, NODE_A_ID, NODE_B_ID }) => {
      const store = window.__ROOT_CANVAS_STORE__;
      const current = store.getState().canvas;
      const ts = new Date().toISOString();
      const nodeA = {
        id: NODE_A_ID,
        type: 'topic',
        title: 'Node Alpha',
        body: 'Alpha notes and thoughts for research.',
        position: posA,
        parentId: null,
        collapsed: false,
        images: [],
        createdAt: ts,
        updatedAt: ts,
      };
      const nodeB = {
        id: NODE_B_ID,
        type: 'finding',
        title: 'Node Beta',
        body: 'Beta key takeaways and points.',
        position: posB,
        parentId: connected ? NODE_A_ID : null,
        sourceSide: connectionSides?.sourceSide,
        targetSide: connectionSides?.targetSide,
        sourcePinned: connectionSides?.sourcePinned ?? false,
        targetPinned: connectionSides?.targetPinned ?? false,
        collapsed: false,
        images: [],
        createdAt: ts,
        updatedAt: ts,
      };

      store.setState({
        canvas: {
          ...current,
          nodes: [nodeA, nodeB],
        },
        selection: { nodeId: null },
        editor: { openNodeId: null },
      });
    },
    { posA, posB, connected, connectionSides, NODE_A_ID, NODE_B_ID }
  );
  await page.waitForTimeout(200);
}

test.describe.configure({ mode: 'serial' });

test.describe('E2E: Node Canvas Connectors and Interactions', () => {

  test('1. Connect A\'s right side to B\'s left side. Exactly one line exists, attached to those sides.', async ({ dashboard: page }) => {
    await setupTwoNodes(page, { x: 80, y: 200 }, { x: 420, y: 200 }, false);

    const cardA = page.locator(`[data-testid="node-card-${NODE_A_ID}"]`);
    const cardB = page.locator(`[data-testid="node-card-${NODE_B_ID}"]`);
    await expect(cardA).toBeVisible();
    await expect(cardB).toBeVisible();

    // Select card A to ensure handles are visible
    await cardA.click();
    const handleSourceRight = cardA.locator('[data-testid="handle-source-right"]');
    const handleTargetLeft = cardB.locator('[data-testid="handle-target-left"]');

    const boxA = await handleSourceRight.boundingBox();
    const boxB = await handleTargetLeft.boundingBox();
    expect(boxA).not.toBeNull();
    expect(boxB).not.toBeNull();

    // Drag from A right handle to B left handle
    await page.mouse.move(boxA!.x + boxA!.width / 2, boxA!.y + boxA!.height / 2);
    await page.mouse.down();
    await page.mouse.move(boxB!.x + boxB!.width / 2, boxB!.y + boxB!.height / 2, { steps: 10 });
    await page.mouse.up();

    // Assert exactly one line exists in DOM
    const edges = page.locator('.react-flow__edge');
    await expect(edges).toHaveCount(1);

    // Verify attached sides in store
    const childNode = await page.evaluate(({ NODE_B_ID }) => {
      const store = window.__ROOT_CANVAS_STORE__;
      return store.getState().canvas.nodes.find((n: StoredNode) => n.id === NODE_B_ID);
    }, { NODE_B_ID });

    expect(childNode!.parentId).toBe(NODE_A_ID);
    expect(childNode!.sourceSide ?? 'right').toBe('right');
    expect(childNode!.targetSide ?? 'left').toBe('left');
  });

  test('2. Move that line\'s end to B\'s top side. It is now attached to the top and still there after other interactions.', async ({ dashboard: page }) => {
    await setupTwoNodes(page, { x: 80, y: 200 }, { x: 420, y: 200 }, true, {
      sourceSide: 'right',
      targetSide: 'left',
    });

    const edge = page.locator('.react-flow__edge').first();
    await expect(edge).toBeAttached();

    const targetUpdater = page.locator('.react-flow__edgeupdater-target').first();
    await expect(targetUpdater).toBeAttached();

    const targetTopHandle = page.locator(`[data-testid="node-card-${NODE_B_ID}"] [data-testid="handle-target-top"]`);
    const boxHandle = await targetTopHandle.boundingBox();
    const boxUpdater = await targetUpdater.boundingBox();

    expect(boxUpdater).not.toBeNull();
    expect(boxHandle).not.toBeNull();

    // Drag edge updater to B's top handle
    await page.mouse.move(boxUpdater!.x + boxUpdater!.width / 2, boxUpdater!.y + boxUpdater!.height / 2);
    await page.mouse.down();
    await page.mouse.move(boxHandle!.x + boxHandle!.width / 2, boxHandle!.y + boxHandle!.height / 2, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(300);

    // Assert it is now attached to top and pinned
    const childAfterMove = await page.evaluate(({ NODE_B_ID }) => {
      const store = window.__ROOT_CANVAS_STORE__;
      return store.getState().canvas.nodes.find((n: StoredNode) => n.id === NODE_B_ID);
    }, { NODE_B_ID });
    expect(childAfterMove!.targetSide).toBe('top');
    expect(childAfterMove!.targetPinned).toBe(true);

    // Perform another interaction: click empty canvas pane and select node A
    await page.locator('.react-flow__pane').click({ position: { x: 50, y: 50 } });
    await page.locator(`[data-testid="node-card-${NODE_A_ID}"]`).click();

    // Assert it is still attached to the top
    const childAfterOtherInteractions = await page.evaluate(({ NODE_B_ID }) => {
      const store = window.__ROOT_CANVAS_STORE__;
      return store.getState().canvas.nodes.find((n: StoredNode) => n.id === NODE_B_ID);
    }, { NODE_B_ID });
    expect(childAfterOtherInteractions!.targetSide).toBe('top');
    expect(childAfterOtherInteractions!.targetPinned).toBe(true);
  });

  test('3. Drop the line\'s end on empty canvas. It returns to its previous side.', async ({ dashboard: page }) => {
    await setupTwoNodes(page, { x: 80, y: 200 }, { x: 420, y: 200 }, true, {
      sourceSide: 'right',
      targetSide: 'left',
    });

    const edge = page.locator('.react-flow__edge').first();
    await expect(edge).toBeAttached();

    const targetUpdater = page.locator('.react-flow__edgeupdater-target').first();
    await expect(targetUpdater).toBeAttached();

    const boxUpdater = await targetUpdater.boundingBox();
    expect(boxUpdater).not.toBeNull();

    // Drag to empty canvas at (250, 120) and drop
    await page.mouse.move(boxUpdater!.x + boxUpdater!.width / 2, boxUpdater!.y + boxUpdater!.height / 2);
    await page.mouse.down();
    await page.mouse.move(250, 120, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(200);

    // Line is not lost and stays attached to previous side
    const edges = page.locator('.react-flow__edge');
    await expect(edges).toHaveCount(1);

    const childNode = await page.evaluate(({ NODE_B_ID }) => {
      const store = window.__ROOT_CANVAS_STORE__;
      return store.getState().canvas.nodes.find((n: StoredNode) => n.id === NODE_B_ID);
    }, { NODE_B_ID });
    expect(childNode!.parentId).toBe(NODE_A_ID);
    expect(childNode!.targetSide ?? 'left').toBe('left');
  });

  test('4. Click a node. The details panel shows that node\'s data and inner click/typing does not drag.', async ({ dashboard: page }) => {
    await setupTwoNodes(page, { x: 80, y: 200 }, { x: 420, y: 200 }, true);

    const cardB = page.locator(`[data-testid="node-card-${NODE_B_ID}"]`);
    await cardB.click();

    // Details panel (Inspector Rail) opens
    const inspector = page.locator('[data-testid="node-inspector-rail"]');
    await expect(inspector).toBeVisible();

    // Shows node data: title, body, connections
    await expect(page.locator('input[placeholder="Give this idea a clear, simple title..."]')).toHaveValue('Node Beta');
    await expect(page.locator('textarea[placeholder*="script notes"]')).toHaveValue('Beta key takeaways and points.');
    await expect(page.locator('[data-testid="node-inspector-connections"]')).toBeVisible();

    // Verify typing or clicking inside the inner body (.nodrag) does NOT drag node
    const posBefore = await cardB.boundingBox();

    // Drag from inside the inner body
    await page.mouse.move(posBefore!.x + 50, posBefore!.y + 50);
    await page.mouse.down();
    await page.mouse.move(posBefore!.x + 150, posBefore!.y + 150, { steps: 5 });
    await page.mouse.up();

    const posAfter = await cardB.boundingBox();
    // Bounding box should be identical because inner element has nodrag class
    expect(Math.round(posAfter!.x)).toBe(Math.round(posBefore!.x));
    expect(Math.round(posAfter!.y)).toBe(Math.round(posBefore!.y));
  });

  test('5. Run auto-layout. Nothing overlaps and all connections remain.', async ({ dashboard: page }) => {
    // Put nodes overlapping initially
    await setupTwoNodes(page, { x: 80, y: 150 }, { x: 100, y: 160 }, true);

    // Trigger auto layout via button
    const autoLayoutBtn = page.locator('[data-testid="btn-auto-layout"]');
    await expect(autoLayoutBtn).toBeVisible();
    await autoLayoutBtn.click();

    await page.waitForTimeout(300);

    const { nodes, edgeCount } = await page.evaluate(() => {
      const store = window.__ROOT_CANVAS_STORE__;
      const c = store.getState().canvas;
      return {
        nodes: c.nodes,
        edgeCount: c.nodes.filter((n: StoredNode) => n.parentId !== null).length,
      };
    });

    // Connection remains
    expect(edgeCount).toBe(1);
    expect(nodes[1].parentId).toBe(NODE_A_ID);

    // Nothing overlaps: in top-to-bottom tree, child y is well below parent y
    const posA = nodes[0].position;
    const posB = nodes[1].position;
    expect(posB.y).toBeGreaterThanOrEqual(posA.y + 120);

    // Connector attaches from bottom to top
    expect(nodes[1].sourceSide).toBe('bottom');
    expect(nodes[1].targetSide).toBe('top');
  });

  test('6. Connect A and B with B to the right of A. Drag B to below A. Connector leaves A bottom and enters B top.', async ({ dashboard: page }) => {
    await setupTwoNodes(page, { x: 80, y: 120 }, { x: 420, y: 120 }, true, {
      sourceSide: 'right',
      targetSide: 'left',
    });

    const cardA = page.locator(`[data-testid="node-card-${NODE_A_ID}"]`);
    const cardB = page.locator(`[data-testid="node-card-${NODE_B_ID}"]`);
    const boxA = await cardA.boundingBox();
    const boxB = await cardB.boundingBox();
    expect(boxA).not.toBeNull();
    expect(boxB).not.toBeNull();

    // Drag node B using its top accent bar (top 3px is outside nodrag) directly below node A
    const dragStartX = boxB!.x + 40;
    const dragStartY = boxB!.y + 1;

    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(boxA!.x + 40, boxA!.y + boxA!.height + 150, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(200);

    // Check updated connector sides
    const childNode = await page.evaluate(({ NODE_B_ID }) => {
      const store = window.__ROOT_CANVAS_STORE__;
      return store.getState().canvas.nodes.find((n: StoredNode) => n.id === NODE_B_ID);
    }, { NODE_B_ID });

    // Position should be below A
    expect(childNode!.position.y).toBeGreaterThan(300);
    // Connector now leaves A's bottom and enters B's top
    expect(childNode!.sourceSide).toBe('bottom');
    expect(childNode!.targetSide).toBe('top');
  });

  test('7. Pin a connector end to a chosen side, then drag the node around. Pinned end does not change sides.', async ({ dashboard: page }) => {
    // Start with B to the right of A, with target end PINNED to top
    await setupTwoNodes(page, { x: 80, y: 120 }, { x: 420, y: 120 }, true, {
      sourceSide: 'right',
      targetSide: 'top',
      targetPinned: true,
    });

    const cardA = page.locator(`[data-testid="node-card-${NODE_A_ID}"]`);
    const cardB = page.locator(`[data-testid="node-card-${NODE_B_ID}"]`);
    const boxA = await cardA.boundingBox();
    const boxB = await cardB.boundingBox();
    expect(boxA).not.toBeNull();
    expect(boxB).not.toBeNull();

    // Drag node B around to below A
    const dragStartX = boxB!.x + 40;
    const dragStartY = boxB!.y + 1;

    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(boxA!.x + 40, boxA!.y + boxA!.height + 150, { steps: 15 });
    await page.mouse.up();

    await page.waitForTimeout(200);

    const childNode = await page.evaluate(({ NODE_B_ID }) => {
      const store = window.__ROOT_CANVAS_STORE__;
      return store.getState().canvas.nodes.find((n: StoredNode) => n.id === NODE_B_ID);
    }, { NODE_B_ID });

    // The target side was pinned to 'top'. Even though B moved below A,
    // its pinned targetSide must remain 'top'!
    expect(childNode!.targetSide).toBe('top');
    expect(childNode!.targetPinned).toBe(true);
  });
});
