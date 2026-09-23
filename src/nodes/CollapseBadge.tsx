/**
 * `CollapseBadge` — the small pill rendered on a collapsed `NodeCard`.
 *
 * The badge shows the count of transitive descendants hidden beneath
 * the node, computed via `descendantCount(canvas, id)` (Requirement 6.5
 * and design.md §Node UI Layer). It is only rendered when
 * `node.collapsed === true`; the parent `NodeCard` decides visibility.
 */

import { descendantCount, useCanvasStore } from '../data';
import type { UUID } from '../data';

import { BranchIcon } from './icons';

export interface CollapseBadgeProps {
  readonly nodeId: UUID;
}

export function CollapseBadge({ nodeId }: CollapseBadgeProps): JSX.Element {
  // The badge count depends on the entire tree shape, not just the node,
  // so subscribe to `canvas` and recompute on structural change. The cost
  // is O(subtree) per render of a collapsed card, which is acceptable at
  // MVP scale (Requirement 12.1 target: 100–150 visible nodes).
  const count = useCanvasStore((s) => descendantCount(s.canvas, nodeId));
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[9px] font-medium leading-[12px] px-1.5 py-0.5 rounded-[2px] select-none"
      style={{
        border: '1px solid #c3c6d6',
        background: '#f5f3f3',
        color: '#1b1c1c',
        boxShadow: 'none',
      }}
      aria-label={`${count} hidden descendant${count === 1 ? '' : 's'}`}
      data-testid="collapse-badge"
    >
      <BranchIcon style={{ opacity: 0.7 }} />
      <span>+{count}</span>
    </span>
  );
}
