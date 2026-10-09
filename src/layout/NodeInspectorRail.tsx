import { useMemo, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useCanvasStore, canvasActions, descendantCount, hasCycle } from '../data';
import type { Node, NodeType, UUID } from '../data';
import type { DragState } from '../canvas';
import { Button } from '../ui/Button';

export interface NodeInspectorRailProps {
  readonly onOpenEditor?: (nodeId: UUID) => void;
  readonly onAddChild?: (parentId: UUID) => void;
  readonly isOpen?: boolean;
  readonly onClose?: () => void;
  readonly dragInfo?: DragState | null;
}

export function NodeInspectorRail({
  onOpenEditor,
  onAddChild,
  onClose,
  dragInfo,
}: NodeInspectorRailProps): JSX.Element {
  const canvas = useCanvasStore((s) => s.canvas);
  const selectionId = useCanvasStore((s) => s.selection.nodeId);
  const selectedNode = canvas.nodes.find((n) => n.id === selectionId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute node path breadcrumb
  const computePath = (node: Node | undefined): string => {
    if (!node) {
      return canvas.nodes.length === 0 ? 'None (No ideas yet)' : 'None (Select an idea)';
    }
    const path: string[] = [node.title || 'Untitled Idea'];
    let curr = node;
    while (curr.parentId) {
      const parent = canvas.nodes.find((n) => n.id === curr.parentId);
      if (!parent) break;
      path.unshift(parent.title || 'Untitled Idea');
      curr = parent;
    }
    return path.join(' > ');
  };

  const pathString = computePath(selectedNode);

  // Short ID for display (e.g. N-04 or ROOT-01)
  const shortId = useMemo(() => {
    if (!selectedNode) return 'N-00';
    if (selectedNode.parentId === null) return 'ROOT-01';
    return `N-${selectedNode.id.slice(0, 2).toUpperCase()}`;
  }, [selectedNode]);

  const parentShortId = useMemo(() => {
    if (!selectedNode || !selectedNode.parentId) return 'none';
    const parent = canvas.nodes.find((n) => n.id === selectedNode.parentId);
    if (!parent) return 'none';
    return parent.parentId === null ? 'node_root_01' : `node_${parent.id.slice(0, 6)}`;
  }, [canvas.nodes, selectedNode]);

  const nodeIdFormatted = selectedNode ? `node_${selectedNode.id.slice(0, 6)}` : 'none';

  // Subtree metrics
  const isCollapsed = selectedNode?.collapsed;
  const hiddenCount = selectedNode ? descendantCount(canvas, selectedNode.id) : 0;
  const isInspectingCollapsedSubtree = selectedNode && (isCollapsed || hiddenCount > 0);

  // Check if current selected node is being dragged
  const isSelectedDragging = dragInfo && selectedNode && dragInfo.nodeId === selectedNode.id;

  // Handle classification type change
  const handleTypeChange = (type: NodeType) => {
    if (!selectedNode) return;
    canvasActions.updateNode(selectedNode.id, { type });
  };

  // Handle image upload
  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedNode) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        canvasActions.addImage(selectedNode.id, {
          id: crypto.randomUUID(),
          dataUrl: reader.result,
          addedAt: new Date().toISOString(),
        });
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
                {shortId}
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
          <span className="text-[#737785] uppercase">PATH: </span>
          <span>{pathString}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-4 overflow-y-auto overflow-x-hidden">
        {selectedNode ? (
          <>
            {/* View A: Collapsed Branch View */}
            {isInspectingCollapsedSubtree && isCollapsed ? (
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

                {/* Hidden Points Metric Cards */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px] text-[#595959] tracking-wider uppercase">
                    <span>SUB-IDEAS UNDER THIS BRANCH</span>
                    <span className="text-[#ba1a1a] font-semibold">{hiddenCount} Hidden Points</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="border border-[#ebebeb] bg-[#fbf9f8] p-2 rounded-[2px] flex flex-col items-center justify-center text-center">
                      <span className="font-mono text-[18px] font-bold text-[#0051c3]">3</span>
                      <span className="font-serif text-[11px] text-[#404040]">Key Points</span>
                    </div>
                    <div className="border border-[#ebebeb] bg-[#fbf9f8] p-2 rounded-[2px] flex flex-col items-center justify-center text-center">
                      <span className="font-mono text-[18px] font-bold text-[#de5052]">2</span>
                      <span className="font-serif text-[11px] text-[#404040]">Open Questions</span>
                    </div>
                    <div className="border border-[#ebebeb] bg-[#fbf9f8] p-2 rounded-[2px] flex flex-col items-center justify-center text-center">
                      <span className="font-mono text-[18px] font-bold text-[#521010]">2</span>
                      <span className="font-serif text-[11px] text-[#404040]">Takeaways</span>
                    </div>
                    <div className="border border-[#ebebeb] bg-[#fbf9f8] p-2 rounded-[2px] flex flex-col items-center justify-center text-center">
                      <span className="font-mono text-[18px] font-bold text-[#595959]">4</span>
                      <span className="font-serif text-[11px] text-[#404040]">References</span>
                    </div>
                  </div>
                </div>

                {/* References & Links */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px] text-[#595959] tracking-wider uppercase">
                    <span>SAVED REFERENCES & LINKS</span>
                    <span className="text-[#0051c3]">4 Links</span>
                  </div>

                  <div className="flex flex-col divide-y divide-[#ebebeb] border border-[#ebebeb] rounded-[2px] bg-[#ffffff]">
                    {[
                      { ref: 'youtube.com/watch?v=creative-habits', label: 'Video Guide' },
                      { ref: 'notion.so/creative-brief-outline', label: 'Script Notes' },
                      { ref: 'medium.com/storytelling-for-video', label: 'Article' },
                      { ref: 'drive.google.com/asset-package-v1', label: 'Assets' },
                    ].map((item) => (
                      <div key={item.ref} className="px-2.5 py-1.5 flex items-center justify-between font-mono text-[9.5px]">
                        <div className="flex items-center gap-1.5 text-[#1b1c1c] truncate">
                          <svg className="w-3 h-3 text-[#737785] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span className="truncate hover:underline cursor-pointer">{item.ref}</span>
                        </div>
                        <span className="text-[#737785] shrink-0">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Expand Subtree Action Buttons */}
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => canvasActions.setCollapsed(selectedNode.id, false)}
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
                    <span>Focus on This Branch Only</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* View B: Standard Node Inspector Form */}
            {(!isInspectingCollapsedSubtree || !isCollapsed) && (
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
                              ? 'bg-[#003b93] text-[#ffffff] shadow-sm'
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
                    <span className="text-[#737785]">{selectedNode.title.length}/128</span>
                  </div>
                  <input
                    type="text"
                    value={selectedNode.title}
                    onChange={(e) =>
                      canvasActions.updateNode(selectedNode.id, {
                        title: e.target.value.slice(0, 128),
                      })
                    }
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
                    placeholder="Add script notes, key points, talking points, or thoughts..."
                    className="w-full p-3 font-serif text-[13px] leading-[20px] text-[#404040] border border-[#ebebeb] bg-[#ffffff] rounded-[2px] focus:outline-none focus:border-[#000000] resize-y transition-colors box-border"
                  />
                </div>

                {/* 4. Attached Images & Media */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.06em] uppercase">
                    <span className="text-[#595959]">ATTACHED IMAGES & MEDIA</span>
                    <span className="text-[#0051c3] font-semibold">{selectedNode.images.length} FILE</span>
                  </div>

                  {selectedNode.images.length > 0 ? (
                    <div className="relative border border-[#ebebeb] rounded-[2px] overflow-hidden bg-[#000000]">
                      <div className="relative h-[130px] w-full flex items-center justify-center">
                        <img
                          src={selectedNode.images[0]?.dataUrl}
                          alt="Attached Visual"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const img = selectedNode.images[0];
                            if (img) canvasActions.removeImage(selectedNode.id, img.id);
                          }}
                          className="absolute top-2 right-2 w-5 h-5 bg-black/70 hover:bg-red-700 text-white rounded-[2px] flex items-center justify-center font-mono text-[10px] cursor-pointer"
                          title="Remove Image"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="bg-[#f5f3f3] px-2.5 py-1.5 border-t border-[#ebebeb] flex flex-col font-mono">
                        <span className="text-[10px] font-semibold text-[#1b1c1c]">
                          Thumbnail / Visual Concept
                        </span>
                        <span className="text-[9px] text-[#737785]">
                          1920x1080 • Visual Asset • 1.2 MB
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {/* Attach Button Area */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-3 px-3 border border-dashed border-[#c3c6d6] hover:border-[#000000] bg-[#fbf9f8] hover:bg-[#ffffff] rounded-[2px] flex items-center justify-center gap-2 font-mono text-[9.5px] text-[#404040] hover:text-[#000000] transition-colors cursor-pointer box-border"
                  >
                    <svg className="w-4 h-4 text-[#737785]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    <span>+ Add Image (Upload, Paste, or Drop)</span>
                  </button>
                </div>

                {/* 5. Connections */}
                <div className="flex flex-col gap-1.5" data-testid="node-inspector-connections">
                  <div className="flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.06em]">
                    <span className="text-[#595959]">CONNECTIONS</span>
                    <span className="text-[#0051c3] font-semibold">
                      {(selectedNode.parentId !== null ? 1 : 0) + canvas.nodes.filter((n) => n.parentId === selectedNode.id).length} TOTAL
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 border border-[#ebebeb] rounded-[2px] p-2.5 bg-[#ffffff] font-mono text-[9.5px]">
                    {/* Incoming (Parent) */}
                    {selectedNode.parentId !== null ? (
                      <div className="flex items-center justify-between py-1 border-b border-[#f0eded]">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-[#737785]">IN:</span>
                          <span className="font-semibold text-[#1b1c1c]">{parentShortId}</span>
                          <span className="text-[#737785]">
                            ({selectedNode.sourceSide ?? 'auto'} → {selectedNode.targetSide ?? 'auto'})
                          </span>
                        </div>
                        {selectedNode.targetPinned ? (
                          <span className="text-[8px] px-1 py-0.5 rounded-[2px] bg-[#fff3cd] text-[#856404] border border-[#ffeeba]">
                            PINNED
                          </span>
                        ) : (
                          <span className="text-[8px] text-[#737785]">AUTO</span>
                        )}
                      </div>
                    ) : (
                      <div className="py-1 border-b border-[#f0eded] text-[#737785] italic">
                        Root idea (no parent)
                      </div>
                    )}

                    {/* Outgoing (Children) */}
                    {canvas.nodes.filter((n) => n.parentId === selectedNode.id).length > 0 ? (
                      <div className="flex flex-col gap-1 pt-1">
                        <span className="text-[#737785] text-[8.5px]">OUTGOING BRANCHES:</span>
                        {canvas.nodes
                          .filter((n) => n.parentId === selectedNode.id)
                          .map((child) => (
                            <div key={child.id} className="flex items-center justify-between">
                              <span className="text-[#1b1c1c] font-medium">
                                N-{child.id.slice(0, 2).toUpperCase()}: {child.title ? child.title.slice(0, 16) : child.type}
                              </span>
                              <span className="text-[#737785]">
                                ({child.sourceSide ?? 'auto'} → {child.targetSide ?? 'auto'})
                              </span>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <div className="pt-1 text-[#737785] italic">
                        No sub-ideas attached
                      </div>
                    )}
                  </div>
                </div>

                {/* 6. Saved References & Links */}
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#595959]">
                    SAVED REFERENCES & LINKS
                  </span>
                  <div className="flex items-center justify-between p-2.5 border border-[#ebebeb] rounded-[2px] bg-[#ffffff] font-mono text-[9.5px]">
                    <div className="flex items-center gap-1.5 text-[#1b1c1c] truncate">
                      <svg className="w-3.5 h-3.5 text-[#737785] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      <span className="truncate hover:underline cursor-pointer">youtube.com/watch?v=creative-habits</span>
                    </div>
                    <span className="text-[#737785] text-[9px] shrink-0">Video Link</span>
                  </div>
                </div>
              </div>
            )}
          </>
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
              Click any idea card on the canvas to view or edit its notes, change its type, add images, or connect new thoughts.
            </p>
          </div>
        )}
      </div>

      {/* Footer Area: Drag Telemetry & Action Buttons */}
      <div className="border-t border-[#ebebeb] bg-[#ffffff] p-4 flex flex-col gap-3 shrink-0 select-none">
        {selectedNode && (
          <div className="flex flex-col gap-1 font-mono text-[9px] text-[#595959]">
            <div className="flex items-center justify-between">
              <span>ID: <strong className="text-[#1b1c1c] font-normal">{nodeIdFormatted}</strong></span>
              <span>PARENT: <strong className="text-[#1b1c1c] font-normal">{parentShortId}</strong></span>
            </div>
            <div className="flex items-center justify-between">
              <span>CREATED: 2025-02-14</span>
              <span>UPDATED: Just now</span>
            </div>
            {selectedNode.parentId !== null && (
              <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-[#ebebeb]">
                <span className="shrink-0 text-[#595959]">CONNECT UNDER:</span>
                <select
                  value={selectedNode.parentId ?? ''}
                  onChange={(e) => {
                    const newParent = e.target.value;
                    if (newParent && newParent !== selectedNode.parentId) {
                      canvasActions.reparentChild(selectedNode.id, newParent);
                    }
                  }}
                  className="font-mono text-[9px] bg-white border border-[#ebebeb] rounded-[2px] px-1 py-0.5 text-[#1b1c1c] focus:outline-none focus:border-[#0051c3] cursor-pointer max-w-[160px] truncate"
                  title="Connect under a different parent idea"
                  data-testid="reconnect-parent-select"
                >
                  {canvas.nodes
                    .filter((n) => n.id !== selectedNode.id && !hasCycle(canvas, selectedNode.id, n.id))
                    .map((n) => {
                      const label = n.parentId === null
                        ? `ROOT: ${n.title ? n.title.slice(0, 16) : 'Main Idea'}`
                        : `N-${n.id.slice(0, 2).toUpperCase()}: ${n.title ? n.title.slice(0, 14) : n.type}`;
                      return (
                        <option key={n.id} value={n.id}>
                          {label}
                        </option>
                      );
                    })}
                </select>
              </div>
            )}
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
                <span>SNAPPING: <strong>20px Grid</strong></span>
                <span>STATUS: <strong className="text-[#0051c3]">Dragging</strong></span>
              </div>
            </div>

            <div className="bg-[#eef3fd] border border-[#c3c6d6] text-[#0051c3] px-2 py-1.5 rounded-[2px] font-mono text-[9px] flex items-center justify-center gap-1.5">
              <span className="animate-spin text-[11px]">↻</span>
              <span>Moving idea: release to place here</span>
            </div>

            <button
              type="button"
              disabled
              className="w-full h-8 bg-[#4472c4] text-white font-mono text-[10px] font-medium rounded-[2px] flex items-center justify-center gap-1.5 cursor-not-allowed opacity-90"
            >
              <span>✋</span>
              <span>Repositioning Active...</span>
            </button>
          </div>
        ) : selectedNode ? (
          /* Normal Footer State (Screenshot 1) */
          <div className="flex flex-col gap-2.5 pt-2 border-t border-[#ebebeb]">
            <div className="flex items-center gap-1.5 font-mono text-[9px] text-[#737785]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0051c3]" />
              <span>Saved automatically</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => onAddChild?.(selectedNode.id)}
                className="flex-1 font-mono text-[10px] h-8 bg-[#0051c3] hover:bg-[#003b93] justify-center"
              >
                + Add Sub-Idea
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
          <div className="text-center font-mono text-[9px] text-[#737785]">
            Saved automatically
          </div>
        )}
      </div>
    </aside>
  );
}
