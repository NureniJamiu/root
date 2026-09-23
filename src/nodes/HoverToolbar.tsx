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
 * Most buttons dispatch directly through `canvasActions`. The `add-child`
 * action routes through the `ToolbarCallbacks` context so the app layer
 * can compute a non-overlapping initial position via
 * `computeChildPosition` (task 9.2, Requirement 3.2) without the
 * `nodes/` layer having to import from `canvas/` (Requirement 10.3).
 */

import type { ReactNode } from 'react';

import { canvasActions } from '../data';
import type { Node, NodeType } from '../data';

import { useToolbarCallbacks } from './toolbarCallbacks';

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
      <ToolbarButton label="Add child" onClick={handleAddChild} testId="btn-add-child">
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
