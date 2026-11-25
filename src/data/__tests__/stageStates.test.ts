/**
 * Stages as views (M0 plan D10): stage state is derived from the cards, and
 * workspace state is saved with the canvas but kept out of undo history.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { STAGE_IDS } from '../model/stages';
import { addNode, connect, emptyCanvas, setWorkspace } from '../mutators';
import { canvasSchema } from '../schema';
import { stageStates, stageTypes } from '../stageStates';
import { canvasActions, useCanvasStore } from '../store';
import type { Canvas, NodeType } from '../types';

function withCards(types: NodeType[]): Canvas {
  return types.reduce((c, type, i) => addNode(c, { position: { x: i * 300, y: 0 }, type }), emptyCanvas());
}

const stateOf = (c: Canvas) => Object.fromEntries(stageStates(c).map((s) => [s.stage, [s.state, s.cards, s.issues.length]]));

describe('stageStates', () => {
  it('lists every stage in journey order, not started on an empty canvas', () => {
    const states = stageStates(emptyCanvas());
    expect(states.map((s) => s.stage)).toEqual(STAGE_IDS);
    expect(states.every((s) => s.state === 'not-started' && s.cards === 0 && s.issues.length === 0)).toBe(true);
  });

  it('marks a stage in progress once it has a card of one of its types', () => {
    const c = withCards(['objective', 'research-question', 'finding']);
    const s = stateOf(c);
    expect(s.problem).toEqual(['in-progress', 2, 2]); // the question has no objective; the objective has no question
    expect(s.literature).toEqual(['in-progress', 1, 1]); // the finding is not used
    expect(s.topic).toEqual(['not-started', 0, 0]);
    expect(s.documentation).toEqual(['not-started', 0, 0]);
  });

  it('counts the issues of a stage’s cards and clears them as the graph is fixed', () => {
    const before = withCards(['objective', 'research-question']);
    const [o, rq] = before.nodes.map((n) => n.id) as [string, string];
    const after = connect(before, { source: rq, target: o, sourceSide: 'right', targetSide: 'left' });
    expect(after.edges[0]!.relationType).toBe('addresses');
    expect(stateOf(after).problem).toEqual(['in-progress', 2, 0]);
  });

  it('knows which types belong to a stage', () => {
    expect([...stageTypes('problem')]).toEqual(['problem', 'objective', 'research-question', 'hypothesis', 'variable']);
    expect([...stageTypes('framework')]).toEqual([]);
    const c = emptyCanvas();
    expect(stageStates(c)).toBe(stageStates(c));
  });
});

describe('workspace state', () => {
  beforeEach(() => canvasActions.loadCanvas(emptyCanvas()));
  const canvas = () => useCanvasStore.getState().canvas;

  it('merges and removes keys, and leaves an unchanged canvas alone', () => {
    const c = setWorkspace(emptyCanvas(), { focusStage: 'problem' });
    expect(c.workspace).toEqual({ focusStage: 'problem' });
    expect(setWorkspace(c, { focusStage: 'problem' })).toBe(c);
    expect(setWorkspace(c, { focusStage: undefined }).workspace).toEqual({});
    expect(canvasSchema.safeParse(c).success).toBe(true);
  });

  it('is saved with the canvas but never moved by undo or redo', () => {
    canvasActions.addNode({ x: 0, y: 0 });
    canvasActions.closeEditor();
    canvasActions.setWorkspace({
      intake: { answer: 'has-topic', answeredAt: '2026-01-01T00:00:00.000Z' },
      focusStage: 'problem',
    });
    expect(canvas().workspace?.focusStage).toBe('problem');
    canvasActions.undo();
    expect(canvas().nodes).toHaveLength(0);
    expect(canvas().workspace).toEqual({
      intake: { answer: 'has-topic', answeredAt: '2026-01-01T00:00:00.000Z' },
      focusStage: 'problem',
    });
    canvasActions.setWorkspace({ focusStage: undefined });
    canvasActions.redo();
    expect(canvas().nodes).toHaveLength(1);
    expect(canvas().workspace).toEqual({ intake: { answer: 'has-topic', answeredAt: '2026-01-01T00:00:00.000Z' } });
  });
});
