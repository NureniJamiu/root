// @vitest-environment node
/**
 * The stores on Cloudflare's own D1 and R2 (run locally by Wrangler), so the
 * Workers code path is tested, not only the better-sqlite3 one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getPlatformProxy, unstable_splitSqlQuery as splitSql } from 'wrangler';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { addNode, emptyCanvas, updateNode } from '../../data/mutators';
import { buildChunks, toPromptCanvas } from '../ai/project-content';
import { createSearchIndex } from '../ai/search-index';
import { createSqlAiStore } from '../ai/ai-store';
import { r2BlobStore } from '../blob-store';
import type { WorkerEnv } from '../cloudflare';
import { createDocumentStore } from '../document-store';
import { createProjectStore } from '../project-store';
import { d1Sql, stmt } from '../sql';
import type { Sql } from '../sql';

const ROOT = path.resolve(__dirname, '../../..');
const USER = 'user-1';

let proxy: Awaited<ReturnType<typeof getPlatformProxy<WorkerEnv>>>;
let sql: Sql;

beforeAll(async () => {
  proxy = await getPlatformProxy<WorkerEnv>({
    configPath: path.join(ROOT, 'wrangler.jsonc'),
    persist: false,
    remoteBindings: false,
    envFiles: [],
  });
  const migration = fs.readFileSync(path.join(ROOT, 'migrations/0001_init.sql'), 'utf8');
  const db = proxy.env.DB;
  await db.batch(splitSql(migration).map((q) => db.prepare(q)));
  sql = d1Sql(db);
}, 60_000);

afterAll(async () => {
  await proxy?.dispose();
});

describe('on D1 and R2', () => {
  it('saves a canvas with an image over D1’s 2 MB row limit, through R2', async () => {
    const files = r2BlobStore(proxy.env.FILES);
    const projects = createProjectStore(sql, files);
    const now = new Date().toISOString();
    const big = `data:image/png;base64,${'A'.repeat(2_200_000)}`;
    const imageId = crypto.randomUUID();
    const project = await projects.create(USER, { title: 'Big' });
    const canvas = {
      ...(await projects.get(USER, project.id))!.canvas,
      nodes: [
        {
          id: crypto.randomUUID(), title: 'Idea', body: '', type: 'topic' as const,
          images: [{ id: imageId, dataUrl: big, addedAt: now }],
          position: { x: 0, y: 0 }, collapsed: false, createdAt: now, updatedAt: now,
        },
      ],
    };
    expect(await projects.update(USER, project.id, { canvas })).not.toBeNull();
    expect((await projects.get(USER, project.id))!.canvas.nodes[0]!.images[0]!.dataUrl).toBe(big);
    expect(await projects.remove(USER, project.id)).toBe(true);
    expect(await proxy.env.FILES.get(`projects/${project.id}/images/${imageId}`)).toBeNull();
  });

  it('stores document images in R2 and refuses a stale save', async () => {
    const files = r2BlobStore(proxy.env.FILES);
    const project = await createProjectStore(sql).create(USER, { title: 'Docs' });
    const documents = createDocumentStore(sql, files);
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 9]);
    const asset = await documents.putAsset(USER, project.id, 'image/png', bytes);
    expect(await documents.getAsset(USER, project.id, asset.id)).toEqual({ mime: 'image/png', bytes });

    const doc = await documents.create(USER, project.id, { title: 'Notes' });
    await documents.update(USER, project.id, doc.id, { title: 'Two', baseRevision: 1 });
    await expect(documents.update(USER, project.id, doc.id, { title: 'Stale', baseRevision: 1 })).rejects.toMatchObject({
      status: 409,
    });
  });

  it('keeps the search index (FTS5, rowids from RETURNING, vectors as BLOBs)', async () => {
    const index = createSearchIndex(sql);
    let canvas = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    const ideaId = canvas.nodes[0]!.id;
    canvas = updateNode(canvas, ideaId, { title: 'Coffee and sleep', body: 'Caffeine delays sleep onset.' });
    const chunks = buildChunks({ title: 'Sleep', canvas: toPromptCanvas(canvas), documents: [] });
    const stale = await index.sync(USER, 'p1', chunks, 'm');
    expect(stale.map((c) => typeof c.rowid)).toEqual(['number']);
    await index.setEmbeddings('m', [{ rowid: stale[0]!.rowid, vector: [0.25, -1, 3.5] }]);
    expect(await index.sync(USER, 'p1', chunks, 'm')).toEqual([]);
    expect((await index.keywordSearch(USER, 'p1', 'caffeine', 5)).map((h) => h.key)).toEqual([`idea:${ideaId}`]);
    const [hit] = await index.vectorSearch(USER, 'p1', 'm', [0.25, -1, 3.5], 1);
    expect(hit!.score).toBeCloseTo(1, 5);
    await sql.batch(index.removeProjectStatements('p1'));
    expect(await index.keywordSearch(USER, 'p1', 'caffeine', 5)).toEqual([]);
  });

  it('runs a batch all-or-nothing', async () => {
    await expect(
      sql.batch([
        stmt('INSERT INTO user_plan ("userId", "plan", "updatedAt") VALUES (?, ?, ?)', 'atomic', 'pro', 'now'),
        stmt('INSERT INTO no_such_table VALUES (1)'),
      ]),
    ).rejects.toThrow();
    expect(await createSqlAiStore(sql).getPlan('atomic')).toBeNull();
  });
});
