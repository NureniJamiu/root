/**
 * Integration tests for the App shell (task 13.2).
 *
 * Requirements exercised: 2.1, 8.3, 8.4.
 *
 * Test coverage:
 *   1. Empty-canvas affordance: `data-testid="btn-create-root"` is visible
 *      when the store has no nodes; clicking it adds a root node (R2.1).
 *   2. Persistence load on mount: seeding `localStorage[CANVAS_KEY]` before
 *      rendering App causes the stored nodes to appear in the store (R8.3,
 *      R8.4).
 *   3. NodeEditor mounts when `editor.openNodeId` is set (R4.1).
 *   4. NodeEditor unmounts when `canvasActions.closeEditor()` is called.
 *
 * Mocking strategy:
 *   - `../canvas` is mocked entirely with a lightweight stub so we avoid
 *     pulling in React Flow, which requires ResizeObserver and other DOM APIs
 *     unavailable in jsdom.
 *   - `reactflow` and its CSS import are also mocked as a belt-and-suspenders
 *     measure in case any transitive import reaches them.
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addRoot, emptyCanvas } from '../../data/mutators';
import { canvasActions, useCanvasStore } from '../../data/store';
import type { CanvasState } from '../../data/store';
import { serializeCanvas } from '../../data/serialize';
import { CANVAS_KEY } from '../../persistence/keys';
import { App } from '../App';

/* -------------------------------------------------------------------------- */
/* Module mocks                                                               */
/* -------------------------------------------------------------------------- */

// Mock the entire canvas layer so CanvasView renders a harmless div.
// This prevents jsdom crashes caused by React Flow internals (ResizeObserver,
// SVG measurement, etc.).
vi.mock('../../canvas', () => ({
  CanvasView: () => <div data-testid="mock-canvas-view" />,
  computeChildPosition: () => ({ x: 0, y: 0 }),
  NODE_WIDTH: 220,
  NODE_HEIGHT: 120,
  SIBLING_GAP: 40,
}));

// Belt-and-suspenders: mock reactflow in case any other import reaches it.
vi.mock('reactflow', () => ({
  default: {},
  ReactFlow: () => <div />,
  Background: () => <div />,
  Controls: () => <div />,
  Handle: () => <div />,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  useReactFlow: () => ({ getViewport: () => ({ x: 0, y: 0, zoom: 1 }) }),
  useNodes: () => [],
  useEdges: () => [],
}));

vi.mock('reactflow/dist/style.css', () => ({}));

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function cleanState(): CanvasState {
  return {
    canvas: emptyCanvas(),
    selection: { nodeId: null },
    editor: { openNodeId: null },
    deletePrompt: { nodeId: null },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/* -------------------------------------------------------------------------- */
/* Suite                                                                      */
/* -------------------------------------------------------------------------- */

describe('App shell — integration', () => {
  beforeEach(() => {
    // Reset the Zustand singleton to an empty canvas.
    useCanvasStore.setState(cleanState());
    // Clear localStorage so no persisted canvas bleeds between tests.
    localStorage.clear();
  });

  /* ---------------------------------------------------------------------- */
  /* R2.1 — empty-canvas affordance                                          */
  /* ---------------------------------------------------------------------- */

  it('shows btn-create-root when the canvas has no nodes (R2.1)', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByTestId('btn-create-root')).toBeVisible();
  });

  it('clicking btn-create-root adds a root node to the store (R2.1)', async () => {
    const user = userEvent.setup();

    await act(async () => {
      render(<App />);
    });

    const btn = screen.getByTestId('btn-create-root');
    await act(async () => {
      await user.click(btn);
    });

    expect(useCanvasStore.getState().canvas.nodes.length).toBeGreaterThan(0);
  });

  /* ---------------------------------------------------------------------- */
  /* R8.3, R8.4 — persistence load on mount                                  */
  /* ---------------------------------------------------------------------- */

  it('loads persisted canvas from localStorage on mount (R8.3, R8.4)', async () => {
    // Build a canvas with one root node and serialize it into localStorage
    // BEFORE rendering App so loadInitialCanvas() picks it up.
    const canvas = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
    const serialized = serializeCanvas(canvas);
    localStorage.setItem(CANVAS_KEY, serialized);

    await act(async () => {
      render(<App />);
    });

    expect(useCanvasStore.getState().canvas.nodes.length).toBeGreaterThan(0);
  });

  /* ---------------------------------------------------------------------- */
  /* R4.1 — NodeEditor mounts / unmounts with editor.openNodeId             */
  /* ---------------------------------------------------------------------- */

  it('NodeEditor appears when editor.openNodeId is set (R4.1)', async () => {
    // Pre-seed localStorage so loadInitialCanvas() picks up a canvas with a
    // root node. The mount effect in AppShell will load this canvas and place
    // it in the store, giving us a valid nodeId to open the editor for.
    const canvas = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
    const nodeId = canvas.nodes[0]!.id;
    localStorage.setItem(CANVAS_KEY, serializeCanvas(canvas));

    await act(async () => {
      render(<App />);
    });

    // Manually open the editor for the persisted node.
    act(() => {
      canvasActions.openEditor(nodeId);
    });

    expect(screen.getByTestId('node-editor')).toBeInTheDocument();
  });

  it('NodeEditor disappears when closeEditor() is called', async () => {
    // Pre-seed localStorage with a root node canvas so the mount effect loads
    // it, then open the editor after mount settles.
    const canvas = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
    const nodeId = canvas.nodes[0]!.id;
    localStorage.setItem(CANVAS_KEY, serializeCanvas(canvas));

    await act(async () => {
      render(<App />);
    });

    // Open the editor.
    act(() => {
      canvasActions.openEditor(nodeId);
    });

    // Editor should be visible.
    expect(screen.getByTestId('node-editor')).toBeInTheDocument();

    // Close it.
    act(() => {
      canvasActions.closeEditor();
    });

    expect(screen.queryByTestId('node-editor')).not.toBeInTheDocument();
  });
});
