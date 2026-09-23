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

import { addChild, addRoot, emptyCanvas } from '../../data/mutators';
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
    selection: { nodeId: null },
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

  it('leaf node: fires onConfirm("subtree") via mount-effect and renders no modal buttons (R7.1)', async () => {
    // Build a canvas with root + leaf (leaf has no children).
    const base = emptyCanvas();
    const withRoot = addRoot(base, { position: { x: 0, y: 0 } });
    const rootId = withRoot.nodes[0]!.id;
    const withLeaf = addChild(withRoot, rootId, { position: { x: 100, y: 100 } });
    const leafId = withLeaf.nodes.find((n) => n.parentId === rootId)!.id;

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

  it('interior node with children: both delete buttons are enabled (R7.2)', async () => {
    // root → child → grandchild; render prompt for child (interior node).
    const base = emptyCanvas();
    const withRoot = addRoot(base, { position: { x: 0, y: 0 } });
    const rootId = withRoot.nodes[0]!.id;
    const withChild = addChild(withRoot, rootId, { position: { x: 100, y: 100 } });
    const childId = withChild.nodes.find((n) => n.parentId === rootId)!.id;
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
  /* R7.5 — Root with children: node-only button is disabled                 */
  /* ---------------------------------------------------------------------- */

  it('root node with children: btn-delete-node-only is disabled, btn-delete-subtree is not (R7.5)', async () => {
    // root + child; render prompt for root.
    const base = emptyCanvas();
    const withRoot = addRoot(base, { position: { x: 0, y: 0 } });
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

    expect(nodeOnlyBtn).toBeDisabled();
    expect(subtreeBtn).not.toBeDisabled();
  });

  /* ---------------------------------------------------------------------- */
  /* R7.6 — Cancel button calls onCancel                                     */
  /* ---------------------------------------------------------------------- */

  it('clicking Cancel calls onCancel (R7.6)', async () => {
    // root + child; render prompt for root so the modal is shown.
    const base = emptyCanvas();
    const withRoot = addRoot(base, { position: { x: 0, y: 0 } });
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
