/**
 * Evidence rules: places where the argument on a canvas is not yet backed.
 *
 * - An **unbacked conclusion** has no finding behind it. A finding backs a
 *   conclusion when it is connected to it directly, or through questions,
 *   research questions and other conclusions (never through a topic, which
 *   joins everything). A `contradicts` connector never backs: a conclusion
 *   whose only finding contradicts it is unbacked.
 * - A conclusion **rests on an open question** when it is connected to a
 *   question or research question that no finding answers yet (no finding
 *   connected to it by a connector that can back).
 * - A **dangling finding** is not connected, even through other findings, to
 *   any other card, so nothing in the argument uses it. A finding that
 *   contradicts a conclusion is used: it is counter-evidence the argument has
 *   to face, and contradictions are kept, not resolved away.
 *
 * Each rule is pure and O(nodes + edges).
 */

import type { GraphView, Issue, Rule, RuleId } from '../model/rules';
import type { UUID } from '../types';
import { indexGraph } from './graph';

/** Cards a conclusion's backing passes through, and that can be left open. */
const QUESTION_TYPES: ReadonlySet<string> = new Set(['question', 'research-question']);
const isQuestion = (type: string | undefined): boolean => type !== undefined && QUESTION_TYPES.has(type);

function issue(rule: { readonly id: RuleId; readonly version: number }, nodeIds: UUID[], label: string, hint: string): Issue {
  return { ruleId: rule.id, ruleVersion: rule.version, nodeIds, edgeIds: [], label, hint };
}

const UNBACKED = { id: 'conclusion-unbacked', version: 2 } as const;

export const conclusionUnbacked: Rule = {
  ...UNBACKED,
  run(g: GraphView): Issue[] {
    const { typeOf, reach, backing } = indexGraph(g);
    // Groups of conclusions and questions joined to each other share their backing.
    const backed = new Map<UUID, boolean>();
    for (const n of g.nodes) {
      if (n.type !== 'conclusion' || backed.has(n.id)) continue;
      const passes = (id: UUID) => typeOf(id) === 'conclusion' || isQuestion(typeOf(id));
      const group = [n.id, ...reach(n.id, passes, backing)];
      const hasFinding = group.some((id) => typeOf(id) === 'finding');
      for (const id of group) if (typeOf(id) === 'conclusion') backed.set(id, hasFinding);
    }
    return g.nodes
      .filter((n) => n.type === 'conclusion' && !backed.get(n.id))
      .map((n) =>
        issue(
          UNBACKED,
          [n.id],
          'No evidence',
          'No finding supports this conclusion. Connect a finding to it, directly or through a question.',
        ),
      );
  },
};

const OPEN_QUESTION = { id: 'conclusion-open-question', version: 2 } as const;

/** Issues name the conclusion first, then the open questions it rests on. */
export const conclusionOpenQuestion: Rule = {
  ...OPEN_QUESTION,
  run(g: GraphView): Issue[] {
    const { typeOf, backing } = indexGraph(g);
    const answered = (questionId: UUID) => backing(questionId).some((id) => typeOf(id) === 'finding');
    const out: Issue[] = [];
    for (const n of g.nodes) {
      if (n.type !== 'conclusion') continue;
      const open = [...new Set(backing(n.id))].filter((id) => isQuestion(typeOf(id)) && !answered(id));
      if (open.length === 0) continue;
      const one = open.length === 1;
      out.push(
        issue(
          OPEN_QUESTION,
          [n.id, ...open],
          one ? 'Open question' : `${open.length} open questions`,
          one
            ? 'This conclusion depends on a question nothing answers yet. Connect a finding to the question.'
            : 'This conclusion depends on questions nothing answers yet. Connect a finding to each one.',
        ),
      );
    }
    return out;
  },
};

const DANGLING = { id: 'finding-dangling', version: 1 } as const;

export const findingDangling: Rule = {
  ...DANGLING,
  run(g: GraphView): Issue[] {
    const { typeOf, reach } = indexGraph(g);
    const settled = new Set<UUID>();
    const dangling = new Set<UUID>();
    for (const n of g.nodes) {
      if (n.type !== 'finding' || settled.has(n.id)) continue;
      const group = [n.id, ...reach(n.id, (id) => typeOf(id) === 'finding')];
      const used = group.some((id) => typeOf(id) !== 'finding');
      for (const id of group) {
        if (typeOf(id) !== 'finding') continue;
        settled.add(id);
        if (!used) dangling.add(id);
      }
    }
    return g.nodes
      .filter((n) => dangling.has(n.id))
      .map((n) =>
        issue(
          DANGLING,
          [n.id],
          'Not used',
          'This finding is not connected to any topic, question or conclusion, so nothing in your argument uses it.',
        ),
      );
  },
};
