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
  relation: null,
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

  it('records accepted ideas and their connectors as AI-made, with the feature and model', () => {
    aiProposalActions.propose(proposal());
    aiProposalActions.accept();
    const { nodes, edges } = canvas();
    expect(nodes).toHaveLength(3);
    expect(edges).toHaveLength(2);
    for (const item of [...nodes, ...edges]) {
      expect(item.provenance).toMatchObject({
        origin: 'ai',
        ai: { feature: 'ai.map', model: 'Test model', acceptedAt: expect.any(String) },
        edited: false,
      });
    }
    expect(edges.every((e) => e.relationType === 'related-to')).toBe(true);
  });

  it('records the feature each kind of proposal comes from', () => {
    canvasActions.addNode({ x: 0, y: 0 });
    const anchor = canvas().nodes[0]!.id;
    canvasActions.closeEditor();
    aiProposalActions.propose(proposal({ kind: 'expand', anchorId: anchor, ideas: [ghost('a', null)], modelLabel: '' }));
    aiProposalActions.accept();
    const added = canvas().nodes[1]!;
    expect(canvas().nodes[0]!.provenance.origin).toBe('researcher');
    expect(added.provenance).toMatchObject({ origin: 'ai', ai: { feature: 'ai.expand', model: 'Unknown model' } });
    expect(canvas().edges[0]!.provenance).toStrictEqual(added.provenance);
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

  it('links an accepted connect suggestion as related-to, the plain link it was shown as', () => {
    aiProposalActions.propose(proposal({ ideas: [ghost('f', null), { ...ghost('c', null, 400), type: 'conclusion' }] }));
    const ids = aiProposalActions.accept();
    canvasActions.applyEdits({ updates: [], connections: [{ source: ids.f!, target: ids.c! }] });
    const [edge] = canvas().edges;
    expect(edge).toMatchObject({ source: ids.f, target: ids.c, relationType: 'related-to' });
    // Drawn by hand, the same pair starts with the map's usual relation.
    canvasActions.undo();
    canvasActions.connect({ source: ids.f!, target: ids.c!, sourceSide: 'right', targetSide: 'left' });
    expect(canvas().edges[0]!.relationType).toBe('supports');
  });

  it('adds each connector with the relation its suggestion showed', () => {
    aiProposalActions.propose(
      proposal({
        ideas: [
          { ...ghost('q', null), type: 'question' },
          { ...ghost('f', 'q', 400), relation: 'answers' },
          { ...ghost('c', 'f', 800), type: 'conclusion', relation: 'supports' },
        ],
      }),
    );
    const ids = aiProposalActions.accept();
    expect(canvas().edges.map((e) => [e.source, e.target, e.relationType, e.provenance.origin])).toEqual([
      [ids.q, ids.f, 'answers', 'ai'],
      [ids.f, ids.c, 'supports', 'ai'],
    ]);
  });

  it('drops the relation of an idea re-hung because its parent was left out', () => {
    const p = proposal({
      ideas: [
        { ...ghost('t', null), type: 'topic' },
        { ...ghost('q', 't', 400), type: 'question' },
        { ...ghost('f', 'q', 800), relation: 'answers' },
      ],
      excluded: ['q'],
    });
    expect(includedIdeas(p).map((i) => [i.key, i.parentKey, i.relation])).toEqual([
      ['t', null, null],
      ['f', 't', null],
    ]);
    aiProposalActions.propose(p);
    aiProposalActions.accept();
    expect(canvas().edges.map((e) => e.relationType)).toEqual(['related-to']);
  });

  it('gives a plain connector the meaning a tidy suggestion showed, and only a plain one', () => {
    aiProposalActions.propose(
      proposal({ ideas: [ghost('f', null), { ...ghost('c', 'f', 400), type: 'conclusion' }, { ...ghost('g', null, 800) }] }),
    );
    const ids = aiProposalActions.accept();
    const plain = canvas().edges[0]!;
    const tidy = { origin: 'ai' as const, ai: { feature: 'ai.tidy' as const, model: 'Gemini', acceptedAt: '2026-01-01T00:00:00.000Z' }, edited: false };
    const applied = canvasActions.applyEdits(
      {
        updates: [],
        connections: [{ source: ids.g!, target: ids.c!, relation: 'supports' }],
        // Drawn f → c; the suggestion names the pair the other way round.
        relations: [{ source: ids.c!, target: ids.f!, relation: 'supports' }],
      },
      tidy,
    );
    expect(applied).toBe(2);
    const after = canvas().edges;
    expect(after.find((e) => e.id === plain.id)).toMatchObject({ relationType: 'supports', provenance: { edited: true } });
    expect(after.find((e) => e.source === ids.g)).toMatchObject({ relationType: 'supports', provenance: tidy });
    // A connector that already means something is left alone.
    expect(canvasActions.applyEdits({ updates: [], connections: [], relations: [{ source: ids.f!, target: ids.c!, relation: 'contradicts' }] })).toBe(0);
  });
});
