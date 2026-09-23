/**
 * Edge styling constants for the Canvas Layer.
 *
 * The Canvas Layer never stores edges in the domain model (R9.3 — the tree
 * shape is `parentId`-only) so every edge is derived per render in
 * `useReactFlowGraph`. This module centralises the visual attributes those
 * derived edges take on.
 *
 * Token source: DESIGN.md §Style Foundations
 *   color.text.tertiary = #312e2e — used as the connector stroke color.
 *
 * Keeping the values here (rather than sprinkled through the derivation
 * hook) lets tests import the exact numbers and lets any future theme
 * work touch a single file.
 */

import type { CSSProperties } from 'react';

/**
 * React Flow edge type name registered by default (bezier curve). We do
 * not register any custom edge types for the MVP.
 */
export const DEFAULT_EDGE_TYPE = 'default' as const;

/**
 * Stroke color for connectors. Drawn from the DESIGN.md
 * color.text.tertiary token (#312e2e — Requirement 11.5).
 */
export const EDGE_STROKE_COLOR = '#312e2e' as const; // color.text.tertiary

/**
 * Stroke width for connectors, in CSS pixels. Design.md §Canvas Layer
 * fixes this at 1 px.
 */
export const EDGE_STROKE_WIDTH = 1 as const;

/**
 * The `style` prop applied to every derived React Flow edge. Kept as an
 * object literal so React Flow's shallow-equality checks on repeated
 * renders always see the same reference.
 */
export const DEFAULT_EDGE_STYLE: CSSProperties = Object.freeze({
  stroke: EDGE_STROKE_COLOR,
  strokeWidth: EDGE_STROKE_WIDTH,
});
