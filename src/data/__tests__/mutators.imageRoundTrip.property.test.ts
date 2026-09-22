/**
 * Property test — Property 7: Image add/remove round-trip (task 4.6).
 *
 * `Feature: root-mvp, Property 7: Image add/remove round-trip`
 *
 * For any `Canvas` `c`, any node id `id` present in `c`, and any well-formed
 * `ImageEntry` `img` with a fresh id (i.e. an id not already in the target
 * node's `images` list),
 *
 *     removeImage(addImage(c, id, img), id, img.id)
 *       .nodes[<idxOf id>].images
 *     ≡ c.nodes[<idxOf id>].images (deep-equal)
 *
 * i.e. appending an image and then removing that same image restores the
 * node's images list byte-for-byte. This exercises Requirements 4.4 and 4.5:
 * `addImage` appends a new entry and `removeImage` deletes the entry keyed
 * by its id.
 *
 * Validates: Requirements 4.4, 4.5.
 *
 * The shared `arbCanvas` / `arbNodeId` / `arbImageEntry` arbitraries from
 * `./arbitraries` are used so the canvas is drawn from the same space as
 * every other Data Model property test. `arbImageEntry` yields a fresh v4
 * UUID and a small (≪ 2 MB) data URL, so collisions with an existing image
 * id are astronomically unlikely, but we still `filter` explicitly to match
 * the design.md phrasing ("with a fresh id") and keep the property honest
 * under future changes to the arbitrary.
 */

import fc from 'fast-check';
import { describe, expect, test } from 'vitest';

import { addImage, removeImage } from '../mutators';
import type { Canvas, UUID } from '../types';
import { arbCanvas, arbImageEntry, arbNodeId } from './arbitraries';

/**
 * Return the `images` list of the node identified by `id` in `c`. The
 * caller guarantees `id` is present in `c`, so the lookup always succeeds.
 */
function imagesOf(c: Canvas, id: UUID) {
  const node = c.nodes.find((n) => n.id === id);
  if (node === undefined) {
    throw new Error(`imagesOf: id ${id} not in canvas`);
  }
  return node.images;
}

describe('Feature: root-mvp, Property 7: Image add/remove round-trip', () => {
  test('removeImage(addImage(c, id, img), id, img.id) restores c.nodes[id].images', () => {
    fc.assert(
      fc.property(
        // Draw a non-empty canvas, then draw an in-canvas node id, then draw
        // a fresh image entry whose id does not already appear in that
        // node's images list. The `filter` on the image id is a safety net
        // — `arbImageEntry` uses `fc.uuid()` so collision probability is
        // essentially zero, but the design property is explicitly about a
        // *fresh* id and we want the test to reflect that literally.
        arbCanvas
          .filter((c) => c.nodes.length > 0)
          .chain((c) =>
            arbNodeId(c).chain((id) =>
              arbImageEntry
                .filter((img) => imagesOf(c, id).every((e) => e.id !== img.id))
                .map((img) => ({ c, id, img })),
            ),
          ),
        ({ c, id, img }) => {
          const after = removeImage(addImage(c, id, img), id, img.id);
          expect(imagesOf(after, id)).toEqual(imagesOf(c, id));
        },
      ),
      { numRuns: 100 },
    );
  });
});
