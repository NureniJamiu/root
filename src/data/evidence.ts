/**
 * Evidence checks: places where the argument on a canvas is not yet backed.
 *
 * - An **unbacked conclusion** has no finding behind it. A finding backs a
 *   conclusion when it is connected to it directly, or through questions and
 *   other conclusions (never through a topic, which joins everything).
 * - A conclusion **rests on an open question** when it is connected to a
 *   question that no finding answers yet (no finding connected to it).
 * - A **dangling finding** is not connected, even through other findings, to
 *   any topic, question or conclusion, so nothing in the argument uses it.
 *
 * Connectors count in both directions: what matters is that two cards are
 * joined, not which one the line was dragged from. Pure, O(nodes + edges),
 * and cached per canvas (canvases are immutable), so every card can ask for
 * its own issues without the work repeating.
 */

import type { Canvas, Node, UUID } from './types';

export type EvidenceIssue =
  | { readonly kind: 'unbacked' }
  | { readonly kind: 'open-question'; readonly questionIds: readonly UUID[] }
  | { readonly kind: 'dangling' };

export type EvidenceIssueKind = EvidenceIssue['kind'];

const NONE: readonly EvidenceIssue[] = [];
const cache = new WeakMap<Canvas, ReadonlyMap<UUID, readonly EvidenceIssue[]>>();

/** Every card's issues, keyed by card id. Cards with none are left out. */
export function evidenceIssues(c: Canvas): ReadonlyMap<UUID, readonly EvidenceIssue[]> {
  const cached = cache.get(c);
  if (cached) return cached;

  const byId = new Map<UUID, Node>(c.nodes.map((n) => [n.id, n]));
  const neighbours = new Map<UUID, UUID[]>();
  for (const e of c.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    (neighbours.get(e.source) ?? neighbours.set(e.source, []).get(e.source)!).push(e.target);
    (neighbours.get(e.target) ?? neighbours.set(e.target, []).get(e.target)!).push(e.source);
  }
  const typeOf = (id: UUID) => byId.get(id)?.type;
  const near = (id: UUID) => neighbours.get(id) ?? [];

  /** Ids reachable from `start` while `through` allows passing a card. */
  const reach = (start: UUID, through: (id: UUID) => boolean): Set<UUID> => {
    const seen = new Set<UUID>([start]);
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop() as UUID;
      if (current !== start && !through(current)) continue;
      for (const next of near(current)) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    seen.delete(start);
    return seen;
  };

  const issues = new Map<UUID, EvidenceIssue[]>();
  const add = (id: UUID, issue: EvidenceIssue) => {
    (issues.get(id) ?? issues.set(id, []).get(id)!).push(issue);
  };

  const answered = (questionId: UUID) => near(questionId).some((id) => typeOf(id) === 'finding');

  // Groups of conclusions and questions joined to each other share their backing.
  const backed = new Map<UUID, boolean>();
  for (const n of c.nodes) {
    if (n.type !== 'conclusion' || backed.has(n.id)) continue;
    const group = [n.id, ...reach(n.id, (id) => typeOf(id) === 'conclusion' || typeOf(id) === 'question')];
    const hasFinding = group.some((id) => typeOf(id) === 'finding');
    for (const id of group) if (typeOf(id) === 'conclusion') backed.set(id, hasFinding);
  }

  for (const n of c.nodes) {
    if (n.type === 'conclusion') {
      if (!backed.get(n.id)) add(n.id, { kind: 'unbacked' });
      const open = [...new Set(near(n.id))].filter((id) => typeOf(id) === 'question' && !answered(id));
      if (open.length > 0) add(n.id, { kind: 'open-question', questionIds: open });
    }
  }

  const settled = new Set<UUID>();
  for (const n of c.nodes) {
    if (n.type !== 'finding' || settled.has(n.id)) continue;
    const group = [n.id, ...reach(n.id, (id) => typeOf(id) === 'finding')];
    const used = group.some((id) => typeOf(id) !== 'finding');
    for (const id of group) {
      if (typeOf(id) !== 'finding') continue;
      settled.add(id);
      if (!used) add(id, { kind: 'dangling' });
    }
  }

  cache.set(c, issues);
  return issues;
}

/** One card's issues; empty when it has none. */
export function evidenceIssuesFor(c: Canvas, id: UUID): readonly EvidenceIssue[] {
  return evidenceIssues(c).get(id) ?? NONE;
}

/** A short label for a card badge. */
export function evidenceIssueLabel(issue: EvidenceIssue): string {
  switch (issue.kind) {
    case 'unbacked':
      return 'No evidence';
    case 'open-question':
      return issue.questionIds.length === 1 ? 'Open question' : `${issue.questionIds.length} open questions`;
    case 'dangling':
      return 'Not used';
  }
}

/** A sentence explaining the issue and how to resolve it. */
export function evidenceIssueHint(issue: EvidenceIssue): string {
  switch (issue.kind) {
    case 'unbacked':
      return 'No finding supports this conclusion. Connect a finding to it, directly or through a question.';
    case 'open-question':
      return issue.questionIds.length === 1
        ? 'This conclusion depends on a question nothing answers yet. Connect a finding to the question.'
        : 'This conclusion depends on questions nothing answers yet. Connect a finding to each one.';
    case 'dangling':
      return 'This finding is not connected to any topic, question or conclusion, so nothing in your argument uses it.';
  }
}
