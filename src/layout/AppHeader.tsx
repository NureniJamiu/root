import { useState } from 'react';
import type { NodeType } from '../data';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { RootMarkIcon, RootLogo } from './Logo';

export interface AppHeaderProps {
  readonly title: string;
  readonly onTitleChange?: (newTitle: string) => void;
  readonly nodeCount: number;
  readonly branchCount: number;
  readonly zoomPercent: number;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFitView: () => void;
  readonly onCenterRoot: () => void;
  readonly onAddNode: () => void;
  readonly activeTypeFilter?: NodeType | null;
  readonly onSelectTypeFilter?: (type: NodeType | null) => void;
}

export function AppHeader({
  title,
  onTitleChange,
  nodeCount,
  branchCount,
  zoomPercent,
  onZoomIn,
  onZoomOut,
  onFitView,
  onCenterRoot,
  onAddNode,
  activeTypeFilter,
  onSelectTypeFilter,
}: AppHeaderProps): JSX.Element {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleDraft.trim() && titleDraft !== title) {
      onTitleChange?.(titleDraft.trim());
    } else {
      setTitleDraft(title);
    }
  };

  return (
    <header
      className="h-12 w-full bg-[#ffffff] border-b border-[#ebebeb] flex items-center justify-between px-3 shrink-0 select-none z-30"
      style={{ boxShadow: 'none' }}
    >
      {/* Left: Brand Mark & Title */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2">
          <RootMarkIcon size={26} />
          <div className="h-4 w-px bg-[#ebebeb]" />
          <RootLogo className="h-5 w-auto" />
        </div>

        <div className="h-4 w-px bg-[#ebebeb] mx-0.5" />

        {isEditingTitle ? (
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSubmit();
              if (e.key === 'Escape') {
                setTitleDraft(title);
                setIsEditingTitle(false);
              }
            }}
            autoFocus
            className="font-serif text-[15px] font-medium text-[#000000] border-b border-[#000000] bg-transparent outline-none px-1 py-0.5"
          />
        ) : (
          <div
            onClick={() => setIsEditingTitle(true)}
            className="group flex items-center gap-1.5 cursor-pointer py-1 px-1.5 rounded-[2px] hover:bg-[#f5f3f3] transition-colors"
            title="Click to edit canvas title"
          >
            <span className="font-serif text-[15px] font-medium text-[#000000] tracking-tight">
              {title || 'Root — Untitled Research Canvas'}
            </span>
            <svg
              className="w-3 h-3 text-[#737785] opacity-50 group-hover:opacity-100 transition-opacity"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </div>
        )}
      </div>

      {/* Center: Canvas Viewport & Zoom Controls */}
      <div className="flex items-center gap-1.5 bg-[#ffffff] p-0.5">
        {/* Zoom Stepper */}
        <div className="inline-flex items-center border border-[#ebebeb] rounded-[2px] bg-[#ffffff] h-7">
          <button
            type="button"
            onClick={onZoomOut}
            aria-label="Zoom out"
            title="Zoom out"
            className="w-6 h-full flex items-center justify-center font-mono text-[13px] text-[#404040] hover:text-[#000000] hover:bg-[#f5f3f3] transition-colors cursor-pointer"
          >
            −
          </button>
          <span className="font-mono text-[10px] text-[#1b1c1c] px-2 min-w-[42px] text-center font-medium border-x border-[#ebebeb]">
            {Math.round(zoomPercent)}%
          </span>
          <button
            type="button"
            onClick={onZoomIn}
            aria-label="Zoom in"
            title="Zoom in"
            className="w-6 h-full flex items-center justify-center font-mono text-[13px] text-[#404040] hover:text-[#000000] hover:bg-[#f5f3f3] transition-colors cursor-pointer"
          >
            +
          </button>
        </div>

        {/* Pan Mode indicator/toggle */}
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-[10px] font-mono"
          icon={
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v5" />
              <path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
              <path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8" />
              <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
            </svg>
          }
        >
          Pan
        </Button>

        {/* Fit View */}
        <Button
          size="sm"
          variant="secondary"
          onClick={onFitView}
          className="h-7 text-[10px] font-mono"
          icon={
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          }
        >
          Fit
        </Button>

        {/* Root Focus */}
        <Button
          size="sm"
          variant="secondary"
          onClick={onCenterRoot}
          className="h-7 text-[10px] font-mono"
          icon={
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <circle cx="12" cy="12" r="8" />
              <line x1="12" y1="2" x2="12" y2="4" />
              <line x1="12" y1="20" x2="12" y2="22" />
              <line x1="2" y1="12" x2="4" y2="12" />
              <line x1="20" y1="12" x2="22" y2="12" />
            </svg>
          }
        >
          Root
        </Button>
      </div>

      {/* Right: Stats, Taxonomy Filter Chips & Actions */}
      <div className="flex items-center gap-2">
        {/* Count summary */}
        <div className="font-mono text-[10px] tracking-wide text-[#595959] pr-1">
          <span className="text-[#000000] font-medium">{nodeCount}</span> Nodes ·{' '}
          <span className="text-[#000000] font-medium">{branchCount}</span> Branches
        </div>

        <div className="h-4 w-px bg-[#ebebeb]" />

        {/* Semantic filter chips */}
        <div className="flex items-center gap-1">
          {(['topic', 'finding', 'question', 'conclusion'] as const).map((type) => {
            const isActive = activeTypeFilter === type;
            const labels: Record<NodeType, string> = {
              topic: 'Topic',
              finding: 'Finding',
              question: 'Question',
              conclusion: 'Conclusion',
            };
            return (
              <button
                key={type}
                type="button"
                onClick={() => onSelectTypeFilter?.(isActive ? null : type)}
                className="cursor-pointer"
              >
                <Badge
                  variant={type}
                  className={`transition-all ${
                    isActive ? 'ring-1 ring-[#000000] font-bold' : 'opacity-85 hover:opacity-100'
                  }`}
                >
                  {labels[type]}
                </Badge>
              </button>
            );
          })}
        </div>

        <div className="h-4 w-px bg-[#ebebeb]" />

        {/* + Add Node action */}
        <Button
          size="sm"
          variant="primary"
          onClick={onAddNode}
          className="h-7 text-[11px] font-mono"
          icon={
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          }
        >
          Add Node
        </Button>

        {/* Tour button */}
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-[10px] font-mono"
          icon={
            <svg className="w-3 h-3 text-[#595959]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          }
        >
          Tour
        </Button>

        {/* User avatar */}
        <div
          className="w-7 h-7 rounded-full bg-[#0051c3] text-[#ffffff] flex items-center justify-center shrink-0 font-mono text-[11px] font-medium select-none cursor-pointer"
          title="Researcher Profile"
        >
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
      </div>
    </header>
  );
}
