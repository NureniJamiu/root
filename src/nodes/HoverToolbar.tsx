/**
 * `HoverToolbar` — the row of action buttons rendered inside a `NodeCard`.
 *
 * The toolbar exposes these actions (design.md §Node UI Layer):
 *   - `add-child`  — insert a new idea connected from this one and open its editor.
 *   - `edit`       — open the `NodeEditor` on this node (images are attached there).
 *   - `cycle-type` — cycle `topic → finding → question → conclusion → topic`.
 *   - `delete`     — open the `DeletePrompt`. The prompt itself bypasses
 *                    the modal when nothing hangs only from this idea.
 *
 * Most buttons dispatch directly through `canvasActions`. The `add-child`
 * action routes through the `ToolbarCallbacks` context so the app layer
 * can compute a non-overlapping initial position via
 * `computeChildPosition` (task 9.2, Requirement 3.2) without the
 * `nodes/` layer having to import from `canvas/` (Requirement 10.3).
 */

import type { ReactNode } from 'react';

import { canvasActions, descendantCount, useCanvasStore } from '../data';
import type { Node, NodeType, UUID } from '../data';

import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  CycleIcon,
  PencilIcon,
  PlusIcon,
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
  const { onAddChild } = useToolbarCallbacks();
  const hasChildren = useCanvasStore(selectHasHideable(node.id));

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
    // R6.3: set collapsed to false (expand affordance).
    canvasActions.setCollapsed(node.id, false);
  };

  return (
    <div
      className="flex flex-row items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      data-testid="hover-toolbar"
    >
      <ToolbarButton label="Add connected idea" onClick={handleAddChild} testId="btn-add-child">
        <PlusIcon />
      </ToolbarButton>
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
      {/* Collapse affordance (R6.1): only when node has children and is not
          collapsed. Expand affordance (R6.3): when node is collapsed. */}
      {node.collapsed ? (
        <ToolbarButton label="Expand connected ideas" onClick={onExpand} testId="btn-expand">
          <ChevronRightIcon />
        </ToolbarButton>
      ) : hasChildren ? (
        <ToolbarButton label="Collapse connected ideas" onClick={onCollapse} testId="btn-collapse">
          <ChevronDownIcon />
        </ToolbarButton>
      ) : null}
      <ToolbarButton
        label="Delete"
        onClick={onDelete}
        testId="btn-delete"
        variant="destructive"
      >
        <CloseIcon />
      </ToolbarButton>
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
}

function ToolbarButton({
  label,
  onClick,
  testId,
  children,
  variant = 'default',
}: ToolbarButtonProps): JSX.Element {
  return (
    <button
      type="button"
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
      className={`inline-flex items-center justify-center rounded-[2px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0051c3] cursor-pointer ${
        variant === 'destructive'
          ? 'hover:bg-[#de5052] hover:text-[#ffffff] hover:border-[#de5052]'
          : 'hover:bg-[#f5f3f3] hover:border-[#000000] hover:text-[#000000]'
      }`}
      style={{
        width: 22,
        height: 22,
        border: '1px solid #ebebeb',
        background: '#ffffff',
        color: '#404040',
        boxShadow: 'none',
      }}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
