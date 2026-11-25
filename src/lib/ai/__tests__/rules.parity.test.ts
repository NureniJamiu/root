/**
 * The gap check on the server and the card badges in the browser run the
 * same rule engine, so they report the same issues for the same canvas.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { addNode, connect, emptyCanvas } from '../../../data/mutators';
import { runRules } from '../../../data/rules';
import type { Canvas, NodeType } from '../../../data/types';
import { arbRichCanvas } from '../../../data/__tests__/arbitraries';
import { promptGraph, ruleIssues } from '../features';
import { toPromptCanvas } from '../project-content';

/** What the server finds for the canvas the browser sends it. */
const serverIssues = (c: Canvas) => runRules(promptGraph(toPromptCanvas(c)));

function withCards(types: NodeType[], links: [number, number][]): Canvas {
  let c = emptyCanvas();
  for (const [i, type] of types.entries()) c = addNode(c, { position: { x: i * 300, y: 0 }, type, title: `${type} ${i}` });
  for (const [s, t] of links) {
    c = connect(c, { source: c.nodes[s]!.id, target: c.nodes[t]!.id, sourceSide: 'right', targetSide: 'left' });
  }
  return c;
}

describe('server and client rule issues', () => {
  it('match for a canvas where every evidence rule fires, including the transitive ones', () => {
    // c0 — q1 — c2 — f3, and c4 — q1: c0 and c4 are backed only through the question and c2,
    // which the old server check missed. q1 is answered by nothing, so c0, c2 and c4 rest on it.
    // f5 is on its own and c6 has nothing behind it.
    const c = withCards(
      ['conclusion', 'question', 'conclusion', 'finding', 'conclusion', 'finding', 'conclusion'],
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [4, 1],
      ],
    );
    const [c0, q1, c2, , c4, f5, c6] = c.nodes.map((n) => n.id);
    const client = runRules(c);
    expect(client.map((i) => [i.ruleId, i.nodeIds])).toEqual([
      ['conclusion-unbacked', [c6]],
      ['conclusion-open-question', [c0, q1]],
      ['conclusion-open-question', [c2, q1]],
      ['conclusion-open-question', [c4, q1]],
      ['finding-dangling', [f5]],
    ]);
    expect(serverIssues(c)).toStrictEqual(client);
    const review = ruleIssues(toPromptCanvas(c));
    expect(review.map((i) => [i.ruleId, i.ruleVersion, i.sources])).toEqual(
      client.map((i) => [i.ruleId, i.ruleVersion, i.nodeIds.map((ideaId) => ({ kind: 'idea', ideaId }))]),
    );
  });

  it('match for any canvas', () => {
    fc.assert(
      fc.property(arbRichCanvas, (c) => {
        expect(serverIssues(c)).toStrictEqual(runRules(c));
      }),
      { numRuns: 200 },
    );
  });
});
