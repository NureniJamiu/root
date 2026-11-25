/**
 * Evidence rules: unbacked conclusions, conclusions resting on open
 * questions, and findings nothing uses. The cases are the ones the client's
 * evidence checks had before the rule engine, now run against the engine.
 */

import { describe, expect, test } from 'vitest';

import type { Canvas, Edge, Node, NodeType } from '../../types';
import { issuesByNode, issuesFor, runRules } from '..';

const TS = '2024-01-01T00:00:00.000Z';
const TYPES: Record<string, NodeType> = { t: 'topic', f: 'finding', q: 'question', c: 'conclusion' };

/**
 * Cards named like `c1`, `f2`: the letter is the type. Edges given as
 * `'c1-f1'` (source-target).
 */
function build(cards: string[], edges: string[]): { c: Canvas; id: (name: string) => string } {
  const ids = new Map(cards.map((name, i) => [name, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`]));
  const id = (name: string): string => ids.get(name)!;
  const nodes: Node[] = cards.map((name) => ({
    id: id(name), title: name, body: '', images: [], type: TYPES[name[0]!]!, position: { x: 0, y: 0 },
    collapsed: false, createdAt: TS, updatedAt: TS, fields: {}, provenance: { origin: 'researcher' as const, edited: false },
  }));
  const es: Edge[] = edges.map((e, i) => {
    const [s, t] = e.split('-') as [string, string];
    return {
      id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      source: id(s), target: id(t), sourceSide: 'right', targetSide: 'left', sourcePinned: false, targetPinned: false,
      relationType: 'related-to' as const, provenance: { origin: 'researcher' as const, edited: false },
    };
  });
  return { c: { id: '20000000-0000-4000-8000-000000000000', schemaVersion: 2, title: '', nodes, edges: es, updatedAt: TS }, id };
}

const kinds = (c: Canvas, id: string): string[] => issuesFor(c, id).map((i) => i.ruleId);

describe('unbacked conclusions', () => {
  test('a conclusion with no finding is unbacked', () => {
    const { c, id } = build(['t1', 'c1'], ['t1-c1']);
    expect(kinds(c, id('c1'))).toEqual(['conclusion-unbacked']);
  });

  test('a connected finding backs it, whichever way the connector runs', () => {
    const a = build(['c1', 'f1'], ['c1-f1']);
    const b = build(['c1', 'f1'], ['f1-c1']);
    expect(kinds(a.c, a.id('c1'))).toEqual([]);
    expect(kinds(b.c, b.id('c1'))).toEqual([]);
  });

  test('a finding through an answered question or another conclusion backs it', () => {
    const viaQuestion = build(['c1', 'q1', 'f1'], ['c1-q1', 'q1-f1']);
    const viaConclusion = build(['c1', 'c2', 'f1'], ['c1-c2', 'c2-f1']);
    expect(kinds(viaQuestion.c, viaQuestion.id('c1'))).toEqual([]);
    expect(kinds(viaConclusion.c, viaConclusion.id('c1'))).toEqual([]);
  });

  test('a finding reached only through a topic does not count', () => {
    const { c, id } = build(['t1', 'c1', 'f1'], ['t1-c1', 't1-f1']);
    expect(kinds(c, id('c1'))).toEqual(['conclusion-unbacked']);
  });
});

describe('conclusions resting on open questions', () => {
  test('a question with no finding is open', () => {
    const { c, id } = build(['c1', 'f1', 'q1', 'q2'], ['c1-f1', 'q1-c1', 'c1-q2']);
    expect(issuesFor(c, id('c1'))).toEqual([
      {
        ruleId: 'conclusion-open-question',
        ruleVersion: 2,
        nodeIds: [id('c1'), id('q1'), id('q2')],
        edgeIds: [],
        label: '2 open questions',
        hint: 'This conclusion depends on questions nothing answers yet. Connect a finding to each one.',
      },
    ]);
  });

  test('a question a finding answers is not open', () => {
    const { c, id } = build(['c1', 'q1', 'f1'], ['c1-q1', 'f1-q1']);
    expect(kinds(c, id('c1'))).toEqual([]);
  });

  test('an unbacked conclusion can also rest on an open question', () => {
    const { c, id } = build(['c1', 'q1'], ['c1-q1']);
    expect(kinds(c, id('c1'))).toEqual(['conclusion-unbacked', 'conclusion-open-question']);
  });
});

describe('dangling findings', () => {
  test('a finding on its own, or among only findings, is dangling', () => {
    const { c, id } = build(['f1', 'f2', 'f3'], ['f2-f3']);
    expect(kinds(c, id('f1'))).toEqual(['finding-dangling']);
    expect(kinds(c, id('f2'))).toEqual(['finding-dangling']);
    expect(kinds(c, id('f3'))).toEqual(['finding-dangling']);
  });

  test('a chain of findings that reaches a topic is used', () => {
    const { c, id } = build(['t1', 'f1', 'f2'], ['t1-f1', 'f1-f2']);
    expect(kinds(c, id('f2'))).toEqual([]);
  });
});

test('topics and questions get no issues, and results are cached per canvas', () => {
  const { c, id } = build(['t1', 'q1'], []);
  expect(kinds(c, id('t1'))).toEqual([]);
  expect(kinds(c, id('q1'))).toEqual([]);
  expect(runRules(c)).toBe(runRules(c));
  expect(issuesByNode(c)).toBe(issuesByNode(c));
});

test('badges read as they did before the engine', () => {
  const { c, id } = build(['c1', 'q1', 'f1'], ['c1-q1']);
  const badge = (name: string) => issuesFor(c, id(name)).map((i) => i.label).join(' · ');
  expect(badge('c1')).toBe('No evidence · Open question');
  expect(badge('f1')).toBe('Not used');
  expect(issuesFor(c, id('c1')).map((i) => i.hint)).toEqual([
    'No finding supports this conclusion. Connect a finding to it, directly or through a question.',
    'This conclusion depends on a question nothing answers yet. Connect a finding to the question.',
  ]);
  expect(issuesFor(c, id('f1'))[0]!.hint).toBe(
    'This finding is not connected to any topic, question or conclusion, so nothing in your argument uses it.',
  );
});
