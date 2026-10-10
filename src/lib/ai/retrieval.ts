/**
 * Choosing what part of a project goes into a prompt.
 *
 * A project that fits the budget goes in whole. A bigger one is searched:
 * words (FTS5) and meaning (embeddings) are searched separately, the two
 * rankings are merged, and each hit brings its neighbours along: the ideas it
 * connects to and the passages that cite it. That graph step gives the model
 * the reasoning around a fact, not just the fact.
 *
 * Embedding is optional. Without a model or key, or when the provider fails,
 * search falls back to words alone.
 */

import { embedMany } from 'ai';
import type { EmbeddingModel } from 'ai';

import { EMBEDDING_DIMENSIONS } from './providers';
import { buildChunks, chunksSize } from './project-content';
import type { Chunk, ProjectContent } from './project-content';
import type { SearchHit, SearchIndex } from './search-index';

/** Turns text into vectors for the search index. */
export interface Embedder {
  /** `provider:model`, stored with every vector. */
  readonly modelId: string;
  embed(values: readonly string[], kind: 'document' | 'query', signal?: AbortSignal): Promise<number[][]>;
}

/** Most passages embedded in one request. */
const EMBED_BATCH = 100;
/** Most passages embedded while answering one question; the rest wait for later questions. */
const EMBED_PER_CALL = 1_000;

/** An `Embedder` over an AI SDK embedding model. */
export function sdkEmbedder(modelId: string, model: EmbeddingModel): Embedder {
  // Gemini Embedding 2 takes the task as a prefix instead of a task type.
  const prefixed = modelId.includes('gemini-embedding-2');
  return {
    modelId,
    async embed(values, kind, signal) {
      const out: number[][] = [];
      for (let i = 0; i < values.length; i += EMBED_BATCH) {
        const batch = values.slice(i, i + EMBED_BATCH).map((v) => {
          const text = v.slice(0, 6_000);
          if (!prefixed) return text;
          return kind === 'query' ? `task: search result | query: ${text}` : text;
        });
        const result = await embedMany({
          model,
          values: batch,
          maxRetries: 1,
          providerOptions: { google: { outputDimensionality: EMBEDDING_DIMENSIONS } },
          ...(signal ? { abortSignal: signal } : {}),
        });
        out.push(...result.embeddings);
      }
      return out;
    },
  };
}

/** The text embedded for a passage. */
function documentText(chunk: Chunk, prefixed: boolean): string {
  return prefixed ? `title: ${chunk.title} | text: ${chunk.text}` : `${chunk.title}\n${chunk.text}`;
}

/**
 * Merge rankings by reciprocal rank: an item ranked high in either list ends
 * up high, and one found by both ends up highest.
 */
export function fuseRankings(lists: ReadonlyArray<readonly SearchHit[]>, k = 60): string[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((hit, rank) => scores.set(hit.key, (scores.get(hit.key) ?? 0) + 1 / (k + rank + 1)));
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
}

/**
 * Add each hit's neighbours after the hits themselves: for an idea, the ideas
 * it connects to and the passages that cite it; for a passage, the ideas it
 * cites. Stops at `budget` characters.
 */
export function expandHits(hitKeys: readonly string[], chunks: readonly Chunk[], budget: number): Chunk[] {
  const byKey = new Map(chunks.map((c) => [c.key, c]));
  const citing = new Map<string, Chunk[]>();
  for (const c of chunks) {
    if (c.source.kind !== 'doc') continue;
    for (const id of c.ideaIds) citing.set(id, [...(citing.get(id) ?? []), c]);
  }
  const picked: Chunk[] = [];
  const seen = new Set<string>();
  let used = 0;
  const take = (chunk: Chunk | undefined): boolean => {
    if (!chunk || seen.has(chunk.key)) return true;
    const size = chunk.text.length + chunk.title.length + 16;
    if (used + size > budget) return false;
    seen.add(chunk.key);
    picked.push(chunk);
    used += size;
    return true;
  };
  const hits = hitKeys.map((k) => byKey.get(k)).filter((c): c is Chunk => !!c);
  // The hits first, so the best matches are never crowded out by neighbours.
  for (const hit of hits) if (!take(hit)) return picked;
  for (const hit of hits) {
    const related =
      hit.source.kind === 'idea'
        ? [...hit.ideaIds.map((id) => byKey.get(`idea:${id}`)), ...(citing.get(hit.source.ideaId) ?? []).slice(0, 2)]
        : hit.ideaIds.map((id) => byKey.get(`idea:${id}`));
    for (const r of related) if (!take(r)) return picked;
  }
  return picked;
}

/** The first `budget` characters' worth of chunks, in order. */
export function withinBudget(chunks: readonly Chunk[], budget: number): Chunk[] {
  const out: Chunk[] = [];
  let used = 0;
  for (const c of chunks) {
    const size = c.text.length + c.title.length + 16;
    if (used + size > budget) break;
    out.push(c);
    used += size;
  }
  return out;
}

export interface GatherInput {
  readonly index: SearchIndex;
  readonly userId: string;
  readonly projectId: string;
  readonly content: ProjectContent;
  /** What to look for; null takes the project from the top (gap check). */
  readonly query: string | null;
  readonly embedder: Embedder | null;
  /** Most characters of project text in the prompt. */
  readonly budget: number;
  readonly signal?: AbortSignal;
  /** Told when embedding fails, so the server can log it. */
  readonly onEmbedError?: (error: unknown) => void;
}

export interface Gathered {
  readonly chunks: Chunk[];
  /** The whole project fit, or only search results were used. */
  readonly mode: 'whole' | 'search';
  /** Search used meaning as well as words. */
  readonly semantic: boolean;
}

/** Bring the index up to date and pick the passages for a prompt. */
export async function gatherContext(input: GatherInput): Promise<Gathered> {
  const chunks = buildChunks(input.content);
  const { index, userId, projectId, embedder } = input;
  const stale = index.sync(userId, projectId, chunks, embedder?.modelId ?? null);

  if (chunksSize(chunks) <= input.budget) return { chunks, mode: 'whole', semantic: false };
  if (input.query === null) {
    // No question: ideas first (they carry the argument), then documents.
    const ordered = [...chunks.filter((c) => c.source.kind === 'idea'), ...chunks.filter((c) => c.source.kind === 'doc')];
    return { chunks: withinBudget(ordered, input.budget), mode: 'search', semantic: false };
  }

  let semantic = false;
  const lists: SearchHit[][] = [index.keywordSearch(userId, projectId, input.query, 30)];
  if (embedder) {
    try {
      const prefixed = embedder.modelId.includes('gemini-embedding-2');
      const todo = stale.slice(0, EMBED_PER_CALL);
      if (todo.length > 0) {
        const vectors = await embedder.embed(todo.map((c) => documentText(c, prefixed)), 'document', input.signal);
        index.setEmbeddings(
          embedder.modelId,
          todo.map((c, i) => ({ rowid: c.rowid, vector: vectors[i] ?? [] })).filter((v) => v.vector.length > 0),
        );
      }
      const [queryVector] = await embedder.embed([input.query], 'query', input.signal);
      if (queryVector) {
        lists.push(index.vectorSearch(userId, projectId, embedder.modelId, queryVector, 30));
        semantic = true;
      }
    } catch (error) {
      if (input.signal?.aborted) throw error;
      input.onEmbedError?.(error);
    }
  }

  const ranked = fuseRankings(lists).slice(0, 16);
  if (ranked.length === 0) {
    // Nothing matched: give the model the ideas, so it can still say what is there.
    return { chunks: withinBudget(chunks, input.budget), mode: 'search', semantic };
  }
  return { chunks: expandHits(ranked, chunks, input.budget), mode: 'search', semantic };
}
