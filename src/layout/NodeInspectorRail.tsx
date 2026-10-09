import { useMemo } from 'react';
import { canvasActions, nodeLabel, nodeOrdinals, useCanvasStore } from '../data';
import type { Edge, Node, NodeType, Side, UUID } from '../data';
import type { DragState } from '../canvas';
import type { SaveStatus } from '../lib/save-queue';
import { Button } from '../ui/Button';
import { ImageMosaic } from './ImageGallery';

export interface NodeInspectorRailProps {
  readonly onOpenEditor?: (nodeId: UUID) => void;
  /** No longer used by the read-only inspector; kept so callers still compile. */
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
      className="flex items-center gap-1.5 font-mono text-[9px] text-muted"
      role="status"
      data-testid="save-status"
      data-status={status}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          status === 'error' ? 'bg-danger-fill' : status === 'saving' ? 'bg-muted' : 'bg-accent'
        }`}
      />
      <span className={status === 'error' ? 'text-danger' : undefined}>{SAVE_LABELS[status]}</span>
    </div>
  );
}

const TYPE_LABELS: Record<NodeType, { readonly label: string; readonly color: string }> = {
  topic: { label: 'Topic', color: 'rgb(var(--topic))' },
  finding: { label: 'Finding', color: 'rgb(var(--finding))' },
  question: { label: 'Question', color: 'rgb(var(--question))' },
  conclusion: { label: 'Conclusion', color: 'rgb(var(--conclusion))' },
};

/** Small uppercase heading over a section of the read-only view. */
function SectionLabel({ children }: { readonly children: string }): JSX.Element {
  return (
    <h3 className="m-0 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em] text-faint">{children}</h3>
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
        <span className="text-muted text-[8.5px] uppercase">
          {label} · {pinned ? 'pinned' : 'auto'}
        </span>
        <span className="font-semibold text-ink truncate" title={node ? nameOf(node) : undefined}>
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
        className="font-mono text-[9px] bg-panel border border-rule rounded-[2px] px-1 py-0.5 text-ink focus:outline-none focus:border-topic cursor-pointer"
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
      <div className="border border-rule bg-paper rounded-[2px] p-2.5 flex flex-col gap-2.5 font-mono text-[9.5px]">
        {row('From', from, edge.sourceSide, 'sourceSide', edge.sourcePinned)}
        {row('To', to, edge.targetSide, 'targetSide', edge.targetPinned)}
      </div>
      <p className="font-serif text-[12px] leading-[18px] text-ink-3 m-0">
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

/**
 * The inspector shows the selected idea as a clean read-only page: its type,
 * a large title, its notes and images. Changes are made in the
 * editor, opened with the edit button in the top-right corner. A selected
 * connector gets its own panel.
 */
export function NodeInspectorRail({
  onOpenEditor,
  onClose,
  dragInfo,
  saveStatus = 'saved',
}: NodeInspectorRailProps): JSX.Element {
  const canvas = useCanvasStore((s) => s.canvas);
  const selectionId = useCanvasStore((s) => s.selection.nodeId);
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

  const isSelectedDragging = dragInfo && selectedNode && dragInfo.nodeId === selectedNode.id;
  const type = selectedNode ? TYPE_LABELS[selectedNode.type] : null;

  return (
    <aside
      className="w-[360px] min-w-[360px] max-w-[360px] h-full bg-panel border-l border-rule flex flex-col justify-between shrink-0 select-none z-20 overflow-hidden box-border"
      style={{ boxShadow: 'none' }}
      data-testid="node-inspector-rail"
    >
      {/* Header: name of the pane, edit and close */}
      <div className="h-11 px-4 border-b border-rule flex items-center justify-between bg-panel shrink-0">
        <span className="font-mono text-[11px] font-medium tracking-[0.04em] uppercase text-ink whitespace-nowrap">
          Node Inspector
        </span>

        <div className="flex items-center gap-1 shrink-0">
          {selectedNode && onOpenEditor && (
            <button
              type="button"
              onClick={() => onOpenEditor(selectedNode.id)}
              className="h-7 pl-2 pr-2.5 inline-flex items-center gap-1.5 rounded-[4px] border border-rule-2 bg-panel font-mono text-[10px] text-ink hover:border-ink hover:bg-sunken transition-colors cursor-pointer"
              title="Edit this idea"
              aria-label="Edit this idea"
              data-testid="btn-inspector-edit"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
              Edit
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-[2px] text-muted hover:text-ink-strong hover:bg-sunken transition-colors cursor-pointer"
              title="Collapse Inspector (Slide right)"
              aria-label="Collapse Inspector"
              data-testid="btn-close-inspector"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M15 3v18" />
                <path d="m10 15 3-3-3-3" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-5 py-5 flex flex-col gap-6 overflow-y-auto overflow-x-hidden select-text">
        {selectedNode && type ? (
          <>
            {/* Type and title */}
            <div className="flex flex-col gap-2.5">
              <span
                className="self-start inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium uppercase tracking-[0.08em]"
                style={{ color: type.color }}
                data-testid="inspector-type"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: type.color }} aria-hidden="true" />
                {type.label}
              </span>
              <h2
                className={`m-0 font-serif text-[26px] font-medium leading-[1.2] break-words ${
                  selectedNode.title ? 'text-ink-strong' : 'text-faint italic'
                }`}
                data-testid="inspector-title"
              >
                {nameOf(selectedNode)}
              </h2>
            </div>

            {/* Notes */}
            <section className="flex flex-col gap-2">
              <SectionLabel>Notes</SectionLabel>
              {selectedNode.body.trim() ? (
                <p
                  className="m-0 font-serif text-[14px] leading-[22px] text-ink whitespace-pre-wrap break-words"
                  data-testid="inspector-notes"
                >
                  {selectedNode.body}
                </p>
              ) : (
                <p className="m-0 font-serif text-[13px] italic text-faint" data-testid="inspector-notes">
                  No notes yet.
                </p>
              )}
            </section>

            {/* Images */}
            {selectedNode.images.length > 0 && (
              <section className="flex flex-col gap-2" data-testid="inspector-images">
                <SectionLabel>Images</SectionLabel>
                <ImageMosaic key={selectedNode.id} images={selectedNode.images} />
              </section>
            )}

          </>
        ) : selectedEdge ? (
          <ConnectorPanel edge={selectedEdge} byId={byId} labelOf={labelOf} nameOf={nameOf} />
        ) : (
          /* Empty Selection State */
          <div className="flex flex-col items-center text-center pt-8 pb-4">
            <div className="w-12 h-12 rounded-[2px] bg-sunken border border-rule flex items-center justify-center text-muted mb-3">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
                <path d="M10 7h4a2 2 0 0 1 2 2v5" />
              </svg>
            </div>

            <h3 className="font-serif text-[18px] font-normal text-ink-strong m-0 mb-1.5">
              No Idea Selected
            </h3>
            <p className="font-serif text-[13px] leading-[20px] text-ink-3 m-0 mb-6 max-w-[280px]">
              {canvas.nodes.length === 0
                ? 'Double-click empty canvas, or use Add Idea, to start.'
                : 'Click any idea card on the canvas to read it here.'}
            </p>
          </div>
        )}
      </div>

      {/* Footer: drag position while moving the idea, otherwise the save state */}
      <div className="border-t border-rule bg-panel px-4 py-3 flex flex-col gap-3 shrink-0 select-none">
        {isSelectedDragging && dragInfo ? (
          <div className="flex items-center justify-between font-mono text-[9px] text-ink-3">
            <span>
              POSITION: <strong className="text-topic">X: {dragInfo.currentX} Y: {dragInfo.currentY}</strong>
            </span>
            <span>
              DELTA:{' '}
              <strong className="text-topic">
                {dragInfo.dx >= 0 ? `+${dragInfo.dx}` : dragInfo.dx} / {dragInfo.dy >= 0 ? `+${dragInfo.dy}` : dragInfo.dy}
              </strong>
            </span>
          </div>
        ) : (
          <SaveIndicator status={saveStatus} />
        )}
      </div>
    </aside>
  );
}
