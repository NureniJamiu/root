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
 * - Classification badge
 * - Scholarly Serif typography for titles and evidentiary notes
 * - Microscopy plate image preview with title/caption overlay
 * - Branch / child stats and collapsed subtree indicators
 */

import { memo } from 'react';
import { Handle, Position as RFPosition } from 'reactflow';
import type { NodeProps } from 'reactflow';

import { formatNodeLabel, nodeOrdinal, useCanvasStore } from '../data';
import type { Node, UUID } from '../data';

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
  const childCount = useCanvasStore(
    (s) => s.canvas.nodes.reduce((n, c) => (c.parentId === data.nodeId ? n + 1 : n), 0),
  );
  const ordinal = useCanvasStore((s) => nodeOrdinal(s.canvas, data.nodeId));

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
          <span className="text-[#a0c4ff]">snaps to 20px</span>
        </div>
      )}

      {/* Target handles: Incoming edges on all 4 sides */}
      <Handle
        id="target-left"
        type="target"
        position={RFPosition.Left}
        isConnectable={true}
        isConnectableStart={true}
        isConnectableEnd={true}
        className={`w-3 h-3 !bg-[#ffffff] hover:!bg-[#0051c3] !border-[1.5px] !border-[#0051c3] rounded-full transition-all duration-150 cursor-crosshair ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        } z-30`}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
        data-testid="handle-target-left"
      />
      <Handle
        id="target-right"
        type="target"
        position={RFPosition.Right}
        isConnectable={true}
        isConnectableStart={true}
        isConnectableEnd={true}
        className={`w-3 h-3 !bg-[#ffffff] hover:!bg-[#0051c3] !border-[1.5px] !border-[#0051c3] rounded-full transition-all duration-150 cursor-crosshair ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        } z-30`}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
        data-testid="handle-target-right"
      />
      <Handle
        id="target-top"
        type="target"
        position={RFPosition.Top}
        isConnectable={true}
        isConnectableStart={true}
        isConnectableEnd={true}
        className={`w-3 h-3 !bg-[#ffffff] hover:!bg-[#0051c3] !border-[1.5px] !border-[#0051c3] rounded-full transition-all duration-150 cursor-crosshair ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        } z-30`}
        style={{ left: '50%', transform: 'translateX(-50%)' }}
        data-testid="handle-target-top"
      />
      <Handle
        id="target-bottom"
        type="target"
        position={RFPosition.Bottom}
        isConnectable={true}
        isConnectableStart={true}
        isConnectableEnd={true}
        className={`w-3 h-3 !bg-[#ffffff] hover:!bg-[#0051c3] !border-[1.5px] !border-[#0051c3] rounded-full transition-all duration-150 cursor-crosshair ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        } z-30`}
        style={{ left: '50%', transform: 'translateX(-50%)' }}
        data-testid="handle-target-bottom"
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

      {/* Inner Card Body with nodrag so typing and clicking do not drag the node */}
      <div className="p-3 flex flex-col gap-2 nodrag">
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
          {node.collapsed ? (
            <CollapseBadge nodeId={node.id} />
          ) : (
            <span>
              {childCount > 0 ? `${childCount} ${childCount === 1 ? 'sub-idea' : 'sub-ideas'}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Source handles: Outgoing edges on all 4 sides */}
      <Handle
        id="source-right"
        type="source"
        position={RFPosition.Right}
        isConnectable={true}
        isConnectableStart={true}
        isConnectableEnd={true}
        className={`w-3 h-3 !bg-[#ffffff] hover:!bg-[#0051c3] !border-[1.5px] !border-[#0051c3] rounded-full transition-all duration-150 cursor-crosshair ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        } z-20`}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
        data-testid="handle-source-right"
      />
      <Handle
        id="source-left"
        type="source"
        position={RFPosition.Left}
        isConnectable={true}
        isConnectableStart={true}
        isConnectableEnd={true}
        className={`w-3 h-3 !bg-[#ffffff] hover:!bg-[#0051c3] !border-[1.5px] !border-[#0051c3] rounded-full transition-all duration-150 cursor-crosshair ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        } z-20`}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
        data-testid="handle-source-left"
      />
      <Handle
        id="source-top"
        type="source"
        position={RFPosition.Top}
        isConnectable={true}
        isConnectableStart={true}
        isConnectableEnd={true}
        className={`w-3 h-3 !bg-[#ffffff] hover:!bg-[#0051c3] !border-[1.5px] !border-[#0051c3] rounded-full transition-all duration-150 cursor-crosshair ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        } z-20`}
        style={{ left: '50%', transform: 'translateX(-50%)' }}
        data-testid="handle-source-top"
      />
      <Handle
        id="source-bottom"
        type="source"
        position={RFPosition.Bottom}
        isConnectable={true}
        isConnectableStart={true}
        isConnectableEnd={true}
        className={`w-3 h-3 !bg-[#ffffff] hover:!bg-[#0051c3] !border-[1.5px] !border-[#0051c3] rounded-full transition-all duration-150 cursor-crosshair ${
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
        } z-20`}
        style={{ left: '50%', transform: 'translateX(-50%)' }}
        data-testid="handle-source-bottom"
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
  readonly isConclusion: boolean;
}

function Header({ node, isConclusion }: HeaderProps): JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      {/* Upper metadata row: Type Pill, Status Pill & Actions */}
      <div className="flex flex-row items-center justify-between gap-1">
        <div className="flex items-center gap-1.5">
          <TypeBadge type={node.type} />
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
