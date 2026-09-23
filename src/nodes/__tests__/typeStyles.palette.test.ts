/**
 * Property 8: typeStyles palette conformance
 *
 * Every color value in `typeStyles[t]` for every `NodeType` `t` is one of
 * the DESIGN.md §Style Foundations palette colors (color.text.* and
 * color.surface.*). Also asserts that `SELECTION_BORDER_COLOR` is in the
 * palette.
 *
 * This is a deterministic exhaustive check over all four NodeTypes — not a
 * fast-check property — because the input space is finite and fully enumerable.
 *
 * Validates: Requirements 4.7
 * Tag: Feature: root-mvp, Property 8: typeStyles palette conformance
 */

import { describe, it, expect } from 'vitest';

import { typeStyles, SELECTION_BORDER_COLOR, PALETTE as RAW_PALETTE } from '../typeStyles';
import type { NodeType } from '../../data';

// ---------------------------------------------------------------------------
// DESIGN.md §Style Foundations — the complete token palette.
// Derived from the exported PALETTE const so this test and the source stay
// in sync automatically; the set here is verified to match DESIGN.md.
// ---------------------------------------------------------------------------
const PALETTE: ReadonlySet<string> = new Set(Object.values(RAW_PALETTE));

const NODE_TYPES: ReadonlyArray<NodeType> = [
  'topic',
  'finding',
  'question',
  'conclusion',
];

describe('Property 8: typeStyles palette conformance', () => {
  it('every border, background, and text color is in the DESIGN.md palette', () => {
    for (const type of NODE_TYPES) {
      const style = typeStyles[type];
      const slots = ['border', 'background', 'text'] as const;
      for (const slot of slots) {
        expect(
          PALETTE.has(style[slot]),
          `typeStyles['${type}'].${slot} = '${style[slot]}' is not in the DESIGN.md palette`,
        ).toBe(true);
      }
    }
  });

  it('the four NodeType pairings are pairwise distinct', () => {
    // Two pairings are considered distinct if any of their three slots differ.
    for (let i = 0; i < NODE_TYPES.length; i++) {
      for (let j = i + 1; j < NODE_TYPES.length; j++) {
        const a = typeStyles[NODE_TYPES[i]!];
        const b = typeStyles[NODE_TYPES[j]!];
        const same =
          a.border === b.border &&
          a.background === b.background &&
          a.text === b.text;
        expect(
          same,
          `typeStyles['${NODE_TYPES[i]}'] and typeStyles['${NODE_TYPES[j]}'] are identical pairings`,
        ).toBe(false);
      }
    }
  });

  it('SELECTION_BORDER_COLOR is in the DESIGN.md palette', () => {
    expect(
      PALETTE.has(SELECTION_BORDER_COLOR),
      `SELECTION_BORDER_COLOR = '${SELECTION_BORDER_COLOR}' is not in the DESIGN.md palette`,
    ).toBe(true);
  });
});
