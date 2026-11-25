/**
 * Problem-framing rules (M0 plan D8): structural gaps between the problem,
 * objectives, research questions, hypotheses and variables. Each is a
 * deterministic query over typed connectors read in their semantic direction,
 * so a connector only counts when its relation says what the rule needs
 * (a research question `addresses` an objective, not merely `related-to` it).
 *
 * `refines` lets a specific card stand under a general one:
 *   - a research question that refines another inherits the objective the
 *     broader question addresses;
 *   - an objective is covered when a research question addresses it or any
 *     objective that refines it;
 *   - an objective that refines another inherits the problem the broader
 *     objective addresses.
 *
 * Each rule is pure and O(nodes + edges).
 */

import type { NodeTypeId } from '../model/nodeTypes';
import type { RelationId } from '../model/relations';
import type { GraphView, Issue, Rule, RuleId } from '../model/rules';
import type { UUID } from '../types';
import { indexGraph } from './graph';
import type { GraphIndex } from './graph';

function issue(rule: { readonly id: RuleId; readonly version: number }, nodeIds: UUID[], label: string, hint: string): Issue {
  return { ruleId: rule.id, ruleVersion: rule.version, nodeIds, edgeIds: [], label, hint };
}

/**
 * Whether `start`, or a card it reaches by following `step` (same type only),
 * satisfies `ok`. Cycles are allowed; each card is visited once.
 */
function along(
  idx: GraphIndex,
  start: UUID,
  step: (id: UUID) => readonly UUID[],
  ok: (id: UUID) => boolean,
): boolean {
  const type = idx.typeOf(start);
  const seen = new Set<UUID>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop() as UUID;
    if (ok(current)) return true;
    for (const next of step(current)) {
      if (seen.has(next) || idx.typeOf(next) !== type) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return false;
}

/** Whether `id` is the subject of a `relation` connector to a card of `type`. */
const hasObject = (idx: GraphIndex, id: UUID, relation: RelationId, type: NodeTypeId): boolean =>
  idx.objectsOf(id, relation).some((o) => idx.typeOf(o) === type);

const RQ_WITHOUT_OBJECTIVE = { id: 'rq-without-objective', version: 1 } as const;

export const rqWithoutObjective: Rule = {
  ...RQ_WITHOUT_OBJECTIVE,
  run(g: GraphView): Issue[] {
    const idx = indexGraph(g);
    const broader = (id: UUID) => idx.objectsOf(id, 'refines');
    return g.nodes
      .filter((n) => n.type === 'research-question')
      .filter((n) => !along(idx, n.id, broader, (id) => hasObject(idx, id, 'addresses', 'objective')))
      .map((n) =>
        issue(
          RQ_WITHOUT_OBJECTIVE,
          [n.id],
          'No objective',
          'This research question is not linked to an objective. Connect it to the objective it addresses.',
        ),
      );
  },
};

const OBJECTIVE_WITHOUT_RQ = { id: 'objective-without-rq', version: 1 } as const;

export const objectiveWithoutRq: Rule = {
  ...OBJECTIVE_WITHOUT_RQ,
  run(g: GraphView): Issue[] {
    const idx = indexGraph(g);
    const narrower = (id: UUID) => idx.subjectsOf(id, 'refines');
    const addressed = (id: UUID) => idx.subjectsOf(id, 'addresses').some((s) => idx.typeOf(s) === 'research-question');
    return g.nodes
      .filter((n) => n.type === 'objective')
      .filter((n) => !along(idx, n.id, narrower, addressed))
      .map((n) =>
        issue(
          OBJECTIVE_WITHOUT_RQ,
          [n.id],
          'No research question',
          'No research question addresses this objective yet. Add one, or connect the question that addresses it.',
        ),
      );
  },
};

const OBJECTIVE_OFF_PROBLEM = { id: 'objective-off-problem', version: 1 } as const;

/** Fires only once the project has a problem statement: before that, there is nothing to tie to. */
export const objectiveOffProblem: Rule = {
  ...OBJECTIVE_OFF_PROBLEM,
  run(g: GraphView): Issue[] {
    if (!g.nodes.some((n) => n.type === 'problem')) return [];
    const idx = indexGraph(g);
    const broader = (id: UUID) => idx.objectsOf(id, 'refines');
    return g.nodes
      .filter((n) => n.type === 'objective')
      .filter((n) => !along(idx, n.id, broader, (id) => hasObject(idx, id, 'addresses', 'problem')))
      .map((n) =>
        issue(
          OBJECTIVE_OFF_PROBLEM,
          [n.id],
          'Not tied to the problem',
          'Your project has a problem statement, but this objective does not address it. Connect it to the problem, or to the objective it refines.',
        ),
      );
  },
};

const HYPOTHESIS_WITHOUT_VARIABLE = { id: 'hypothesis-without-variable', version: 1 } as const;

export const hypothesisWithoutVariable: Rule = {
  ...HYPOTHESIS_WITHOUT_VARIABLE,
  run(g: GraphView): Issue[] {
    const idx = indexGraph(g);
    return g.nodes
      .filter((n) => n.type === 'hypothesis' && !hasObject(idx, n.id, 'involves', 'variable'))
      .map((n) =>
        issue(
          HYPOTHESIS_WITHOUT_VARIABLE,
          [n.id],
          'No variables',
          'This hypothesis names no variables. Connect the variables it involves.',
        ),
      );
  },
};
