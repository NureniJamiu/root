/**
 * The next-steps panel is deterministic (M0 plan D10): rule issues first,
 * then the cards a stage starts with that the project lacks.
 */
import { describe, expect, it } from 'vitest';

import { addNode, connect, emptyCanvas } from '../../data/mutators';
import type { Canvas, NodeType } from '../../data/types';
import { NEXT_STEPS_MAX, nextSteps } from '../nextSteps';

function withCards(types: NodeType[]): Canvas {
  return types.reduce((c, type, i) => addNode(c, { position: { x: i * 300, y: 0 }, type }), emptyCanvas());
}

const ids = (c: Canvas, focus: Parameters<typeof nextSteps>[1]) => nextSteps(c, focus).map((s) => s.id);

describe('nextSteps', () => {
  it('asks for the cards a stage starts with', () => {
    expect(ids(emptyCanvas(), 'topic')).toEqual(['add-topic']);
    expect(ids(emptyCanvas(), 'problem')).toEqual(['add-problem', 'add-objective', 'add-research-question']);
    expect(nextSteps(emptyCanvas(), 'problem')[1]!.action).toEqual({ kind: 'add', type: 'objective', label: 'Add objective' });
  });

  it('puts rule issues first, pointing at the first card, and drops starters already there', () => {
    const c = withCards(['research-question', 'research-question']);
    const steps = nextSteps(c, 'problem');
    expect(steps.map((s) => s.id)).toEqual(['issue-rq-without-objective', 'add-problem', 'add-objective']);
    expect(steps[0]).toMatchObject({
      text: '2 research questions are not linked to an objective.',
      action: { kind: 'show', nodeId: c.nodes[0]!.id, label: 'Show' },
    });
  });

  it('clears an issue once the graph is fixed', () => {
    const c = withCards(['objective', 'research-question']);
    const [o, rq] = c.nodes.map((n) => n.id) as [string, string];
    const fixed = connect(c, { source: o, target: rq, sourceSide: 'right', targetSide: 'left' });
    expect(ids(fixed, 'problem')).toEqual(['add-problem']);
  });

  it('says which stages have no workspace yet, and offers Write view for writing up', () => {
    expect(ids(emptyCanvas(), 'data')).toEqual(['add-finding', 'later-data']);
    expect(nextSteps(emptyCanvas(), 'documentation')).toEqual([
      expect.objectContaining({ id: 'later-documentation', action: { kind: 'write', label: 'Open Write view' } }),
    ]);
  });

  it('lists every stage’s issues and no starters when no stage is in focus', () => {
    const c = withCards(['research-question', 'finding']);
    expect(ids(c, null)).toEqual(['issue-rq-without-objective', 'issue-finding-dangling']);
    expect(ids(emptyCanvas(), null)).toEqual([]);
  });

  it('shows at most a handful of steps', () => {
    const c = withCards(['research-question', 'objective', 'hypothesis', 'finding', 'conclusion', 'problem']);
    expect(nextSteps(c, null).length).toBeLessThanOrEqual(NEXT_STEPS_MAX);
  });
});
