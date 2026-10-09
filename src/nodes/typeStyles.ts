/**
 * `Node_Type` → visual style pairing for `NodeCard`.
 *
 * The four pairings are drawn from the DESIGN.md §Style Foundations token
 * set. Every color references a named semantic token from the palette —
 * the property test in typeStyles.palette.test.ts asserts this invariant
 * (Property 8, Requirement 4.7).
 *
 * The map is typed as a total mapping from `NodeType` so callers can index
 * with `typeStyles[node.type]` and receive a concrete `TypeStyle` back
 * (rather than `TypeStyle | undefined` under `noUncheckedIndexedAccess`).
 */

import type { NodeType } from '../data';

/**
 * The three color slots a card variant paints:
 *   - `border`     — the 1 px (or 2 px when selected) card border.
 *   - `background` — the card fill.
 *   - `text`       — the title (and, for `conclusion`, body) text color.
 *
 * All values are theme tokens (`rgb(var(--topic))`, see theme/tokens.css)
 * so consumers can apply them via inline `style` and the colours follow
 * light and dark mode.
 */
export interface TypeStyle {
  readonly border: string;
  readonly background: string;
  readonly text: string;
}

/**
 * DESIGN.md §Style Foundations — complete color palette.
 * Kept here as a typed const so `typeStyles` values stay auditable
 * and the palette test can import this map instead of repeating hex values.
 */
export const PALETTE = {
  // Typographic Neutrals (DESIGN.md §Colors)
  obsidian:      'rgb(var(--ink-strong))', // Document headlines, titles, active indicators
  readingInk:    'rgb(var(--ink-read))', // Primary reading ink
  muted:         'rgb(var(--ink-3))', // Secondary metadata, coordinates
  // Surfaces
  canvas:        'rgb(var(--canvas))', // Primary canvas underlay
  surface:       'rgb(var(--panel))', // Pure surface card containers
  borderRule:    'rgb(var(--rule))', // Structural dividing rules
  surfaceMuted:  'rgb(var(--sunken))', // Surface container low
  // Semantic Research Nodes (DESIGN.md §Semantic Research Nodes)
  topic:         'rgb(var(--topic))', // Cobalt blue: core subject anchors, active focus
  finding:       'rgb(var(--finding))', // Deep botanical green: verified facts, citations
  question:      'rgb(var(--question))', // Crimson coral: active inquiries, hypotheses
  conclusion:    'rgb(var(--conclusion))', // Deep oxblood: consolidated theses, closures
  // Backward-compatibility aliases
  textPrimary:   'rgb(var(--ink-strong))',
  textSecondary: 'rgb(var(--ink-read))',
  textTertiary:  'rgb(var(--ink-3))',
  surfaceBase:   'rgb(var(--ink-strong))',
  surfaceRaised: 'rgb(var(--panel))',
  surfaceStrong: 'rgb(var(--topic))',
} as const;

/**
 * Distinct visual pairing per `NodeType`. Only DESIGN.md palette colors
 * are used; every value maps to a named token in `PALETTE`.
 *
 * | NodeType     | Border                       | Background            | Text                  |
 * | ------------ | ---------------------------- | --------------------- | --------------------- |
 * | `topic`      | topic        `#0051c3`     | surface       `#ffffff` | obsidian    `#000000` |
 * | `finding`    | finding      `#2d7a4c`     | surface       `#ffffff` | obsidian    `#000000` |
 * | `question`   | question     `#de5052`     | surface       `#ffffff` | obsidian    `#000000` |
 * | `conclusion` | conclusion   `#521010`     | surface       `#ffffff` | obsidian    `#000000` |
 */
export const typeStyles: { readonly [K in NodeType]: TypeStyle } = {
  topic: {
    border:     PALETTE.topic,
    background: PALETTE.surface,
    text:       PALETTE.obsidian,
  },
  finding: {
    border:     PALETTE.finding,
    background: PALETTE.surface,
    text:       PALETTE.obsidian,
  },
  question: {
    border:     PALETTE.question,
    background: PALETTE.surface,
    text:       PALETTE.obsidian,
  },
  conclusion: {
    border:     PALETTE.conclusion,
    background: PALETTE.surface,
    text:       PALETTE.obsidian,
  },
};

/**
 * Selection border color. Uses cobalt blue (`#0051c3`) —
 * the DESIGN.md active focus accent — applied as a 2 px border when a node
 * is selected.
 */
export const SELECTION_BORDER_COLOR = PALETTE.topic; // rgb(var(--topic))
