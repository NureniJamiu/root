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
  const isConclusion = node.type === 'conclusion';

  return (
    <div
      className="group transition-all duration-150"
      style={{
        border: `${borderWidth}px solid ${borderColor}`,
        background: style.background,
        color: style.text,
        borderRadius: 2,
        boxShadow: 'none',
        minWidth: 220,
        maxWidth: 320,
        padding: '10px 12px',
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

      <Header node={node} isConclusion={isConclusion} />
      <BodyPreview body={node.body} isConclusion={isConclusion} />
      <ImageThumbStrip images={node.images} />

      {node.collapsed ? (
        <div className="mt-2.5 flex flex-row justify-end">
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

interface HeaderProps {
  readonly node: Node;
  readonly isConclusion: boolean;
}

function Header({ node, isConclusion }: HeaderProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Upper metadata row: Type Pill & Hover Toolbar */}
      <div className="flex flex-row items-center justify-between gap-1">
        <TypeBadge type={node.type} isConclusion={isConclusion} />
        <HoverToolbar node={node} />
      </div>

      {/* Title */}
      <div
        className={`font-serif leading-tight ${isConclusion ? 'italic' : ''}`}
        data-testid="node-title"
        style={{
          fontSize: '16px',
          fontWeight: 500,
          color: '#000000',
          letterSpacing: '-0.01em',
          wordBreak: 'break-word',
        }}
      >
        {node.title || (
          <span style={{ opacity: 0.45, fontStyle: 'italic' }}>
            Untitled node
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TypeBadge — Architectural classification tag                               */
/* -------------------------------------------------------------------------- */

const BADGE_COLOR_MAP: Record<Node['type'], { border: string; bg: string; color: string }> = {
  topic: { border: '#0051c3', bg: 'rgba(0, 81, 195, 0.08)', color: '#0051c3' },
  finding: { border: '#2d7a4c', bg: 'rgba(45, 122, 76, 0.08)', color: '#2d7a4c' },
  question: { border: '#de5052', bg: 'rgba(222, 80, 82, 0.08)', color: '#de5052' },
  conclusion: { border: '#521010', bg: 'rgba(82, 16, 16, 0.08)', color: '#521010' },
};

function TypeBadge({
  type,
}: {
  readonly type: Node['type'];
  readonly isConclusion: boolean;
}): JSX.Element {
  const conf = BADGE_COLOR_MAP[type];
  return (
    <div
      className="inline-flex items-center gap-1 select-none font-mono"
      style={{
        fontSize: '9px',
        lineHeight: '12px',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontWeight: 500,
        padding: '2px 5px',
        borderRadius: 2,
        background: conf.bg,
        color: conf.color,
        border: `1px solid ${conf.border}`,
      }}
    >
      <span
        style={{
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: conf.color,
        }}
      />
      {type}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BodyPreview                                                                */
/* -------------------------------------------------------------------------- */

interface BodyPreviewProps {
  readonly body: string;
  readonly isConclusion: boolean;
}

function BodyPreview({ body, isConclusion }: BodyPreviewProps): JSX.Element | null {
  if (body.length === 0) return null;
  const truncated =
    body.length > BODY_PREVIEW_LIMIT
      ? `${body.slice(0, BODY_PREVIEW_LIMIT)}…`
      : body;
  return (
    <p
      className={`mt-1.5 whitespace-pre-wrap leading-[20px] font-serif ${isConclusion ? 'italic' : ''}`}
      data-testid="node-body-preview"
      style={{
        fontSize: '13px',
        color: '#404040',
      }}
    >
      {truncated}
    </p>
  );
}
