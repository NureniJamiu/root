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
import { Button } from '../ui';

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
  const branchCount = useCanvasStore((s) => descendantCount(s.canvas, nodeId));

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
      className="root-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      // Clicking the backdrop cancels, like the editor's click-away.
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
        className="root-modal-panel w-[440px] max-w-full bg-[#ffffff] text-[#1b1c1c] border border-[#d9d9de] rounded-[4px] overflow-hidden"
        data-testid="delete-prompt"
      >
        <div className="relative px-6 pt-5 pb-4">
          <span className="absolute left-0 top-0 h-[3px] w-full bg-[#ba1a1a]" aria-hidden="true" />
          <div className="flex items-start gap-3">
            <span className="mt-0.5 w-8 h-8 shrink-0 inline-flex items-center justify-center rounded-full bg-[#fdf2f2] text-[#ba1a1a]" aria-hidden="true">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6M14 11v6" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </span>
            <div className="flex flex-col gap-1 min-w-0">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[#737785]">
                Delete idea
              </span>
              <h2 id="delete-prompt-title" className="font-serif text-[20px] leading-[26px] font-normal text-[#000000] m-0 truncate">
                {node.title.trim() ? `Delete “${node.title.trim()}”?` : 'Delete this idea?'}
              </h2>
              <p id="delete-prompt-body" className="font-serif text-[14px] leading-[21px] text-[#404040] m-0">
                Some ideas hang only from this one. What should happen to them?
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-6 pb-5">
          <ChoiceButton
            testId="btn-delete-node-only"
            onClick={() => onConfirm('nodeOnly')}
            title="Remove this idea and its connectors. The ideas it was connected to stay."
            hint="Connected ideas stay on the canvas."
          >
            Delete this idea only
          </ChoiceButton>

          <ChoiceButton
            testId="btn-delete-subtree"
            onClick={() => onConfirm('subtree')}
            title="Remove this idea and every idea that hangs only from it."
            hint={`Also removes the ${branchCount} idea${branchCount === 1 ? '' : 's'} below it.`}
            danger
          >
            Delete idea and everything that hangs from it
          </ChoiceButton>
        </div>

        <div className="flex flex-row items-center justify-between px-6 py-3.5 border-t border-[#ebebeb] bg-[#fbfbfc]">
          <span className="font-mono text-[10px] text-[#737785]">Undo brings it back.</span>
          <Button variant="secondary" size="md" onClick={onCancel} data-testid="btn-delete-cancel">
            Cancel
          </Button>
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
  readonly title?: string;
  /** One-line consequence shown under the label. */
  readonly hint?: string;
  /** The stronger of the two choices: filled red. */
  readonly danger?: boolean;
}

function ChoiceButton({ testId, onClick, children, title, hint, danger = false }: ChoiceButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      data-testid={testId}
      className={`group w-full flex flex-col items-start gap-0.5 px-4 py-3 text-left rounded-[3px] border transition-colors duration-150 cursor-pointer ${
        danger
          ? 'bg-[#ba1a1a] border-[#ba1a1a] text-[#ffffff] hover:bg-[#93000a] hover:border-[#93000a]'
          : 'bg-[#ffffff] border-[#e3c4c4] text-[#ba1a1a] hover:bg-[#fdf2f2] hover:border-[#ba1a1a]'
      }`}
    >
      <span className="font-mono text-[12px] font-medium">{children}</span>
      {hint && (
        <span className={`font-serif text-[12.5px] ${danger ? 'text-[#ffffff]/80' : 'text-[#595959]'}`}>{hint}</span>
      )}
    </button>
  );
}
