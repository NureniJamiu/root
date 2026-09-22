/**
 * `HoverToolbar` — the row of action buttons rendered inside a `NodeCard`.
 *
 * The toolbar exposes five actions (design.md §Node UI Layer):
 *   - `add-child`  — insert a child under this node and open its editor.
 *   - `edit`       — open the `NodeEditor` on this node.
 *   - `add-image`  — open the editor (image upload lives inside `NodeEditor`).
 *   - `cycle-type` — cycle `topic → finding → question → conclusion → topic`.
 *   - `delete`     — open the `DeletePrompt`. The prompt itself bypasses
 *                    the modal for leaves (Requirement 7.1) and enforces
 *                    root-with-children rules (Requirement 7.5).
 *
 * Buttons dispatch through `canvasActions`; no direct store writes. The
 * initial child position used by `add-child` here is a simple offset from
 * the parent — task 9.2 will replace this with `computeChildPosition` for
 * proper non-overlap placement (Requirement 3.2).
 */

import type { ReactNode } from 'react';

import { canvasActions } from '../data';
import type { Node, NodeType } from '../data';

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

/**
 * Offset used when placing a new child near its parent. Task 9.2 replaces
 * this with `computeChildPosition` which guarantees no bounding-box
 * overlap with existing siblings (Requirement 3.2). Kept as a small
 * diagonal shift so the two cards do not perfectly stack in the interim.
 */
const CHILD_OFFSET = { x: 240, y: 120 } as const;

export interface HoverToolbarProps {
  readonly node: Node;
}

export function HoverToolbar({ node }: HoverToolbarProps): JSX.Element {
  const onAddChild = (): void => {
    canvasActions.addChild(node.id, {
      x: node.position.x + CHILD_OFFSET.x,
      y: node.position.y + CHILD_OFFSET.y,
    });
  };
  const onEdit = (): void => {
    canvasActions.openEditor(node.id);
  };
  const onAddImage = (): void => {
    // Image upload lives in the editor; the toolbar button simply opens
    // it. `NodeEditor` (task 11.1) will focus its drop zone in this flow.
    canvasActions.openEditor(node.id);
  };
  const onCycleType = (): void => {
    canvasActions.updateNode(node.id, { type: nextType(node.type) });
  };
  const onDelete = (): void => {
    // Route through the delete prompt; it bypasses the modal for leaves
    // and disables invalid options for root-with-children.
    canvasActions.openDeletePrompt(node.id);
  };

  return (
    <div
      className="flex flex-row gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      data-testid="hover-toolbar"
    >
      <ToolbarButton label="Add child" onClick={onAddChild} testId="btn-add-child">
        +
      </ToolbarButton>
      <ToolbarButton label="Edit" onClick={onEdit} testId="btn-edit">
        ✎
      </ToolbarButton>
      <ToolbarButton label="Add image" onClick={onAddImage} testId="btn-add-image">
        🖼
      </ToolbarButton>
      <ToolbarButton
        label={`Cycle type (current: ${node.type})`}
        onClick={onCycleType}
        testId="btn-cycle-type"
      >
        ⟳
      </ToolbarButton>
      <ToolbarButton label="Delete" onClick={onDelete} testId="btn-delete">
        ✕
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
}

function ToolbarButton({
  label,
  onClick,
  testId,
  children,
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
      className="rounded-xs px-1 text-body transition-colors"
      style={{
        border: '1px solid #404040',
        background: '#ffffff',
        color: '#000000',
      }}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
