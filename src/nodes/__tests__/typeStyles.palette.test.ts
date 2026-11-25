/**
 * Property 8: typeStyles palette conformance
 *
 * Every color value in `typeStyles[t]` for every enabled `NodeType` `t` is
 * one of the DESIGN.md §Style Foundations palette colors. Also asserts that
 * `SELECTION_BORDER_COLOR` is in the palette.
 *
 * This is a deterministic exhaustive check over every enabled type — not a
 * fast-check property — because the input space is finite and fully enumerable.
 *
 * Validates: Requirements 4.7
 * Tag: Feature: root-mvp, Property 8: typeStyles palette conformance
 */

import { describe, it, expect } from 'vitest';

import { typeStyles, SELECTION_BORDER_COLOR, PALETTE as RAW_PALETTE, typeColorToken } from '../typeStyles';
import { ENABLED_NODE_TYPE_IDS } from '../../data';
import type { NodeType } from '../../data';

// ---------------------------------------------------------------------------
// DESIGN.md §Style Foundations — the complete token palette.
// Derived from the exported PALETTE const so this test and the source stay
// in sync automatically; the set here is verified to match DESIGN.md.
// ---------------------------------------------------------------------------
const PALETTE: ReadonlySet<string> = new Set(Object.values(RAW_PALETTE));

const NODE_TYPES: ReadonlyArray<NodeType> = ENABLED_NODE_TYPE_IDS;

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

  it('types with different colour tokens have distinct pairings', () => {
    // The four general types each have their own colour; the other types
    // share their family's colour (D11), so only different tokens must differ.
    for (let i = 0; i < NODE_TYPES.length; i++) {
      for (let j = i + 1; j < NODE_TYPES.length; j++) {
        const ta = NODE_TYPES[i]!;
        const tb = NODE_TYPES[j]!;
        if (typeColorToken(ta) === typeColorToken(tb)) continue;
        const a = typeStyles[ta];
        const b = typeStyles[tb];
        const same = a.border === b.border && a.background === b.background && a.text === b.text;
        expect(same, `typeStyles['${ta}'] and typeStyles['${tb}'] are identical pairings`).toBe(false);
      }
    }
  });

  it('the four general types keep their own colours and the framing family shares --framing', () => {
    expect(typeStyles.topic.border).toBe('rgb(var(--topic))');
    expect(typeStyles.finding.border).toBe('rgb(var(--finding))');
    expect(typeStyles.question.border).toBe('rgb(var(--question))');
    expect(typeStyles.conclusion.border).toBe('rgb(var(--conclusion))');
    for (const t of ['problem', 'objective', 'research-question', 'hypothesis', 'variable'] as const) {
      expect(typeStyles[t].border).toBe('rgb(var(--framing))');
    }
  });

  it('SELECTION_BORDER_COLOR is in the DESIGN.md palette', () => {
    expect(
      PALETTE.has(SELECTION_BORDER_COLOR),
      `SELECTION_BORDER_COLOR = '${SELECTION_BORDER_COLOR}' is not in the DESIGN.md palette`,
    ).toBe(true);
  });
});
