// @vitest-environment node
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { createCitationRewriter, parseSourceMarker, resolveRefs } from '../citations';
import { buildChunks, documentBlocks, numberChunks } from '../project-content';
import type { ProjectContent } from '../project-content';
import { expandHits, fuseRankings, gatherContext } from '../retrieval';
import type { Embedder } from '../retrieval';
import { createSearchIndex, ftsQuery } from '../search-index';

const A = '00000000-0000-4000-8000-00000000000a';
const B = '00000000-0000-4000-8000-00000000000b';
const C = '00000000-0000-4000-8000-00000000000c';
const DOC = '00000000-0000-4000-8000-0000000000d1';

const content: ProjectContent = {
  title: 'Sleep',
  canvas: {
    title: 'Sleep',
    nodes: [
      { id: A, title: 'Sleep and memory', body: 'The root question.', type: 'topic' },
      { id: B, title: 'REM sleep consolidates motor skills', body: 'From a 2019 review.', type: 'finding' },
      { id: C, title: 'Naps help recall', body: '', type: 'conclusion' },
    ],
    edges: [{ source: A, target: B }],
  },
  documents: [
    {
      id: DOC,
      title: 'Draft',
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { id: 'h1', level: 2 }, content: [{ type: 'text', text: 'Background' }] },
          {
            type: 'paragraph',
            attrs: { id: 'p1' },
            content: [
              { type: 'text', text: 'Skills improve overnight ' },
              { type: 'ideaRef', attrs: { id: B, label: 'REM sleep' } },
            ],
          },
          { type: 'ideaCard', attrs: { id: 'c1', nodeId: C, label: 'Naps help recall' } },
          { type: 'heading', attrs: { id: 'h2', level: 2 }, content: [{ type: 'text', text: 'Caffeine' }] },
          { type: 'paragraph', attrs: { id: 'p2' }, content: [{ type: 'text', text: 'Coffee delays sleep onset.' }] },
        ],
      },
    },
  ],
};

describe('project content', () => {
  it('reads document blocks with the ideas they cite', () => {
    const blocks = documentBlocks(content.documents[0]!.content);
    expect(blocks.map((b) => b.id)).toEqual(['h1', 'p1', 'c1', 'h2', 'p2']);
    expect(blocks[1]).toMatchObject({ text: 'Skills improve overnight @REM sleep', ideaIds: [B] });
    expect(blocks[2]!.ideaIds).toEqual([C]);
  });

  it('makes a chunk per idea and per section of a document', () => {
    const chunks = buildChunks(content);
    expect(chunks.map((c) => c.key)).toEqual([`idea:${A}`, `idea:${B}`, `idea:${C}`, `doc:${DOC}:h1`, `doc:${DOC}:h2`]);
    expect(chunks[0]!.text).toContain('Connected to: REM sleep consolidates motor skills');
    expect(chunks[3]).toMatchObject({ source: { kind: 'doc', documentId: DOC, blockId: 'h1' }, ideaIds: [B, C] });
  });

  it('numbers chunks with short references', () => {
    const { text, refs } = numberChunks(buildChunks(content), 'Project: Sleep');
    expect(text).toContain('I2: [finding] REM sleep consolidates motor skills');
    expect(text).toContain('D1 (from “Draft”): Background');
    expect(refs.get('I2')).toEqual({ kind: 'idea', ideaId: B });
    expect(refs.get('D2')).toEqual({ kind: 'doc', documentId: DOC, blockId: 'h2' });
  });
});

describe('citations', () => {
  const { refs } = numberChunks(buildChunks(content), '');

  it('rewrites short references and drops made-up ones', () => {
    const r = createCitationRewriter(refs);
    const out = r.push('Skills improve [[I2]] and naps [[I9]] help [[I3, D1]]. See [a link](https://x.y).') + r.flush();
    expect(out).toBe(
      `Skills improve [[idea:${B}]] and naps  help [[idea:${C}]][[doc:${DOC}#h1]]. See [a link](https://x.y).`,
    );
  });

  it('handles a citation split across chunks of the stream', () => {
    const r = createCitationRewriter(refs);
    const out = ['Fact [', '[I', '1]', '] more [no', 't a ref] end ['].map((t) => r.push(t)).join('') + r.flush();
    expect(out).toBe(`Fact [[idea:${A}]] more [not a ref] end [`);
  });

  it('reads markers back', () => {
    expect(parseSourceMarker(`idea:${A}`)).toEqual({ kind: 'idea', ideaId: A });
    expect(parseSourceMarker(`doc:${DOC}#p1`)).toEqual({ kind: 'doc', documentId: DOC, blockId: 'p1' });
    expect(resolveRefs('I1, D2, X4', refs)).toHaveLength(2);
  });
});

describe('search index', () => {
  it('syncs by hash and searches by words', () => {
    const index = createSearchIndex(new Database(':memory:'));
    const chunks = buildChunks(content);
    expect(index.sync('u', 'p', chunks, 'm')).toHaveLength(5);
    index.setEmbeddings('m', [{ rowid: 1, vector: [1, 0] }]);
    // Unchanged chunks keep their vectors; only those still without one come back.
    expect(index.sync('u', 'p', chunks, 'm')).toHaveLength(4);
    expect(index.keywordSearch('u', 'p', 'coffee onset', 5).map((h) => h.key)).toEqual([`doc:${DOC}:h2`]);
    expect(index.keywordSearch('other-user', 'p', 'coffee', 5)).toEqual([]);
    // A removed idea leaves the index.
    index.sync('u', 'p', chunks.slice(1), 'm');
    expect(index.keywordSearch('u', 'p', 'root question', 5)).toEqual([]);
    expect(ftsQuery('OR "ab" c-de')).toBe('"or" OR "ab" OR "de"');
  });

  it('searches by meaning', () => {
    const index = createSearchIndex(new Database(':memory:'));
    const stale = index.sync('u', 'p', buildChunks(content), 'm');
    index.setEmbeddings(
      'm',
      stale.map((c, i) => ({ rowid: c.rowid, vector: i === 4 ? [0, 1] : [1, 0] })),
    );
    expect(index.vectorSearch('u', 'p', 'm', [0, 1], 1)[0]!.key).toBe(`doc:${DOC}:h2`);
    expect(index.vectorSearch('u', 'p', 'other-model', [0, 1], 1)).toEqual([]);
  });
});

describe('retrieval', () => {
  it('fuses rankings, favouring items both lists found', () => {
    expect(fuseRankings([[{ key: 'a', score: 1 }, { key: 'b', score: 0.5 }], [{ key: 'b', score: 1 }]])).toEqual(['b', 'a']);
  });

  it('brings neighbours along with each hit', () => {
    const chunks = buildChunks(content);
    const keys = expandHits([`idea:${A}`], chunks, 10_000).map((c) => c.key);
    expect(keys).toEqual([`idea:${A}`, `idea:${B}`]);
    const fromDoc = expandHits([`doc:${DOC}:h1`], chunks, 10_000).map((c) => c.key);
    expect(fromDoc).toEqual([`doc:${DOC}:h1`, `idea:${B}`, `idea:${C}`]);
  });

  it('sends a small project whole and searches a big one', async () => {
    const index = createSearchIndex(new Database(':memory:'));
    const embedded: string[][] = [];
    const embedder: Embedder = {
      modelId: 'test:embed',
      embed: async (values) => {
        embedded.push([...values]);
        return values.map((v) => (v.toLowerCase().includes('coffee') ? [0, 1] : [1, 0]));
      },
    };
    const base = { index, userId: 'u', projectId: 'p', content, embedder };
    const whole = await gatherContext({ ...base, query: 'anything', budget: 100_000 });
    expect(whole).toMatchObject({ mode: 'whole', semantic: false });
    expect(embedded).toHaveLength(0);

    const searched = await gatherContext({ ...base, query: 'What about coffee?', budget: 120 });
    expect(searched).toMatchObject({ mode: 'search', semantic: true });
    expect(searched.chunks[0]!.key).toBe(`doc:${DOC}:h2`);
    expect(embedded[0]).toHaveLength(5);

    // A failing embedder falls back to words.
    const errors: unknown[] = [];
    const broken = await gatherContext({
      ...base,
      embedder: { modelId: 'test:other', embed: async () => Promise.reject(new Error('down')) },
      query: 'coffee',
      budget: 120,
      onEmbedError: (e) => errors.push(e),
    });
    expect(broken.semantic).toBe(false);
    expect(broken.chunks[0]!.key).toBe(`doc:${DOC}:h2`);
    expect(errors).toHaveLength(1);
  });
});
