/**
 * Turning a canvas into the text a model reads.
 *
 * The browser sends a `PromptCanvas` (ideas and connectors, no images); these
 * helpers pick the part a feature needs and write it out as a compact,
 * readable outline. Pure functions: no I/O, no SDKs.
 */

import type { PromptCanvas } from './contracts';

type PromptNode = PromptCanvas['nodes'][number];

/** Most ideas listed in a whole-canvas overview before it is cut short. */
const OVERVIEW_MAX = 150;
/** Deepest level of a branch included in a draft. */
const BRANCH_DEPTH_MAX = 4;
/** Most ideas included in a draft. */
const BRANCH_NODES_MAX = 80;

function indexes(canvas: PromptCanvas) {
  const byId = new Map(canvas.nodes.map((n) => [n.id, n]));
  const out = new Map<string, string[]>();
  const into = new Map<string, string[]>();
  for (const e of canvas.edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    out.set(e.source, [...(out.get(e.source) ?? []), e.target]);
    into.set(e.target, [...(into.get(e.target) ?? []), e.source]);
  }
  return { byId, out, into };
}

function oneLine(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function titleOf(node: PromptNode): string {
  return node.title.trim() || 'Untitled idea';
}

function describeIdea(node: PromptNode): string {
  const notes = node.body.trim();
  return `[${node.type}] ${titleOf(node)}${notes ? `\n  Notes: ${oneLine(notes, 1_200)}` : ''}`;
}

/** Every idea's title and type, as context for where a new idea fits. */
export function describeOverview(canvas: PromptCanvas): string {
  const lines = canvas.nodes.slice(0, OVERVIEW_MAX).map((n) => `- [${n.type}] ${oneLine(titleOf(n), 120)}`);
  const more = canvas.nodes.length - OVERVIEW_MAX;
  if (more > 0) lines.push(`- …and ${more} more ideas`);
  return lines.join('\n');
}

/**
 * The idea being expanded and what surrounds it: the ideas leading to it, the
 * ideas it already connects to (so suggestions do not repeat them) and its
 * siblings. Returns null when the idea is not on the canvas.
 */
export function describeExpandContext(canvas: PromptCanvas, focusId: string): string | null {
  const { byId, out, into } = indexes(canvas);
  const focus = byId.get(focusId);
  if (!focus) return null;

  // The chain of ideas leading to this one, nearest first, up to four levels.
  const path: PromptNode[] = [];
  const seen = new Set([focusId]);
  let current = focusId;
  for (let i = 0; i < 4; i += 1) {
    const parentId = (into.get(current) ?? []).find((id) => !seen.has(id));
    const parent = parentId ? byId.get(parentId) : undefined;
    if (!parent) break;
    path.push(parent);
    seen.add(parent.id);
    current = parent.id;
  }

  const children = (out.get(focusId) ?? []).map((id) => byId.get(id)).filter((n): n is PromptNode => !!n);
  const parentId = path[0]?.id;
  const siblings = parentId
    ? (out.get(parentId) ?? [])
        .filter((id) => id !== focusId)
        .map((id) => byId.get(id))
        .filter((n): n is PromptNode => !!n)
    : [];

  const parts = [`Project: ${canvas.title.trim() || 'Untitled project'}`, `Idea to expand:\n${describeIdea(focus)}`];
  if (path.length > 0) {
    parts.push(`It follows from (nearest first):\n${path.map((n) => `- ${describeIdea(n)}`).join('\n')}`);
  }
  if (children.length > 0) {
    parts.push(`Already connected from it (do not repeat these):\n${children.map((n) => `- [${n.type}] ${titleOf(n)}`).join('\n')}`);
  }
  if (siblings.length > 0) {
    parts.push(`Its siblings:\n${siblings.map((n) => `- [${n.type}] ${titleOf(n)}`).join('\n')}`);
  }
  parts.push(`Everything on the canvas:\n${describeOverview(canvas)}`);
  return parts.join('\n\n');
}

export interface BranchOutline {
  readonly text: string;
  /** Ids of the ideas in the outline, root first. */
  readonly ids: string[];
  readonly root: PromptNode;
}

/**
 * A branch as a numbered outline the drafting model writes from: the root,
 * the ideas it connects to, theirs, and so on, each with its id and notes.
 */
export function describeBranch(canvas: PromptCanvas, rootId: string): BranchOutline | null {
  const { byId, out } = indexes(canvas);
  const root = byId.get(rootId);
  if (!root) return null;
  const ids: string[] = [];
  const lines: string[] = [];
  const seen = new Set<string>();

  const visit = (node: PromptNode, depth: number): void => {
    if (seen.has(node.id) || ids.length >= BRANCH_NODES_MAX) return;
    seen.add(node.id);
    ids.push(node.id);
    const indent = '  '.repeat(depth);
    const notes = node.body.trim();
    lines.push(`${indent}- id=${node.id} [${node.type}] ${titleOf(node)}`);
    if (notes) lines.push(`${indent}  Notes: ${oneLine(notes, 1_500)}`);
    if (depth >= BRANCH_DEPTH_MAX) return;
    for (const childId of out.get(node.id) ?? []) {
      const child = byId.get(childId);
      if (child) visit(child, depth + 1);
    }
  };
  visit(root, 0);
  return { text: lines.join('\n'), ids, root };
}
