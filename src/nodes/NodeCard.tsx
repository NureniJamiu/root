/**
 * `NodeCard` — the presentational card rendered for each research node.
 *
 * Registered as the single `'research'` custom node type on `<ReactFlow>`
 * by `canvas/CanvasView`.
 *
 * Connection handles:
 * - Every side (top, right, bottom, left) has a handle, so a connector can be
 *   dragged out of any side and dropped on any side of another card.
 * - Each side carries a source and a target handle at the same spot. Only the
 *   source handle starts a drag; both accept a drop. They are hidden until the
 *   card is hovered or selected, or a connector is being dragged (see the
 *   `.rf-handle` rules in `app/index.css`).
 * - A card takes any number of connectors.
 *
 * Visual hierarchy mirrors DESIGN.md and attached visual guide:
 * - Top colored taxonomy accent bar (3px)
 * - High-contrast editorial container with 1px border (2px cobalt when selected/dragging)
 * - Classification badge
 * - Scholarly Serif typography for titles and evidentiary notes
 * - Microscopy plate image preview with title/caption overlay
 * - Connection count and collapsed-branch indicator
 */

import { Fragment, memo } from 'react';
import { Handle, Position as RFPosition } from 'reactflow';
import type { NodeProps } from 'reactflow';

import { formatNodeLabel, hasHiddenChildren, hiddenDescendantCount, nodeOrdinal, useCanvasStore } from '../data';
import type { Node, Side, UUID } from '../data';

import { CollapseBadge } from './CollapseBadge';
import { HoverToolbar } from './HoverToolbar';
import { SELECTION_BORDER_COLOR, typeStyles } from './typeStyles';

/**
 * The data payload React Flow attaches to a `'research'` node.
 */
export interface NodeCardData {
  readonly nodeId: UUID;
  readonly isDragging?: boolean;
  readonly dx?: number;
  readonly dy?: number;
}

/**
 * Memoized selector: return the `Node` matching `nodeId`.
 */
function selectNode(nodeId: UUID) {
  return (s: { canvas: { nodes: readonly Node[] } }): Node | undefined =>
    s.canvas.nodes.find((n) => n.id === nodeId);
}

function NodeCardImpl(props: NodeProps<NodeCardData>): JSX.Element | null {
  const { data, selected } = props;
  const node = useCanvasStore(selectNode(data.nodeId));
  // Primitive selectors: the card re-renders only when its own numbers change,
  // not on every edit to any other idea.
  const connectionCount = useCanvasStore(
    (s) => s.canvas.edges.reduce((n, e) => (e.source === data.nodeId || e.target === data.nodeId ? n + 1 : n), 0),
  );
  const ordinal = useCanvasStore((s) => nodeOrdinal(s.canvas, data.nodeId));
  // Collapsed, or partway through revealing its connected ideas one at a time.
  const showsHiddenBadge = useCanvasStore(
    (s) => hasHiddenChildren(s.canvas, data.nodeId) && hiddenDescendantCount(s.canvas, data.nodeId) > 0,
  );

  // Transiently deleted node guard
  if (node === undefined) return null;

  const style = typeStyles[node.type];
  const isDragging = !!data.isDragging;
  const isSelectedOrDragging = selected || isDragging;
  const borderWidth = isSelectedOrDragging ? 2 : 1;
  const borderColor = isSelectedOrDragging ? SELECTION_BORDER_COLOR : style.border;
  const isConclusion = node.type === 'conclusion';

  // Short label, unique within the canvas
  const shortId = formatNodeLabel(node, ordinal);

  // Top accent bar color: always the idea's type, so selection is carried by the border alone
  const topAccentColor =
    node.type === 'topic'
      ? '#0051c3'
      : node.type === 'finding'
      ? '#2d7a4c'
      : node.type === 'question'
      ? '#de5052'
      : '#521010';

  return (
    <div
      className="group relative transition-shadow duration-150"
      style={{
        border: `${borderWidth}px solid ${borderColor}`,
        background: '#ffffff',
        color: style.text,
        borderRadius: 2,
        boxShadow: 'none',
        width: 290,
        minWidth: 260,
        maxWidth: 320,
        padding: 0,
        overflow: 'visible',
      }}
      data-testid={`node-card-${node.id}`}
      data-node-type={node.type}
      data-selected={selected ? 'true' : 'false'}
    >
      {/* Actions float above the top-right corner on hover (hidden while dragging,
          where the drag badge takes that spot). */}
      {!isDragging && <HoverToolbar node={node} />}

      {/* Real-time dragging coordinate delta badge */}
      {isDragging && (
        <div
          className="absolute -top-7 right-0 z-30 font-mono text-[9px] px-2 py-0.5 rounded-[2px] flex items-center gap-2 pointer-events-none whitespace-nowrap"
          style={{
            background: '#002566',
            color: '#ffffff',
            border: '1px solid #0051c3',
          }}
        >
          <span>
            dx: {data.dx && data.dx >= 0 ? `+${data.dx}` : data.dx ?? 0}px, dy:{' '}
            {data.dy && data.dy >= 0 ? `+${data.dy}` : data.dy ?? 0}px
          </span>
          <span className="text-[#a0c4ff]">Shift snaps</span>
        </div>
      )}

      <SideHandles />

      {/* Top 3px colored accent bar */}
      <div
        style={{
          height: 3,
          width: '100%',
          background: topAccentColor,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
        }}
      />

      {/* Card body. The whole card is a drag surface; the toolbar buttons stop their own mousedown. */}
      <div className="p-3 flex flex-col gap-2">
        <Header node={node} isConclusion={isConclusion} />

        <BodyPreview body={node.body} isConclusion={isConclusion} />

        {/* Image / Asset preview */}
        {node.images.length > 0 && (
          <div className="relative w-full h-[115px] bg-[#000000] rounded-[2px] overflow-hidden border border-[#ebebeb] flex items-center justify-center my-0.5">
            <img
              src={node.images[0]?.dataUrl}
              alt="Attached Visual"
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 inset-x-0 bg-black/75 px-2 py-0.5 flex items-center justify-between font-mono text-[8px] text-white tracking-wider">
              <span>Visual Asset • Reference</span>
            </div>
          </div>
        )}

        {/* Card Footer: Metadata, Branch Stats, and Clean Collapsed Badge */}
        <div className="flex items-center justify-between pt-1.5 border-t border-[#ebebeb] font-mono text-[9px] text-[#737785] tracking-wide select-none">
          <span>{shortId}</span>
          {node.collapsed || showsHiddenBadge ? (
            <CollapseBadge nodeId={node.id} />
          ) : (
            <span>
              {connectionCount > 0
                ? `${connectionCount} ${connectionCount === 1 ? 'connection' : 'connections'}`
                : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const SIDES: ReadonlyArray<readonly [Side, RFPosition]> = [
  ['top', RFPosition.Top],
  ['right', RFPosition.Right],
  ['bottom', RFPosition.Bottom],
  ['left', RFPosition.Left],
];

/** Source and target handles on all four sides. Styled by `.rf-handle` in `app/index.css`. */
function SideHandles(): JSX.Element {
  return (
    <>
      {SIDES.map(([side, position]) => (
        <Fragment key={side}>
          <Handle
            id={`target-${side}`}
            type="target"
            position={position}
            isConnectableStart={false}
            isConnectableEnd
            className={`rf-handle rf-handle-${side}`}
            data-testid={`handle-target-${side}`}
          />
          <Handle
            id={`source-${side}`}
            type="source"
            position={position}
            isConnectableStart
            isConnectableEnd
            className={`rf-handle rf-handle-${side} rf-handle-source`}
            data-testid={`handle-source-${side}`}
          />
        </Fragment>
      ))}
    </>
  );
}

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
      {/* Upper metadata row: Type Pill */}
      <div className="flex flex-row items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <TypeBadge type={node.type} />
        </div>
      </div>

      {/* Title */}
      <div
        className={`font-serif leading-tight ${isConclusion ? 'italic' : ''}`}
        data-testid="node-title"
        style={{
          fontSize: '16.5px',
          fontWeight: 500,
          color: '#000000',
          letterSpacing: '-0.01em',
          wordBreak: 'break-word',
        }}
      >
        {node.title || (
          <span style={{ opacity: 0.45, fontStyle: 'italic' }}>
            Untitled idea
          </span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* TypeBadge — Architectural classification tag                               */
/* -------------------------------------------------------------------------- */

const BADGE_CONFIG = {
  topic: {
    label: 'TOPIC',
    border: '#0051c3',
    bg: 'rgba(0, 81, 195, 0.08)',
    color: '#0051c3',
  },
  finding: {
    label: 'FINDING',
    border: '#2d7a4c',
    bg: 'rgba(45, 122, 76, 0.1)',
    color: '#2d7a4c',
  },
  question: {
    label: 'QUESTION',
    border: '#de5052',
    bg: 'rgba(222, 80, 82, 0.08)',
    color: '#de5052',
  },
  conclusion: {
    label: 'CONCLUSION',
    border: '#521010',
    bg: 'rgba(82, 16, 16, 0.08)',
    color: '#521010',
  },
} as const;

function TypeBadge({ type }: { readonly type: Node['type'] }): JSX.Element {
  const conf = BADGE_CONFIG[type];
  return (
    <div
      className="inline-flex items-center gap-1 select-none font-mono"
      style={{
        fontSize: '9px',
        lineHeight: '12px',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        fontWeight: 600,
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
      {conf.label}
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
  return (
    <p
      className={`mt-0.5 whitespace-pre-wrap leading-[20px] font-serif ${isConclusion ? 'italic' : ''}`}
      data-testid="node-body-preview"
      style={{
        fontSize: '13px',
        color: '#404040',
        // Clamp to three lines at a word boundary instead of cutting mid-word.
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
        overflowWrap: 'anywhere',
      }}
    >
      {body}
    </p>
  );
}
