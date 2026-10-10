import { beforeEach, describe, expect, it } from 'vitest';

import { aiProposalActions, includedIdeas, setAiDecisionListener, useAiProposalStore } from '../aiProposals';
import type { AiProposal, GhostIdea } from '../aiProposals';
import { emptyCanvas } from '../mutators';
import { canvasActions, useCanvasStore } from '../store';

const canvas = () => useCanvasStore.getState().canvas;

const ghost = (key: string, parentKey: string | null, x = 0): GhostIdea => ({
  key,
  title: `Idea ${key}`,
  body: `Notes ${key}`,
  type: 'finding',
  parentKey,
  position: { x, y: 0 },
});

const proposal = (over: Partial<AiProposal> = {}): AiProposal => ({
  kind: 'map',
  anchorId: null,
  ideas: [ghost('a', null), ghost('b', 'a', 400), ghost('c', 'b', 800)],
  excluded: [],
  modelLabel: 'Test model',
  ...over,
});

describe('AI proposals', () => {
  beforeEach(() => {
    canvasActions.loadCanvas(emptyCanvas());
    aiProposalActions.clear();
  });

  it('re-hangs ideas whose parent was left out', () => {
    const ideas = includedIdeas(proposal({ excluded: ['b'] }));
    expect(ideas.map((i) => [i.key, i.parentKey])).toEqual([
      ['a', null],
      ['c', 'a'],
    ]);
  });

  it('adds a map as one connected tree in one undo step', () => {
    aiProposalActions.propose(proposal());
    const ids = aiProposalActions.accept();
    expect(Object.keys(ids)).toEqual(['a', 'b', 'c']);
    expect(canvas().nodes.map((n) => n.title)).toEqual(['Idea a', 'Idea b', 'Idea c']);
    expect(canvas().edges.map((e) => [e.source, e.target])).toEqual([
      [ids.a, ids.b],
      [ids.b, ids.c],
    ]);
    expect(useAiProposalStore.getState().proposal).toBeNull();
    canvasActions.undo();
    expect(canvas().nodes).toHaveLength(0);
  });

  it('hangs an expansion from its idea and skips left-out ideas', () => {
    canvasActions.addNode({ x: 0, y: 0 });
    const anchor = canvas().nodes[0]!.id;
    canvasActions.closeEditor();
    aiProposalActions.propose(
      proposal({ kind: 'expand', anchorId: anchor, ideas: [ghost('x', null), ghost('y', null)], excluded: ['y'] }),
    );
    aiProposalActions.toggle('y');
    aiProposalActions.toggle('x');
    const ids = aiProposalActions.accept();
    expect(Object.keys(ids)).toEqual(['y']);
    expect(canvas().edges.map((e) => [e.source, e.target])).toEqual([[anchor, ids.y]]);
  });

  it('discards without touching the canvas', () => {
    aiProposalActions.propose(proposal());
    aiProposalActions.clear();
    expect(canvas().nodes).toHaveLength(0);
    expect(aiProposalActions.accept()).toEqual({});
  });

  it('tracks pending requests and errors', () => {
    aiProposalActions.start({ kind: 'expand', anchorId: null });
    expect(useAiProposalStore.getState().pending).not.toBeNull();
    aiProposalActions.fail('Nope');
    expect(useAiProposalStore.getState()).toMatchObject({ pending: null, error: 'Nope' });
  });

  it('reports how many suggestions were kept', () => {
    const decisions: Array<[string, number, number]> = [];
    setAiDecisionListener((kind, offered, accepted) => decisions.push([kind, offered, accepted]));
    aiProposalActions.propose(proposal({ excluded: ['c'] }));
    aiProposalActions.accept();
    aiProposalActions.propose(proposal({ kind: 'capture' }));
    aiProposalActions.clear();
    aiProposalActions.clear();
    setAiDecisionListener(null);
    expect(decisions).toEqual([
      ['map', 3, 2],
      ['capture', 3, 0],
    ]);
  });

  it('applies several edits as one undo step', () => {
    aiProposalActions.propose(proposal());
    const ids = aiProposalActions.accept();
    const before = canvas();
    const applied = canvasActions.applyEdits({
      updates: [
        { id: ids.a!, patch: { type: 'question' } },
        { id: ids.b!, patch: { title: 'Renamed' } },
        { id: 'missing', patch: { title: 'x' } },
      ],
      connections: [
        { source: ids.a!, target: ids.c! },
        { source: ids.a!, target: 'missing' },
      ],
    });
    expect(applied).toBe(3);
    expect(canvas().nodes.find((n) => n.id === ids.a)!.type).toBe('question');
    expect(canvas().nodes.find((n) => n.id === ids.b)!.title).toBe('Renamed');
    expect(canvas().edges).toHaveLength(3);
    canvasActions.undo();
    expect(canvas()).toEqual(before);
  });
});
