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
      className="inline-flex items-center rounded-xs px-1 text-body"
      style={{
        // Neutral pill so the badge reads on any type variant without
        // introducing a fifth palette pairing.
        border: '1px solid #404040',
        background: '#ebebeb',
        color: '#000000',
      }}
      aria-label={`${count} hidden descendant${count === 1 ? '' : 's'}`}
      data-testid="collapse-badge"
    >
      +{count}
    </span>
  );
}
