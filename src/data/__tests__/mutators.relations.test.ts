/**
 * Typed connectors (plan slice S5): a drawn connector starts with the validity
 * map's default relation for its two card types, and `setEdgeRelation`
 * changes what it means as one undo step.
 */

import { describe, expect, test } from 'vitest';

import { ENABLED_NODE_TYPE_IDS, defaultRelation } from '../model';
import { addChild, addNode, connect, emptyCanvas, setEdgeRelation, updateEdge } from '../mutators';
import { canvasSchema } from '../schema';
import { canvasActions, useCanvasStore } from '../store';
import type { Canvas, NodeType } from '../types';

const ends = { sourceSide: 'right', targetSide: 'left' } as const;

function twoCards(from: NodeType, to: NodeType): { c: Canvas; a: string; b: string } {
  let c = addNode(emptyCanvas(), { position: { x: 0, y: 0 }, type: from });
  c = addNode(c, { position: { x: 400, y: 0 }, type: to });
  return { c, a: c.nodes[0]!.id, b: c.nodes[1]!.id };
}

describe('default relation on connect', () => {
  test('every pair of enabled types gets the map default, whichever way it is drawn', () => {
    for (const from of ENABLED_NODE_TYPE_IDS) {
      for (const to of ENABLED_NODE_TYPE_IDS) {
        const { c, a, b } = twoCards(from, to);
        const next = connect(c, { source: a, target: b, ...ends });
        expect(next.edges[0]!.relationType, `${from} → ${to}`).toBe(defaultRelation(from, to));
        expect(canvasSchema.safeParse(next).success).toBe(true);
      }
    }
  });

  test('picks the typed relation for usual pairs and related-to otherwise', () => {
    const drawn = (from: NodeType, to: NodeType) => {
      const { c, a, b } = twoCards(from, to);
      return connect(c, { source: a, target: b, ...ends }).edges[0]!.relationType;
    };
    expect(drawn('finding', 'conclusion')).toBe('supports');
    expect(drawn('conclusion', 'finding')).toBe('supports');
    expect(drawn('finding', 'question')).toBe('answers');
    expect(drawn('research-question', 'objective')).toBe('addresses');
    expect(drawn('hypothesis', 'variable')).toBe('involves');
    expect(drawn('objective', 'objective')).toBe('refines');
    expect(drawn('finding', 'finding')).toBe('related-to');
    expect(drawn('topic', 'question')).toBe('related-to');
  });

  test('a new connected idea and a re-attached connector keep their relation', () => {
    const { c, a, b } = twoCards('finding', 'conclusion');
    const child = addChild(c, a, { position: { x: 0, y: 400 } });
    expect(child.edges[0]!.relationType).toBe('related-to');
    const typed = connect(c, { source: a, target: b, ...ends });
    const moved = updateEdge(typed, typed.edges[0]!.id, { source: a, target: b, sourceSide: 'bottom', targetSide: 'top' });
    expect(moved.edges[0]!.relationType).toBe('supports');
  });
});

describe('setEdgeRelation', () => {
  test('sets the relation, even one that does not fit, and the canvas still parses', () => {
    const { c, a, b } = twoCards('finding', 'conclusion');
    const one = connect(c, { source: a, target: b, ...ends });
    const id = one.edges[0]!.id;
    const contradicted = setEdgeRelation(one, id, 'contradicts');
    expect(contradicted.edges[0]!.relationType).toBe('contradicts');
    const misfit = setEdgeRelation(one, id, 'involves');
    expect(misfit.edges[0]!.relationType).toBe('involves');
    expect(canvasSchema.safeParse(misfit).success).toBe(true);
  });

  test('an unchanged relation or an unknown connector changes nothing', () => {
    const { c, a, b } = twoCards('finding', 'conclusion');
    const one = connect(c, { source: a, target: b, ...ends });
    expect(setEdgeRelation(one, one.edges[0]!.id, 'supports')).toBe(one);
    expect(setEdgeRelation(one, crypto.randomUUID(), 'answers')).toBe(one);
  });

  test('changing what an AI-made connector means marks it edited', () => {
    const { c, a, b } = twoCards('finding', 'conclusion');
    const one = connect(c, { source: a, target: b, ...ends });
    const ai = {
      ...one,
      edges: one.edges.map((e) => ({
        ...e,
        provenance: {
          origin: 'ai' as const,
          ai: { feature: 'ai.capture' as const, model: 'Claude Sonnet', acceptedAt: '2026-11-25T10:00:00.000Z' },
          edited: false,
        },
      })),
    };
    expect(setEdgeRelation(ai, ai.edges[0]!.id, 'contradicts').edges[0]!.provenance).toMatchObject({ origin: 'ai', edited: true });
  });

  test('the store action is one undo step', () => {
    const { c, a, b } = twoCards('finding', 'conclusion');
    canvasActions.loadCanvas(connect(c, { source: a, target: b, ...ends }));
    const id = useCanvasStore.getState().canvas.edges[0]!.id;
    canvasActions.setEdgeRelation(id, 'contradicts');
    expect(useCanvasStore.getState().canvas.edges[0]!.relationType).toBe('contradicts');
    canvasActions.undo();
    expect(useCanvasStore.getState().canvas.edges[0]!.relationType).toBe('supports');
  });
});
