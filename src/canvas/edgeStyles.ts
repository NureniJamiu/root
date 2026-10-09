/**
 * Connector styling constants for the Canvas Layer.
 *
 * Connectors are derived per render in `useReactFlowGraph` and drawn by
 * `ConnectorEdge`. A connector takes the colour of the idea type it leaves,
 * so a glance at the canvas shows what feeds what. Question connectors are
 * dashed to read as open inquiries.
 */

import type { CSSProperties } from 'react';

import type { NodeType } from '../data';

/** Edge type name registered with React Flow for every connector. */
export const CONNECTOR_EDGE_TYPE = 'connector' as const;

/** Stroke colour for a connector leaving an idea of each type. */
export const EDGE_COLOR_BY_TYPE: Readonly<Record<NodeType, string>> = Object.freeze({
  topic: 'rgb(var(--topic))',
  finding: 'rgb(var(--finding))',
  question: 'rgb(var(--question))',
  conclusion: 'rgb(var(--conclusion))',
});

/** Neutral stroke used when the source type is unknown. */
export const EDGE_STROKE_COLOR = 'rgb(var(--muted))' as const;

/** Stroke width of a resting connector, in CSS pixels. */
export const EDGE_STROKE_WIDTH = 2 as const;

/** Stroke width of a hovered or selected connector. */
export const EDGE_STROKE_WIDTH_ACTIVE = 3 as const;

/** Radius of the dot drawn where a connector meets a card. */
export const EDGE_DOT_RADIUS = 4 as const;

/** Width of the invisible band around a connector that still counts as a click on it. */
export const EDGE_INTERACTION_WIDTH = 24 as const;

/** Dash pattern for connectors that point at an open question. */
export const EDGE_DASH = '5 4' as const;

/** Line drawn while the user drags a new connector out of a card. */
export const CONNECTION_LINE_STYLE: CSSProperties = Object.freeze({
  stroke: 'rgb(var(--topic))',
  strokeWidth: 2,
  strokeDasharray: '5 4',
});
