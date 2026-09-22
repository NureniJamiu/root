/**
 * Unit tests for mutator edge cases (task 4.12).
 *
 * These pin down four specific interactions from `mutators.ts` that the
 * property tests either cannot express cheaply or that the design.md
 * "guarded no-op" contract calls out explicitly:
 *
 *   1. `deleteNodeOnly` on a leaf is behaviourally identical to
 *      `deleteSubtree` on the same leaf — reparenting a childless node is
 *      the empty operation, so both mutators must produce the same canvas.
 *   2. `addImage` refuses a data URL larger than the 2 MB cap and returns
 *      the input canvas unchanged (R4.4 — data URL cap 2 MB by byte
 *      length). The test uses a 2.5 MB ASCII payload; because ASCII is
 *      one byte per character the byte length matches the character count.
 *   3. `addChild` with a `parentId` that is not present in the canvas is a
 *      no-op (guarded mutator boundary — the store's `safeParse` is the
 *      second line of defence, not the first).
 *   4. `deleteNodeOnly` on the root of a non-empty tree is a no-op (R7.5)
 *      because reparenting the root's children to `null` would produce
 *      multiple roots and violate `canvasSchema`.
 *
 * These cases live in their own file (rather than piggybacking on the
 * property tests) so a regression in any one of them fails with a targeted
 * message rather than a fast-check counterexample.
 *
 * Requirements exercised: 4.4, 7.5.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addChild,
  addImage,
  addRoot,
  deleteNodeOnly,
  deleteSubtree,
  emptyCanvas,
} from '../mutators';
import type { Canvas, ImageEntry, UUID } from '../types';

/* -------------------------------------------------------------------------- */
/* Constants + fixtures                                                        */
/* -------------------------------------------------------------------------- */

/** Byte cap in `mutators.ts`; kept as a local constant so the 2.5 MB size
 *  under test is expressed relative to the cap rather than as a magic number. */
const IMAGE_DATA_URL_MAX_BYTES = 2 * 1024 * 1024;

/** A UUID that is guaranteed not to appear in any fixture canvas built here. */
const GHOST_ID: UUID = '00000000-0000-4000-8000-0000000000ff';

/**
 * Build a two-node canvas: a root plus one direct child (leaf). Returned as
 * a tuple with the ids so tests can address each node without re-scanning.
 */
function makeRootWithChild(): { canvas: Canvas; rootId: UUID; leafId: UUID } {
  const c0 = addRoot(emptyCanvas(), { position: { x: 0, y: 0 } });
  const root = c0.nodes[0];
  if (root === undefined) throw new Error('addRoot did not add a node');
  const c1 = addChild(c0, root.id, { position: { x: 100, y: 100 } });
  const leaf = c1.nodes.find((n) => n.id !== root.id);
  if (leaf === undefined) throw new Error('addChild did not add a node');
  return { canvas: c1, rootId: root.id, leafId: leaf.id };
}

/**
 * Build a well-formed `ImageEntry` whose `dataUrl` has the requested UTF-8
 * byte length. Uses an ASCII payload so `byteLength === characterCount`.
 */
function makeImageEntryOfSize(sizeBytes: number): ImageEntry {
  const prefix = 'data:image/png;base64,';
  const filler = 'A'.repeat(sizeBytes - prefix.length);
  return {
    id: '00000000-0000-4000-8000-000000000101',
    dataUrl: prefix + filler,
    addedAt: '2024-01-01T00:00:00.000Z',
  };
}

/* -------------------------------------------------------------------------- */
/* Suite                                                                       */
/* -------------------------------------------------------------------------- */

describe('mutators — edge cases', () => {
  // Freeze the wall clock so `now()` returns the same ISO string for every
  // mutator call in the "leaf equivalence" test. Without this the two
  // canvases would differ only on `updatedAt`, which is not the semantic
  // property under test.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /* ---------------------------------------------------------------------- */
  /* deleteNodeOnly ≡ deleteSubtree on a leaf                                */
  /* ---------------------------------------------------------------------- */

  it('deleteNodeOnly on a leaf equals deleteSubtree on the same leaf', () => {
    const { canvas, leafId } = makeRootWithChild();

    const afterNodeOnly = deleteNodeOnly(canvas, leafId);
    const afterSubtree = deleteSubtree(canvas, leafId);

    // Structurally equal: both remove the leaf, neither touches the root.
    // The frozen clock makes `updatedAt` identical on both sides.
    expect(afterNodeOnly).toEqual(afterSubtree);
    // Sanity: the leaf is actually gone, so we're not asserting equality of
    // two no-ops.
    expect(afterNodeOnly.nodes.some((n) => n.id === leafId)).toBe(false);
    expect(afterNodeOnly.nodes).toHaveLength(1);
  });

  /* ---------------------------------------------------------------------- */
  /* addImage rejects > 2 MB data URLs                                       */
  /* ---------------------------------------------------------------------- */

  it('addImage rejects a 2.5 MB data URL and returns the input canvas', () => {
    const { canvas, rootId } = makeRootWithChild();
    // 2.5 MB in bytes; comfortably above the 2 MB cap so byte-length
    // rounding cannot flip the decision.
    const oversize = Math.floor(2.5 * 1024 * 1024);
    expect(oversize).toBeGreaterThan(IMAGE_DATA_URL_MAX_BYTES);

    const image = makeImageEntryOfSize(oversize);

    const result = addImage(canvas, rootId, image);

    // A guarded no-op returns the *same* canvas reference; assert both
    // identity and value so a future refactor that clones on the no-op
    // path is caught here.
    expect(result).toBe(canvas);
    expect(result.nodes[0]?.images).toEqual([]);
  });

  /* ---------------------------------------------------------------------- */
  /* addChild rejects unknown parentId                                       */
  /* ---------------------------------------------------------------------- */

  it('addChild on unknown parentId returns the input canvas', () => {
    const { canvas } = makeRootWithChild();

    const result = addChild(canvas, GHOST_ID, { position: { x: 42, y: 42 } });

    // Same reference — `addChild` short-circuits before allocating.
    expect(result).toBe(canvas);
    // Belt-and-braces: node count unchanged.
    expect(result.nodes).toHaveLength(canvas.nodes.length);
  });

  /* ---------------------------------------------------------------------- */
  /* deleteNodeOnly on root-with-children is a no-op (R7.5)                  */
  /* ---------------------------------------------------------------------- */

  it('deleteNodeOnly on root-with-children returns the input canvas', () => {
    const { canvas, rootId, leafId } = makeRootWithChild();

    const result = deleteNodeOnly(canvas, rootId);

    // Reparenting the child to `null` would produce two roots, so R7.5
    // requires the mutator to reject at the boundary. Assert identity to
    // prove no allocation occurred on the no-op path.
    expect(result).toBe(canvas);
    // The tree is intact: root and leaf both still present, parentage
    // untouched.
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes.find((n) => n.id === rootId)?.parentId).toBe(null);
    expect(result.nodes.find((n) => n.id === leafId)?.parentId).toBe(rootId);
  });
});
