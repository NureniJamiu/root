/**
 * A project as the AI reads it: its ideas, connectors and documents, cut into
 * the passages ("chunks") that search indexes and prompts quote.
 *
 * Pure functions over plain data: no database, no SDKs, no React.
 *
 * Prompts never show raw ids. Each idea and passage gets a short reference
 * ("I3", "D2") and the model cites those; `SourceRefs` maps them back, so a
 * citation can only ever point at something that exists.
 */

import type { JSONContent } from '@tiptap/core';

import { PROMPT_BODY_MAX, PROMPT_NODES_MAX } from './contracts';
import type { AiSource, PromptCanvas } from './contracts';

type PromptNode = PromptCanvas['nodes'][number];

export interface ProjectDocument {
  readonly id: string;
  readonly title: string;
  readonly content: JSONContent;
}

/** Everything about a project the AI may read. Images are never included. */
export interface ProjectContent {
  readonly title: string;
  readonly canvas: PromptCanvas;
  readonly documents: readonly ProjectDocument[];
}

/** One block of a document with the ideas it cites. */
export interface DocBlock {
  /** The block's stable id, when it has one. */
  readonly id: string | null;
  readonly heading: boolean;
  readonly text: string;
  readonly ideaIds: readonly string[];
}

export type ChunkSource =
  | { readonly kind: 'idea'; readonly ideaId: string }
  | { readonly kind: 'doc'; readonly documentId: string; readonly blockId: string | null };

/** A passage the search index stores and prompts quote. */
export interface Chunk {
  /** Stable within a project: `idea:<id>` or `doc:<document id>:<first block id or index>`. */
  readonly key: string;
  readonly source: ChunkSource;
  /** The idea's or document's title. */
  readonly title: string;
  readonly text: string;
  /** Ideas this passage cites (documents) or connects to (ideas). */
  readonly ideaIds: readonly string[];
}

/** Longest document passage, in characters, before a new one starts. */
const PASSAGE_MAX = 1_200;

/** The parts of a canvas `toPromptCanvas` reads (the full canvas type fits). */
export interface CanvasLike {
  readonly title: string;
  readonly nodes: ReadonlyArray<{ readonly id: string; readonly title: string; readonly body: string; readonly type: PromptCanvas['nodes'][number]['type'] }>;
  readonly edges: ReadonlyArray<{ readonly source: string; readonly target: string }>;
}

/**
 * A canvas as the AI reads it: titles, notes, types and connectors. Images,
 * positions and styling are left out. `mustInclude` keeps the ideas a request
 * is about when the canvas is too big to send whole.
 */
export function toPromptCanvas(canvas: CanvasLike, mustInclude: readonly string[] = []): PromptCanvas {
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

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'codeBlock']);

function inlineText(node: JSONContent, ideaIds: string[]): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'ideaRef') {
    const id = node.attrs?.id;
    if (typeof id === 'string') ideaIds.push(id);
    return `@${String(node.attrs?.label ?? 'idea')}`;
  }
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map((child) => inlineText(child, ideaIds)).join('');
}

/** The text blocks of a document in order, each with the ideas it cites. */
export function documentBlocks(content: JSONContent): DocBlock[] {
  const blocks: DocBlock[] = [];
  const visit = (node: JSONContent): void => {
    if (node.type === 'ideaCard') {
      const id = node.attrs?.nodeId;
      blocks.push({
        id: typeof node.attrs?.id === 'string' ? node.attrs.id : null,
        heading: false,
        text: `[Idea card: ${String(node.attrs?.label ?? 'idea')}]`,
        ideaIds: typeof id === 'string' ? [id] : [],
      });
      return;
    }
    if (node.type && TEXT_BLOCKS.has(node.type)) {
      const ideaIds: string[] = [];
      const text = inlineText(node, ideaIds).replace(/[ \t]+/g, ' ').trim();
      if (text || ideaIds.length > 0) {
        blocks.push({
          id: typeof node.attrs?.id === 'string' ? node.attrs.id : null,
          heading: node.type === 'heading',
          text,
          ideaIds,
        });
      }
      return;
    }
    for (const child of node.content ?? []) visit(child);
  };
  visit(content);
  return blocks;
}

/* -------------------------------------------------------------------------- */
/* Chunks                                                                     */
/* -------------------------------------------------------------------------- */

function oneLine(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function ideaTitle(node: PromptNode): string {
  return node.title.trim() || 'Untitled idea';
}

/** Ideas connected to each idea, in either direction. */
export function neighbours(canvas: PromptCanvas): Map<string, string[]> {
  const ids = new Set(canvas.nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  const add = (a: string, b: string): void => {
    const list = out.get(a) ?? [];
    if (!list.includes(b)) list.push(b);
    out.set(a, list);
  };
  for (const e of canvas.edges) {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    add(e.source, e.target);
    add(e.target, e.source);
  }
  return out;
}

/**
 * Every passage of a project: one per idea (its type, title, notes and the
 * titles of connected ideas) and one per run of document blocks under a
 * heading, kept under `PASSAGE_MAX` characters.
 */
export function buildChunks(content: ProjectContent): Chunk[] {
  const chunks: Chunk[] = [];
  const byId = new Map(content.canvas.nodes.map((n) => [n.id, n]));
  const links = neighbours(content.canvas);

  for (const node of content.canvas.nodes) {
    const connected = (links.get(node.id) ?? []).map((id) => byId.get(id)).filter((n): n is PromptNode => !!n);
    const lines = [`[${node.type}] ${ideaTitle(node)}`];
    if (node.body.trim()) lines.push(node.body.trim());
    if (connected.length > 0) lines.push(`Connected to: ${connected.map((n) => oneLine(ideaTitle(n), 80)).join('; ')}`);
    chunks.push({
      key: `idea:${node.id}`,
      source: { kind: 'idea', ideaId: node.id },
      title: ideaTitle(node),
      text: lines.join('\n'),
      ideaIds: connected.map((n) => n.id),
    });
  }

  for (const doc of content.documents) {
    const title = doc.title.trim() || 'Untitled document';
    let run: DocBlock[] = [];
    let index = 0;
    const flush = (): void => {
      if (run.length === 0) return;
      const first = run[0]!;
      chunks.push({
        key: `doc:${doc.id}:${first.id ?? `#${index}`}`,
        source: { kind: 'doc', documentId: doc.id, blockId: first.id },
        title,
        text: run.map((b) => b.text).join('\n'),
        ideaIds: [...new Set(run.flatMap((b) => b.ideaIds))],
      });
      index += 1;
      run = [];
    };
    for (const block of documentBlocks(doc.content)) {
      const length = run.reduce((sum, b) => sum + b.text.length + 1, 0);
      if (block.heading || (run.length > 0 && length + block.text.length > PASSAGE_MAX)) flush();
      run.push(block);
    }
    flush();
  }
  return chunks;
}

/** A short, stable fingerprint of a chunk's text (FNV-1a), to spot changes. */
export function chunkHash(chunk: Chunk): string {
  let h = 0x811c9dc5;
  const text = `${chunk.title}\n${chunk.text}`;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + text.length.toString(36);
}

/* -------------------------------------------------------------------------- */
/* Numbered context for prompts                                               */
/* -------------------------------------------------------------------------- */

/** Short reference → what it points at. */
export type SourceRefs = ReadonlyMap<string, AiSource>;

export interface NumberedContext {
  /** The context as the model reads it. */
  readonly text: string;
  readonly refs: SourceRefs;
}

/**
 * Write `chunks` as a numbered list the model can cite: ideas as "I1", "I2"…
 * and document passages as "D1", "D2"…, in the order given.
 */
export function numberChunks(chunks: readonly Chunk[], intro: string): NumberedContext {
  const refs = new Map<string, AiSource>();
  const ideaLines: string[] = [];
  const docLines: string[] = [];
  for (const chunk of chunks) {
    if (chunk.source.kind === 'idea') {
      const ref = `I${ideaLines.length + 1}`;
      refs.set(ref, { kind: 'idea', ideaId: chunk.source.ideaId });
      ideaLines.push(`${ref}: ${chunk.text.replace(/\n/g, '\n    ')}`);
    } else {
      const ref = `D${docLines.length + 1}`;
      refs.set(ref, { kind: 'doc', documentId: chunk.source.documentId, blockId: chunk.source.blockId });
      docLines.push(`${ref} (from “${chunk.title}”): ${chunk.text.replace(/\n/g, '\n    ')}`);
    }
  }
  const parts = [intro];
  if (ideaLines.length > 0) parts.push(`Ideas on the canvas:\n${ideaLines.join('\n')}`);
  if (docLines.length > 0) parts.push(`Passages from the project's documents:\n${docLines.join('\n')}`);
  if (ideaLines.length === 0 && docLines.length === 0) parts.push('The project is empty.');
  return { text: parts.join('\n\n'), refs };
}

/** Total characters of the chunks, to decide whether a whole project fits a prompt. */
export function chunksSize(chunks: readonly Chunk[]): number {
  return chunks.reduce((sum, c) => sum + c.text.length + c.title.length + 16, 0);
}
