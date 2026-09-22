/**
 * `NodeCard` — the presentational card rendered for each research node.
 *
 * Registered as the single `'research'` custom node type on `<ReactFlow>`
 * by `canvas/CanvasView` (design.md §Canvas Layer). React Flow supplies
 * the wrapper props (`data`, `selected`, `id`, etc.); the card reads its
 * `Node` from the Zustand store by `data.nodeId` using a memoized
 * selector so the card only re-renders when its own node changes.
 *
 * The layout mirrors design.md §Node UI Layer:
 *
 *   ┌─ Header ────────────── HoverToolbar ─┐
 *   │  Title                                │
 *   ├───────────────────────────────────────┤
 *   │  BodyPreview (first N chars)          │
 *   │  ImageThumbStrip                      │
 *   │                       CollapseBadge   │  (only when collapsed)
 *   └───────────────────────────────────────┘
 *
 * Palette is driven by `typeStyles[node.type]`; selection swaps the
 * border to 2 px `#0051c3` per Requirement 11.7. No shadows, radius
 * 5 px (design.md `sm`).
 */

import { memo } from 'react';
import { Handle, Position as RFPosition } from 'reactflow';
import type { NodeProps } from 'reactflow';

import { useCanvasStore } from '../data';
import type { Node, UUID } from '../data';

import { CollapseBadge } from './CollapseBadge';
import { HoverToolbar } from './HoverToolbar';
import { ImageThumbStrip } from './ImageThumbStrip';
import { SELECTION_BORDER_COLOR, typeStyles } from './typeStyles';

/**
 * Number of body characters shown in the card preview. Design.md leaves
 * "first N chars of body" underspecified; 160 fits two lines at the
 * body type scale without pushing the card past a comfortable width.
 */
const BODY_PREVIEW_LIMIT = 160;

/**
 * The data payload React Flow attaches to a `'research'` node. `nodeId`
 * duplicates the RF node id so `NodeCard` can read from the store without
 * threading `id` through both channels (design.md §Node UI Layer types).
 */
export interface NodeCardData {
  readonly nodeId: UUID;
}

/**
 * Memoized selector: return the `Node` matching `nodeId`, or `undefined`
 * when the id has just been removed from the canvas. Kept as a
 * module-level factory so its reference is stable across renders.
 */
function selectNode(nodeId: UUID) {
  return (s: { canvas: { nodes: readonly Node[] } }): Node | undefined =>
    s.canvas.nodes.find((n) => n.id === nodeId);
}

function NodeCardImpl(props: NodeProps<NodeCardData>): JSX.Element | null {
  const { data, selected } = props;
  const node = useCanvasStore(selectNode(data.nodeId));

  // The node can transiently disappear when the user deletes it while
  // React Flow is mid-render. Return `null` rather than crashing; the
  // RF node list will drop this entry on the next tick.
  if (node === undefined) return null;

  const style = typeStyles[node.type];
  const borderWidth = selected ? 2 : 1;
  const borderColor = selected ? SELECTION_BORDER_COLOR : style.border;

  return (
    <div
      className="group rounded-sm transition-colors"
      style={{
        // Fixed inline styles avoid dragging color decisions through
        // Tailwind arbitrary-value classes and keep the class list a
        // pure structural signal (see task 10.3 test).
        border: `${borderWidth}px solid ${borderColor}`,
        background: style.background,
        color: style.text,
        borderRadius: 5,
        // Design.md §Visual Design: flat material, no shadows.
        boxShadow: 'none',
        minWidth: 180,
        maxWidth: 320,
        padding: 8,
        // Compensate the border width delta on selection so the card's
        // outer bounding box does not shift by 1 px.
        margin: selected ? 0 : 1,
      }}
      data-testid={`node-card-${node.id}`}
      data-node-type={node.type}
      data-selected={selected ? 'true' : 'false'}
    >
      {/* Target handle: incoming edge from parent. Hidden but interactive
          so React Flow can attach edges without a visible dot. */}
      <Handle
        type="target"
        position={RFPosition.Top}
        style={{ opacity: 0, pointerEvents: 'none' }}
        isConnectable={false}
      />

      <Header node={node} />
      <BodyPreview body={node.body} />
      <ImageThumbStrip images={node.images} />

      {node.collapsed ? (
        <div className="mt-1 flex flex-row justify-end">
          <CollapseBadge nodeId={node.id} />
        </div>
      ) : null}

      {/* Source handle: outgoing edges to children. */}
      <Handle
        type="source"
        position={RFPosition.Bottom}
        style={{ opacity: 0, pointerEvents: 'none' }}
        isConnectable={false}
      />
    </div>
  );
}

/**
 * `React.memo` short-circuits re-renders when the RF wrapper props are
 * shallowly equal. The store subscription still keeps the card in sync
 * when its `Node` changes, so this memoization only skips renders driven
 * by unrelated changes (sibling drag, viewport pan).
 */
export const NodeCard = memo(NodeCardImpl);
NodeCard.displayName = 'NodeCard';

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

function Header({ node }: { readonly node: Node }): JSX.Element {
  return (
    <div className="flex flex-row items-start justify-between gap-2">
      <div
        className="flex-1 truncate text-body"
        data-testid="node-title"
        style={{ fontWeight: 400 }}
      >
        {node.title || <span style={{ opacity: 0.5 }}>Untitled</span>}
      </div>
      <HoverToolbar node={node} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BodyPreview                                                                */
/* -------------------------------------------------------------------------- */

function BodyPreview({ body }: { readonly body: string }): JSX.Element | null {
  if (body.length === 0) return null;
  const truncated =
    body.length > BODY_PREVIEW_LIMIT
      ? `${body.slice(0, BODY_PREVIEW_LIMIT)}…`
      : body;
  return (
    <p
      className="mt-1 whitespace-pre-wrap text-body"
      data-testid="node-body-preview"
      // color inherits from card container so `conclusion` (white text on
      // accent) renders correctly without a second override.
    >
      {truncated}
    </p>
  );
}
