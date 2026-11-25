/**
 * `ConnectorEdge` — the single edge type used for every connector.
 *
 * - Bezier curve in its relation's colour (the source idea's type colour for
 *   `related-to`), with a dot where it meets each card.
 * - The relation label sits on the middle of the curve, read from source to
 *   target ("supported by"). It lets clicks through to the curve. A
 *   `related-to` connector shows it only while hovered or selected, so an
 *   old canvas looks as it did. A relation that does not fit its two cards is
 *   dashed in the warning colour and its label carries a warning mark.
 * - Hovering or selecting a connector highlights it and shows a remove button
 *   just above its midpoint (not on it, so clicks on the curve never hit it). The same connector can be removed with Delete/Backspace
 *   while it is selected.
 * - Select a connector (click) to raise it above the cards, then drag either
 *   end to re-attach it to another card or side; React Flow's reconnect
 *   anchors do that and `CanvasView` handles the result. A selected connector
 *   shows larger end grips.
 */

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from 'reactflow';
import type { EdgeProps } from 'reactflow';

import { canvasActions } from '../data';
import type { RelationType } from '../data';

import {
  EDGE_DASH,
  EDGE_DOT_RADIUS,
  EDGE_INTERACTION_WIDTH,
  EDGE_STROKE_COLOR,
  EDGE_STROKE_WIDTH,
  EDGE_STROKE_WIDTH_ACTIVE,
} from './edgeStyles';

export interface ConnectorEdgeData {
  readonly relation: RelationType;
  readonly color: string;
  readonly dashed: boolean;
  /** The relation label, read from source to target. */
  readonly label: string;
  /** Show the label only while the connector is hovered or selected. */
  readonly quiet: boolean;
  /** The relation does not fit the two cards' types. */
  readonly invalid: boolean;
  /** Set while the card at either end is animating in or out. */
  readonly opacity?: number;
}

/** How far above the middle of the curve the remove button sits, so clicking (or double-clicking) the curve itself never hits it. */
const REMOVE_BUTTON_OFFSET_PX = 30;

/** How long the remove button stays after the pointer leaves, so it can be reached. */
const HIDE_DELAY_MS = 150;

function ConnectorEdgeImpl(props: EdgeProps<ConnectorEdgeData>): JSX.Element {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    data,
  } = props;

  const [hovered, setHovered] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
  }, []);

  const show = useCallback(() => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = null;
    setHovered(true);
  }, []);
  const hide = useCallback(() => {
    if (hideTimer.current !== null) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setHovered(false), HIDE_DELAY_MS);
  }, []);

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const color = data?.color ?? EDGE_STROKE_COLOR;
  const active = !!selected || hovered;
  const showLabel = data !== undefined && data.label !== '' && (!data.quiet || active);
  const dotRadius = selected ? EDGE_DOT_RADIUS + 2.5 : active ? EDGE_DOT_RADIUS + 1.5 : EDGE_DOT_RADIUS;

  return (
    <g
      onMouseEnter={show}
      onMouseLeave={hide}
      style={data?.opacity !== undefined ? { opacity: data.opacity } : undefined}
      data-testid={`connector-${id}`}
      data-selected={selected ? 'true' : 'false'}
      data-relation={data?.relation}
      data-invalid={data?.invalid ? 'true' : undefined}
    >
      {active && (
        <path d={path} fill="none" stroke={color} strokeWidth={10} strokeOpacity={0.16} strokeLinecap="round" />
      )}
      <BaseEdge
        path={path}
        interactionWidth={EDGE_INTERACTION_WIDTH}
        style={{
          stroke: color,
          strokeWidth: active ? EDGE_STROKE_WIDTH_ACTIVE : EDGE_STROKE_WIDTH,
          strokeLinecap: 'round',
          ...(data?.dashed ? { strokeDasharray: EDGE_DASH } : {}),
        }}
      />
      <circle cx={sourceX} cy={sourceY} r={dotRadius} fill={color} stroke="rgb(var(--panel))" strokeWidth={1.5} pointerEvents="none" />
      <circle cx={targetX} cy={targetY} r={dotRadius} fill={color} stroke="rgb(var(--panel))" strokeWidth={1.5} pointerEvents="none" />

      {(showLabel || active) && (
        <EdgeLabelRenderer>
          {showLabel && data && (
            <div
              className="nodrag nopan inline-flex items-center gap-1 px-1.5 py-[1px] rounded-[2px] bg-panel font-mono text-[9px] leading-[12px] tracking-[0.04em] uppercase whitespace-nowrap select-none"
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: 'none',
                color: data.color,
                border: `1px ${data.invalid ? 'dashed' : 'solid'} ${data.color}`,
                ...(data.opacity !== undefined ? { opacity: data.opacity } : {}),
              }}
              data-testid={`connector-label-${id}`}
            >
              {data.invalid && (
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-label="Does not fit these cards">
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
              )}
              {data.label}
            </div>
          )}
          {active && (
            <div
              className="nodrag nopan"
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - REMOVE_BUTTON_OFFSET_PX}px)`,
                pointerEvents: 'all',
              }}
              onMouseEnter={show}
              onMouseLeave={hide}
            >
              <button
                type="button"
                aria-label="Remove connection"
                title="Remove connection (Delete)"
                data-testid={`connector-remove-${id}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  canvasActions.removeEdge(id);
                }}
                className="inline-flex items-center justify-center rounded-full bg-panel text-ink-read hover:bg-question-fill hover:text-white hover:border-question transition-colors cursor-pointer"
                style={{ width: 20, height: 20, border: `1px solid ${color}` }}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                  <path d="M2 2l6 6M8 2l-6 6" />
                </svg>
              </button>
            </div>
          )}
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

export const ConnectorEdge = memo(ConnectorEdgeImpl);
ConnectorEdge.displayName = 'ConnectorEdge';
