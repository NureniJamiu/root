/**
 * The dashed connectors drawn to AI suggestions waiting for review. A
 * suggestion that says what its connector means shows that relation as a
 * label, read from its parent to it, so a connector never gets a meaning the
 * person did not see before pressing Add (principle 0.3). Pure.
 */
import type { Edge as RFEdge } from 'reactflow';

import { computeFacingSides, ghostId, relationLabel } from '../data';
import type { AiProposal, NodeType, Position, UUID } from '../data';
import { EDGE_COLOR_BY_TYPE, EDGE_DASH, EDGE_STROKE_COLOR } from './edgeStyles';
import { sourceHandleId, targetHandleId } from './reconnect';

/** The idea an expansion grows from, as the ghost connectors need it. */
export interface GhostAnchor {
  readonly id: UUID;
  readonly position: Position;
  readonly type: NodeType;
}

export function ghostEdges(proposal: AiProposal, anchor: GhostAnchor | undefined): RFEdge[] {
  const excluded = new Set(proposal.excluded);
  const byKey = new Map(proposal.ideas.map((i) => [i.key, i]));
  const edges: RFEdge[] = [];
  for (const idea of proposal.ideas) {
    const parent = idea.parentKey !== null ? byKey.get(idea.parentKey) : undefined;
    const from = parent ? { id: ghostId(parent.key), position: parent.position, type: parent.type } : anchor;
    if (!from) continue;
    const { sourceSide, targetSide } = computeFacingSides(from.position, idea.position);
    const on = !excluded.has(idea.key) && (!parent || !excluded.has(parent.key));
    // Switched off, or hanging from a switched-off suggestion: it would be added as a plain link, if at all.
    const label = on && idea.relation ? relationLabel(idea.relation, from.type, idea.type) : undefined;
    edges.push({
      id: `ai-ghost-edge:${idea.key}`,
      source: from.id,
      target: ghostId(idea.key),
      sourceHandle: sourceHandleId(sourceSide),
      targetHandle: targetHandleId(targetSide),
      focusable: false,
      updatable: false,
      ...(label
        ? {
            label,
            labelStyle: { fontSize: 10, fontFamily: 'var(--font-mono, monospace)', fill: 'rgb(var(--ink-3))' },
            labelBgStyle: { fill: 'rgb(var(--panel))' },
            labelBgPadding: [4, 2] as [number, number],
          }
        : {}),
      style: {
        stroke: on ? EDGE_COLOR_BY_TYPE[from.type] : EDGE_STROKE_COLOR,
        strokeWidth: 1.5,
        strokeDasharray: EDGE_DASH,
        opacity: on ? 0.8 : 0.35,
      },
    });
  }
  return edges;
}
