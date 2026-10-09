// @vitest-environment node
import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { addChild, addImage, addRoot, emptyCanvas, updateNode } from '../../data/mutators';
import type { Canvas } from '../../data/types';
import { IMAGE_REF_DATA_URL } from '../image-ref';
import { createProjectStore, ensureProjectSchema, ProjectError } from '../project-store';
import type { ProjectStore } from '../project-store';

const USER = 'user-1';
const OTHER = 'user-2';
const IMAGE = 'data:image/png;base64,AAAA';

function canvasWithImage(): { canvas: Canvas; imageId: string } {
  let canvas = addRoot({ ...emptyCanvas(), title: 'With image' }, { position: { x: 0, y: 0 } });
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
    ensureProjectSchema(db);
    store = createProjectStore(db);
  });

  it('creates a first project when the user has none', () => {
    const list = store.list(USER);
    expect(list).toHaveLength(1);
    expect(store.list(USER)).toHaveLength(1); // not again on the next call
  });

  it('only shows a user their own projects', () => {
    const mine = store.create(USER, { title: 'Mine' });
    expect(store.get(OTHER, mine.id)).toBeNull();
    expect(store.update(OTHER, mine.id, { title: 'Hijacked' })).toBeNull();
    expect(store.remove(OTHER, mine.id)).toBe(false);
    expect(store.get(USER, mine.id)?.title).toBe('Mine');
  });

  it('rejects an invalid canvas instead of storing it', () => {
    const bad = { ...emptyCanvas(), nodes: [{ not: 'a node' }] };
    expect(() => store.create(USER, { canvas: bad as unknown as Canvas })).toThrow(ProjectError);
    let canvas = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
    canvas = addChild(canvas, canvas.nodes[0]!.id, { position: { x: 1, y: 1 } });
    const twoRoots = { ...canvas, nodes: canvas.nodes.map((n) => ({ ...n, parentId: null })) };
    const project = store.create(USER, { title: 'ok' });
    expect(() => store.update(USER, project.id, { canvas: twoRoots })).toThrow(/exactly 1 root/);
  });

  it('computes nodeCount itself and ignores a client-supplied value', () => {
    let canvas = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
    canvas = addChild(canvas, canvas.nodes[0]!.id, { position: { x: 1, y: 1 } });
    const created = store.create(USER, { canvas, nodeCount: 999 } as never);
    expect(created.nodeCount).toBe(2);
    const updated = store.update(USER, created.id, { canvas, nodeCount: 0 } as never);
    expect(updated?.nodeCount).toBe(2);
    expect(store.list(USER)[0]!.nodeCount).toBe(2);
  });

  it('refuses to create a project whose id is taken, by anyone', () => {
    const first = store.create(USER, { title: 'First' });
    expect(() => store.create(OTHER, { id: first.id })).toThrow(/already exists/);
  });

  it('update never creates: a missing project is null (so a save after delete is a 404)', () => {
    const project = store.create(USER, { title: 'Doomed' });
    expect(store.remove(USER, project.id)).toBe(true);
    expect(store.update(USER, project.id, { title: 'Zombie' })).toBeNull();
    expect(store.get(USER, project.id)).toBeNull();
  });

  it('rejects a title longer than the shared limit', () => {
    const project = store.create(USER, { title: 'ok' });
    expect(() => store.update(USER, project.id, { title: 'x'.repeat(201) })).toThrow(ProjectError);
  });

  describe('images', () => {
    it('stores image data outside the canvas JSON and gives it back on read', () => {
      const { canvas, imageId } = canvasWithImage();
      const project = store.create(USER, { canvas });

      const raw = db.prepare('SELECT canvas FROM project WHERE id = ?').get(project.id) as { canvas: string };
      expect(raw.canvas).not.toContain(IMAGE);
      expect(raw.canvas).toContain(IMAGE_REF_DATA_URL);

      const read = store.get(USER, project.id)!;
      expect(read.canvas.nodes[0]!.images).toEqual([
        expect.objectContaining({ id: imageId, dataUrl: IMAGE }),
      ]);
    });

    it('accepts a reference for an image it already holds, without re-sending the data', () => {
      const { canvas, imageId } = canvasWithImage();
      const project = store.create(USER, { canvas });

      const slim: Canvas = {
        ...canvas,
        nodes: canvas.nodes.map((n) => ({
          ...n,
          images: n.images.map((i) => ({ ...i, dataUrl: IMAGE_REF_DATA_URL })),
        })),
      };
      const edited = { ...slim, title: 'Edited' };
      expect(store.update(USER, project.id, { canvas: edited })).not.toBeNull();

      const read = store.get(USER, project.id)!;
      expect(read.canvas.title).toBe('Edited');
      expect(read.canvas.nodes[0]!.images[0]).toMatchObject({ id: imageId, dataUrl: IMAGE });
    });

    it('rejects a reference to an image it does not hold (409 missing-image)', () => {
      const { canvas } = canvasWithImage();
      const project = store.create(USER, { title: 'p' });
      const dangling: Canvas = {
        ...canvas,
        nodes: canvas.nodes.map((n) => ({
          ...n,
          images: n.images.map((i) => ({ ...i, dataUrl: IMAGE_REF_DATA_URL })),
        })),
      };
      try {
        store.update(USER, project.id, { canvas: dangling });
        expect.unreachable();
      } catch (err) {
        expect(err).toBeInstanceOf(ProjectError);
        expect(err).toMatchObject({ status: 409, code: 'missing-image' });
      }
    });

    it('drops stored images that the canvas no longer references, and on delete', () => {
      const { canvas } = canvasWithImage();
      const project = store.create(USER, { canvas });
      const count = () =>
        (db.prepare('SELECT COUNT(*) AS n FROM project_image WHERE projectId = ?').get(project.id) as { n: number }).n;
      expect(count()).toBe(1);

      const without = updateNode({ ...canvas, nodes: canvas.nodes.map((n) => ({ ...n, images: [] })) }, canvas.nodes[0]!.id, {});
      store.update(USER, project.id, { canvas: without });
      expect(count()).toBe(0);

      store.update(USER, project.id, { canvas });
      expect(count()).toBe(1);
      store.remove(USER, project.id);
      expect(count()).toBe(0);
    });

    it('leaves the stored project untouched when an update is rejected part-way', () => {
      const { canvas } = canvasWithImage();
      const project = store.create(USER, { canvas });
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
      expect(() => store.update(USER, project.id, { canvas: dangling })).toThrow(ProjectError);
      expect(store.get(USER, project.id)!.canvas.title).toBe('With image');
      expect(
        (db.prepare('SELECT COUNT(*) AS n FROM project_image').get() as { n: number }).n,
      ).toBe(1);
    });
  });
});
