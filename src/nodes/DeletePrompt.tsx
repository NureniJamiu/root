/**
 * `DeletePrompt` — the delete-confirmation modal (Requirements 7.1–7.6).
 *
 * The component is rendered by `App.tsx` (task 13.1) whenever the store
 * has `state.deletePrompt.nodeId !== null` — typically because the user
 * clicked the delete button on a `HoverToolbar`, which routes through
 * `canvasActions.openDeletePrompt(nodeId)`.
 *
 * Behavior by node shape (design.md §Delete Flow):
 *
 *   - Leaf (no children)               → the modal is bypassed and the
 *                                        delete happens immediately
 *                                        (R7.1). Implemented as a
 *                                        mount-effect firing
 *                                        `onConfirm('subtree')` — on a
 *                                        leaf, `deleteSubtree` and
 *                                        `deleteNodeOnly` are equivalent
 *                                        (Property 12 vs. Property 13,
 *                                        task 4.12 unit test), so the
 *                                        subtree branch is used for its
 *                                        single canonical semantics.
 *   - Interior node with children      → both options rendered (R7.2).
 *   - Root node with children (R7.5)   → both options rendered, but the
 *                                        "Delete node only" button is
 *                                        disabled — reparenting the
 *                                        children of the root would
 *                                        break the "exactly one root"
 *                                        invariant (design.md §Data
 *                                        Model — canvasSchema).
 *   - Cancel (R7.6)                    → parent's `onCancel` handler
 *                                        closes the modal without
 *                                        touching the canvas.
 *
 * The component is purely presentational: it dispatches nothing on its
 * own. `App.tsx` wires `onCancel` to `canvasActions.closeDeletePrompt`
 * and `onConfirm` to `canvasActions.deleteNodeOnly` /
 * `canvasActions.deleteSubtree`, both of which auto-close the prompt as
 * part of their commit (see `clearUiForRemoved` in `data/store.ts`).
 */

import { useEffect, useRef } from 'react';

import { useCanvasStore } from '../data';
import type { Node, UUID } from '../data';

/**
 * The two confirm modes exposed by the prompt. `nodeOnly` reparents the
 * target's direct children to the target's parent (R7.3); `subtree`
 * removes the target and every transitive descendant (R7.4). For a leaf
 * the two are equivalent, and the leaf bypass uses `subtree` as the
 * canonical choice.
 */
export type DeleteMode = 'nodeOnly' | 'subtree';

export interface DeletePromptProps {
  readonly nodeId: UUID;
  readonly onCancel: () => void;
  readonly onConfirm: (mode: DeleteMode) => void;
}

/**
 * Store selector: return the target `Node` (or `undefined` if it was
 * removed between store update and re-render). Kept out of the component
 * body so its reference is stable across renders — required so Zustand
 * doesn't consider the selector to have changed every commit.
 */
function selectNode(nodeId: UUID) {
  return (s: { canvas: { nodes: readonly Node[] } }): Node | undefined =>
    s.canvas.nodes.find((n) => n.id === nodeId);
}

/**
 * Store selector: does any node have `parentId === nodeId`? A boolean
 * scalar is returned (rather than the child list) so Zustand's default
 * `Object.is` equality check short-circuits re-renders when the shape of
 * the children set changes but the has-children answer does not.
 */
function selectHasChildren(nodeId: UUID) {
  return (s: { canvas: { nodes: readonly Node[] } }): boolean =>
    s.canvas.nodes.some((n) => n.parentId === nodeId);
}

export function DeletePrompt({
  nodeId,
  onCancel,
  onConfirm,
}: DeletePromptProps): JSX.Element | null {
  const node = useCanvasStore(selectNode(nodeId));
  const hasChildren = useCanvasStore(selectHasChildren(nodeId));

  // Keep the latest `onConfirm` in a ref so the leaf-bypass effect only
  // depends on the target's identity, not on a callback whose reference
  // may change every parent render.
  const onConfirmRef = useRef(onConfirm);
  useEffect(() => {
    onConfirmRef.current = onConfirm;
  });

  // Leaf bypass (R7.1). Guarded by a ref so a re-render triggered by
  // the mutation itself (e.g. Zustand emitting a state update before the
  // parent unmounts us) cannot fire the callback a second time.
  const firedRef = useRef(false);
  useEffect(() => {
    if (node !== undefined && !hasChildren && !firedRef.current) {
      firedRef.current = true;
      onConfirmRef.current('subtree');
    }
  }, [node, hasChildren]);

  // Esc closes the modal (R7.6). Attached at the document level so the
  // key handler works regardless of where focus currently sits.
  useEffect(() => {
    if (node === undefined || !hasChildren) return;
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [node, hasChildren, onCancel]);

  // The node may have been removed between store update and re-render —
  // for example when the leaf-bypass effect fires and the store commit
  // clears `deletePrompt.nodeId`, causing `App` to unmount us. Render
  // nothing in that transient window.
  if (node === undefined) return null;

  // Leaf: the effect above will fire and close the prompt. Nothing to
  // render in the meantime — showing a partial modal for one frame would
  // be a flash of unwanted UI.
  if (!hasChildren) return null;

  const isRootWithChildren = node.parentId === null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      // A translucent black backdrop keeps the modal readable without
      // relying on shadows (design.md §Visual Design: flat material, no
      // shadows). Clicking the backdrop cancels — matches the editor's
      // click-away behavior in task 11.1.
      style={{ background: 'rgba(0, 0, 0, 0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      data-testid="delete-prompt-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-prompt-title"
        aria-describedby="delete-prompt-body"
        className="rounded-sm"
        style={{
          background: '#ffffff',
          color: '#000000',
          border: '1px solid #404040',
          borderRadius: 5,
          minWidth: 360,
          maxWidth: 480,
          padding: 16,
        }}
        data-testid="delete-prompt"
      >
        <h2
          id="delete-prompt-title"
          className="text-body"
          style={{ margin: 0, fontWeight: 400, fontSize: 16 }}
        >
          Delete node?
        </h2>

        <p
          id="delete-prompt-body"
          className="text-body"
          style={{ margin: '8px 0 16px 0' }}
        >
          {isRootWithChildren
            ? 'This node is the root and has descendants. It can only be deleted together with its entire subtree.'
            : "What should happen to this node's descendants?"}
        </p>

        <div className="flex flex-col gap-2">
          <ChoiceButton
            testId="btn-delete-node-only"
            disabled={isRootWithChildren}
            onClick={() => onConfirm('nodeOnly')}
            title="Reparent this node's direct children to its parent, then remove this node."
          >
            Delete node only
          </ChoiceButton>

          <ChoiceButton
            testId="btn-delete-subtree"
            onClick={() => onConfirm('subtree')}
            title="Remove this node and every descendant."
          >
            Delete node and entire subtree
          </ChoiceButton>
        </div>

        <div className="mt-4 flex flex-row justify-end">
          <ChoiceButton
            testId="btn-delete-cancel"
            onClick={onCancel}
            variant="secondary"
          >
            Cancel
          </ChoiceButton>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Internal: uniform button styling                                           */
/* -------------------------------------------------------------------------- */

interface ChoiceButtonProps {
  readonly testId: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
  readonly disabled?: boolean;
  readonly title?: string;
  /**
   * `primary` — filled, used for the two confirm choices.
   * `secondary` — outlined, used for Cancel.
   */
  readonly variant?: 'primary' | 'secondary';
}

function ChoiceButton({
  testId,
  onClick,
  children,
  disabled = false,
  title,
  variant = 'primary',
}: ChoiceButtonProps): JSX.Element {
  const filled = variant === 'primary';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      data-testid={testId}
      className="rounded-xs px-2 py-1 text-body transition-colors"
      style={{
        border: `1px solid ${filled ? '#0051c3' : '#404040'}`,
        background: filled ? (disabled ? '#ebebeb' : '#0051c3') : '#ffffff',
        color: filled ? (disabled ? '#595959' : '#ffffff') : '#000000',
        cursor: disabled ? 'not-allowed' : 'pointer',
        // Selection ring color inherits from the primary palette (R11.7)
        // but we do not paint any shadow — flat material only.
        boxShadow: 'none',
      }}
    >
      {children}
    </button>
  );
}
