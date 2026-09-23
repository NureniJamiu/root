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
 * Stroke color for default connectors.
 */
export const EDGE_STROKE_COLOR = '#737785' as const;

/**
 * Stroke width for default connectors in CSS pixels.
 */
export const EDGE_STROKE_WIDTH = 1.5 as const;

/**
 * Active cobalt blue accent for selected and dragging connectors.
 */
export const SELECTED_EDGE_COLOR = '#0051c3' as const;

/**
 * Default connector style (neutral hairline bezier).
 */
export const DEFAULT_EDGE_STYLE: CSSProperties = Object.freeze({
  stroke: EDGE_STROKE_COLOR,
  strokeWidth: EDGE_STROKE_WIDTH,
});

/**
 * Selected connector style (solid vibrant cobalt blue).
 */
export const SELECTED_EDGE_STYLE: CSSProperties = Object.freeze({
  stroke: SELECTED_EDGE_COLOR,
  strokeWidth: 2,
});

/**
 * Dragging connector style (dashed vibrant cobalt blue).
 */
export const DRAGGING_EDGE_STYLE: CSSProperties = Object.freeze({
  stroke: SELECTED_EDGE_COLOR,
  strokeWidth: 2,
  strokeDasharray: '5 4',
});

/**
 * Question connector style (subtle dashed gray for inquiries/hypotheses).
 */
export const QUESTION_EDGE_STYLE: CSSProperties = Object.freeze({
  stroke: EDGE_STROKE_COLOR,
  strokeWidth: 1.5,
  strokeDasharray: '4 4',
});
