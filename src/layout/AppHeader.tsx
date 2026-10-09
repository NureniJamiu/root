import { useEffect, useRef, useState } from 'react';
import type { NodeType } from '../data';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { RootLogo } from './Logo';
import { PanelLeftIcon, PanelRightIcon } from './panelIcons';

export interface AppHeaderProps {
  readonly title: string;
  /** Longest title the rename field accepts. */
  readonly titleMaxLength?: number;
  readonly onTitleChange?: (newTitle: string) => void;
  readonly nodeCount: number;
  readonly connectionCount: number;
  readonly onAddNode: () => void;
  /** Disable Add Idea while there is no project to add to (still loading, or failed to load). */
  readonly addNodeDisabled?: boolean;
  /** Tooltip for the Add Idea button, e.g. which idea the new card will connect to. */
  readonly addNodeHint?: string;
  readonly isSidebarOpen?: boolean;
  readonly onToggleSidebar?: () => void;
  readonly isInspectorOpen?: boolean;
  readonly onToggleInspector?: () => void;
  readonly activeTypeFilter?: NodeType | null;
  readonly onSelectTypeFilter?: (type: NodeType | null) => void;
  readonly onNavigateHome?: () => void;
}

const TYPE_LABELS: Record<NodeType, string> = {
  topic: 'Topic',
  finding: 'Finding',
  question: 'Question',
  conclusion: 'Conclusion',
};

/** The colour of each type, shown as a dot beside the highlight dropdown. */
const TYPE_COLORS: Record<NodeType, string> = {
  topic: '#0051c3',
  finding: '#2d7a4c',
  question: '#de5052',
  conclusion: '#521010',
};

const GUIDE_ITEMS: ReadonlyArray<{ keys: readonly string[]; label: string }> = [
  { keys: ['Space', 'Drag'], label: 'Pan the canvas' },
  { keys: ['Scroll'], label: 'Zoom in and out' },
  { keys: ['Double-click'], label: 'Add an idea on empty canvas' },
  { keys: ['Shift', 'Drag'], label: 'Snap a dragged idea to the grid' },
  { keys: ['Del'], label: 'Delete the selected idea or connector' },
  { keys: ['Esc'], label: 'Clear the selection' },
  { keys: ['N'], label: 'Add an idea in the middle of the view' },
  { keys: ['Ctrl/⌘', 'Z'], label: 'Undo the last change' },
  { keys: ['Ctrl/⌘', 'Shift', 'Z'], label: 'Redo' },
];

export function AppHeader({
  title,
  titleMaxLength,
  onTitleChange,
  nodeCount,
  connectionCount,
  onAddNode,
  addNodeDisabled = false,
  addNodeHint,
  isSidebarOpen = true,
  onToggleSidebar,
  isInspectorOpen = true,
  onToggleInspector,
  activeTypeFilter,
  onSelectTypeFilter,
  onNavigateHome,
}: AppHeaderProps): JSX.Element {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const guideRef = useRef<HTMLDivElement>(null);

  // Keep the draft in step with the active project (e.g. after switching projects).
  useEffect(() => {
    if (!isEditingTitle) setTitleDraft(title);
  }, [title, isEditingTitle]);

  useEffect(() => {
    if (!isGuideOpen) return;
    function handlePointerDown(e: PointerEvent) {
      if (!guideRef.current?.contains(e.target as globalThis.Node)) setIsGuideOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsGuideOpen(false);
    }
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isGuideOpen]);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleDraft.trim() && titleDraft !== title) {
      onTitleChange?.(titleDraft.trim());
    } else {
      setTitleDraft(title);
    }
  };

  return (
    <header className="h-12 w-full bg-[#ffffff] border-b border-[#ebebeb] flex items-center justify-between gap-4 pl-2 pr-2 shrink-0 select-none z-30">
      {/* Left: sidebar affordance (only while collapsed) + project title */}
      <div className="flex items-center gap-2 min-w-0">
        {!isSidebarOpen && onToggleSidebar && (
          <>
            <button
              type="button"
              onClick={onToggleSidebar}
              className="w-7 h-7 inline-flex items-center justify-center rounded-[2px] text-[#737785] hover:text-[#000000] hover:bg-[#f0eded] transition-colors cursor-pointer shrink-0"
              title="Expand sidebar"
              aria-label="Expand sidebar"
              aria-expanded={false}
              data-testid="btn-toggle-sidebar"
            >
              <PanelLeftIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNavigateHome}
              disabled={!onNavigateHome}
              className="flex items-center hover:opacity-80 transition-opacity cursor-pointer disabled:cursor-default shrink-0"
              title={onNavigateHome ? 'Back to home' : undefined}
            >
              <RootLogo className="h-7 w-auto" />
            </button>
            <div className="h-4 w-px bg-[#ebebeb] mx-1 shrink-0" />
          </>
        )}

        <div className={`flex items-center min-w-0 ${isSidebarOpen ? 'pl-2' : ''}`}>
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
              maxLength={titleMaxLength}
              aria-label="Project title"
              className="font-serif text-[17px] font-medium text-[#000000] border-b border-[#000000] bg-transparent outline-none px-1 py-0.5 min-w-[220px]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setIsEditingTitle(true)}
              className="group flex items-center gap-1.5 min-w-0 cursor-text py-1 px-1.5 rounded-[2px] hover:bg-[#f5f3f3] transition-colors"
              title="Rename project"
            >
              <span className="font-serif text-[17px] font-medium text-[#000000] tracking-tight truncate">
                {title || 'Untitled Project'}
              </span>
              <svg
                className="w-3 h-3 shrink-0 text-[#737785] opacity-0 group-hover:opacity-100 transition-opacity"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
            </button>
          )}
          <span className="ml-2 font-mono text-[10px] text-[#737785] tracking-wide whitespace-nowrap shrink-0">
            {nodeCount} {nodeCount === 1 ? 'idea' : 'ideas'} · {connectionCount}{' '}
            {connectionCount === 1 ? 'connection' : 'connections'}
          </span>
        </div>
      </div>

      {/* Right: type highlight, help, primary action, inspector toggle */}
      <div className="flex items-center gap-2 shrink-0">
        {onSelectTypeFilter && (
          <label className="relative flex items-center gap-2" data-testid="type-filter">
            <span className="relative inline-flex items-center">
              <span
                className="pointer-events-none absolute left-2.5 w-2 h-2 rounded-full"
                style={{
                  background: activeTypeFilter ? TYPE_COLORS[activeTypeFilter] : 'transparent',
                  border: activeTypeFilter ? 'none' : '1px solid #c3c6d6',
                }}
                aria-hidden="true"
              />
              <select
                value={activeTypeFilter ?? ''}
                onChange={(e) => onSelectTypeFilter(e.target.value === '' ? null : (e.target.value as NodeType))}
                aria-label="Highlight ideas by type"
                className="h-8 appearance-none rounded-[4px] border border-[#e2e2e2] bg-white pl-6 pr-7 font-mono text-[11px] text-[#1b1c1c] hover:border-[#1b1c1c] focus:outline-none focus-visible:border-[#0051c3] focus-visible:ring-1 focus-visible:ring-[#0051c3] transition-colors cursor-pointer"
                data-testid="type-filter-select"
              >
                <option value="">All</option>
                {(Object.keys(TYPE_LABELS) as NodeType[]).map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <svg
                className="pointer-events-none absolute right-2 w-3 h-3 text-[#737785]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </label>
        )}

        <div className="h-4 w-px bg-[#ebebeb]" />

        <div className="relative" ref={guideRef}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsGuideOpen((v) => !v)}
            aria-expanded={isGuideOpen}
            className={`text-[11px] px-2 ${isGuideOpen ? 'bg-[#f0eded] text-[#000000]' : ''}`}
            icon={
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            }
            data-testid="btn-guide"
          >
            Guide
          </Button>
          {isGuideOpen && (
            <div
              className="absolute right-0 top-[calc(100%+6px)] w-[280px] bg-[#ffffff] border border-[#c3c6d6] rounded-[2px] p-3 z-50"
              role="dialog"
              aria-label="Canvas guide"
              data-testid="guide-popover"
            >
              <p className="font-serif text-[13px] leading-[19px] text-[#404040] m-0 mb-3">
                Hover an idea to add a connected idea, edit or collapse it. Drag from a dot on any side of a card to any side of another card (or drop on the card itself) to connect them. A card can have as many connectors as you like.
              </p>
              <p className="font-serif text-[13px] leading-[19px] text-[#404040] m-0 mb-3">
                Click a connector to select it, then press Delete or use its ✕ button to remove it. With a connector selected, drag either end to re-attach it (dropped on empty canvas, it goes back). A side you pick stays put; double-click a connector to let it follow the facing sides again. A dashed connector leads to a Question.
              </p>
              <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
                {GUIDE_ITEMS.map((item) => (
                  <li key={item.label} className="flex items-center justify-between gap-3">
                    <span className="font-serif text-[13px] text-[#1b1c1c]">{item.label}</span>
                    <span className="flex items-center gap-1 shrink-0 capitalize">
                      {item.keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <Button
          size="sm"
          variant="primary"
          onClick={onAddNode}
          disabled={addNodeDisabled}
          title={addNodeHint}
          className="h-9 px-4 text-[9.5px] uppercase"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
          data-testid="btn-add-idea"
        >
          Add Idea
        </Button>

        {onToggleInspector && (
          <>
            <div className="h-4 w-px bg-[#ebebeb]" />
            <button
              type="button"
              onClick={onToggleInspector}
              className={`w-7 h-7 inline-flex items-center justify-center rounded-[2px] transition-colors cursor-pointer ${isInspectorOpen
                ? 'text-[#000000] bg-[#f0eded]'
                : 'text-[#737785] hover:text-[#000000] hover:bg-[#f5f3f3]'
                }`}
              title={isInspectorOpen ? 'Hide inspector' : 'Show inspector'}
              aria-label={isInspectorOpen ? 'Hide inspector' : 'Show inspector'}
              aria-expanded={isInspectorOpen}
              data-testid="btn-toggle-inspector"
            >
              <PanelRightIcon className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
