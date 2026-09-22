/**
 * Unit tests for `canvasActions` dispatch (task 6.2).
 *
 * These tests pin down store-level behaviours that the pure-mutator property
 * tests intentionally do not cover, because the coupling between a canvas
 * write and the accompanying UI-state change only exists inside the store:
 *
 *   1. `canvasActions.addRoot` produces a canvas with one node and, as a
 *      coupled UI-state change, opens the `NodeEditor` on that new root so
 *      the user can start typing a title immediately (R2.4).
 *   2. `canvasActions.addChild(parentId, p)` grows the node list by one and
 *      opens the editor on the *new child*, not on the parent (R3.3). The
 *      "not the parent" clause is the substantive check — a subtle bug in
 *      the `findNewNodeId` diff logic could route focus to the parent.
 *   3. `canvasActions.deleteNodeOnly` on the root of a canvas that has
 *      children is a no-op at the store level: no state change is
 *      committed, so the previous `canvas` reference is preserved (R7.5).
 *      The pure mutator already returns the input canvas unchanged; the
 *      store contract is that the same-reference short-circuit in
 *      `commitCanvasWrite` prevents any redundant `setState`.
 *
 * `useCanvasStore` is a module-level singleton, so every test resets the
 * store to a clean initial state via `useCanvasStore.setState(...)` before
 * running. Tests never share observable state.
 *
 * Requirements exercised: 2.4, 3.3, 7.5.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { emptyCanvas } from '../mutators';
import { canvasActions, useCanvasStore } from '../store';
import type { CanvasState } from '../store';
import type { Position, UUID } from '../types';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Build a clean `CanvasState` matching the store's own `initialState()`.
 * Kept local rather than exported from `store.ts` because tests are the
 * only consumer that needs to synthesize this shape; the production store
 * initializes itself via the same function.
 */
function cleanState(): CanvasState {
  return {
    canvas: emptyCanvas(),
    selection: { nodeId: null },
    editor: { openNodeId: null },
    deletePrompt: { nodeId: null },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * A fixed position used across cases where the exact coordinates are
 * irrelevant. Extracting it keeps each `it` block focused on the state
 * transition under test rather than on setup noise.
 */
const P: Position = { x: 0, y: 0 };

/* -------------------------------------------------------------------------- */
/* Suite                                                                      */
/* -------------------------------------------------------------------------- */

describe('canvasActions — dispatch', () => {
  beforeEach(() => {
    // Reset the module-level singleton before each test. `setState` with
    // an object shallow-merges, so we explicitly overwrite every top-level
    // field to ensure no residue from a previous test leaks through.
    useCanvasStore.setState(cleanState());
  });

  /* ---------------------------------------------------------------------- */
  /* R2.4 — addRoot opens the editor on the new root                          */
  /* ---------------------------------------------------------------------- */

  it('addRoot commits the new root and opens the editor on it (R2.4)', () => {
    canvasActions.addRoot(P);

    const state = useCanvasStore.getState();

    // One node added, and it is a root (parentId === null). This is a
    // sanity check on the mutator wiring; the substantive claim is the
    // editor coupling below.
    expect(state.canvas.nodes).toHaveLength(1);
    const root = state.canvas.nodes[0];
    expect(root?.parentId).toBe(null);

    // R2.4: opening the create-root affordance leads directly into the
    // editor for the freshly created node so the user can begin typing.
    expect(state.editor.openNodeId).toBe(root?.id);
  });

  /* ---------------------------------------------------------------------- */
  /* R3.3 — addChild grows the store and opens editor on the CHILD           */
  /* ---------------------------------------------------------------------- */

  it('addChild adds a node and opens the editor on the new child, not the parent (R3.3)', () => {
    // Setup: add a root so there is a parent to attach to.
    canvasActions.addRoot(P);
    const rootId = useCanvasStore.getState().canvas.nodes[0]?.id as
      | UUID
      | undefined;
    // Precondition guard so a regression in `addRoot` produces a clear
    // failure here rather than a misleading one downstream.
    expect(rootId).toBeDefined();
    const parentId = rootId as UUID;

    const beforeCount = useCanvasStore.getState().canvas.nodes.length;

    canvasActions.addChild(parentId, { x: 100, y: 100 });

    const state = useCanvasStore.getState();

    // Node count grew by exactly one — the mutator did not silently
    // reject the parentId at its boundary.
    expect(state.canvas.nodes).toHaveLength(beforeCount + 1);

    // Identify the new child by exclusion. There must be exactly one
    // node with `parentId === rootId` in this fixture.
    const child = state.canvas.nodes.find((n) => n.parentId === parentId);
    expect(child).toBeDefined();

    // R3.3: editor targets the child, not the parent. Both halves of
    // this assertion matter — a "focus stayed on the root" bug would
    // pass the first half alone.
    expect(state.editor.openNodeId).toBe(child?.id);
    expect(state.editor.openNodeId).not.toBe(parentId);
  });

  /* ---------------------------------------------------------------------- */
  /* R7.5 — deleteNodeOnly on root-with-children is a no-op at the store     */
  /* ---------------------------------------------------------------------- */

  it('deleteNodeOnly on root-with-children does not change store state (R7.5)', () => {
    // Setup: build a root with one child so R7.5's precondition
    // (root has at least one child) holds.
    canvasActions.addRoot(P);
    const rootId = useCanvasStore.getState().canvas.nodes[0]?.id as
      | UUID
      | undefined;
    expect(rootId).toBeDefined();
    canvasActions.addChild(rootId as UUID, { x: 100, y: 100 });

    // Snapshot the canvas *reference* before the guarded action. The
    // store contract for a no-op is that `commitCanvasWrite` observes
    // `after === before` from the mutator and skips `setState`, so the
    // canvas reference on the store must be identical afterwards.
    const canvasBefore = useCanvasStore.getState().canvas;
    const editorBefore = useCanvasStore.getState().editor;

    canvasActions.deleteNodeOnly(rootId as UUID);

    const state = useCanvasStore.getState();

    // Same reference proves no write occurred; deep equality alone
    // would also pass if the store had committed a structurally
    // identical clone, which would still be a bug (spurious re-render).
    expect(state.canvas).toBe(canvasBefore);

    // Belt-and-braces value checks: the root is still there with its
    // child still parented to it.
    expect(state.canvas.nodes).toHaveLength(2);
    expect(state.canvas.nodes.find((n) => n.id === rootId)?.parentId).toBe(null);
    expect(
      state.canvas.nodes.find((n) => n.parentId === rootId),
    ).toBeDefined();

    // Coupled UI-state must also be untouched: a no-op canvas write
    // must not clear the editor that `addChild` opened on the child.
    expect(state.editor).toBe(editorBefore);
  });
});
