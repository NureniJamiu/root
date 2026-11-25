/**
 * The M0 structural rules (plan slice S6): problem-framing gaps, connectors
 * whose relation does not fit, and the relation-aware evidence refinement.
 * Each rule has at least one case where it fires and one where it does not.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { arbCanvas } from '../../__tests__/arbitraries';
import type { Canvas } from '../../types';
import { issuesFor, runRules } from '..';
import { build } from './build';

const kinds = (c: Canvas, id: string): string[] => issuesFor(c, id).map((i) => i.ruleId);

describe('rq-without-objective', () => {
  test('a research question on its own, or only related to an objective, has no objective', () => {
    const alone = build(['rq1'], []);
    const related = build(['rq1', 'o1'], ['rq1>o1:related-to']);
    expect(kinds(alone.c, alone.id('rq1'))).toEqual(['rq-without-objective']);
    expect(kinds(related.c, related.id('rq1'))).toContain('rq-without-objective');
    expect(issuesFor(alone.c, alone.id('rq1'))[0]).toMatchObject({
      label: 'No objective',
      hint: 'This research question is not linked to an objective. Connect it to the objective it addresses.',
    });
  });

  test('addressing an objective clears it, whichever way the connector was drawn', () => {
    const forward = build(['rq1', 'o1'], ['rq1>o1:addresses']);
    const drawnBack = build(['rq1', 'o1'], ['o1>rq1:addresses']);
    expect(kinds(forward.c, forward.id('rq1'))).toEqual([]);
    expect(kinds(drawnBack.c, drawnBack.id('rq1'))).toEqual([]);
  });

  test('a sub-question inherits the objective of the question it refines', () => {
    const { c, id } = build(['rq1', 'rq2', 'o1'], ['rq1>o1:addresses', 'rq2>rq1:refines']);
    expect(kinds(c, id('rq2'))).toEqual([]);
    // The broader question does not inherit from the narrower one.
    const reversed = build(['rq1', 'rq2', 'o1'], ['rq2>o1:addresses', 'rq2>rq1:refines']);
    expect(kinds(reversed.c, reversed.id('rq1'))).toEqual(['rq-without-objective']);
  });
});

describe('objective-without-rq', () => {
  test('an objective no research question addresses is a coverage gap', () => {
    const { c, id } = build(['o1', 'rq1'], ['o1>rq1:related-to']);
    expect(kinds(c, id('o1'))).toEqual(['objective-without-rq']);
  });

  test('a research question addressing it, or a narrower objective, covers it', () => {
    const direct = build(['o1', 'rq1'], ['rq1>o1:addresses']);
    const viaNarrower = build(['o1', 'o2', 'rq1'], ['o2>o1:refines', 'rq1>o2:addresses']);
    expect(kinds(direct.c, direct.id('o1'))).toEqual([]);
    expect(kinds(viaNarrower.c, viaNarrower.id('o1'))).toEqual([]);
    expect(kinds(viaNarrower.c, viaNarrower.id('o2'))).toEqual([]);
  });
});

describe('objective-off-problem', () => {
  test('stays quiet until the project has a problem statement', () => {
    const { c, id } = build(['o1', 'rq1'], ['rq1>o1:addresses']);
    expect(kinds(c, id('o1'))).toEqual([]);
  });

  test('flags an objective that does not address the problem', () => {
    const { c, id } = build(['p1', 'o1', 'rq1'], ['rq1>o1:addresses', 'o1>p1:related-to']);
    expect(kinds(c, id('o1'))).toEqual(['objective-off-problem']);
  });

  test('addressing the problem, directly or through a broader objective, clears it', () => {
    const direct = build(['p1', 'o1', 'rq1'], ['o1>p1:addresses', 'rq1>o1:addresses']);
    const inherited = build(['p1', 'o1', 'o2', 'rq1'], ['o1>p1:addresses', 'o2>o1:refines', 'rq1>o2:addresses']);
    expect(kinds(direct.c, direct.id('o1'))).toEqual([]);
    expect(kinds(inherited.c, inherited.id('o2'))).toEqual([]);
  });
});

describe('hypothesis-without-variable', () => {
  test('a hypothesis that involves no variable is flagged', () => {
    const alone = build(['h1'], []);
    const related = build(['h1', 'v1'], ['h1>v1:related-to']);
    expect(kinds(alone.c, alone.id('h1'))).toEqual(['hypothesis-without-variable']);
    expect(kinds(related.c, related.id('h1'))).toEqual(['hypothesis-without-variable']);
  });

  test('involving a variable clears it', () => {
    const { c, id } = build(['h1', 'v1'], ['v1>h1:involves']);
    expect(kinds(c, id('h1'))).toEqual([]);
  });
});

describe('relation-invalid', () => {
  test('a relation the map does not allow for its cards is flagged on the card it was drawn from', () => {
    // A question retyped to a conclusion leaves an `answers` connector that no longer fits.
    const { c, id, edgeId } = build(['f1', 'c1'], ['f1>c1:answers']);
    expect(issuesFor(c, id('f1'))).toEqual([
      expect.objectContaining({
        ruleId: 'relation-invalid',
        nodeIds: [id('f1'), id('c1')],
        edgeIds: [edgeId(0)],
        label: "Connector doesn't fit",
      }),
    ]);
    // The connector is flagged, not removed or changed.
    expect(c.edges).toHaveLength(1);
    expect(c.edges[0]!.relationType).toBe('answers');
  });

  test('several bad connectors from one card make one issue', () => {
    const { c, id } = build(['f1', 'c1', 't1'], ['f1>c1:answers', 'f1>t1:supports']);
    const [only, ...rest] = issuesFor(c, id('f1')).filter((i) => i.ruleId === 'relation-invalid');
    expect(rest).toEqual([]);
    expect(only).toMatchObject({ nodeIds: [id('f1'), id('c1'), id('t1')], label: "2 connectors don't fit" });
  });

  test('fitting relations, including related-to between any cards, are not flagged', () => {
    const { c } = build(['f1', 'c1', 't1', 'rq1', 'o1'], ['f1>c1:supports', 't1>rq1', 'rq1>o1:addresses', 'c1>f1:contradicts']);
    expect(runRules(c).filter((i) => i.ruleId === 'relation-invalid')).toEqual([]);
  });
});

describe('evidence rules read relation types', () => {
  test('a conclusion whose only finding contradicts it has no evidence', () => {
    const { c, id } = build(['f1', 'c1'], ['f1>c1:contradicts']);
    expect(kinds(c, id('c1'))).toEqual(['conclusion-unbacked']);
  });

  test('a contradicting finding is still part of the argument, so it is not dangling', () => {
    const { c, id } = build(['f1', 'f2', 'c1'], ['f1>c1:contradicts', 'f2>c1:supports']);
    expect(kinds(c, id('f1'))).toEqual([]);
    expect(kinds(c, id('c1'))).toEqual([]);
  });

  test('contradicts does not pass backing along a chain', () => {
    const { c, id } = build(['c1', 'c2', 'f1'], ['c1>c2', 'f1>c2:contradicts']);
    expect(kinds(c, id('c1'))).toEqual(['conclusion-unbacked']);
    expect(kinds(c, id('c2'))).toEqual(['conclusion-unbacked']);
  });

  test('supports and answers back a conclusion as related-to did', () => {
    const direct = build(['f1', 'c1'], ['f1>c1:supports']);
    const viaQuestion = build(['c1', 'q1', 'f1'], ['c1>q1', 'f1>q1:answers']);
    expect(kinds(direct.c, direct.id('c1'))).toEqual([]);
    expect(kinds(viaQuestion.c, viaQuestion.id('c1'))).toEqual([]);
  });

  test('a research question passes backing and can be left open, like a question', () => {
    const answered = build(['c1', 'rq1', 'o1', 'f1'], ['c1>rq1', 'f1>rq1:answers', 'rq1>o1:addresses']);
    const open = build(['c1', 'rq1', 'o1'], ['c1>rq1', 'rq1>o1:addresses']);
    expect(kinds(answered.c, answered.id('c1'))).toEqual([]);
    expect(kinds(open.c, open.id('c1'))).toEqual(['conclusion-unbacked', 'conclusion-open-question']);
  });
});

/** The canvas as it reads after the v1 → v2 migration: every connector `related-to`. */
const asMigrated = (c: Canvas): Canvas => ({
  ...c,
  edges: c.edges.map((e) => ({ ...e, relationType: 'related-to' as const })),
});

describe('old canvases', () => {
  const EVIDENCE = new Set(['conclusion-unbacked', 'conclusion-open-question', 'finding-dangling']);

  test('raise only the evidence checks they raised before', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        const migrated = asMigrated(c);
        expect(runRules(migrated).every((i) => EVIDENCE.has(i.ruleId))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  test('get the same evidence issues whatever fitting relations their connectors carry', () => {
    fc.assert(
      fc.property(arbCanvas, (c) => {
        // The mutators give new connectors their pair's default (supports, answers, related-to).
        const typed = { ...c, edges: c.edges.filter((e) => e.relationType !== 'contradicts') };
        const strip = (x: Canvas) => runRules(x).filter((i) => EVIDENCE.has(i.ruleId));
        expect(strip(typed)).toEqual(strip(asMigrated(typed)));
      }),
      { numRuns: 200 },
    );
  });
});
