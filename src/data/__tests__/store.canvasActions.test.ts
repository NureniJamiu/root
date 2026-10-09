/**
 * Unit tests for `canvasActions` dispatch.
 *
 * These pin down store-level behaviours that the pure-mutator tests do not
 * cover, because the coupling between a canvas write and the accompanying
 * UI-state change only exists inside the store:
 *
 *   1. `addNode` / `addChild` open the `NodeEditor` on the *new* card, so the
 *      user can start typing a title immediately.
 *   2. Connector actions (`connect`, `updateEdge`, `removeEdge`) validate,
 *      are undoable, and keep the selection consistent.
 *   3. `moveNodes` commits a multi-card drag as one undo step.
 *   4. `deleteNodeOnly` clears UI state that pointed at the removed card.
 *
 * `useCanvasStore` is a module-level singleton, so every test resets the
 * store to a clean initial state before running.
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
    selection: { nodeId: null, edgeId: null },
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
  /* addNode opens the editor on the new card                                */
  /* ---------------------------------------------------------------------- */

  it('addNode commits an unconnected card and opens the editor on it', () => {
    canvasActions.addNode(P);

    const state = useCanvasStore.getState();

    expect(state.canvas.nodes).toHaveLength(1);
    expect(state.canvas.edges).toHaveLength(0);
    expect(state.editor.openNodeId).toBe(state.canvas.nodes[0]?.id);
  });

  it('addNode works on a canvas that already has cards', () => {
    canvasActions.addNode(P);
    canvasActions.addNode({ x: 500, y: 500 });
    const state = useCanvasStore.getState();
    expect(state.canvas.nodes).toHaveLength(2);
    expect(state.canvas.edges).toHaveLength(0);
    expect(state.editor.openNodeId).toBe(state.canvas.nodes[1]?.id);
  });

  /* ---------------------------------------------------------------------- */
  /* addChild grows the store, connects, and opens the editor on the CHILD   */
  /* ---------------------------------------------------------------------- */

  it('addChild adds a connected node and opens the editor on the new child, not the parent', () => {
    canvasActions.addNode(P);
    const parentId = useCanvasStore.getState().canvas.nodes[0]?.id as UUID;
    expect(parentId).toBeDefined();

    canvasActions.addChild(parentId, { x: 400, y: 0 });

    const state = useCanvasStore.getState();
    expect(state.canvas.nodes).toHaveLength(2);
    expect(state.canvas.edges).toHaveLength(1);
    const childId = state.canvas.nodes.find((n) => n.id !== parentId)?.id;
    expect(state.canvas.edges[0]).toMatchObject({ source: parentId, target: childId });
    expect(state.editor.openNodeId).toBe(childId);
    expect(state.editor.openNodeId).not.toBe(parentId);
  });

  /* ---------------------------------------------------------------------- */
  /* Connectors                                                              */
  /* ---------------------------------------------------------------------- */

  function twoCards(): [UUID, UUID] {
    canvasActions.addNode(P);
    canvasActions.addNode({ x: 500, y: 0 });
    const [a, b] = useCanvasStore.getState().canvas.nodes.map((n) => n.id) as [UUID, UUID];
    return [a, b];
  }

  it('connect adds a connector and rejects a self connection without writing', () => {
    const [a, b] = twoCards();
    canvasActions.connect({ source: a, target: b, sourceSide: 'right', targetSide: 'left' });
    expect(useCanvasStore.getState().canvas.edges).toHaveLength(1);

    const before = useCanvasStore.getState().canvas;
    canvasActions.connect({ source: a, target: a, sourceSide: 'right', targetSide: 'left' });
    expect(useCanvasStore.getState().canvas).toBe(before);
  });

  it('updateEdge re-attaches and removeEdge deletes; both are undoable', () => {
    const [a, b] = twoCards();
    canvasActions.connect({ source: a, target: b, sourceSide: 'right', targetSide: 'left' });
    const edgeId = useCanvasStore.getState().canvas.edges[0]!.id;

    canvasActions.updateEdge(edgeId, { source: a, target: b, sourceSide: 'bottom', targetSide: 'top' });
    expect(useCanvasStore.getState().canvas.edges[0]).toMatchObject({ sourceSide: 'bottom', targetSide: 'top' });

    canvasActions.removeEdge(edgeId);
    expect(useCanvasStore.getState().canvas.edges).toHaveLength(0);

    canvasActions.undo();
    expect(useCanvasStore.getState().canvas.edges).toHaveLength(1);
  });

  it('a removed connector is no longer selected', () => {
    const [a, b] = twoCards();
    canvasActions.connect({ source: a, target: b, sourceSide: 'right', targetSide: 'left' });
    const edgeId = useCanvasStore.getState().canvas.edges[0]!.id;

    canvasActions.selectEdge(edgeId);
    expect(useCanvasStore.getState().selection).toEqual({ nodeId: null, edgeId });

    canvasActions.removeEdge(edgeId);
    expect(useCanvasStore.getState().selection.edgeId).toBeNull();
  });

  it('selecting a card deselects the connector and the other way round', () => {
    const [a, b] = twoCards();
    canvasActions.connect({ source: a, target: b, sourceSide: 'right', targetSide: 'left' });
    const edgeId = useCanvasStore.getState().canvas.edges[0]!.id;

    canvasActions.selectEdge(edgeId);
    canvasActions.select(a);
    expect(useCanvasStore.getState().selection).toEqual({ nodeId: a, edgeId: null });
    canvasActions.selectEdge(edgeId);
    expect(useCanvasStore.getState().selection).toEqual({ nodeId: null, edgeId });
  });

  it('moveNodes commits several positions as one undo step', () => {
    const [a, b] = twoCards();
    canvasActions.moveNodes(new Map([[a, { x: 10, y: 10 }], [b, { x: 20, y: 20 }]]));
    const nodes = useCanvasStore.getState().canvas.nodes;
    expect(nodes.find((n) => n.id === a)?.position).toEqual({ x: 10, y: 10 });
    expect(nodes.find((n) => n.id === b)?.position).toEqual({ x: 20, y: 20 });

    canvasActions.undo();
    expect(useCanvasStore.getState().canvas.nodes.find((n) => n.id === a)?.position).toEqual(P);
  });

  /* ---------------------------------------------------------------------- */
  /* deleteNodeOnly keeps the cards it was connected to                      */
  /* ---------------------------------------------------------------------- */

  it('deleteNodeOnly removes the card and its connectors and clears an open editor on it', () => {
    canvasActions.addNode(P);
    const rootId = useCanvasStore.getState().canvas.nodes[0]!.id;
    canvasActions.addChild(rootId, { x: 400, y: 0 });
    const childId = useCanvasStore.getState().canvas.nodes[1]!.id;
    canvasActions.openEditor(rootId);

    canvasActions.deleteNodeOnly(rootId);

    const state = useCanvasStore.getState();
    expect(state.canvas.nodes.map((n) => n.id)).toEqual([childId]);
    expect(state.canvas.edges).toEqual([]);
    expect(state.editor.openNodeId).toBeNull();
  });
});
