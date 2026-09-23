import { useCanvasStore, canvasActions } from '../data';
import type { Node, UUID } from '../data';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';

export interface NodeInspectorRailProps {
  readonly onOpenEditor?: (nodeId: UUID) => void;
  readonly onAddChild?: (parentId: UUID) => void;
  readonly isOpen?: boolean;
  readonly onClose?: () => void;
}

export function NodeInspectorRail({
  onOpenEditor,
  onAddChild,
  onClose,
}: NodeInspectorRailProps): JSX.Element {
  const canvas = useCanvasStore((s) => s.canvas);
  const selectionId = useCanvasStore((s) => s.selection.nodeId);
  const selectedNode = canvas.nodes.find((n) => n.id === selectionId);

  // Compute node path breadcrumb
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
    return path.join(' / ');
  };

  const pathString = computePath(selectedNode);

  return (
    <aside
      className="w-[360px] min-w-[360px] h-full bg-[#ffffff] border-l border-[#ebebeb] flex flex-col justify-between shrink-0 select-none z-20"
      style={{ boxShadow: 'none' }}
      data-testid="node-inspector-rail"
    >
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col">
        {/* Rail Title Header */}
        <div className="h-10 px-3 border-b border-[#ebebeb] flex items-center justify-between bg-[#ffffff]">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-[#000000]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            <Badge variant={selectedNode ? 'topic' : 'muted'}>
              {selectedNode ? 'Active' : 'Empty'}
            </Badge>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-[2px] text-[#737785] hover:text-[#000000] hover:bg-[#f5f3f3] transition-colors cursor-pointer"
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

        {/* Path Ribbon */}
        <div className="px-3 py-1.5 border-b border-[#ebebeb] bg-[#fbf9f8] font-mono text-[9px] text-[#595959] tracking-wide truncate">
          <span className="text-[#737785] uppercase">PATH: </span>
          <span>{pathString}</span>
        </div>

        {/* Main Content Area */}
        <div className="p-4 flex flex-col">
          {selectedNode ? (
            /* Selected Node Inspector View */
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <Badge variant={selectedNode.type} dot>
                  {selectedNode.type}
                </Badge>
                <span className="font-mono text-[9px] text-[#737785]">
                  ID: {selectedNode.id.slice(0, 8)}
                </span>
              </div>

              <div>
                <h3 className="font-serif text-[18px] font-medium text-[#000000] m-0 leading-snug">
                  {selectedNode.title || 'Untitled Node'}
                </h3>
                {selectedNode.body ? (
                  <p className="font-serif text-[13px] leading-[20px] text-[#404040] mt-2 whitespace-pre-wrap">
                    {selectedNode.body}
                  </p>
                ) : (
                  <p className="font-serif text-[13px] italic text-[#737785] mt-2">
                    No synthesis or evidentiary notes recorded for this node.
                  </p>
                )}
              </div>

              {selectedNode.images.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#595959]">
                    Attached Plates ({selectedNode.images.length})
                  </span>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {selectedNode.images.map((img) => (
                      <img
                        key={img.id}
                        src={img.dataUrl}
                        alt=""
                        className="w-16 h-16 object-cover border border-[#ebebeb] rounded-[2px]"
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-[#ebebeb]">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => onOpenEditor?.(selectedNode.id)}
                  className="flex-1"
                >
                  Edit Node
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onAddChild?.(selectedNode.id)}
                  className="flex-1"
                >
                  + Add Child
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => canvasActions.openDeletePrompt(selectedNode.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ) : (
            /* Empty State View */
            <div className="flex flex-col items-center text-center pt-8 pb-4">
              {/* Boxed connected wireframe icon */}
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
                Create a Root Node on the canvas to inspect classification types, evidentiary synthesis notes, microscopy plates, and indexed DOI citations.
              </p>

              {/* QUICK KEYS Card */}
              <div className="w-full bg-[#f5f3f3] border border-[#ebebeb] rounded-[2px] p-3 text-left">
                <div className="font-mono text-[9px] uppercase font-medium tracking-[0.06em] text-[#595959] mb-2.5">
                  Quick Keys
                </div>
                <div className="flex flex-col gap-2 font-mono text-[11px] text-[#1b1c1c]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#404040]">Create Root Node</span>
                    <Kbd>N</Kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#404040]">Pan Canvas</span>
                    <Kbd>Space + Drag</Kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#404040]">Zoom Viewport</span>
                    <Kbd>Scroll / +/-</Kbd>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer: Persistence Status */}
      <div className="border-t border-[#ebebeb] bg-[#ffffff] px-3 py-2 text-center">
        <span className="font-mono text-[9px] text-[#737785]">
          Auto-saved to LocalStorage (500ms debounce)
        </span>
      </div>
    </aside>
  );
}
