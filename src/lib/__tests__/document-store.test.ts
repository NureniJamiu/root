// @vitest-environment node
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDocumentStore, DocumentError, ensureDocumentSchema } from '../document-store';
import type { DocumentStore } from '../document-store';
import { createProjectStore, ensureProjectSchema } from '../project-store';

const USER = 'user-1';
const OTHER = 'user-2';
const IDEA_A = '11111111-1111-4111-8111-111111111111';
const IDEA_B = '22222222-2222-4222-8222-222222222222';

function doc(...content: unknown[]) {
  return { type: 'doc', content };
}
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string, marks?: unknown[]) => (marks ? { type: 'text', text: t, marks } : { type: 'text', text: t });
const cite = (id: string, label = 'Idea') => ({ type: 'ideaRef', attrs: { id, label } });
const card = (nodeId: string) => ({ type: 'ideaCard', attrs: { nodeId, label: 'Card' } });

function errorOf(fn: () => unknown): DocumentError {
  try {
    fn();
  } catch (err) {
    if (err instanceof DocumentError) return err;
    throw err;
  }
  throw new Error('expected a DocumentError');
}

describe('document store', () => {
  let db: Database.Database;
  let store: DocumentStore;
  let projectId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureProjectSchema(db);
    ensureDocumentSchema(db);
    projectId = createProjectStore(db).create(USER, { title: 'Research' }).id;
    store = createDocumentStore(db);
  });

  it('creates, lists, reads and saves a document', () => {
    const created = store.create(USER, projectId, { title: '  Draft  ', content: doc(p(text('Hello world'))) });
    expect(created.title).toBe('Draft');
    expect(created.revision).toBe(1);
    expect(created.wordCount).toBe(2);
    expect(store.list(USER, projectId).map((d) => d.id)).toEqual([created.id]);

    const saved = store.update(USER, projectId, created.id, {
      title: 'Final',
      content: doc(p(text('Three words here'))),
      baseRevision: 1,
    });
    expect(saved.revision).toBe(2);
    expect(saved.wordCount).toBe(3);
    const read = store.get(USER, projectId, created.id);
    expect(read?.title).toBe('Final');
    expect(JSON.stringify(read?.content)).toContain('Three words here');
  });

  it('gives an empty document and a default title when none are sent', () => {
    const created = store.create(USER, projectId, {});
    expect(created.title).toBe('Untitled document');
    expect(created.content.type).toBe('doc');
  });

  it('keeps other users out of the project and its documents', () => {
    const created = store.create(USER, projectId, {});
    expect(errorOf(() => store.list(OTHER, projectId)).status).toBe(404);
    expect(errorOf(() => store.get(OTHER, projectId, created.id)).status).toBe(404);
    expect(errorOf(() => store.create(OTHER, projectId, {})).status).toBe(404);
    expect(errorOf(() => store.update(OTHER, projectId, created.id, { title: 'x', baseRevision: 1 })).status).toBe(404);
    expect(errorOf(() => store.remove(OTHER, projectId, created.id)).status).toBe(404);
    expect(store.get(USER, projectId, created.id)).not.toBeNull();
  });

  it('refuses a save based on an old revision and returns the stored version', () => {
    const created = store.create(USER, projectId, { content: doc(p(text('v1'))) });
    store.update(USER, projectId, created.id, { content: doc(p(text('v2 from tab A'))), baseRevision: 1 });
    const conflict = errorOf(() =>
      store.update(USER, projectId, created.id, { content: doc(p(text('v2 from tab B'))), baseRevision: 1 }),
    );
    expect(conflict.status).toBe(409);
    expect(conflict.current?.revision).toBe(2);
    expect(JSON.stringify(conflict.current?.content)).toContain('tab A');
  });

  it('rejects content that does not fit the schema', () => {
    expect(errorOf(() => store.create(USER, projectId, { content: { type: 'paragraph' } })).status).toBe(400);
    expect(errorOf(() => store.create(USER, projectId, { content: doc({ type: 'script', text: 'x' }) })).status).toBe(400);
    expect(errorOf(() => store.create(USER, projectId, { content: doc(text('loose text at the top')) })).status).toBe(400);
  });

  it('drops unsafe links and foreign images before saving', () => {
    const created = store.create(USER, projectId, {
      content: doc(
        p(text('bad', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
        p(text('good', [{ type: 'link', attrs: { href: 'https://example.com' } }])),
        { type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } },
        { type: 'image', attrs: { src: `/api/projects/${projectId}/assets/abc` } },
        { type: 'image', attrs: { src: '/api/projects/someone-else/assets/abc' } },
      ),
    });
    const json = JSON.stringify(created.content);
    expect(json).not.toContain('javascript:');
    expect(json).toContain('https://example.com');
    expect(json).not.toContain('data:image');
    expect(json).toContain(`/api/projects/${projectId}/assets/abc`);
    expect(json).not.toContain('someone-else');
  });

  it('rejects a document over the size limit', () => {
    const big = doc(p(text('x'.repeat(2 * 1024 * 1024 + 10))));
    expect(errorOf(() => store.create(USER, projectId, { content: big })).status).toBe(413);
  });

  it('tracks which ideas each document cites, through saves and deletes', () => {
    const one = store.create(USER, projectId, { content: doc(p(text('See '), cite(IDEA_A)), card(IDEA_B)) });
    const two = store.create(USER, projectId, { content: doc(p(cite(IDEA_A), cite(IDEA_A))) });
    expect(store.backlinks(USER, projectId)).toEqual({ [IDEA_A]: expect.arrayContaining([one.id, two.id]), [IDEA_B]: [one.id] });

    store.update(USER, projectId, one.id, { content: doc(p(text('No more citations'))), baseRevision: 1 });
    expect(store.backlinks(USER, projectId)).toEqual({ [IDEA_A]: [two.id] });

    expect(store.remove(USER, projectId, two.id)).toBe(true);
    expect(store.backlinks(USER, projectId)).toEqual({});
  });

  it('stores images for the project owner only', () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const asset = store.putAsset(USER, projectId, 'image/png', bytes);
    expect(asset.url).toBe(`/api/projects/${projectId}/assets/${asset.id}`);
    expect(store.getAsset(USER, projectId, asset.id)?.mime).toBe('image/png');
    expect(store.getAsset(OTHER, projectId, asset.id)).toBeNull();
    expect(errorOf(() => store.putAsset(USER, projectId, 'image/svg+xml', bytes)).status).toBe(400);
    expect(errorOf(() => store.putAsset(USER, projectId, 'image/png', Buffer.alloc(0))).status).toBe(400);
    expect(errorOf(() => store.putAsset(USER, projectId, 'image/png', Buffer.alloc(5 * 1024 * 1024 + 1))).status).toBe(413);
  });

  it('removes everything of a project when it is deleted', () => {
    store.create(USER, projectId, { content: doc(p(cite(IDEA_A))) });
    store.putAsset(USER, projectId, 'image/png', Buffer.from([1]));
    store.removeProject(projectId);
    expect(store.list(USER, projectId)).toEqual([]);
    expect(store.backlinks(USER, projectId)).toEqual({});
    expect((db.prepare('SELECT COUNT(*) AS n FROM project_asset').get() as { n: number }).n).toBe(0);
  });
});
