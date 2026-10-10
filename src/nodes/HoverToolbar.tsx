/**
 * `HoverToolbar` — the row of action buttons that floats just above a
 * `NodeCard`'s top-right corner while the card is hovered or focused.
 *
 * The toolbar exposes these actions (design.md §Node UI Layer):
 *   - `add-child`  — insert a new idea connected from this one and open its editor.
 *   - `edit`       — open the `NodeEditor` on this node (images are attached there).
 *   - `cycle-type` — cycle `topic → finding → question → conclusion → topic`.
 *   - `collapse` / `expand` — hide or show every connected idea at once.
 *   - reveal arrow — opens `ChildRevealMenu` to show or hide connected
 *                    ideas one at a time, in any order.
 *   - `expand-ai`  — ask AI for connected ideas (only when AI is set up).
 *   - `delete`     — open the `DeletePrompt`. The prompt itself bypasses
 *                    the modal when nothing hangs only from this idea.
 *
 * Most buttons dispatch directly through `canvasActions`. The `add-child`
 * action routes through the `ToolbarCallbacks` context so the app layer
 * can compute a non-overlapping initial position via
 * `computeChildPosition` (task 9.2, Requirement 3.2) without the
 * `nodes/` layer having to import from `canvas/` (Requirement 10.3).
 */

import { useCallback, useRef, useState } from 'react';
import type { ReactNode, Ref } from 'react';

import { canvasActions, descendantCount, hasHiddenChildren, useCanvasStore } from '../data';
import type { Node, NodeType, UUID } from '../data';

import { ChildRevealMenu } from './ChildRevealMenu';
import { IDEA_DRAG_MIME } from './dragMime';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  CycleIcon,
  PencilIcon,
  PlusIcon,
  SparkleIcon,
} from './icons';
import { useToolbarCallbacks } from './toolbarCallbacks';

/**
 * Selector: does collapsing the node hide anything? The collapse affordance
 * is only offered when it does (Requirement 6.1).
 */
function selectHasHideable(nodeId: UUID) {
  return (s: { canvas: Parameters<typeof descendantCount>[0] }): boolean =>
    descendantCount(s.canvas, nodeId) > 0;
}

/** Selector: does the node connect to anything at all (so it has ideas to list)? */
function selectHasChildren(nodeId: UUID) {
  return (s: { canvas: Parameters<typeof descendantCount>[0] }): boolean =>
    s.canvas.edges.some((e) => e.source === nodeId);
}

/**
 * The cycle order used by the type button. Follows the four-button
 * order rendered by the future `NodeEditor` (task 11.1) so the two paths
 * surface the same mental model: `topic → finding → question →
 * conclusion → topic`.
 */
const NEXT_TYPE: { readonly [K in NodeType]: NodeType } = {
  topic: 'finding',
  finding: 'question',
  question: 'conclusion',
  conclusion: 'topic',
};

function nextType(current: NodeType): NodeType {
  return NEXT_TYPE[current];
}

export interface HoverToolbarProps {
  readonly node: Node;
}

export function HoverToolbar({ node }: HoverToolbarProps): JSX.Element {
  const { onAddChild, onExpandWithAi } = useToolbarCallbacks();
  const hasChildren = useCanvasStore(selectHasHideable(node.id));
  const hasAnyChild = useCanvasStore(selectHasChildren(node.id));
  // Collapsed, or showing only some of its connected ideas.
  const partlyHidden = useCanvasStore((s) => hasHiddenChildren(s.canvas, node.id));
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const arrowRef = useRef<HTMLButtonElement | null>(null);
  const closeMenu = useCallback((fromKeyboard?: boolean) => {
    setMenuAnchor(null);
    if (fromKeyboard) arrowRef.current?.focus();
  }, []);
  const toggleMenu = (): void => {
    setMenuAnchor((open) => (open ? null : arrowRef.current?.getBoundingClientRect() ?? null));
  };

  const handleAddChild = (): void => {
    // The provider is responsible for computing the child position and
    // dispatching `canvasActions.addChild`. In production the App shell
    // supplies `computeChildPosition`; in isolated tests a naive
    // diagonal-offset fallback keeps behavior consistent.
    onAddChild(node.id);
  };
  const onEdit = (): void => {
    canvasActions.openEditor(node.id);
  };
  const onCycleType = (): void => {
    canvasActions.updateNode(node.id, { type: nextType(node.type) });
  };
  const onDelete = (): void => {
    // Route through the delete prompt; it bypasses the modal when nothing
    // hangs only from this idea.
    canvasActions.openDeletePrompt(node.id);
  };
  const onCollapse = (): void => {
    // R6.1: set collapsed to true (collapse affordance).
    canvasActions.setCollapsed(node.id, true);
  };
  const onExpand = (): void => {
    // R6.3: show every connected idea (also ends a one-at-a-time reveal).
    canvasActions.setCollapsed(node.id, false);
  };

  return (
    <div
      // Floats just above the card's top-right corner. The bottom padding
      // bridges the gap so the pointer can travel from card to buttons
      // without the toolbar fading out; while hidden it catches no clicks.
      className={`absolute right-0 bottom-full z-20 w-max pb-1.5 transition-[opacity,transform] duration-150 ease-out group-hover:opacity-100 group-hover:translate-y-0 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:pointer-events-auto ${
        menuAnchor ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-1 pointer-events-none'
      }`}
      data-testid="hover-toolbar"
    >
      <div
        className="flex flex-row items-center gap-1 rounded-[4px] bg-panel p-[3px]"
        style={{ border: '1px solid rgb(var(--rule-2))', boxShadow: '0 4px 12px rgb(var(--shadow) / 0.10)' }}
      >
        <span
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData(IDEA_DRAG_MIME, node.id);
            e.dataTransfer.setData('text/plain', node.title || 'Untitled idea');
            e.dataTransfer.effectAllowed = 'copy';
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="nodrag inline-flex items-center justify-center rounded-[2px] text-muted hover:text-ink-strong hover:bg-sunken cursor-grab"
          style={{ width: 16, height: 22 }}
          title="Drag into a document"
          aria-label="Drag into a document"
          data-testid="btn-drag-to-doc"
        >
          <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden="true">
            <circle cx="2" cy="2" r="1" /><circle cx="6" cy="2" r="1" />
            <circle cx="2" cy="6" r="1" /><circle cx="6" cy="6" r="1" />
            <circle cx="2" cy="10" r="1" /><circle cx="6" cy="10" r="1" />
          </svg>
        </span>
        <ToolbarButton label="Add connected idea" onClick={handleAddChild} testId="btn-add-child">
          <PlusIcon />
        </ToolbarButton>
        {onExpandWithAi && (
          <ToolbarButton label="Suggest connected ideas with AI" onClick={() => onExpandWithAi(node.id)} testId="btn-expand-ai">
            <SparkleIcon />
          </ToolbarButton>
        )}
        <ToolbarButton label="Edit (notes and images)" onClick={onEdit} testId="btn-edit">
          <PencilIcon />
        </ToolbarButton>
        <ToolbarButton
          label={`Change card type (current: ${node.type})`}
          onClick={onCycleType}
          testId="btn-cycle-type"
        >
          <CycleIcon />
        </ToolbarButton>
        {/* Collapse affordance (R6.1): when every connected idea is shown.
            Expand affordance (R6.3): when some or all of them are hidden. The
            arrow beside it reveals them one at a time. */}
        {(partlyHidden || hasChildren || hasAnyChild) && (
          <div className="inline-flex items-center">
            {partlyHidden ? (
              <ToolbarButton label="Expand connected ideas" onClick={onExpand} testId="btn-expand" joined={hasAnyChild ? 'left' : undefined}>
                <ChevronRightIcon />
              </ToolbarButton>
            ) : hasChildren ? (
              <ToolbarButton label="Collapse connected ideas" onClick={onCollapse} testId="btn-collapse" joined={hasAnyChild ? 'left' : undefined}>
                <ChevronDownIcon />
              </ToolbarButton>
            ) : null}
            {hasAnyChild && (
            <ToolbarButton
              label="Show or hide connected ideas one by one"
              onClick={toggleMenu}
              testId="btn-reveal-menu"
              joined={partlyHidden || hasChildren ? 'right' : undefined}
              buttonRef={arrowRef}
              pressed={menuAnchor !== null}
            >
              <CaretIcon />
            </ToolbarButton>
            )}
          </div>
        )}
        {menuAnchor && <ChildRevealMenu nodeId={node.id} anchor={menuAnchor} onClose={closeMenu} />}
        <ToolbarButton
          label="Delete"
          onClick={onDelete}
          testId="btn-delete"
          variant="destructive"
        >
          <CloseIcon />
        </ToolbarButton>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Internal: uniform button styling                                           */
/* -------------------------------------------------------------------------- */

interface ToolbarButtonProps {
  readonly label: string;
  readonly onClick: () => void;
  readonly testId: string;
  readonly children: ReactNode;
  readonly variant?: 'default' | 'destructive';
  /** Half of a split button: square off the side that touches its partner. */
  readonly joined?: 'left' | 'right' | undefined;
  readonly buttonRef?: Ref<HTMLButtonElement>;
  readonly pressed?: boolean;
}

function ToolbarButton({
  label,
  onClick,
  testId,
  children,
  variant = 'default',
  joined,
  buttonRef,
  pressed,
}: ToolbarButtonProps): JSX.Element {
  return (
    <button
      ref={buttonRef}
      type="button"
      aria-pressed={pressed}
      data-child-reveal-toggle={testId === 'btn-reveal-menu' ? '' : undefined}
      aria-label={label}
      title={label}
      onClick={(e) => {
        // Stop RF from grabbing the click as a canvas drag/selection.
        e.stopPropagation();
        onClick();
      }}
      onMouseDown={(e) => {
        // Prevent RF's node drag from starting when the user targets a
        // toolbar button. Without this, click-and-hold on a button turns
        // into a canvas drag.
        e.stopPropagation();
      }}
      className={`inline-flex items-center justify-center rounded-[2px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-topic cursor-pointer ${
        variant === 'destructive'
          ? 'hover:bg-question-fill hover:text-on-accent hover:border-question'
          : 'hover:bg-sunken hover:border-ink-strong hover:text-ink-strong'
      }`}
      style={{
        width: testId === 'btn-reveal-menu' ? 14 : 22,
        height: 22,
        border: '1px solid rgb(var(--rule))',
        background: pressed ? 'rgb(var(--sunken))' : 'rgb(var(--panel))',
        color: pressed ? 'rgb(var(--ink-strong))' : 'rgb(var(--ink-read))',
        boxShadow: 'none',
        ...(joined === 'left' ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 } : {}),
        ...(joined === 'right' ? { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: -1 } : {}),
      }}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function CaretIcon(): JSX.Element {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
      <path d="M1 2.5h6L4 6z" />
    </svg>
  );
}
