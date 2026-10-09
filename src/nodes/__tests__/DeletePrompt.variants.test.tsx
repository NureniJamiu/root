/**
 * Component tests for `DeletePrompt` variants (task 12.2).
 *
 * Requirements exercised: 7.1, 7.2, 7.5, 7.6.
 *
 * Test strategy:
 *   - Seed the Zustand store with specific tree shapes.
 *   - Render `<DeletePrompt nodeId={...} onCancel={...} onConfirm={...} />`.
 *   - Assert DOM structure and callback invocations.
 *
 * The store is the module-level Zustand singleton; `beforeEach` resets it
 * to a known state so tests are fully isolated.
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addChild, addNode, connect, emptyCanvas } from '../../data/mutators';
import { useCanvasStore } from '../../data/store';
import type { CanvasState } from '../../data/store';
import { DeletePrompt } from '../DeletePrompt';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Build a minimal empty `CanvasState` scaffold. */
function emptyState(): CanvasState {
  return {
    canvas: emptyCanvas(),
    selection: { nodeId: null, edgeId: null },
    editor: { openNodeId: null },
    deletePrompt: { nodeId: null },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/* -------------------------------------------------------------------------- */
/* Suite                                                                      */
/* -------------------------------------------------------------------------- */

describe('DeletePrompt — variants', () => {
  beforeEach(() => {
    useCanvasStore.setState(emptyState());
  });

  /* ---------------------------------------------------------------------- */
  /* R7.1 — Leaf bypass: prompt fires onConfirm('subtree') immediately       */
  /* and no modal buttons are visible                                        */
  /* ---------------------------------------------------------------------- */

  it('card nothing hangs from: fires onConfirm("subtree") via mount-effect and renders no modal buttons (R7.1)', async () => {
    // Build a canvas with root + leaf (leaf has no children).
    const base = emptyCanvas();
    const withRoot = addNode(base, { position: { x: 0, y: 0 } });
    const rootId = withRoot.nodes[0]!.id;
    const withLeaf = addChild(withRoot, rootId, { position: { x: 100, y: 100 } });
    const leafId = withLeaf.nodes.find((n) => n.id !== rootId)!.id;

    useCanvasStore.setState({ ...emptyState(), canvas: withLeaf });

    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    await act(async () => {
      render(
        <DeletePrompt
          nodeId={leafId}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />,
      );
    });

    // Leaf bypass: onConfirm must have been called with 'subtree'.
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledWith('subtree');

    // No modal buttons should be rendered — the leaf bypasses the UI entirely.
    expect(screen.queryByTestId('btn-delete-node-only')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-delete-subtree')).not.toBeInTheDocument();
    expect(screen.queryByTestId('btn-delete-cancel')).not.toBeInTheDocument();
  });

  /* ---------------------------------------------------------------------- */
  /* R7.2 — Interior node: both delete buttons are enabled                   */
  /* ---------------------------------------------------------------------- */

  it('card with ideas hanging from it: both delete buttons are enabled (R7.2)', async () => {
    // root → child → grandchild; render prompt for child (interior node).
    const base = emptyCanvas();
    const withRoot = addNode(base, { position: { x: 0, y: 0 } });
    const rootId = withRoot.nodes[0]!.id;
    const withChild = addChild(withRoot, rootId, { position: { x: 100, y: 100 } });
    const childId = withChild.nodes.find((n) => n.id !== rootId)!.id;
    const withGrandchild = addChild(withChild, childId, { position: { x: 200, y: 200 } });

    useCanvasStore.setState({ ...emptyState(), canvas: withGrandchild });

    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    await act(async () => {
      render(
        <DeletePrompt
          nodeId={childId}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />,
      );
    });

    const nodeOnlyBtn = screen.getByTestId('btn-delete-node-only');
    const subtreeBtn = screen.getByTestId('btn-delete-subtree');

    expect(nodeOnlyBtn).toBeInTheDocument();
    expect(subtreeBtn).toBeInTheDocument();
    expect(nodeOnlyBtn).not.toBeDisabled();
    expect(subtreeBtn).not.toBeDisabled();
  });

  /* ---------------------------------------------------------------------- */
  /* The first card is not special: both options are offered                 */
  /* ---------------------------------------------------------------------- */

  it('first card with something hanging from it: both delete options are enabled, nothing is special about the first card', async () => {
    // root + child; render prompt for root.
    const base = emptyCanvas();
    const withRoot = addNode(base, { position: { x: 0, y: 0 } });
    const rootId = withRoot.nodes[0]!.id;
    const withChild = addChild(withRoot, rootId, { position: { x: 100, y: 100 } });

    useCanvasStore.setState({ ...emptyState(), canvas: withChild });

    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    await act(async () => {
      render(
        <DeletePrompt
          nodeId={rootId}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />,
      );
    });

    const nodeOnlyBtn = screen.getByTestId('btn-delete-node-only');
    const subtreeBtn = screen.getByTestId('btn-delete-subtree');

    expect(nodeOnlyBtn).not.toBeDisabled();
    expect(subtreeBtn).not.toBeDisabled();
  });

  /* ---------------------------------------------------------------------- */
  /* R7.6 — Cancel button calls onCancel                                     */
  /* ---------------------------------------------------------------------- */

  it('clicking Cancel calls onCancel (R7.6)', async () => {
    // root + child; render prompt for root so the modal is shown.
    const base = emptyCanvas();
    const withRoot = addNode(base, { position: { x: 0, y: 0 } });
    const rootId = withRoot.nodes[0]!.id;
    const withChild = addChild(withRoot, rootId, { position: { x: 100, y: 100 } });

    useCanvasStore.setState({ ...emptyState(), canvas: withChild });

    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();

    await act(async () => {
      render(
        <DeletePrompt
          nodeId={rootId}
          onCancel={onCancel}
          onConfirm={onConfirm}
        />,
      );
    });

    const cancelBtn = screen.getByTestId('btn-delete-cancel');
    await user.click(cancelBtn);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe('DeletePrompt — shared and unconnected cards', () => {
  beforeEach(() => {
    useCanvasStore.setState(emptyState());
  });

  it('bypasses the modal for an unconnected card', async () => {
    const canvas = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    useCanvasStore.setState({ ...emptyState(), canvas });
    const onConfirm = vi.fn();

    await act(async () => {
      render(<DeletePrompt nodeId={canvas.nodes[0]!.id} onCancel={vi.fn()} onConfirm={onConfirm} />);
    });

    expect(onConfirm).toHaveBeenCalledWith('subtree');
    expect(screen.queryByTestId('btn-delete-node-only')).not.toBeInTheDocument();
  });

  it('bypasses the modal when everything it points at is also fed by another card', async () => {
    // a -> shared <- b: nothing hangs only from a.
    let canvas = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    canvas = addNode(canvas, { position: { x: 0, y: 300 } });
    const [a, b] = canvas.nodes.map((n) => n.id) as [string, string];
    canvas = addChild(canvas, a, { position: { x: 500, y: 0 } });
    const shared = canvas.nodes[2]!.id;
    canvas = connect(canvas, { source: b, target: shared, sourceSide: 'right', targetSide: 'left' });
    useCanvasStore.setState({ ...emptyState(), canvas });
    const onConfirm = vi.fn();

    await act(async () => {
      render(<DeletePrompt nodeId={a} onCancel={vi.fn()} onConfirm={onConfirm} />);
    });

    expect(onConfirm).toHaveBeenCalledWith('subtree');
  });
});
