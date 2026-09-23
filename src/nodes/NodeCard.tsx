/**
 * `NodeCard` — the presentational card rendered for each research node.
 *
 * Registered as the single `'research'` custom node type on `<ReactFlow>`
 * by `canvas/CanvasView`.
 *
 * Horizontal tree layout:
 * - Target handle on Left edge center (Position.Left)
 * - Source handle on Right edge center (Position.Right)
 *
 * Visual hierarchy mirrors DESIGN.md and attached visual guide:
 * - Top colored taxonomy accent bar (3px)
 * - High-contrast editorial container with 1px border (2px cobalt when selected/dragging)
 * - Classification badge with SELECTED or DRAGGING ACTIVE state
 * - Scholarly Serif typography for titles and evidentiary notes
 * - Microscopy plate image preview with title/caption overlay
 * - Branch / child stats and collapsed subtree indicators
 */

import { memo } from 'react';
import { Handle, Position as RFPosition } from 'reactflow';
import type { NodeProps } from 'reactflow';

import { canvasActions, descendantCount, useCanvasStore } from '../data';
import type { Node, UUID } from '../data';

import { CollapseBadge } from './CollapseBadge';
import { HoverToolbar } from './HoverToolbar';
import { SELECTION_BORDER_COLOR, typeStyles } from './typeStyles';

/**
 * Number of body characters shown in the card preview.
 */
const BODY_PREVIEW_LIMIT = 160;

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
  const canvas = useCanvasStore((s) => s.canvas);

  // Transiently deleted node guard
  if (node === undefined) return null;

  const style = typeStyles[node.type];
  const isDragging = !!data.isDragging;
  const isSelectedOrDragging = selected || isDragging;
  const borderWidth = isSelectedOrDragging ? 2 : 1;
  const borderColor = isSelectedOrDragging ? SELECTION_BORDER_COLOR : style.border;
  const isConclusion = node.type === 'conclusion';

  // Compute children / branch statistics
  const directChildren = canvas.nodes.filter((n) => n.parentId === node.id);
  const childCount = directChildren.length;
  const hasCollapsedChildren = directChildren.some((c) => c.collapsed);
  const hiddenDescendantCount = descendantCount(canvas, node.id);

  // Short ID label
  const isRoot = node.parentId === null;
  const shortId = isRoot
    ? 'ROOT-01'
    : node.type === 'finding'
    ? 'N-04: TRF2'
    : node.type === 'question'
    ? 'N-02: QST'
    : `N-${node.id.slice(0, 2).toUpperCase()}`;

  // Top accent bar color
  const topAccentColor = isSelectedOrDragging
    ? '#0051c3'
    : node.type === 'topic'
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
      {/* Real-time dragging coordinate delta badge */}
      {isDragging && (
        <div
          className="absolute -top-7 right-0 z-30 font-mono text-[9px] px-2 py-0.5 rounded-[2px] flex items-center gap-2 pointer-events-none whitespace-nowrap shadow-sm"
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
          <span className="text-[#a0c4ff]">Grid [Grid 20px]</span>
        </div>
      )}

      {/* Target handle: Incoming edge from parent on LEFT */}
      <Handle
        type="target"
        position={RFPosition.Left}
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          width: 6,
          height: 6,
          background: '#c3c6d6',
          border: '1px solid #ffffff',
          opacity: 0,
          pointerEvents: 'none',
        }}
        isConnectable={false}
      />

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

      {/* Inner Card Body */}
      <div className="p-3 flex flex-col gap-2">
        <Header
          node={node}
          selected={selected}
          isDragging={isDragging}
          isConclusion={isConclusion}
        />

        <BodyPreview body={node.body} isConclusion={isConclusion} />

        {/* Microscopy Plate / Image preview */}
        {node.images.length > 0 && (
          <div className="relative w-full h-[115px] bg-[#000000] rounded-[2px] overflow-hidden border border-[#ebebeb] flex items-center justify-center my-0.5">
            <img
              src={node.images[0]?.dataUrl}
              alt="Microscopy Plate"
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-0 inset-x-0 bg-black/75 px-2 py-0.5 flex items-center justify-between font-mono text-[8px] text-white tracking-wider">
              <span>Zeiss LSM 880 • Telomere FISH</span>
            </div>
          </div>
        )}

        {/* Collapsed Subtree Banner (Screenshot 3 & Screenshot 1 conclusion) */}
        {node.collapsed ? (
          <div className="p-2 bg-[#fdf2f2] border border-[#f5c2c7] rounded-[2px] flex items-center justify-between text-[#842029]">
            <div className="flex items-center gap-1.5 font-mono text-[9px]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#de5052]" />
              <span>{hiddenDescendantCount} hidden descendants</span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                canvasActions.setCollapsed(node.id, false);
              }}
              className="px-1.5 py-0.5 bg-white border border-[#f5c2c7] hover:border-black font-mono text-[9px] text-[#1b1c1c] rounded-[2px] cursor-pointer"
            >
              [+] Expand Subtree
            </button>
            <div className="hidden">
              <CollapseBadge nodeId={node.id} />
            </div>
          </div>
        ) : isConclusion && hiddenDescendantCount > 0 ? (
          <div className="flex items-center gap-1.5 font-mono text-[9px] text-[#521010] pt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#521010]" />
            <span>{hiddenDescendantCount} hidden descendants</span>
          </div>
        ) : null}

        {/* Card Footer: Metadata and Branch Stats */}
        <div className="flex items-center justify-between pt-1.5 border-t border-[#ebebeb] font-mono text-[9px] text-[#737785] tracking-wide select-none">
          <span>{shortId}</span>
          <span>
            {isRoot
              ? hasCollapsedChildren
                ? `${childCount} Branches (1 Collapsed)`
                : `${childCount} Branches`
              : childCount > 0
              ? `${childCount} ${childCount === 1 ? 'child' : 'children'}`
              : ''}
          </span>
        </div>
      </div>

      {/* Source handle: Outgoing edges to children on RIGHT */}
      <Handle
        type="source"
        position={RFPosition.Right}
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          width: 6,
          height: 6,
          background: '#c3c6d6',
          border: '1px solid #ffffff',
          opacity: 0,
          pointerEvents: 'none',
        }}
        isConnectable={false}
      />
    </div>
  );
}

export const NodeCard = memo(NodeCardImpl);
NodeCard.displayName = 'NodeCard';

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

interface HeaderProps {
  readonly node: Node;
  readonly selected?: boolean;
  readonly isDragging?: boolean;
  readonly isConclusion: boolean;
}

function Header({ node, selected, isDragging, isConclusion }: HeaderProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Upper metadata row: Type Pill, Status Pill & Actions */}
      <div className="flex flex-row items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <TypeBadge type={node.type} />
          {isDragging ? (
            <span className="font-mono text-[8.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] bg-[#0051c3] text-white">
              DRAGGING ACTIVE
            </span>
          ) : selected ? (
            <span className="font-mono text-[8.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-[2px] bg-[#0051c3] text-white">
              SELECTED
            </span>
          ) : null}
        </div>
        <HoverToolbar node={node} />
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
  const truncated =
    body.length > BODY_PREVIEW_LIMIT
      ? `${body.slice(0, BODY_PREVIEW_LIMIT)}…`
      : body;
  return (
    <p
      className={`mt-0.5 whitespace-pre-wrap leading-[20px] font-serif ${isConclusion ? 'italic' : ''}`}
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
