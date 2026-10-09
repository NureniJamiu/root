/**
 * `DeletePrompt` — the delete-confirmation modal (Requirements 7.1–7.6).
 *
 * The component is rendered by `App.tsx` whenever the store has
 * `state.deletePrompt.nodeId !== null` — typically because the user clicked
 * the delete button on a `HoverToolbar` or pressed Delete on a selected idea,
 * which routes through `canvasActions.openDeletePrompt(nodeId)`.
 *
 * Behavior by node shape:
 *
 *   - Nothing hangs only from the idea → the modal is bypassed and the delete
 *     happens immediately. Implemented as a mount-effect firing
 *     `onConfirm('subtree')`; when nothing hangs only from the idea,
 *     `deleteSubtree` and `deleteNodeOnly` are equivalent.
 *   - Other ideas hang only from it   → both options are offered:
 *       · "this idea only" removes it and its connectors; the ideas it was
 *         connected to stay where they are;
 *       · "idea and everything that hangs from it" also removes the ideas
 *         reachable only through it. Ideas that something else also points at
 *         are kept.
 *   - Cancel (R7.6)                    → parent's `onCancel` handler closes
 *                                        the modal without touching the canvas.
 *
 * The component is purely presentational: it dispatches nothing on its own.
 * `App.tsx` wires `onCancel` to `canvasActions.closeDeletePrompt` and
 * `onConfirm` to `canvasActions.deleteNodeOnly` / `canvasActions.deleteSubtree`,
 * both of which auto-close the prompt as part of their commit.
 */

import { useEffect, useRef } from 'react';

import { descendantCount, useCanvasStore } from '../data';
import type { Node, UUID } from '../data';

/**
 * The two confirm modes exposed by the prompt. `nodeOnly` removes the target
 * and its connectors; `subtree` also removes every idea that hangs only from
 * it. When nothing hangs only from it the two are equivalent, and the bypass
 * uses `subtree` as the canonical choice.
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
 * Store selector: does any idea hang only from `nodeId`? A boolean scalar is
 * returned so Zustand's default `Object.is` equality check short-circuits
 * re-renders when the set changes but the answer does not.
 */
function selectHasDependents(nodeId: UUID) {
  return (s: { canvas: Parameters<typeof descendantCount>[0] }): boolean =>
    descendantCount(s.canvas, nodeId) > 0;
}

export function DeletePrompt({
  nodeId,
  onCancel,
  onConfirm,
}: DeletePromptProps): JSX.Element | null {
  const node = useCanvasStore(selectNode(nodeId));
  const hasChildren = useCanvasStore(selectHasDependents(nodeId));

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
          background: '#ffffff',         // color.surface.raised
          color: '#191818',              // color.text.primary
          border: '1px solid #312e2e',   // color.text.tertiary
          borderRadius: 8,               // radius.sm
          minWidth: 360,
          maxWidth: 480,
          padding: 16,                   // space.7
        }}
        data-testid="delete-prompt"
      >
        <h2
          id="delete-prompt-title"
          className="text-body"
          style={{ margin: 0, fontWeight: 400, fontSize: 16 }}
        >
          Delete this idea?
        </h2>

        <p
          id="delete-prompt-body"
          className="text-body"
          style={{ margin: '8px 0 16px 0' }}
        >
          Some ideas hang only from this one. What should happen to them?
        </p>

        <div className="flex flex-col gap-2">
          <ChoiceButton
            testId="btn-delete-node-only"
            onClick={() => onConfirm('nodeOnly')}
            title="Remove this idea and its connectors. The ideas it was connected to stay."
          >
            Delete this idea only
          </ChoiceButton>

          <ChoiceButton
            testId="btn-delete-subtree"
            onClick={() => onConfirm('subtree')}
            title="Remove this idea and every idea that hangs only from it."
          >
            Delete idea and everything that hangs from it
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
        border: `1px solid ${filled ? '#ba1a1a' : '#312e2e'}`, // strong : text.tertiary
        background: filled ? (disabled ? '#f6f5f4' : '#ba1a1a') : '#ffffff', // muted : strong : raised
        color: filled ? (disabled ? '#312e2e' : '#ffffff') : '#191818',       // tertiary : raised : primary
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: 'none',
      }}
    >
      {children}
    </button>
  );
}
