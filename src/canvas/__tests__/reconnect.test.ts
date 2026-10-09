import { describe, expect, it } from 'vitest';

import { addNode, emptyCanvas } from '../../data/mutators';
import {
  computeFacingSides,
  connectionToEnds,
  handleIdToSide,
  nearestSide,
  sourceHandleId,
  targetHandleId,
} from '../reconnect';

function twoCards(posA = { x: 0, y: 0 }, posB = { x: 500, y: 0 }) {
  let canvas = addNode(emptyCanvas(), { position: posA });
  canvas = addNode(canvas, { position: posB });
  return { canvas, a: canvas.nodes[0]!.id, b: canvas.nodes[1]!.id };
}

describe('handleIdToSide', () => {
  it('reads the side out of either handle id', () => {
    expect(handleIdToSide('source-left')).toBe('left');
    expect(handleIdToSide('target-right')).toBe('right');
    expect(handleIdToSide('source-top')).toBe('top');
    expect(handleIdToSide('target-bottom')).toBe('bottom');
    expect(handleIdToSide('nonsense')).toBeNull();
    expect(handleIdToSide(null)).toBeNull();
    expect(handleIdToSide(undefined)).toBeNull();
  });

  it('round-trips with the handle id builders', () => {
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      expect(handleIdToSide(sourceHandleId(side))).toBe(side);
      expect(handleIdToSide(targetHandleId(side))).toBe(side);
    }
  });
});

describe('connectionToEnds', () => {
  it('uses the side each handle names, on any side of either card', () => {
    const { canvas, a, b } = twoCards();
    expect(
      connectionToEnds(canvas, { source: a, target: b, sourceHandle: 'source-top', targetHandle: 'target-bottom' }),
    ).toEqual({ source: a, target: b, sourceSide: 'top', targetSide: 'bottom', sourcePinned: true, targetPinned: true });
    // Same-side connections are fine too.
    expect(
      connectionToEnds(canvas, { source: a, target: b, sourceHandle: 'source-left', targetHandle: 'source-left' }),
    ).toEqual({ source: a, target: b, sourceSide: 'left', targetSide: 'left', sourcePinned: true, targetPinned: true });
  });

  it('keeps the direction of the drag: source is where it started', () => {
    const { canvas, a, b } = twoCards();
    const ends = connectionToEnds(canvas, { source: b, target: a, sourceHandle: 'source-left', targetHandle: 'target-right' });
    expect(ends).toMatchObject({ source: b, target: a });
  });

  it('falls back to the facing sides when a handle names none', () => {
    const { canvas, a, b } = twoCards({ x: 0, y: 0 }, { x: 0, y: 500 });
    expect(connectionToEnds(canvas, { source: a, target: b })).toEqual({
      source: a, target: b, sourceSide: 'bottom', targetSide: 'top', sourcePinned: true, targetPinned: true,
    });
  });

  it('rejects self connections, missing ends and unknown cards', () => {
    const { canvas, a } = twoCards();
    expect(connectionToEnds(canvas, { source: a, target: a })).toBeNull();
    expect(connectionToEnds(canvas, { source: a, target: null })).toBeNull();
    expect(connectionToEnds(canvas, { source: null, target: a })).toBeNull();
    expect(connectionToEnds(canvas, { source: a, target: crypto.randomUUID() })).toBeNull();
  });
});

describe('nearestSide', () => {
  const rect = { left: 100, top: 100, width: 300, height: 120 };

  it.each([
    [{ x: 105, y: 160 }, 'left'],
    [{ x: 395, y: 160 }, 'right'],
    [{ x: 250, y: 105 }, 'top'],
    [{ x: 250, y: 215 }, 'bottom'],
  ] as const)('%j -> %s', (point, side) => {
    expect(nearestSide(rect, point)).toBe(side);
  });

  it('measures in fractions of the card so a wide card does not favour top and bottom', () => {
    // 40px from the left edge on a 300px card is 13%; 30px from the top on a 120px card is 25%.
    expect(nearestSide(rect, { x: 140, y: 130 })).toBe('left');
  });
});

describe('computeFacingSides', () => {
  it('picks the sides along the larger distance', () => {
    expect(computeFacingSides({ x: 0, y: 0 }, { x: 400, y: 100 })).toEqual({ sourceSide: 'right', targetSide: 'left' });
    expect(computeFacingSides({ x: 0, y: 0 }, { x: 100, y: -400 })).toEqual({ sourceSide: 'top', targetSide: 'bottom' });
  });
});
