/**
 * Component tests for `NodeEditor` (task 11.2).
 *
 * Requirements exercised: 4.2, 4.3, 4.6, 4.7.
 *
 * Test strategy:
 *   - Seed the store with a canvas containing one root node.
 *   - Render `<NodeEditor nodeId={nodeId} onClose={vi.fn()} />`.
 *   - Assert observable state changes via `useCanvasStore.getState()` and
 *     DOM queries.
 *
 * The store is a module-level Zustand singleton; `beforeEach` resets it to
 * a clean slate so tests are fully isolated.
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addRoot, emptyCanvas } from '../../data/mutators';
import { canvasActions, useCanvasStore } from '../../data/store';
import type { CanvasState } from '../../data/store';
import { NodeEditor } from '../NodeEditor';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Build a clean `CanvasState` with a single root node so the editor has a
 * real node to bind to. Returns both the state and the root node's id so
 * tests don't have to fish it out themselves.
 */
function stateWithOneNode(): { state: CanvasState; nodeId: string } {
  const base = emptyCanvas();
  const canvas = addRoot(base, { position: { x: 0, y: 0 } });
  const nodeId = canvas.nodes[0]!.id;
  const state: CanvasState = {
    canvas,
    selection: { nodeId: null },
    editor: { openNodeId: nodeId },
    deletePrompt: { nodeId: null },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  return { state, nodeId };
}

/* -------------------------------------------------------------------------- */
/* Suite                                                                      */
/* -------------------------------------------------------------------------- */

describe('NodeEditor — component', () => {
  // Shared nodeId extracted from beforeEach so tests use the same id
  // that seeds the store (fixes the double-UUID bug where a second
  // stateWithOneNode() call produced a different random id).
  let nodeId: string;

  beforeEach(() => {
    // Reset the module-level singleton before each test and capture
    // the node id so every test references the same node.
    const result = stateWithOneNode();
    nodeId = result.nodeId;
    useCanvasStore.setState(result.state);
  });

  /* ---------------------------------------------------------------------- */
  /* R4.2 — title input dispatches updateNode({title})                       */
  /* ---------------------------------------------------------------------- */

  it('typing in the title input updates the node title in the store (R4.2)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    await act(async () => {
      render(<NodeEditor nodeId={nodeId} onClose={onClose} />);
    });

    const titleInput = screen.getByTestId('node-editor-title');

    // Clear the current value and type a new title.
    await user.clear(titleInput);
    await user.type(titleInput, 'My new title');

    const node = useCanvasStore.getState().canvas.nodes[0]!;
    expect(node.title).toBe('My new title');
  });

  /* ---------------------------------------------------------------------- */
  /* R4.3 — body counter is normal when body length < 19800                  */
  /* ---------------------------------------------------------------------- */

  it('body counter shows {length}/20000 in normal color when body is short (R4.3)', async () => {
    const onClose = vi.fn();

    await act(async () => {
      render(<NodeEditor nodeId={nodeId} onClose={onClose} />);
    });

    const counter = screen.getByTestId('node-editor-body-counter');

    // Fresh node has empty body → counter should read "0/20000".
    expect(counter.textContent).toBe('0/20000');

    // Normal state: color must NOT be the warning red.
    const color = (counter as HTMLElement).style.color;
    expect(color).not.toBe('rgb(222, 80, 82)'); // #de5052
    expect(color).not.toBe('#de5052');
  });

  /* ---------------------------------------------------------------------- */
  /* R4.3 — body counter turns red in the last 200 characters of headroom    */
  /* ---------------------------------------------------------------------- */

  it('body counter turns red when body length exceeds 19800 chars (R4.3)', async () => {
    const onClose = vi.fn();

    // Seed the node with a 19 900-character body via the action (typing
    // 19 900 characters in userEvent would be prohibitively slow).
    act(() => {
      canvasActions.updateNode(nodeId, { body: 'A'.repeat(19_900) });
    });

    await act(async () => {
      render(<NodeEditor nodeId={nodeId} onClose={onClose} />);
    });

    const counter = screen.getByTestId('node-editor-body-counter');

    expect(counter.textContent).toBe('19900/20000');

    // Warning state: counter color must be the #de5052 red. jsdom may
    // normalize inline styles from hex to rgb(), so we accept both forms.
    const color = (counter as HTMLElement).style.color;
    const isWarnColor = color === '#de5052' || color === 'rgb(222, 80, 82)';
    expect(isWarnColor).toBe(true);
  });

  /* ---------------------------------------------------------------------- */
  /* R4.6 — type buttons update the node type via updateNode({type})         */
  /* ---------------------------------------------------------------------- */

  it('clicking the "finding" type button sets node.type to "finding" (R4.6)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    await act(async () => {
      render(<NodeEditor nodeId={nodeId} onClose={onClose} />);
    });

    const findingButton = screen.getByTestId('node-editor-type-finding');
    await user.click(findingButton);

    const node = useCanvasStore.getState().canvas.nodes[0]!;
    expect(node.type).toBe('finding');
  });

  /* ---------------------------------------------------------------------- */
  /* R4.7 — Esc key closes the editor                                         */
  /* ---------------------------------------------------------------------- */

  it('pressing Escape closes the editor (sets editor.openNodeId to null) (R4.7)', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    await act(async () => {
      render(<NodeEditor nodeId={nodeId} onClose={onClose} />);
    });

    // Confirm the editor is open.
    expect(screen.getByTestId('node-editor')).toBeInTheDocument();

    // Fire Esc — the editor listens on the window, so it triggers
    // regardless of which element has focus.
    await user.keyboard('{Escape}');

    // After Esc, closeEditor() should have run and cleared openNodeId.
    expect(useCanvasStore.getState().editor.openNodeId).toBe(null);

    // The onClose callback passed as a prop should also have been called.
    expect(onClose).toHaveBeenCalledOnce();
  });
});
