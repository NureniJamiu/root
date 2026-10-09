/**
 * `ConnectorEdge` — the single edge type used for every connector.
 *
 * - Bezier curve in the colour of the source idea's type, with a dot where it
 *   meets each card.
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

import {
  EDGE_DASH,
  EDGE_DOT_RADIUS,
  EDGE_INTERACTION_WIDTH,
  EDGE_STROKE_COLOR,
  EDGE_STROKE_WIDTH,
  EDGE_STROKE_WIDTH_ACTIVE,
} from './edgeStyles';

export interface ConnectorEdgeData {
  readonly color: string;
  readonly dashed: boolean;
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
  const dotRadius = selected ? EDGE_DOT_RADIUS + 2.5 : active ? EDGE_DOT_RADIUS + 1.5 : EDGE_DOT_RADIUS;

  return (
    <g
      onMouseEnter={show}
      onMouseLeave={hide}
      style={data?.opacity !== undefined ? { opacity: data.opacity } : undefined}
      data-testid={`connector-${id}`}
      data-selected={selected ? 'true' : 'false'}
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

      {active && (
        <EdgeLabelRenderer>
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
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

export const ConnectorEdge = memo(ConnectorEdgeImpl);
ConnectorEdge.displayName = 'ConnectorEdge';
