/**
 * Connector styling constants for the Canvas Layer.
 *
 * Connectors are derived per render in `useReactFlowGraph` and drawn by
 * `ConnectorEdge`. A connector whose meaning is not set (`related-to`) takes
 * the colour of the idea type it leaves, so a glance at the canvas shows what
 * feeds what, and its label appears only on hover or selection. A typed
 * connector takes its relation's colour and always shows its label. Untyped
 * connectors into a question are dashed to read as open inquiries; a relation
 * the validity map does not allow for its two cards is dotted in the warning
 * colour, so it differs from them by more than hue.
 */

import type { CSSProperties } from 'react';

import { ENABLED_NODE_TYPE_IDS } from '../data';
import type { NodeType, RelationId } from '../data';
import { typeColor } from '../nodes';

/** Edge type name registered with React Flow for every connector. */
export const CONNECTOR_EDGE_TYPE = 'connector' as const;

/** Stroke colour for a connector leaving an idea of each type (its type or family colour). */
export const EDGE_COLOR_BY_TYPE: Readonly<Record<NodeType, string>> = Object.freeze(
  Object.fromEntries(ENABLED_NODE_TYPE_IDS.map((type) => [type, typeColor(type)])) as Record<NodeType, string>,
);

/**
 * Stroke colour of a typed connector. Relations that frame the problem use the
 * framing colour, relations that bring evidence use the finding colour, and a
 * contradiction uses the question colour. `related-to` has none: it keeps the
 * colour of the card it leaves (`EDGE_COLOR_BY_TYPE`).
 */
export const EDGE_COLOR_BY_RELATION: Readonly<Record<Exclude<RelationId, 'related-to'>, string>> = Object.freeze({
  addresses: 'rgb(var(--framing))',
  refines: 'rgb(var(--framing))',
  involves: 'rgb(var(--framing))',
  answers: 'rgb(var(--finding))',
  supports: 'rgb(var(--finding))',
  contradicts: 'rgb(var(--question))',
});

/** Stroke of a connector whose relation does not fit its two cards (the warning colour). */
export const EDGE_INVALID_COLOR = 'rgb(var(--danger))' as const;

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

/** Dash pattern for untyped connectors that point at an open question. */
export const EDGE_DASH = '5 4' as const;
/** Dot pattern (with round caps) for connectors whose relation does not fit their cards. */
export const EDGE_INVALID_DASH = '1 5' as const;

/** Line drawn while the user drags a new connector out of a card. */
export const CONNECTION_LINE_STYLE: CSSProperties = Object.freeze({
  stroke: 'rgb(var(--topic))',
  strokeWidth: 2,
  strokeDasharray: '5 4',
});
