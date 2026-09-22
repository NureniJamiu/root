/**
 * `Node_Type` → visual style pairing for `NodeCard`.
 *
 * The four pairings are transcribed verbatim from design.md
 * §Node_Type Palette Mapping. Every color is drawn from the DESIGN.md
 * palette — the property test in task 10.2 asserts this invariant
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
 * All values are literal hex strings from the DESIGN.md palette so
 * consumers can apply them via inline `style` without introducing a
 * dependency on Tailwind arbitrary-value syntax.
 */
export interface TypeStyle {
  readonly border: string;
  readonly background: string;
  readonly text: string;
}

/**
 * Distinct visual pairing per `NodeType`. Only palette colors are used.
 *
 * | NodeType     | Border            | Text            | Background        |
 * | ------------ | ----------------- | --------------- | ----------------- |
 * | `topic`      | `#0051c3` primary | `#000000`       | `#ffffff`         |
 * | `finding`    | `#404040` neutral | `#000000`       | `#ebebeb`         |
 * | `question`   | `#de5052` second. | `#521010` acc.  | `#ffffff`         |
 * | `conclusion` | `#521010` accent  | `#ffffff`       | `#521010`         |
 */
export const typeStyles: { readonly [K in NodeType]: TypeStyle } = {
  topic: {
    border: '#0051c3',
    background: '#ffffff',
    text: '#000000',
  },
  finding: {
    border: '#404040',
    background: '#ebebeb',
    text: '#000000',
  },
  question: {
    border: '#de5052',
    background: '#ffffff',
    text: '#521010',
  },
  conclusion: {
    border: '#521010',
    background: '#521010',
    text: '#ffffff',
  },
};

/**
 * Selection border color. Design.md §Node UI Layer specifies a 2 px
 * `#0051c3` (primary) border when a node is selected, overriding the
 * type-driven base border.
 */
export const SELECTION_BORDER_COLOR = '#0051c3';
