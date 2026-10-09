/**
 * Connector mutators: connect, updateEdge, removeEdge, plus the guards that
 * keep the canvas valid. Cards can have any number of connectors on any side.
 */

import fc from 'fast-check';
import { describe, expect, it, test } from 'vitest';

import { addChild, addNode, autoRouteEdge, connect, emptyCanvas, moveNode, moveNodes, removeEdge, updateEdge } from '../mutators';
import { canvasSchema } from '../schema';
import type { Canvas, Side } from '../types';

import { arbCanvas, arbSide } from './arbitraries';

function threeCards(): { c: Canvas; a: string; b: string; d: string } {
  let c = emptyCanvas();
  for (let i = 0; i < 3; i += 1) c = addNode(c, { position: { x: i * 400, y: 0 } });
  const [a, b, d] = c.nodes.map((n) => n.id) as [string, string, string];
  return { c, a, b, d };
}

describe('connect', () => {
  test('adds a connector with the given sides', () => {
    const { c, a, b } = threeCards();
    const next = connect(c, { source: a, target: b, sourceSide: 'bottom', targetSide: 'top' });
    expect(next.edges).toHaveLength(1);
    expect(next.edges[0]).toMatchObject({ source: a, target: b, sourceSide: 'bottom', targetSide: 'top' });
    expect(canvasSchema.safeParse(next).success).toBe(true);
  });

  test('a card can have several connectors, to different cards or to the same card on different sides', () => {
    const { c, a, b, d } = threeCards();
    let next = connect(c, { source: a, target: b, sourceSide: 'right', targetSide: 'left' });
    next = connect(next, { source: a, target: d, sourceSide: 'right', targetSide: 'left' });
    next = connect(next, { source: d, target: a, sourceSide: 'top', targetSide: 'top' });
    next = connect(next, { source: a, target: b, sourceSide: 'bottom', targetSide: 'bottom' });
    next = connect(next, { source: b, target: a, sourceSide: 'right', targetSide: 'right' });
    expect(next.edges).toHaveLength(5);
    expect(canvasSchema.safeParse(next).success).toBe(true);
  });

  test('a card can have several connectors arriving at the same side', () => {
    const { c, a, b, d } = threeCards();
    let next = connect(c, { source: a, target: d, sourceSide: 'right', targetSide: 'left' });
    next = connect(next, { source: b, target: d, sourceSide: 'right', targetSide: 'left' });
    expect(next.edges).toHaveLength(2);
  });

  test('rejects self connections, unknown cards and exact duplicates', () => {
    const { c, a, b } = threeCards();
    expect(connect(c, { source: a, target: a, sourceSide: 'right', targetSide: 'left' })).toBe(c);
    expect(connect(c, { source: a, target: crypto.randomUUID(), sourceSide: 'right', targetSide: 'left' })).toBe(c);
    const once = connect(c, { source: a, target: b, sourceSide: 'right', targetSide: 'left' });
    expect(connect(once, { source: a, target: b, sourceSide: 'right', targetSide: 'left' })).toBe(once);
  });

  test('every canvas reached through random sequences is valid', () => {
    fc.assert(fc.property(arbCanvas, (c) => canvasSchema.safeParse(c).success), { numRuns: 100 });
  });
});

describe('updateEdge', () => {
  test('moves either end to another side or another card, keeping the id', () => {
    const { c, a, b, d } = threeCards();
    const one = connect(c, { source: a, target: b, sourceSide: 'right', targetSide: 'left' });
    const id = one.edges[0]!.id;

    const side = updateEdge(one, id, { source: a, target: b, sourceSide: 'top', targetSide: 'left' });
    expect(side.edges[0]).toMatchObject({ id, sourceSide: 'top' });

    const other = updateEdge(one, id, { source: a, target: d, sourceSide: 'right', targetSide: 'bottom' });
    expect(other.edges[0]).toMatchObject({ id, target: d, targetSide: 'bottom' });
    expect(other.edges).toHaveLength(1);
  });

  test('rejects self connections, duplicates of another connector, and no-ops', () => {
    const { c, a, b } = threeCards();
    let two = connect(c, { source: a, target: b, sourceSide: 'right', targetSide: 'left' });
    two = connect(two, { source: a, target: b, sourceSide: 'top', targetSide: 'top' });
    const [first, second] = two.edges as [Canvas['edges'][number], Canvas['edges'][number]];

    expect(updateEdge(two, second.id, { source: a, target: a, sourceSide: 'top', targetSide: 'top' })).toBe(two);
    expect(updateEdge(two, second.id, { source: a, target: b, sourceSide: 'right', targetSide: 'left' })).toBe(two);
    expect(updateEdge(two, first.id, { ...first })).toBe(two);
    expect(updateEdge(two, crypto.randomUUID(), { ...first })).toBe(two);
  });

  test('random re-attachments keep the canvas valid', () => {
    fc.assert(
      fc.property(
        arbCanvas.filter((c) => c.edges.length > 0),
        arbSide,
        arbSide,
        (c, sourceSide: Side, targetSide: Side) => {
          const e = c.edges[0]!;
          const next = updateEdge(c, e.id, { source: e.source, target: e.target, sourceSide, targetSide });
          expect(canvasSchema.safeParse(next).success).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});

describe('removeEdge', () => {
  test('removes only that connector and keeps both cards', () => {
    const { c, a, b, d } = threeCards();
    let two = connect(c, { source: a, target: b, sourceSide: 'right', targetSide: 'left' });
    two = connect(two, { source: b, target: d, sourceSide: 'right', targetSide: 'left' });
    const next = removeEdge(two, two.edges[0]!.id);
    expect(next.edges).toEqual([two.edges[1]]);
    expect(next.nodes).toEqual(two.nodes);
    expect(removeEdge(two, crypto.randomUUID())).toBe(two);
  });
});

describe('pinned and automatic ends', () => {
  const ends = { sourceSide: 'right', targetSide: 'left' } as const;

  it('connect defaults to automatic ends; pins are kept when given', () => {
    const { c, a, b } = threeCards();
    expect(connect(c, { source: a, target: b, ...ends }).edges[0]).toMatchObject({ sourcePinned: false, targetPinned: false });
    expect(connect(c, { source: a, target: b, ...ends, targetPinned: true }).edges[0]).toMatchObject({
      sourcePinned: false,
      targetPinned: true,
    });
  });

  it('addChild leaves the ends automatic unless a side is asked for', () => {
    const { c, a } = threeCards();
    expect(addChild(c, a, { position: { x: 0, y: 500 } }).edges[0]).toMatchObject({
      sourceSide: 'bottom', targetSide: 'top', sourcePinned: false, targetPinned: false,
    });
    expect(addChild(c, a, { position: { x: 0, y: 500 }, targetSide: 'right' }).edges[0]).toMatchObject({
      targetSide: 'right', targetPinned: true, sourcePinned: false,
    });
  });

  it('moving a card re-resolves automatic ends and leaves pinned ends alone', () => {
    const { c, a, b } = threeCards(); // a at x=0, b at x=400
    let one = connect(c, { source: a, target: b, ...ends, targetPinned: true });
    one = moveNode(one, b, { x: 0, y: 600 }); // b is now below a
    expect(one.edges[0]).toMatchObject({ sourceSide: 'bottom', targetSide: 'left' }); // target pinned
    one = moveNode(one, b, { x: 800, y: 0 });
    expect(one.edges[0]).toMatchObject({ sourceSide: 'right', targetSide: 'left' });
  });

  it('moveNodes refreshes once for several cards', () => {
    const { c, a, b, d } = threeCards();
    let two = connect(c, { source: a, target: b, ...ends });
    two = connect(two, { source: b, target: d, ...ends });
    const next = moveNodes(two, new Map([[a, { x: 0, y: -500 }], [b, { x: 0, y: 0 }], [d, { x: 0, y: 500 }]]));
    expect(next.edges.map((e) => [e.sourceSide, e.targetSide])).toEqual([['bottom', 'top'], ['bottom', 'top']]);
  });

  it('updateEdge keeps the pin flags it is not given', () => {
    const { c, a, b } = threeCards();
    const one = connect(c, { source: a, target: b, ...ends, sourcePinned: true });
    const moved = updateEdge(one, one.edges[0]!.id, { source: a, target: b, sourceSide: 'right', targetSide: 'top', targetPinned: true });
    expect(moved.edges[0]).toMatchObject({ sourcePinned: true, targetPinned: true, targetSide: 'top' });
  });

  it('autoRouteEdge unpins both ends and takes the facing sides', () => {
    const { c, a, b } = threeCards();
    const pinned = connect(c, { source: a, target: b, sourceSide: 'top', targetSide: 'bottom', sourcePinned: true, targetPinned: true });
    const auto = autoRouteEdge(pinned, pinned.edges[0]!.id);
    expect(auto.edges[0]).toMatchObject({ sourceSide: 'right', targetSide: 'left', sourcePinned: false, targetPinned: false });
    expect(autoRouteEdge(auto, auto.edges[0]!.id)).toBe(auto);
    expect(autoRouteEdge(auto, crypto.randomUUID())).toBe(auto);
  });
});
