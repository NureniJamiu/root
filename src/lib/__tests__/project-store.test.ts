// @vitest-environment node
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { addChild, addImage, addNode, emptyCanvas, updateNode } from '../../data/mutators';
import type { Canvas } from '../../data/types';
import { toV1 } from '../../data/__tests__/arbitraries';
import { memoryBlobStore } from '../blob-store';
import { IMAGE_REF_DATA_URL } from '../image-ref';
import { createProjectStore, ProjectError } from '../project-store';
import type { ProjectStore } from '../project-store';
import { ensureSchema } from '../schema';
import { sqliteSql } from '../sql';

const USER = 'user-1';
const OTHER = 'user-2';
const IMAGE = 'data:image/png;base64,AAAA';

function canvasWithImage(): { canvas: Canvas; imageId: string } {
  let canvas = addNode({ ...emptyCanvas(), title: 'With image' }, { position: { x: 0, y: 0 } });
  const imageId = crypto.randomUUID();
  canvas = addImage(canvas, canvas.nodes[0]!.id, {
    id: imageId,
    dataUrl: IMAGE,
    addedAt: new Date().toISOString(),
  });
  return { canvas, imageId };
}

describe('project store', () => {
  let db: Database.Database;
  let store: ProjectStore;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureSchema(db);
    store = createProjectStore(sqliteSql(db));
  });

  it('creates a first project when the user has none', async () => {
    const list = await store.list(USER);
    expect(list).toHaveLength(1);
    expect(await store.list(USER)).toHaveLength(1); // not again on the next call
  });

  it('only shows a user their own projects', async () => {
    const mine = await store.create(USER, { title: 'Mine' });
    expect(await store.get(OTHER, mine.id)).toBeNull();
    expect(await store.update(OTHER, mine.id, { title: 'Hijacked' })).toBeNull();
    expect(await store.remove(OTHER, mine.id)).toBe(false);
    expect((await store.get(USER, mine.id))?.title).toBe('Mine');
  });

  it('rejects an invalid canvas instead of storing it', async () => {
    const bad = { ...emptyCanvas(), nodes: [{ not: 'a node' }] };
    await expect(store.create(USER, { canvas: bad as unknown as Canvas })).rejects.toThrow(ProjectError);
    let canvas = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    canvas = addChild(canvas, canvas.nodes[0]!.id, { position: { x: 1, y: 1 } });
    const selfLoop = { ...canvas, edges: canvas.edges.map((e) => ({ ...e, target: e.source })) };
    const project = await store.create(USER, { title: 'ok' });
    await expect(store.update(USER, project.id, { canvas: selfLoop })).rejects.toThrow(/to itself/);
  });

  it('migrates a project saved in the older parentId format when it is read back', async () => {
    const project = await store.create(USER, { title: 'legacy' });
    const a = crypto.randomUUID();
    const b = crypto.randomUUID();
    const ts = new Date().toISOString();
    const node = (id: string, parentId: string | null, x: number) => ({
      id, parentId, title: id, body: '', images: [], type: 'topic', position: { x, y: 0 },
      collapsed: false, createdAt: ts, updatedAt: ts,
    });
    const legacy = { id: project.id, title: 'legacy', updatedAt: ts, nodes: [node(a, null, 0), node(b, a, 400)] };
    db.prepare('UPDATE project SET canvas = ? WHERE id = ?').run(JSON.stringify(legacy), project.id);

    const loaded = (await store.get(USER, project.id))!;

    expect(loaded.canvas.edges).toHaveLength(1);
    expect(loaded.canvas.edges[0]).toMatchObject({ source: a, target: b, sourceSide: 'right', targetSide: 'left' });
    expect(loaded.canvas.nodes.every((n) => !('parentId' in n))).toBe(true);
  });

  it('reads a stored v1 canvas back as v2, with nothing inferred', async () => {
    let canvas = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    canvas = addChild(canvas, canvas.nodes[0]!.id, { position: { x: 400, y: 0 } });
    const project = await store.create(USER, { canvas });
    db.prepare('UPDATE project SET canvas = ? WHERE id = ?').run(JSON.stringify(toV1(canvas)), project.id);
    const loaded = (await store.get(USER, project.id))!.canvas;
    expect(loaded.schemaVersion).toBe(2);
    expect(loaded.nodes.map((n) => n.provenance.origin)).toEqual(['unrecorded', 'unrecorded']);
    expect(loaded.edges[0]).toMatchObject({ relationType: 'related-to', provenance: { origin: 'unrecorded' } });
  });

  describe('downgrade guard', () => {
    const v2Canvas = () => {
      let canvas = addNode({ ...emptyCanvas(), title: 'Typed' }, { position: { x: 0, y: 0 } });
      canvas = addChild(canvas, canvas.nodes[0]!.id, { position: { x: 400, y: 0 } });
      return canvas;
    };

    it('refuses (409 stale-schema) a canvas without schemaVersion 2 once the stored one is v2', async () => {
      const canvas = v2Canvas();
      const project = await store.create(USER, { canvas });
      const stale = { ...toV1(canvas), title: 'Saved by an old tab' };
      await expect(store.update(USER, project.id, { canvas: stale })).rejects.toMatchObject({
        status: 409,
        code: 'stale-schema',
      });
      const kept = (await store.get(USER, project.id))!.canvas;
      expect(kept.title).toBe('Typed');
      expect(kept.edges[0]!.provenance.origin).toBe('researcher');
    });

    it('still accepts a v2 save, and a title-only save, over a v2 canvas', async () => {
      const canvas = v2Canvas();
      const project = await store.create(USER, { canvas });
      expect(await store.update(USER, project.id, { canvas: { ...canvas, title: 'Renamed' } })).not.toBeNull();
      expect(await store.update(USER, project.id, { title: 'Renamed again' })).not.toBeNull();
    });

    it('accepts a v1 save over a stored v1 canvas and stores it as v2', async () => {
      const canvas = v2Canvas();
      const project = await store.create(USER, { canvas });
      db.prepare('UPDATE project SET canvas = ? WHERE id = ?').run(JSON.stringify(toV1(canvas)), project.id);
      expect(await store.update(USER, project.id, { canvas: toV1(canvas) })).not.toBeNull();
      const raw = db.prepare('SELECT canvas FROM project WHERE id = ?').get(project.id) as { canvas: string };
      expect(JSON.parse(raw.canvas)).toMatchObject({ schemaVersion: 2 });
    });

    it('creates new projects as v2', async () => {
      const project = await store.create(USER, { title: 'Blank' });
      const raw = db.prepare('SELECT canvas FROM project WHERE id = ?').get(project.id) as { canvas: string };
      expect(JSON.parse(raw.canvas)).toMatchObject({ schemaVersion: 2 });
    });
  });

  it('computes nodeCount itself and ignores a client-supplied value', async () => {
    let canvas = addNode(emptyCanvas(), { position: { x: 0, y: 0 } });
    canvas = addChild(canvas, canvas.nodes[0]!.id, { position: { x: 1, y: 1 } });
    const created = await store.create(USER, { canvas, nodeCount: 999 } as never);
    expect(created.nodeCount).toBe(2);
    const updated = await store.update(USER, created.id, { canvas, nodeCount: 0 } as never);
    expect(updated?.nodeCount).toBe(2);
    expect((await store.list(USER))[0]!.nodeCount).toBe(2);
  });

  it('refuses to create a project whose id is taken, by anyone', async () => {
    const first = await store.create(USER, { title: 'First' });
    await expect(store.create(OTHER, { id: first.id })).rejects.toThrow(/already exists/);
  });

  it('update never creates: a missing project is null (so a save after delete is a 404)', async () => {
    const project = await store.create(USER, { title: 'Doomed' });
    expect(await store.remove(USER, project.id)).toBe(true);
    expect(await store.update(USER, project.id, { title: 'Zombie' })).toBeNull();
    expect(await store.get(USER, project.id)).toBeNull();
  });

  it('rejects a title longer than the shared limit', async () => {
    const project = await store.create(USER, { title: 'ok' });
    await expect(store.update(USER, project.id, { title: 'x'.repeat(201) })).rejects.toThrow(ProjectError);
  });

  describe('images', () => {
    it('stores image data outside the canvas JSON and gives it back on read', async () => {
      const { canvas, imageId } = canvasWithImage();
      const project = await store.create(USER, { canvas });

      const raw = db.prepare('SELECT canvas FROM project WHERE id = ?').get(project.id) as { canvas: string };
      expect(raw.canvas).not.toContain(IMAGE);
      expect(raw.canvas).toContain(IMAGE_REF_DATA_URL);

      const read = (await store.get(USER, project.id))!;
      expect(read.canvas.nodes[0]!.images).toEqual([
        expect.objectContaining({ id: imageId, dataUrl: IMAGE }),
      ]);
    });

    it('accepts a reference for an image it already holds, without re-sending the data', async () => {
      const { canvas, imageId } = canvasWithImage();
      const project = await store.create(USER, { canvas });

      const slim: Canvas = {
        ...canvas,
        nodes: canvas.nodes.map((n) => ({
          ...n,
          images: n.images.map((i) => ({ ...i, dataUrl: IMAGE_REF_DATA_URL })),
        })),
      };
      const edited = { ...slim, title: 'Edited' };
      expect(await store.update(USER, project.id, { canvas: edited })).not.toBeNull();

      const read = (await store.get(USER, project.id))!;
      expect(read.canvas.title).toBe('Edited');
      expect(read.canvas.nodes[0]!.images[0]).toMatchObject({ id: imageId, dataUrl: IMAGE });
    });

    it('rejects a reference to an image it does not hold (409 missing-image)', async () => {
      const { canvas } = canvasWithImage();
      const project = await store.create(USER, { title: 'p' });
      const dangling: Canvas = {
        ...canvas,
        nodes: canvas.nodes.map((n) => ({
          ...n,
          images: n.images.map((i) => ({ ...i, dataUrl: IMAGE_REF_DATA_URL })),
        })),
      };
      try {
        await store.update(USER, project.id, { canvas: dangling });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ProjectError);
        expect(err).toMatchObject({ status: 409, code: 'missing-image' });
      }
    });

    it('drops stored images that the canvas no longer references, and on delete', async () => {
      const { canvas } = canvasWithImage();
      const project = await store.create(USER, { canvas });
      const count = () =>
        (db.prepare('SELECT COUNT(*) AS n FROM project_image WHERE projectId = ?').get(project.id) as { n: number }).n;
      expect(count()).toBe(1);

      const without = updateNode({ ...canvas, nodes: canvas.nodes.map((n) => ({ ...n, images: [] })) }, canvas.nodes[0]!.id, {});
      await store.update(USER, project.id, { canvas: without });
      expect(count()).toBe(0);

      await store.update(USER, project.id, { canvas });
      expect(count()).toBe(1);
      await store.remove(USER, project.id);
      expect(count()).toBe(0);
    });

    it('leaves the stored project untouched when an update is rejected part-way', async () => {
      const { canvas } = canvasWithImage();
      const project = await store.create(USER, { canvas });
      const dangling: Canvas = {
        ...canvas,
        title: 'Should not apply',
        nodes: canvas.nodes.map((n) => ({
          ...n,
          images: [
            { id: crypto.randomUUID(), dataUrl: IMAGE, addedAt: new Date().toISOString() },
            { id: crypto.randomUUID(), dataUrl: IMAGE_REF_DATA_URL, addedAt: new Date().toISOString() },
          ],
        })),
      };
      await expect(store.update(USER, project.id, { canvas: dangling })).rejects.toThrow(ProjectError);
      expect((await store.get(USER, project.id))!.canvas.title).toBe('With image');
      expect(
        (db.prepare('SELECT COUNT(*) AS n FROM project_image').get() as { n: number }).n,
      ).toBe(1);
    });
  });

  describe('images in blob storage (R2 on Workers)', () => {
    let blobs: ReturnType<typeof memoryBlobStore>;

    beforeEach(() => {
      blobs = memoryBlobStore();
      store = createProjectStore(sqliteSql(db), blobs);
    });

    it('keeps image data in blob storage, not the database, and gives it back on read', async () => {
      const { canvas, imageId } = canvasWithImage();
      const project = await store.create(USER, { canvas });

      expect(blobs.keys()).toEqual([`projects/${project.id}/images/${imageId}`]);
      const row = db.prepare('SELECT dataUrl FROM project_image WHERE id = ?').get(imageId) as { dataUrl: string };
      expect(row.dataUrl).toBe('');

      const read = (await store.get(USER, project.id))!;
      expect(read.canvas.nodes[0]!.images).toEqual([expect.objectContaining({ id: imageId, dataUrl: IMAGE })]);
    });

    it('deletes the blob of an image the canvas drops, and every blob when the project goes', async () => {
      const { canvas } = canvasWithImage();
      const project = await store.create(USER, { canvas });
      await store.update(USER, project.id, { canvas: { ...canvas, nodes: canvas.nodes.map((n) => ({ ...n, images: [] })) } });
      expect(blobs.keys()).toEqual([]);

      await store.update(USER, project.id, { canvas });
      expect(blobs.keys()).toHaveLength(1);
      await store.remove(USER, project.id);
      expect(blobs.keys()).toEqual([]);
    });
  });
});
