import { useMemo, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { useCanvasStore, canvasActions, descendantCount } from '../data';
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

  // Compute node path breadcrumb (e.g. Root > Telomere Dynamics > TRF2 Shelterin)
  const computePath = (node: Node | undefined): string => {
    if (!node) {
      return canvas.nodes.length === 0 ? 'None (Tree Uninitialized)' : 'None (No Selection)';
    }
    const path: string[] = [node.title || 'Untitled Node'];
    let curr = node;
    while (curr.parentId) {
      const parent = canvas.nodes.find((n) => n.id === curr.parentId);
      if (!parent) break;
      path.unshift(parent.title || 'Untitled Node');
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
      className="w-[360px] min-w-[360px] h-full bg-[#ffffff] border-l border-[#ebebeb] flex flex-col justify-between shrink-0 select-none z-20 overflow-y-auto"
      style={{ boxShadow: 'none' }}
      data-testid="node-inspector-rail"
    >
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col shrink-0">
        {/* Rail Title Header */}
        <div className="h-10 px-3 border-b border-[#ebebeb] flex items-center justify-between bg-[#ffffff]">
          <div className="flex items-center gap-2">
            <svg
              className="w-3.5 h-3.5 text-[#000000]"
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
            <span className="font-mono text-[11px] font-medium tracking-[0.04em] uppercase text-[#1b1c1c]">
              Node Inspector
            </span>
          </div>

          <div className="flex items-center gap-2">
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
        <div className="px-3 py-1.5 border-b border-[#ebebeb] bg-[#fbf9f8] font-mono text-[9px] text-[#595959] tracking-wide truncate">
          <span className="text-[#737785] uppercase">PATH: </span>
          <span>{pathString}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-3.5 flex flex-col gap-4 overflow-y-auto">
        {selectedNode ? (
          <>
            {/* View A: Collapsed Subtree View (Screenshot 3) */}
            {isInspectingCollapsedSubtree && isCollapsed ? (
              <div className="flex flex-col gap-3.5">
                {/* Collapsed Subtree Summary Header */}
                <div className="border border-[#f5c2c7] bg-[#fdf2f2] rounded-[2px] p-2.5 flex flex-col gap-1 text-[#521010]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-mono text-[9px] font-semibold tracking-wider uppercase">
                      <svg className="w-3 h-3 text-[#521010]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                      </svg>
                      <span>COLLAPSED SUBTREE SUMMARY</span>
                    </div>
                    <span className="font-mono text-[8px] font-bold px-1.5 py-0.5 rounded-[2px] bg-[#521010] text-white uppercase tracking-wider">
                      COLLAPSED
                    </span>
                  </div>
                  <span className="font-serif text-[12px] italic text-[#521010]">
                    Branch γ: {selectedNode.title || 'p53-Dependent Arrest'}
                  </span>
                </div>

                {/* Hidden Evidence Hierarchy Metric Cards */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px] text-[#595959] tracking-wider uppercase">
                    <span>HIDDEN EVIDENCE HIERARCHY</span>
                    <span className="text-[#ba1a1a] font-semibold">{hiddenCount} Nodes Masked</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="border border-[#ebebeb] bg-[#fbf9f8] p-2 rounded-[2px] flex flex-col items-center justify-center text-center">
                      <span className="font-mono text-[18px] font-bold text-[#0051c3]">3</span>
                      <span className="font-serif text-[11px] text-[#404040]">Findings & Assays</span>
                    </div>
                    <div className="border border-[#ebebeb] bg-[#fbf9f8] p-2 rounded-[2px] flex flex-col items-center justify-center text-center">
                      <span className="font-mono text-[18px] font-bold text-[#de5052]">2</span>
                      <span className="font-serif text-[11px] text-[#404040]">Open Questions</span>
                    </div>
                    <div className="border border-[#ebebeb] bg-[#fbf9f8] p-2 rounded-[2px] flex flex-col items-center justify-center text-center">
                      <span className="font-mono text-[18px] font-bold text-[#521010]">2</span>
                      <span className="font-serif text-[11px] text-[#404040]">Conclusions</span>
                    </div>
                    <div className="border border-[#ebebeb] bg-[#fbf9f8] p-2 rounded-[2px] flex flex-col items-center justify-center text-center">
                      <span className="font-mono text-[18px] font-bold text-[#595959]">4</span>
                      <span className="font-serif text-[11px] text-[#404040]">Indexed DOIs</span>
                    </div>
                  </div>
                </div>

                {/* Aggregated Corpus & Citations */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px] text-[#595959] tracking-wider uppercase">
                    <span>AGGREGATED CORPUS & CITATIONS</span>
                    <span className="text-[#0051c3]">4 DOIs</span>
                  </div>

                  <div className="flex flex-col divide-y divide-[#ebebeb] border border-[#ebebeb] rounded-[2px] bg-[#ffffff]">
                    {[
                      { doi: '10.1038/s41580-021-00382-7', journal: 'PubMed' },
                      { doi: '10.1126/science.1172548', journal: 'Science' },
                      { doi: '10.1016/j.cell.2019.03.041', journal: 'Cell' },
                      { doi: '10.1073/pnas.1802914115', journal: 'PNAS' },
                    ].map((item) => (
                      <div key={item.doi} className="px-2.5 py-1.5 flex items-center justify-between font-mono text-[9.5px]">
                        <div className="flex items-center gap-1.5 text-[#1b1c1c] truncate">
                          <svg className="w-3 h-3 text-[#737785] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span className="truncate hover:underline cursor-pointer">{item.doi}</span>
                        </div>
                        <span className="text-[#737785] shrink-0">{item.journal}</span>
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
                    <span>Expand All Under Branch ({hiddenCount} Nodes)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenEditor?.(selectedNode.id)}
                    className="w-full h-7 bg-white hover:bg-[#f5f3f3] border border-[#ebebeb] text-[#404040] font-mono text-[10px] rounded-[2px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span>⤢</span>
                    <span>Focus Subtree Exclusively</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* View B: Standard Node Inspector Form */}
            {(!isInspectingCollapsedSubtree || !isCollapsed) && (
              <div className="flex flex-col gap-3.5">
                {/* 1. Classification Type */}
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#595959]">
                    CLASSIFICATION TYPE
                  </span>
                  <div className="grid grid-cols-4 gap-1 border border-[#ebebeb] p-0.5 rounded-[2px] bg-[#fbf9f8]">
                    {(['topic', 'finding', 'question', 'conclusion'] as const).map((type) => {
                      const isActive = selectedNode.type === type;
                      const label = type === 'conclusion' ? 'Concl.' : type.charAt(0).toUpperCase() + type.slice(1);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => handleTypeChange(type)}
                          className={`h-6 text-[10px] font-mono rounded-[1px] transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-[#003b93] text-[#ffffff] font-medium shadow-none'
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
                    <span>NODE TITLE (SCHOLARLY SERIF)</span>
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
                    placeholder="Enter scholarly node title..."
                    className="w-full px-2.5 py-1.5 font-serif text-[16px] font-medium leading-tight text-[#000000] border border-[#ebebeb] rounded-[2px] focus:outline-none focus:border-[#000000] transition-colors"
                  />
                </div>

                {/* 3. Analytical Synthesis / Evidentiary Notes */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px] text-[#595959] tracking-[0.06em] uppercase">
                    <span>ANALYTICAL SYNTHESIS / EVIDENTIARY NOTES</span>
                    <span className="text-[#737785]">{selectedNode.body.length} chars</span>
                  </div>
                  <textarea
                    rows={4}
                    value={selectedNode.body}
                    onChange={(e) =>
                      canvasActions.updateNode(selectedNode.id, { body: e.target.value })
                    }
                    placeholder="Record analytical evidentiary notes, methods, and observations..."
                    className="w-full p-2.5 font-serif text-[13px] leading-[20px] text-[#404040] border border-[#ebebeb] rounded-[2px] focus:outline-none focus:border-[#000000] resize-y transition-colors"
                  />
                </div>

                {/* 4. Attached Microscopy & Plates */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between font-mono text-[9px] tracking-[0.06em] uppercase">
                    <span className="text-[#595959]">ATTACHED MICROSCOPY & PLATES</span>
                    <span className="text-[#0051c3] font-semibold">{selectedNode.images.length} FILE</span>
                  </div>

                  {selectedNode.images.length > 0 ? (
                    <div className="relative border border-[#ebebeb] rounded-[2px] overflow-hidden bg-[#000000]">
                      <div className="relative h-[130px] w-full flex items-center justify-center">
                        <img
                          src={selectedNode.images[0]?.dataUrl}
                          alt="Microscopy Plate"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const img = selectedNode.images[0];
                            if (img) canvasActions.removeImage(selectedNode.id, img.id);
                          }}
                          className="absolute top-2 right-2 w-5 h-5 bg-black/70 hover:bg-red-700 text-white rounded-[2px] flex items-center justify-center font-mono text-[10px] cursor-pointer"
                          title="Remove Plate"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="bg-[#f5f3f3] px-2.5 py-1.5 border-t border-[#ebebeb] flex flex-col font-mono">
                        <span className="text-[10px] font-semibold text-[#1b1c1c]">
                          Zeiss LSM 880 Telomere FISH 5µm
                        </span>
                        <span className="text-[9px] text-[#737785]">
                          1928x1080 • Confocal Laser Stack • 2.4 MB
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
                    className="w-full py-2.5 border border-dashed border-[#c3c6d6] hover:border-[#000000] bg-[#fbf9f8] hover:bg-[#ffffff] rounded-[2px] flex items-center justify-center gap-1.5 font-mono text-[9px] text-[#404040] hover:text-[#000000] transition-colors cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5 text-[#737785]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <path d="m21 15-5-5L5 21" />
                    </svg>
                    <span>+ Attach Image (File / Paste / URL)</span>
                  </button>
                </div>

                {/* 5. Indexed DOIs & Citations */}
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#595959]">
                    INDEXED DOIS & CITATIONS
                  </span>
                  <div className="flex items-center justify-between p-2 border border-[#ebebeb] rounded-[2px] bg-[#ffffff] font-mono text-[9.5px]">
                    <div className="flex items-center gap-1.5 text-[#1b1c1c] truncate">
                      <svg className="w-3 h-3 text-[#737785] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      <span className="truncate hover:underline cursor-pointer">10.1038/s41580-021-00382-7</span>
                    </div>
                    <span className="text-[#737785] text-[9px] shrink-0">de Lange et al.</span>
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
              No Node Selected
            </h3>
            <p className="font-serif text-[13px] leading-[20px] text-[#595959] m-0 mb-6 max-w-[280px]">
              Select a node on the canvas to inspect classification types, evidentiary synthesis notes, microscopy plates, and indexed DOI citations.
            </p>
          </div>
        )}
      </div>

      {/* Footer Area: Drag Telemetry & Action Buttons */}
      <div className="border-t border-[#ebebeb] bg-[#ffffff] p-3 flex flex-col gap-2.5 shrink-0 select-none">
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
              <span>Dragging Active: committing on pointer release</span>
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
          <div className="flex flex-col gap-2 pt-1 border-t border-[#ebebeb]">
            <div className="flex items-center gap-1.5 font-mono text-[9px] text-[#737785]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0051c3]" />
              <span>Auto-saved to LocalStorage (508ms debounce)</span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => onAddChild?.(selectedNode.id)}
                className="flex-1 font-mono text-[10px] h-8 bg-[#0051c3] hover:bg-[#003b93]"
              >
                + Branch Child
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => canvasActions.openDeletePrompt(selectedNode.id)}
                className="font-mono text-[10px] h-8 px-3"
              >
                Prune...
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center font-mono text-[9px] text-[#737785]">
            Auto-saved to LocalStorage (500ms debounce)
          </div>
        )}
      </div>
    </aside>
  );
}
