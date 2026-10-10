/**
 * A suggested idea that is not on the canvas yet: a dashed, see-through card
 * drawn where the idea would land. Clicking it switches it on or off; the
 * review bar adds the ones left on.
 */

import { memo } from 'react';
import { Handle, Position as RFPosition } from 'reactflow';
import type { NodeProps } from 'reactflow';

import { aiProposalActions } from '../data';
import type { GhostIdea, Side } from '../data';
import { EDGE_COLOR_BY_TYPE } from './edgeStyles';
import { sourceHandleId, targetHandleId } from './reconnect';

export const GHOST_NODE_TYPE = 'ghost' as const;

export interface GhostCardData {
  readonly idea: GhostIdea;
  readonly included: boolean;
}

const SIDES: ReadonlyArray<readonly [Side, RFPosition]> = [
  ['top', RFPosition.Top],
  ['right', RFPosition.Right],
  ['bottom', RFPosition.Bottom],
  ['left', RFPosition.Left],
];

const TYPE_LABEL: Record<GhostIdea['type'], string> = {
  topic: 'Topic',
  finding: 'Finding',
  question: 'Question',
  conclusion: 'Conclusion',
};

function GhostCardImpl({ data }: NodeProps<GhostCardData>): JSX.Element {
  const { idea, included } = data;
  const accent = EDGE_COLOR_BY_TYPE[idea.type];
  return (
    <div
      role="checkbox"
      aria-checked={included}
      aria-label={`${included ? 'Included' : 'Left out'}: ${idea.title}`}
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        aiProposalActions.toggle(idea.key);
      }}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          aiProposalActions.toggle(idea.key);
        }
      }}
      className="relative rounded-[3px] bg-panel cursor-pointer transition-opacity duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-topic"
      style={{
        width: 290,
        border: `1.5px dashed ${included ? accent : 'rgb(var(--rule-2))'}`,
        opacity: included ? 0.92 : 0.45,
        boxShadow: included ? '0 6px 18px rgb(var(--shadow) / 0.10)' : 'none',
      }}
      data-testid={`ghost-card-${idea.key}`}
      data-included={included ? 'true' : 'false'}
    >
      {SIDES.map(([side, position]) => (
        <span key={side}>
          <Handle id={targetHandleId(side)} type="target" position={position} isConnectable={false} className="!opacity-0" />
          <Handle id={sourceHandleId(side)} type="source" position={position} isConnectable={false} className="!opacity-0" />
        </span>
      ))}
      <div className="p-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] uppercase tracking-wider" style={{ color: accent }}>
            {TYPE_LABEL[idea.type]} · suggested
          </span>
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-4 h-4 rounded-[2px] text-[10px] leading-none"
            style={{
              border: `1px solid ${included ? accent : 'rgb(var(--rule-2))'}`,
              background: included ? accent : 'transparent',
              color: 'rgb(var(--on-accent))',
            }}
          >
            {included ? '✓' : ''}
          </span>
        </div>
        <div className="text-[13px] font-medium leading-snug text-ink-strong">{idea.title}</div>
        {idea.body && <div className="text-[12px] leading-snug text-ink-read line-clamp-3">{idea.body}</div>}
      </div>
    </div>
  );
}

export const GhostCard = memo(GhostCardImpl);
GhostCard.displayName = 'GhostCard';
