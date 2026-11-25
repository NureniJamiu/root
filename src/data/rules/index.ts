/**
 * The rule engine (M0 plan D8): one set of deterministic checks, run by the
 * cards and inspector in the browser and by the gap check on the server, so
 * both report the same issues for the same graph.
 *
 * Results are cached per graph (canvases are immutable), so every card can
 * ask for its own issues without the work repeating.
 */

import type { GraphView, Issue, Rule } from '../model/rules';
import type { UUID } from '../types';
import { conclusionOpenQuestion, conclusionUnbacked, findingDangling } from './evidence';
import { hypothesisWithoutVariable, objectiveOffProblem, objectiveWithoutRq, rqWithoutObjective } from './framing';
import { relationInvalid } from './relations';

/** Every rule, in the order their issues are listed. */
export const RULES: readonly Rule[] = [
  conclusionUnbacked,
  conclusionOpenQuestion,
  findingDangling,
  rqWithoutObjective,
  objectiveWithoutRq,
  objectiveOffProblem,
  hypothesisWithoutVariable,
  relationInvalid,
];

const NONE: readonly Issue[] = [];
const results = new WeakMap<GraphView, readonly Issue[]>();
const grouped = new WeakMap<GraphView, ReadonlyMap<UUID, readonly Issue[]>>();

/** Every issue on the graph, rule by rule. */
export function runRules(g: GraphView): readonly Issue[] {
  const cached = results.get(g);
  if (cached) return cached;
  const issues = RULES.flatMap((rule) => rule.run(g));
  results.set(g, issues);
  return issues;
}

/**
 * Each card's issues, keyed by the card an issue is about (its first node
 * id), in canvas order. Cards with none are left out.
 */
export function issuesByNode(g: GraphView): ReadonlyMap<UUID, readonly Issue[]> {
  const cached = grouped.get(g);
  if (cached) return cached;
  const bySubject = new Map<UUID, Issue[]>();
  for (const issue of runRules(g)) {
    const subject = issue.nodeIds[0];
    if (subject === undefined) continue;
    (bySubject.get(subject) ?? bySubject.set(subject, []).get(subject)!).push(issue);
  }
  const ordered = new Map<UUID, readonly Issue[]>();
  for (const n of g.nodes) {
    const list = bySubject.get(n.id);
    if (list) ordered.set(n.id, list);
  }
  grouped.set(g, ordered);
  return ordered;
}

/** One card's issues; empty when it has none. */
export function issuesFor(g: GraphView, id: UUID): readonly Issue[] {
  return issuesByNode(g).get(id) ?? NONE;
}
