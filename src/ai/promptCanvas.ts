/**
 * The canvas as AI requests send it: titles, notes, types and connectors.
 * Images, positions and styling never leave the browser.
 */

import type { Canvas, UUID } from '../data';
import { PROMPT_BODY_MAX, PROMPT_NODES_MAX } from '../lib/ai/contracts';
import type { PromptCanvas } from '../lib/ai/contracts';

/** `mustInclude` keeps the ideas a request is about when the canvas is too big to send whole. */
export function toPromptCanvas(canvas: Canvas, mustInclude: readonly UUID[] = []): PromptCanvas {
  const keep = new Set(mustInclude);
  const first = canvas.nodes.filter((n) => keep.has(n.id));
  const rest = canvas.nodes.filter((n) => !keep.has(n.id));
  const nodes = [...first, ...rest].slice(0, PROMPT_NODES_MAX);
  const ids = new Set(nodes.map((n) => n.id));
  return {
    title: canvas.title.slice(0, 200),
    nodes: nodes.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body.length > PROMPT_BODY_MAX ? n.body.slice(0, PROMPT_BODY_MAX) : n.body,
      type: n.type,
    })),
    edges: canvas.edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .slice(0, PROMPT_NODES_MAX * 4)
      .map((e) => ({ source: e.source, target: e.target })),
  };
}
