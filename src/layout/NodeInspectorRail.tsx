import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  IMAGE_DATA_URL_MAX_BYTES,
  NODE_TITLE_MAX,
  canvasActions,
  computeFacingSides,
  isDuplicateEdge,
  nodeLabel,
  nodeOrdinals,
  subtreeIds,
  useCanvasStore,
} from '../data';
import type { Edge, ImageEntry, Node, NodeType, Side, UUID } from '../data';
import type { DragState } from '../canvas';
import type { SaveStatus } from '../lib/save-queue';
import { Button } from '../ui/Button';
import { formatDataUrlSize, formatDate, formatRelativeTime } from './formatTime';

export interface NodeInspectorRailProps {
  readonly onOpenEditor?: (nodeId: UUID) => void;
  readonly onAddChild?: (parentId: UUID) => void;
  readonly onClose?: () => void;
  readonly dragInfo?: DragState | null;
  /** State of the project's save pipeline; drives the "Saved" indicator. */
  readonly saveStatus?: SaveStatus;
}

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  error: 'Not saved — retrying',
};

function SaveIndicator({ status }: { readonly status: SaveStatus }): JSX.Element {
  return (
    <div
      className="flex items-center gap-1.5 font-mono text-[9px] text-[#737785]"
      role="status"
      data-testid="save-status"
      data-status={status}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'error' ? 'bg-[#ba1a1a]' : status === 'saving' ? 'bg-[#737785]' : 'bg-[#0051c3]'
        }`}
      />
      <span className={status === 'error' ? 'text-[#ba1a1a]' : undefined}>{SAVE_LABELS[status]}</span>
    </div>
  );
}

/** One attached image with its real dimensions and size. */
function ImageAttachment({
  nodeId,
  image,
  index,
}: {
  readonly nodeId: UUID;
  readonly image: ImageEntry;
  readonly index: number;
}): JSX.Element {
  const [dimensions, setDimensions] = useState<string | null>(null);
  return (
    <div className="relative border border-[#ebebeb] rounded-[2px] overflow-hidden bg-[#000000]">
      <div className="relative h-[130px] w-full flex items-center justify-center">
        <img
          src={image.dataUrl}
          alt={`Attached visual ${index + 1}`}
          className="w-full h-full object-cover"
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0) setDimensions(`${img.naturalWidth}×${img.naturalHeight}`);
          }}
        />
        <button
          type="button"
          onClick={() => canvasActions.removeImage(nodeId, image.id)}
          className="absolute top-2 right-2 w-5 h-5 bg-black/70 hover:bg-[#ba1a1a] text-white rounded-[2px] flex items-center justify-center font-mono text-[10px] cursor-pointer"
          title="Remove image"
          aria-label={`Remove image ${index + 1}`}
        >
          ✕
        </button>
      </div>
      <div className="bg-[#f5f3f3] px-2.5 py-1.5 border-t border-[#ebebeb] flex flex-col font-mono">
        <span className="text-[9px] text-[#737785]">
          {dimensions ? `${dimensions} • ` : ''}
          {formatDataUrlSize(image.dataUrl)}
        </span>
      </div>
    </div>
  );
}

const SIDE_OPTIONS: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/** Details of the selected connector: its two cards, the sides it attaches to, and a remove button. */
function ConnectorPanel({
  edge,
  byId,
  labelOf,
  nameOf,
}: {
  readonly edge: Edge;
  readonly byId: ReadonlyMap<UUID, Node>;
  readonly labelOf: (node: Node) => string;
  readonly nameOf: (node: Node) => string;
}): JSX.Element {
  const from = byId.get(edge.source);
  const to = byId.get(edge.target);
  const row = (
    label: string,
    node: Node | undefined,
    side: Side,
    key: 'sourceSide' | 'targetSide',
    pinned: boolean,
  ) => (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col min-w-0">
        <span className="text-[#737785] text-[8.5px] uppercase">
          {label} · {pinned ? 'pinned' : 'auto'}
        </span>
        <span className="font-semibold text-[#1b1c1c] truncate" title={node ? nameOf(node) : undefined}>
          {node ? `${labelOf(node)} ${nameOf(node)}` : 'missing'}
        </span>
      </div>
      <select
        value={side}
        onChange={(e) =>
          canvasActions.updateEdge(edge.id, {
            source: edge.source,
            target: edge.target,
            sourceSide: edge.sourceSide,
            targetSide: edge.targetSide,
            [key]: e.target.value as Side,
            // Choosing a side pins that end.
            [key === 'sourceSide' ? 'sourcePinned' : 'targetPinned']: true,
          })
        }
        className="font-mono text-[9px] bg-white border border-[#ebebeb] rounded-[2px] px-1 py-0.5 text-[#1b1c1c] focus:outline-none focus:border-[#0051c3] cursor-pointer"
        aria-label={`${label} side`}
        data-testid={`connector-${key}`}
      >
        {SIDE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
  return (
    <div className="flex flex-col gap-3" data-testid="connector-panel">
      <div className="border border-[#ebebeb] bg-[#fbf9f8] rounded-[2px] p-2.5 flex flex-col gap-2.5 font-mono text-[9.5px]">
        {row('From', from, edge.sourceSide, 'sourceSide', edge.sourcePinned)}
        {row('To', to, edge.targetSide, 'targetSide', edge.targetPinned)}
      </div>
      <p className="font-serif text-[12px] leading-[18px] text-[#595959] m-0">
        With the connector selected, drag either end to attach it to another card or side. A side you pick stays pinned when the card moves; double-click the connector, or use Auto-route, to let it follow the facing sides again.
      </p>
      <Button
        size="sm"
        variant="secondary"
        disabled={!edge.sourcePinned && !edge.targetPinned}
        onClick={() => canvasActions.autoRouteEdge(edge.id)}
        className="font-mono text-[10px] h-8 justify-center"
        data-testid="btn-auto-route"
      >
        Auto-route
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => canvasActions.removeEdge(edge.id)}
        className="font-mono text-[10px] h-8 justify-center"
        data-testid="btn-remove-connector"
      >
        Remove connector
      </Button>
    </div>
  );
}

export function NodeInspectorRail({
  onOpenEditor,
  onAddChild,
  onClose,
  dragInfo,
  saveStatus = 'saved',
}: NodeInspectorRailProps): JSX.Element {
  const canvas = useCanvasStore((s) => s.canvas);
  const selectionId = useCanvasStore((s) => s.selection.nodeId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const selectedEdgeId = useCanvasStore((s) => s.selection.edgeId);

  // Indexes built once per canvas change, not once per lookup.
  const { byId, ordinals } = useMemo(
    () => ({
      byId: new Map(canvas.nodes.map((n) => [n.id, n])),
      ordinals: nodeOrdinals(canvas),
    }),
    [canvas],
  );

  const selectedNode: Node | undefined = selectionId ? byId.get(selectionId) : undefined;
  const selectedEdge: Edge | undefined =
    !selectedNode && selectedEdgeId ? canvas.edges.find((e) => e.id === selectedEdgeId) : undefined;
  const labelOf = (node: Node): string => nodeLabel(node, ordinals);
  const nameOf = (node: Node): string => node.title || 'Untitled idea';

  const pathString = useMemo(() => {
    if (selectedNode) return selectedNode.title || 'Untitled Idea';
    if (selectedEdge) return 'Connector';
    return canvas.nodes.length === 0 ? 'None (No ideas yet)' : 'None (Select an idea)';
  }, [selectedNode, selectedEdge, canvas.nodes.length]);

  // Every connector that touches the selected idea.
  const connections = useMemo(
    () =>
      selectedNode
        ? canvas.edges.filter((e) => e.source === selectedNode.id || e.target === selectedNode.id)
        : [],
    [canvas.edges, selectedNode],
  );

  // Everything under the selected idea, counted by type.
  const branchStats = useMemo(() => {
    const counts: Record<NodeType, number> = { topic: 0, finding: 0, question: 0, conclusion: 0 };
    let total = 0;
    if (selectedNode) {
      for (const id of subtreeIds(canvas, selectedNode.id)) {
        if (id === selectedNode.id) continue;
        const node = byId.get(id);
        if (node) {
          counts[node.type] += 1;
          total += 1;
        }
      }
    }
    return { counts, total };
  }, [canvas, byId, selectedNode]);

  // Ideas the selected one could still be connected to.
  const connectOptions = useMemo(
    () => (selectedNode ? canvas.nodes.filter((n) => n.id !== selectedNode.id) : []),
    [canvas.nodes, selectedNode],
  );

  const hiddenCount = branchStats.total;
  const isCollapsed = selectedNode?.collapsed ?? false;

  // Check if current selected node is being dragged
  const isSelectedDragging = dragInfo && selectedNode && dragInfo.nodeId === selectedNode.id;

  // Handle classification type change
  const handleTypeChange = (type: NodeType) => {
    if (!selectedNode) return;
    canvasActions.updateNode(selectedNode.id, { type });
  };

  // Read a picked or dropped image file onto the selected idea.
  const attachImage = (file: File | undefined) => {
    if (!file || !selectedNode) return;
    if (!file.type.startsWith('image/')) {
      setImageError('That file is not an image.');
      return;
    }
    const nodeId = selectedNode.id;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      if (reader.result.length > IMAGE_DATA_URL_MAX_BYTES) {
        setImageError('That image is larger than 2 MB. Choose a smaller one.');
        return;
      }
      setImageError(null);
      canvasActions.addImage(nodeId, {
        id: crypto.randomUUID(),
        dataUrl: reader.result,
        addedAt: new Date().toISOString(),
      });
    };
    reader.readAsDataURL(file);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    attachImage(e.target.files?.[0]);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsDropTarget(false);
    attachImage(e.dataTransfer.files[0]);
  };

  return (
    <aside
      className="w-[360px] min-w-[360px] max-w-[360px] h-full bg-[#ffffff] border-l border-[#ebebeb] flex flex-col justify-between shrink-0 select-none z-20 overflow-hidden box-border"
      style={{ boxShadow: 'none' }}
      data-testid="node-inspector-rail"
    >
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col shrink-0">
        {/* Rail Title Header */}
        <div className="h-11 px-4 border-b border-[#ebebeb] flex items-center justify-between bg-[#ffffff] shrink-0">
          <div className="flex items-center gap-2 shrink-0">
            <svg
              className="w-4 h-4 text-[#000000] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="21" y1="10" x2="3" y2="10" />
              <line x1="21" y1="6" x2="3" y2="6" />
              <line x1="21" y1="14" x2="3" y2="14" />
              <line x1="21" y1="18" x2="3" y2="18" />
            </svg>
            <span className="font-mono text-[11px] font-medium tracking-[0.04em] uppercase text-[#1b1c1c] whitespace-nowrap">
              Node Inspector
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selectedNode && (
              <span className="font-mono text-[10px] text-[#1b1c1c] border border-[#ebebeb] bg-[#ffffff] px-1.5 py-0.5 rounded-[2px]">
                {labelOf(selectedNode)}
              </span>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-[2px] text-[#737785] hover:text-[#000000] hover:bg-[#f5f3f3] transition-colors cursor-pointer"
                title="Collapse Inspector (Slide right)"
                aria-label="Collapse Inspector"
                data-testid="btn-close-inspector"
              >
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M15 3v18" />
                  <path d="m10 15 3-3-3-3" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Path Ribbon */}
        <div className="px-4 py-2 border-b border-[#ebebeb] bg-[#fbf9f8] font-mono text-[9px] text-[#595959] tracking-wide truncate shrink-0">
          <span className="text-[#737785] uppercase">SELECTED: </span>
          <span>{pathString}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-4 overflow-y-auto overflow-x-hidden">
        {selectedNode ? (
          <>
            {/* View A: Collapsed Branch View */}
            {isCollapsed ? (
              <div className="flex flex-col gap-3.5">
                {/* Collapsed Branch Summary Header */}
                <div className="border border-[#f5c2c7] bg-[#fdf2f2] rounded-[2px] p-2.5 flex flex-col gap-1 text-[#521010]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-mono text-[9px] font-semibold tracking-wider uppercase">
                      <svg className="w-3 h-3 text-[#521010]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                      </svg>
                      <span>COLLAPSED BRANCH SUMMARY</span>
                    </div>
                    <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded-[2px] bg-[#521010] text-white uppercase tracking-wider">
                      COLLAPSED
                    </span>
                  </div>
                  <span className="font-serif text-[12px] italic text-[#521010]">
                    Branch: {selectedNode.title || 'Sub-Topic'}
                  </span>
                </div>

                {/* Hidden ideas, counted by type */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px] text-[#595959] tracking-wider uppercase">
                    <span>SUB-IDEAS UNDER THIS BRANCH</span>
                    <span className="text-[#ba1a1a] font-semibold">
                      {hiddenCount} Hidden {hiddenCount === 1 ? 'Idea' : 'Ideas'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2" data-testid="branch-stats">
                    {(
                      [
                        ['topic', 'Topics', '#0051c3'],
                        ['finding', 'Findings', '#2d7a4c'],
                        ['question', 'Open Questions', '#de5052'],
                        ['conclusion', 'Conclusions', '#521010'],
                      ] as const
                    ).map(([type, label, color]) => (
                      <div
                        key={type}
                        className="border border-[#ebebeb] bg-[#fbf9f8] p-2 rounded-[2px] flex flex-col items-center justify-center text-center"
                      >
                        <span className="font-mono text-[18px] font-bold" style={{ color }}>
                          {branchStats.counts[type]}
                        </span>
                        <span className="font-serif text-[11px] text-[#404040]">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expand Subtree Action Buttons */}
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => canvasActions.expandSubtree(selectedNode.id)}
                    className="w-full h-8 bg-[#0051c3] hover:bg-[#003b93] text-white font-mono text-[10px] font-medium rounded-[2px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>⇅</span>
                    <span>Expand All Under Branch ({hiddenCount} {hiddenCount === 1 ? 'Idea' : 'Ideas'})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenEditor?.(selectedNode.id)}
                    className="w-full h-7 bg-white hover:bg-[#f5f3f3] border border-[#ebebeb] text-[#404040] font-mono text-[10px] rounded-[2px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>⤢</span>
                    <span>Open in editor</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* View B: Standard Node Inspector Form */}
            {!isCollapsed && (
              <div className="flex flex-col gap-4">
                {/* 1. Classification Type */}
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#595959]">
                    CARD TYPE
                  </span>
                  <div className="grid grid-cols-4 gap-1 border border-[#ebebeb] p-1 rounded-[2px] bg-[#fbf9f8]">
                    {(['topic', 'finding', 'question', 'conclusion'] as const).map((type) => {
                      const isActive = selectedNode.type === type;
                      const label = type === 'conclusion' ? 'Concl.' : type.charAt(0).toUpperCase() + type.slice(1);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleTypeChange(type)}
                          className={`h-7 text-[10px] font-mono rounded-[1px] transition-all cursor-pointer flex items-center justify-center font-medium ${
                            isActive
                              ? 'bg-[#003b93] text-[#ffffff]'
                              : 'text-[#404040] hover:text-[#000000] hover:bg-[#ffffff]'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Node Title Field */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px] text-[#595959] tracking-[0.06em] uppercase">
                    <span>TITLE</span>
                    <span className="text-[#737785]">{selectedNode.title.length}/{NODE_TITLE_MAX}</span>
                  </div>
                  <input
                    type="text"
                    value={selectedNode.title}
                    onChange={(e) =>
                      canvasActions.updateNode(selectedNode.id, {
                        title: e.target.value.slice(0, NODE_TITLE_MAX),
                      })
                    }
                    maxLength={NODE_TITLE_MAX}
                    aria-label="Idea title"
                    placeholder="Give this idea a clear, simple title..."
                    className="w-full px-3 py-2 font-serif text-[15px] font-medium leading-tight text-[#000000] border border-[#ebebeb] bg-[#ffffff] rounded-[2px] focus:outline-none focus:border-[#000000] transition-colors box-border"
                  />
                </div>

                {/* 3. Notes & Details */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px] text-[#595959] tracking-[0.06em] uppercase">
                    <span>NOTES & DETAILS</span>
                    <span className="text-[#737785]">{selectedNode.body.length} chars</span>
                  </div>
                  <textarea
                    rows={4}
                    value={selectedNode.body}
                    onChange={(e) =>
                      canvasActions.updateNode(selectedNode.id, { body: e.target.value })
                    }
                    aria-label="Notes and details"
                    placeholder="Add script notes, key points, talking points, or thoughts..."
                    className="w-full p-3 font-serif text-[13px] leading-[20px] text-[#404040] border border-[#ebebeb] bg-[#ffffff] rounded-[2px] focus:outline-none focus:border-[#000000] resize-y transition-colors box-border"
                  />
                </div>

                {/* 4. Attached Images & Media */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.06em] uppercase">
                    <span className="text-[#595959]">ATTACHED IMAGES & MEDIA</span>
                    <span className="text-[#0051c3] font-semibold">
                      {selectedNode.images.length} {selectedNode.images.length === 1 ? 'FILE' : 'FILES'}
                    </span>
                  </div>

                  {selectedNode.images.map((image, index) => (
                    <ImageAttachment key={image.id} nodeId={selectedNode.id} image={image} index={index} />
                  ))}

                  {/* Attach Button Area */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                    aria-label="Choose an image to attach"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDropTarget(true);
                    }}
                    onDragLeave={() => setIsDropTarget(false)}
                    onDrop={handleDrop}
                    className={`w-full py-3 px-3 border border-dashed hover:border-[#000000] hover:bg-[#ffffff] rounded-[2px] flex items-center justify-center gap-2 font-mono text-[9.5px] text-[#404040] hover:text-[#000000] transition-colors cursor-pointer box-border ${
                      isDropTarget ? 'border-[#0051c3] bg-[#eef3fd]' : 'border-[#c3c6d6] bg-[#fbf9f8]'
                    }`}
                    data-testid="btn-add-image"
                  >
                    <svg className="w-4 h-4 text-[#737785]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    <span>+ Add image (click or drop a file)</span>
                  </button>
                  {imageError && (
                    <p role="alert" className="m-0 font-mono text-[9.5px] text-[#ba1a1a]" data-testid="image-error">
                      {imageError}
                    </p>
                  )}
                </div>

                {/* 5. Connections */}
                <div className="flex flex-col gap-1.5" data-testid="node-inspector-connections">
                  <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.06em]">
                    <span className="text-[#595959]">CONNECTIONS</span>
                    <span className="text-[#0051c3] font-semibold">{connections.length} TOTAL</span>
                  </div>

                  <div className="flex flex-col gap-1 border border-[#ebebeb] rounded-[2px] p-2.5 bg-[#ffffff] font-mono text-[9.5px]">
                    {connections.length === 0 ? (
                      <div className="text-[#737785] italic">
                        Not connected. Drag from a dot on the card&apos;s edge to another card.
                      </div>
                    ) : (
                      connections.map((edge) => {
                        const outgoing = edge.source === selectedNode.id;
                        const other = byId.get(outgoing ? edge.target : edge.source);
                        return (
                          <div
                            key={edge.id}
                            className="flex items-center justify-between gap-2 py-0.5"
                            data-testid={`connection-row-${edge.id}`}
                          >
                            <button
                              type="button"
                              onClick={() => canvasActions.selectEdge(edge.id)}
                              className="flex items-center gap-1.5 min-w-0 text-left bg-transparent border-0 p-0 cursor-pointer hover:text-[#0051c3]"
                              title="Select this connector"
                            >
                              <span className="text-[#737785] shrink-0">{outgoing ? 'OUT →' : 'IN ←'}</span>
                              <span className="font-semibold text-[#1b1c1c] truncate" title={other ? nameOf(other) : undefined}>
                                {other ? `${labelOf(other)} ${nameOf(other)}` : 'missing'}
                              </span>
                              <span className="text-[#737785] shrink-0">
                                ({outgoing ? edge.sourceSide : edge.targetSide} → {outgoing ? edge.targetSide : edge.sourceSide})
                                {edge.sourcePinned || edge.targetPinned ? ' · pinned' : ''}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => canvasActions.removeEdge(edge.id)}
                              className="shrink-0 w-4 h-4 rounded-[2px] text-[#737785] hover:text-white hover:bg-[#ba1a1a] cursor-pointer leading-none"
                              title="Remove this connection"
                              aria-label="Remove connection"
                              data-testid={`connection-remove-${edge.id}`}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : selectedEdge ? (
          <ConnectorPanel edge={selectedEdge} byId={byId} labelOf={labelOf} nameOf={nameOf} />
        ) : (
          /* Empty Selection State */
          <div className="flex flex-col items-center text-center pt-8 pb-4">
            <div className="w-12 h-12 rounded-[2px] bg-[#f5f3f3] border border-[#ebebeb] flex items-center justify-center text-[#737785] mb-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <path d="M10 7h4a2 2 0 0 1 2 2v5" />
              </svg>
            </div>

            <h3 className="font-serif text-[18px] font-normal text-[#000000] m-0 mb-1.5">
              No Idea Selected
            </h3>
            <p className="font-serif text-[13px] leading-[20px] text-[#595959] m-0 mb-6 max-w-[280px]">
              Click any idea card on the canvas to view or edit its notes, change its type, add images, or connect new thoughts. Double-click empty canvas to add an idea.
            </p>
          </div>
        )}
      </div>

      {/* Footer Area: Drag Telemetry & Action Buttons */}
      <div className="border-t border-[#ebebeb] bg-[#ffffff] p-4 flex flex-col gap-3 shrink-0 select-none">
        {selectedNode && (
          <div className="flex flex-col gap-1 font-mono text-[9px] text-[#595959]">
            <div className="flex items-center justify-between gap-2">
              <span>
                IDEA: <strong className="text-[#1b1c1c] font-normal">{labelOf(selectedNode)}</strong>
              </span>
              <span className="truncate">
                LINKS: <strong className="text-[#1b1c1c] font-normal">{connections.length}</strong>
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>CREATED: {formatDate(selectedNode.createdAt) ?? '—'}</span>
              <span>UPDATED: {formatRelativeTime(selectedNode.updatedAt) ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-[#ebebeb]">
              <span className="shrink-0 text-[#595959]">CONNECT TO:</span>
              <select
                value=""
                onChange={(e) => {
                  const targetId = e.target.value;
                  const target = byId.get(targetId);
                  if (!target) return;
                  const sides = computeFacingSides(selectedNode.position, target.position);
                  const ends = { source: selectedNode.id, target: targetId, ...sides };
                  if (isDuplicateEdge(canvas, ends)) return;
                  canvasActions.connect(ends);
                }}
                className="font-mono text-[9px] bg-white border border-[#ebebeb] rounded-[2px] px-1 py-0.5 text-[#1b1c1c] focus:outline-none focus:border-[#0051c3] cursor-pointer max-w-[160px] truncate"
                title="Connect this idea to another one"
                data-testid="connect-to-select"
              >
                <option value="">Choose an idea…</option>
                {connectOptions.map((n) => (
                  <option key={n.id} value={n.id}>
                    {labelOf(n)} {nameOf(n).slice(0, 40)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Real-time Drag Telemetry (Screenshot 2) */}
        {isSelectedDragging && dragInfo ? (
          <div className="flex flex-col gap-2 pt-1 border-t border-[#ebebeb]">
            <div className="flex flex-col gap-1 font-mono text-[9px] text-[#595959]">
              <div className="flex items-center justify-between">
                <span>POSITION: <strong className="text-[#0051c3]">X: {dragInfo.currentX} Y: {dragInfo.currentY}</strong></span>
                <span>DELTA: <strong className="text-[#0051c3]">{dragInfo.dx >= 0 ? `+${dragInfo.dx}` : dragInfo.dx} / {dragInfo.dy >= 0 ? `+${dragInfo.dy}` : dragInfo.dy}</strong></span>
              </div>
              <div className="flex items-center justify-between">
                <span>SNAPPING: <strong>Off (hold Shift)</strong></span>
                <span>STATUS: <strong className="text-[#0051c3]">Dragging</strong></span>
              </div>
            </div>

            <div className="bg-[#eef3fd] border border-[#c3c6d6] text-[#0051c3] px-2 py-1.5 rounded-[2px] font-mono text-[9px] flex items-center justify-center gap-1.5">
              <span>Moving idea: release to place it here</span>
            </div>
          </div>
        ) : selectedNode ? (
          /* Normal Footer State (Screenshot 1) */
          <div className="flex flex-col gap-2.5 pt-2 border-t border-[#ebebeb]">
            <SaveIndicator status={saveStatus} />

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => onAddChild?.(selectedNode.id)}
                className="flex-1 font-mono text-[10px] h-8 bg-[#0051c3] hover:bg-[#003b93] justify-center"
              >
                + Add Connected Idea
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => canvasActions.openDeletePrompt(selectedNode.id)}
                className="font-mono text-[10px] h-8 px-3 justify-center"
              >
                Delete...
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <SaveIndicator status={saveStatus} />
          </div>
        )}
      </div>
    </aside>
  );
}
