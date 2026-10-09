/**
 * The worked "Content Plan" example offered from the empty canvas.
 *
 * Built as a single pure transform of an empty canvas — the mutators create
 * the nodes and `computeTreeLayout` places them — so loading it is one store
 * write (and one undo step) rather than a chain of timed updates.
 */

import { computeTreeLayout } from '../canvas';
import type { NodeSizes } from '../canvas';
import { addChild, addImage, addRoot, updateNode } from '../data';
import type { Canvas, NodeType, UUID } from '../data';

const ORIGIN = { x: 0, y: 0 } as const;

/** Estimated height of a card that carries an image (it has not been measured yet). */
const IMAGE_CARD_SIZE = { width: 290, height: 340 } as const;

const RETENTION_CHART =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%230b1120"/><rect x="30" y="30" width="100" height="70" rx="4" fill="%231e293b" stroke="%233b82f6" stroke-width="2"/><text x="80" y="70" fill="%23ffffff" font-family="sans-serif" font-size="12" text-anchor="middle">HOOK</text><path d="M130 65 L170 65" stroke="%233b82f6" stroke-width="2" stroke-dasharray="4"/><rect x="170" y="30" width="100" height="70" rx="4" fill="%231e293b" stroke="%2310b981" stroke-width="2"/><text x="220" y="70" fill="%23ffffff" font-family="sans-serif" font-size="12" text-anchor="middle">BREAKDOWN</text><path d="M270 65 L310 65" stroke="%2310b981" stroke-width="2" stroke-dasharray="4"/><rect x="310" y="30" width="60" height="70" rx="4" fill="%231e293b" stroke="%23f59e0b" stroke-width="2"/><text x="340" y="70" fill="%23ffffff" font-family="sans-serif" font-size="12" text-anchor="middle">CTA</text><path d="M80 140 Q200 110 320 170" stroke="%2338bdf8" stroke-width="3" fill="none"/><circle cx="80" cy="140" r="4" fill="%2338bdf8"/><circle cx="200" cy="125" r="4" fill="%2338bdf8"/><circle cx="320" cy="170" r="4" fill="%2338bdf8"/><text x="200" y="195" fill="%2394a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">Retention Curve Across Video Sections</text></svg>';

interface IdeaSpec {
  readonly title: string;
  readonly type: NodeType;
  readonly body: string;
}

const ROOT: IdeaSpec = {
  title: 'Content Strategy: Launching a Video Series',
  type: 'topic',
  body: 'Outlining topics, hooks, and production steps to produce high-impact, engaging content consistently.',
};

const QUESTION: IdeaSpec = {
  title: 'What core questions and hooks hook viewers first?',
  type: 'question',
  body: 'Reviewing top viewer comments, community questions, and real pain points to frame relatable hooks.',
};

const FINDING: IdeaSpec = {
  title: 'Short visual breakdowns hold attention longer',
  type: 'finding',
  body: 'Illustrative numbers: pair each point with a clear visual card or diagram and measure how many viewers reach the end.',
};

const CONCLUSION: IdeaSpec = {
  title: 'Publish weekly 5-minute guides with actionable takeaways',
  type: 'conclusion',
  body: 'Adopt a simple 3-part formula: intriguing hook, 3 visual examples, and one concrete action step to test immediately.',
};

/**
 * Return `base` (which must be empty) filled with the example tree and laid
 * out. Returns `base` unchanged when it already has ideas.
 */
export function buildExampleCanvas(base: Canvas): Canvas {
  if (base.nodes.length > 0) return base;

  let canvas = addRoot(base, { position: ORIGIN });
  const rootId = canvas.nodes[0]!.id;
  canvas = updateNode(canvas, rootId, { title: ROOT.title, type: ROOT.type, body: ROOT.body });

  const addIdea = (spec: IdeaSpec): UUID => {
    canvas = addChild(canvas, rootId, { position: ORIGIN });
    const id = canvas.nodes[canvas.nodes.length - 1]!.id;
    canvas = updateNode(canvas, id, { title: spec.title, type: spec.type, body: spec.body });
    return id;
  };

  addIdea(QUESTION);
  const findingId = addIdea(FINDING);
  addIdea(CONCLUSION);

  canvas = addImage(canvas, findingId, {
    id: crypto.randomUUID(),
    dataUrl: RETENTION_CHART,
    addedAt: new Date().toISOString(),
  });

  const sizes: NodeSizes = new Map([[findingId, IMAGE_CARD_SIZE]]);
  return computeTreeLayout(canvas, sizes);
}
