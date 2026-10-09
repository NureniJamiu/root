/**
 * `CollapseBadge` — the small pill rendered on a card that hides some of
 * what hangs from it: collapsed, or revealing its connected ideas one at a
 * time.
 *
 * The badge shows how many of the ideas that hang only from the node are
 * hidden right now (`hiddenDescendantCount`, Requirement 6.5). Clicking it
 * shows every connected idea. The parent `NodeCard` decides visibility.
 */

import { canvasActions, hiddenDescendantCount, useCanvasStore } from '../data';
import type { UUID } from '../data';

import { BranchIcon } from './icons';

export interface CollapseBadgeProps {
  readonly nodeId: UUID;
}

export function CollapseBadge({ nodeId }: CollapseBadgeProps): JSX.Element {
  const count = useCanvasStore((s) => hiddenDescendantCount(s.canvas, nodeId));
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        canvasActions.setCollapsed(nodeId, false);
      }}
      className="inline-flex items-center gap-1 font-mono text-[9px] font-medium leading-[12px] px-1.5 py-0.5 rounded-[2px] select-none hover:bg-sunken-2 hover:border-ink transition-colors cursor-pointer"
      style={{
        border: '1px solid rgb(var(--rule-strong))',
        background: 'rgb(var(--sunken))',
        color: 'rgb(var(--ink))',
        boxShadow: 'none',
      }}
      title="Click to expand"
      aria-label={`${count} hidden descendant${count === 1 ? '' : 's'}`}
      data-testid="collapse-badge"
    >
      <BranchIcon style={{ opacity: 0.7 }} />
      <span>+{count} hidden</span>
    </button>
  );
}
