/**
 * Canvas toolbar controls for showing and hiding branches:
 *
 *   - A scope switch: act on every idea, or only on the selected ones.
 *     It follows the selection (selecting ideas switches it to "Selected",
 *     clearing the selection switches it back to "All") and can be flipped
 *     by hand at any time.
 *   - Collapse and Expand, applied to the scope in one undo step.
 *   - Walkthrough: reveal hidden ideas one at a time for a presentation
 *     (see `walkthrough.ts`). While it runs, `WalkthroughBar` floats above
 *     the toolbar with Back / Next / Show all / End, and the arrow keys (or a
 *     presentation clicker's Page Up / Page Down) step through.
 */

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { canvasActions, downstreamIds, useCanvasStore, visibleNodeIds } from '../data';
import type { UUID } from '../data';

import { hiddenInScope, shownNodeIds, useWalkthroughStore, walkthroughActions } from './walkthrough';

type Scope = 'all' | 'selected';

export interface BranchToolbarGroupProps {
  /** Ideas currently selected on the canvas (may be several). */
  readonly selectedIds: readonly UUID[];
}

export function BranchToolbarGroup({ selectedIds }: BranchToolbarGroupProps): JSX.Element {
  const canvas = useCanvasStore((s) => s.canvas);
  const walkthroughActive = useWalkthroughStore((s) => s.active);
  const hasSelection = selectedIds.length > 0;

  // Follow the selection, but let the user override it.
  const [scope, setScope] = useState<Scope>(hasSelection ? 'selected' : 'all');
  useEffect(() => {
    setScope(hasSelection ? 'selected' : 'all');
  }, [hasSelection]);

  const effectiveScope: Scope = scope === 'selected' && hasSelection ? 'selected' : 'all';
  const targetIds = useMemo(
    () => (effectiveScope === 'selected' ? selectedIds : canvas.nodes.map((n) => n.id)),
    [effectiveScope, selectedIds, canvas.nodes],
  );

  const { canCollapse, canExpand } = useMemo(() => {
    const hasChildren = new Set(canvas.edges.map((e) => e.source));
    const targets = new Set(targetIds);
    const collapsible = canvas.nodes.some((n) => targets.has(n.id) && !n.collapsed && hasChildren.has(n.id));
    const branch = new Set<UUID>(targetIds);
    if (effectiveScope === 'selected') {
      for (const id of targetIds) for (const d of downstreamIds(canvas, id)) branch.add(d);
    }
    const expandable =
      canvas.nodes.some((n) => branch.has(n.id) && n.collapsed) ||
      canvas.edges.some((e) => e.hidden === true && branch.has(e.source));
    return { canCollapse: collapsible, canExpand: expandable };
  }, [canvas, targetIds, effectiveScope]);

  const scopeLabel = effectiveScope === 'selected' ? `${selectedIds.length} selected` : 'all';
  const roots = effectiveScope === 'selected' ? selectedIds : null;
  const canWalk = canvas.edges.length > 0;

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Show and hide branches">
      <div className="flex items-center gap-0.5 bg-[#f5f3f3] rounded-[2px] p-0.5" role="group" aria-label="Apply to">
        <ScopeButton
          label="All"
          title="Collapse and expand act on every idea"
          isActive={effectiveScope === 'all'}
          onClick={() => setScope('all')}
          testId="btn-scope-all"
        />
        <ScopeButton
          label={hasSelection ? `Selected · ${selectedIds.length}` : 'Selected'}
          title={hasSelection ? 'Collapse and expand act on the selected ideas' : 'Select ideas first (Ctrl/⌘-click or drag a box)'}
          isActive={effectiveScope === 'selected'}
          disabled={!hasSelection}
          onClick={() => setScope('selected')}
          testId="btn-scope-selected"
        />
      </div>
      <BranchButton
        label={`Collapse ${scopeLabel}`}
        disabled={!canCollapse || walkthroughActive}
        onClick={() => canvasActions.collapseNodes(effectiveScope === 'all' ? 'all' : selectedIds)}
        testId="btn-collapse-scope"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="7 20 12 15 17 20" />
          <polyline points="7 4 12 9 17 4" />
        </svg>
      </BranchButton>
      <BranchButton
        label={`Expand ${scopeLabel}`}
        disabled={!canExpand || walkthroughActive}
        onClick={() => canvasActions.expandNodes(effectiveScope === 'all' ? 'all' : selectedIds)}
        testId="btn-expand-scope"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polyline points="7 15 12 20 17 15" />
          <polyline points="7 9 12 4 17 9" />
        </svg>
      </BranchButton>
      <BranchButton
        label={
          walkthroughActive
            ? 'Walkthrough running'
            : `Walkthrough: reveal ${effectiveScope === 'selected' ? 'the selected branches' : 'the canvas'} one idea at a time`
        }
        disabled={!canWalk || walkthroughActive}
        isActive={walkthroughActive}
        onClick={() => walkthroughActions.start(roots)}
        testId="btn-walkthrough"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <polygon points="6 4 20 12 6 20 6 4" />
        </svg>
      </BranchButton>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Walkthrough bar                                                            */
/* -------------------------------------------------------------------------- */

export interface WalkthroughBarProps {
  /** Called with each idea as it is revealed, e.g. to bring it into view. */
  readonly onRevealed?: (id: UUID) => void;
}

export function WalkthroughBar({ onRevealed }: WalkthroughBarProps): JSX.Element | null {
  const { active, roots, revealed, total } = useWalkthroughStore();
  const canvas = useCanvasStore((s) => s.canvas);

  const remaining = useMemo(
    () => (active ? hiddenInScope(canvas, shownNodeIds(canvas, revealed), roots).size : 0),
    [active, canvas, revealed, roots],
  );

  // A different project, or the walked-through ideas being deleted, ends it.
  const canvasId = canvas.id;
  useEffect(() => {
    return () => walkthroughActions.end();
  }, [canvasId]);
  useEffect(() => {
    if (!active || roots === null) return;
    const visible = visibleNodeIds(canvas);
    if (!roots.some((id) => visible.has(id))) walkthroughActions.end();
  }, [active, roots, canvas]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      const { editor, deletePrompt } = useCanvasStore.getState();
      if (editor.openNodeId || deletePrompt.nodeId) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Stop the keys here so React Flow does not also nudge a selected card.
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        e.stopPropagation();
        const id = walkthroughActions.next();
        if (id) onRevealed?.(id);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        e.stopPropagation();
        walkthroughActions.back();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        walkthroughActions.end();
      }
    }
    // Capture, so Escape ends the walkthrough before it clears the selection.
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, onRevealed]);

  if (!active) return null;

  const done = Math.max(0, total - remaining);
  const finished = remaining === 0;

  return (
    <div
      className="root-walkthrough-bar absolute bottom-16 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-[#000000] text-[#ffffff] rounded-[3px] pl-3 pr-1 py-1"
      role="toolbar"
      aria-label="Walkthrough"
      data-testid="walkthrough-bar"
    >
      <span className="flex items-center gap-2 font-mono text-[10.5px] tracking-[0.04em] whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-[#de5052] animate-pulse" aria-hidden="true" />
        <span className="uppercase text-[#ffffff]/70">Walkthrough</span>
        <span className="tabular-nums" data-testid="walkthrough-progress">
          {finished ? 'All shown' : `${done} / ${total}`}
        </span>
      </span>
      <span className="w-px h-4 bg-[#ffffff]/20" aria-hidden="true" />
      <BarButton label="Back (←)" onClick={() => walkthroughActions.back()} disabled={revealed.length === 0} testId="btn-walkthrough-back">
        ← Back
      </BarButton>
      <BarButton
        label="Reveal the next idea (→)"
        onClick={() => {
          const id = walkthroughActions.next();
          if (id) onRevealed?.(id);
        }}
        disabled={finished}
        primary
        testId="btn-walkthrough-next"
      >
        Next →
      </BarButton>
      <BarButton label="Reveal everything left" onClick={() => walkthroughActions.showAll()} disabled={finished} testId="btn-walkthrough-all">
        Show all
      </BarButton>
      <BarButton label="End the walkthrough (Esc)" onClick={() => walkthroughActions.end()} testId="btn-walkthrough-end">
        End
      </BarButton>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

function ScopeButton({
  label,
  title,
  isActive,
  disabled = false,
  onClick,
  testId,
}: {
  readonly label: string;
  readonly title: string;
  readonly isActive: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly testId: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={isActive}
      title={title}
      className={`h-6 px-2 inline-flex items-center rounded-[2px] border font-mono text-[10px] whitespace-nowrap transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
        isActive
          ? 'bg-[#ffffff] text-[#000000] border-[#ebebeb]'
          : 'border-transparent text-[#737785] enabled:hover:text-[#000000]'
      }`}
      data-testid={testId}
    >
      {label}
    </button>
  );
}

function BranchButton({
  label,
  onClick,
  disabled = false,
  isActive = false,
  testId,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly isActive?: boolean;
  readonly testId: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-7 h-7 inline-flex items-center justify-center rounded-[2px] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-35 ${
        isActive ? 'text-[#de5052] bg-[#fdf2f2]' : 'text-[#404040] enabled:hover:text-[#000000] enabled:hover:bg-[#f5f3f3]'
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function BarButton({
  label,
  onClick,
  disabled = false,
  primary = false,
  testId,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly primary?: boolean;
  readonly testId: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`h-7 px-2.5 inline-flex items-center rounded-[2px] font-mono text-[10.5px] whitespace-nowrap transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-35 ${
        primary
          ? 'bg-[#ffffff] text-[#000000] enabled:hover:bg-[#dae2ff]'
          : 'text-[#ffffff]/85 enabled:hover:bg-[#ffffff]/15 enabled:hover:text-[#ffffff]'
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
