/**
 * Stages as views over the graph (M0 plan D10). A stage's state is derived
 * from the cards on the canvas, never stored: a stage is `in-progress` once a
 * card of one of its types exists, `not-started` otherwise. There is no
 * "complete": that would be a judgement, not a fact the graph can show.
 *
 * Each stage also counts the rule issues on its cards, so the stage bar and
 * the next-steps panel can point at what needs attention. Pure, cached per
 * canvas (canvases are immutable).
 */

import { ENABLED_NODE_TYPE_IDS } from './model/enabled';
import type { EnabledNodeTypeId } from './model/enabled';
import { NODE_TYPES } from './model/nodeTypes';
import type { Issue } from './model/rules';
import { STAGE_IDS } from './model/stages';
import type { StageId } from './model/stages';
import { runRules } from './rules';
import type { Canvas } from './types';

export type StageProgress = 'not-started' | 'in-progress';

export interface StageState {
  readonly stage: StageId;
  readonly state: StageProgress;
  /** Cards whose type belongs to the stage. */
  readonly cards: number;
  /** Rule issues about those cards. */
  readonly issues: readonly Issue[];
}

const BY_STAGE: ReadonlyMap<StageId, ReadonlySet<EnabledNodeTypeId>> = new Map(
  STAGE_IDS.map((stage) => [
    stage,
    new Set(ENABLED_NODE_TYPE_IDS.filter((t) => (NODE_TYPES[t].stages as readonly StageId[]).includes(stage))),
  ]),
);

/** The enabled node types that belong to `stage` (possibly none yet). */
export function stageTypes(stage: StageId): ReadonlySet<EnabledNodeTypeId> {
  return BY_STAGE.get(stage) ?? new Set();
}

const cache = new WeakMap<Canvas, readonly StageState[]>();

/** Every stage, in journey order, with its state, card count and issues. */
export function stageStates(c: Canvas): readonly StageState[] {
  const cached = cache.get(c);
  if (cached) return cached;
  const typeOf = new Map(c.nodes.map((n) => [n.id, n.type]));
  const issues = runRules(c);
  const states = STAGE_IDS.map((stage): StageState => {
    const types = stageTypes(stage);
    const cards = c.nodes.filter((n) => types.has(n.type)).length;
    return {
      stage,
      state: cards > 0 ? 'in-progress' : 'not-started',
      cards,
      issues: issues.filter((i) => {
        const subject = i.nodeIds[0];
        const type = subject === undefined ? undefined : typeOf.get(subject);
        return type !== undefined && types.has(type);
      }),
    };
  });
  cache.set(c, states);
  return states;
}
