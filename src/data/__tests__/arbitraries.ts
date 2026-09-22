/**
 * Shared fast-check arbitraries for the Data Model Layer property tests.
 *
 * The primary export is `arbCanvas`: it builds a `Canvas` by applying a
 * random sequence of pure mutators to `emptyCanvas()`. Because every
 * generated canvas is reached only through the mutators — each of which is
 * guarded to reject invariant-breaking inputs — the resulting canvas is
 * structurally valid by construction. This simultaneously exercises
 * Property 15 (design.md §Correctness Properties): every finite mutator
 * sequence applied to the empty canvas yields a canvas that satisfies
 * `canvasSchema`.
 *
 * The remaining exports are small helper arbitraries and *canvas-scoped*
 * arbitrary factories that individual property tests use to draw a random
 * node id or a random parent/child edge out of a canvas produced by
 * `arbCanvas`.
 *
 * Requirements: 9.1, 9.2, 9.3.
 */

import fc from 'fast-check';

import {
  addChild,
  addImage,
  addRoot,
  deleteNodeOnly,
  deleteSubtree,
  emptyCanvas,
  moveNode,
  removeImage,
  setCollapsed,
  updateNode,
  type NodePatch,
} from '../mutators';
import type {
  Canvas,
  ImageEntry,
  NodeType,
  Position,
  UUID,
} from '../types';

/* -------------------------------------------------------------------------- */
/* Leaf arbitraries                                                           */
/* -------------------------------------------------------------------------- */

/** Uniform over the four MVP node types. */
export const arbNodeType: fc.Arbitrary<NodeType> = fc.constantFrom<NodeType>(
  'topic',
  'finding',
  'question',
  'conclusion',
);

/**
 * A `Position` with finite integer coordinates in `[-10_000, 10_000]`. The
 * bounded range keeps shrinkers small while still spanning the coordinate
 * space the canvas actually uses.
 */
export const arbPosition: fc.Arbitrary<Position> = fc.record({
  x: fc.integer({ min: -10_000, max: 10_000 }),
  y: fc.integer({ min: -10_000, max: 10_000 }),
});

/**
 * An `ImageEntry` with a fresh UUID, a short valid data URL, and a fixed
 * ISO timestamp. The MVP's image mutators only look at `id`, at the byte
 * length of `dataUrl` (capped at 2 MB — well above these payloads), and at
 * `addedAt` as an opaque string, so keeping the payload small keeps the
 * shrinker fast without losing coverage.
 */
export const arbImageEntry: fc.Arbitrary<ImageEntry> = fc.record({
  id: fc.uuid(),
  dataUrl: fc.constantFrom(
    'data:image/png;base64,iVBORw0KGgo=',
    'data:image/jpeg;base64,/9j/4AAQ',
    'data:image/gif;base64,R0lGODlh',
  ),
  addedAt: fc.constant('2024-01-01T00:00:00.000Z'),
});

/* -------------------------------------------------------------------------- */
/* Operation plan                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Abstract description of a single mutator invocation. Node references are
 * indices into the *current* node list at fold time; concrete node ids are
 * looked up by `applyOp` immediately before dispatching to the mutator so
 * that a fixed op plan generated up-front stays meaningful as the canvas
 * grows and shrinks during the fold. `noOp` covers the case where an op
 * targets a slot that no longer exists (e.g. `removeImage` on a node with
 * no images) — the mutators already treat these as no-ops, we just skip
 * them explicitly to keep intent readable.
 */
type Op =
  | { readonly kind: 'addRoot'; readonly position: Position }
  | {
      readonly kind: 'addChild';
      readonly nodeIdx: number;
      readonly position: Position;
    }
  | {
      readonly kind: 'updateNode';
      readonly nodeIdx: number;
      readonly patch: NodePatch;
    }
  | {
      readonly kind: 'addImage';
      readonly nodeIdx: number;
      readonly image: ImageEntry;
    }
  | {
      readonly kind: 'removeImage';
      readonly nodeIdx: number;
      readonly imageIdx: number;
    }
  | {
      readonly kind: 'moveNode';
      readonly nodeIdx: number;
      readonly position: Position;
    }
  | {
      readonly kind: 'setCollapsed';
      readonly nodeIdx: number;
      readonly value: boolean;
    }
  | { readonly kind: 'deleteNodeOnly'; readonly nodeIdx: number }
  | { readonly kind: 'deleteSubtree'; readonly nodeIdx: number };

/**
 * A `NodePatch` with each key independently present or absent. Under
 * `exactOptionalPropertyTypes` an absent key is meaningfully different
 * from `key: undefined`, which is why we use `fc.record`'s
 * `requiredKeys: []` variant rather than mapping `undefined` values.
 */
const arbNodePatch: fc.Arbitrary<NodePatch> = fc.record(
  {
    title: fc.string({ maxLength: 100 }),
    body: fc.string({ maxLength: 500 }),
    type: arbNodeType,
  },
  { requiredKeys: [] },
);

/** Non-negative integer used as an abstract node/image slot index. */
const arbSlot: fc.Arbitrary<number> = fc.integer({ min: 0, max: 255 });

const arbOpAddRoot: fc.Arbitrary<Op> = arbPosition.map((position) => ({
  kind: 'addRoot' as const,
  position,
}));

const arbOpAddChild: fc.Arbitrary<Op> = fc
  .tuple(arbSlot, arbPosition)
  .map(([nodeIdx, position]) => ({
    kind: 'addChild' as const,
    nodeIdx,
    position,
  }));

const arbOpUpdateNode: fc.Arbitrary<Op> = fc
  .tuple(arbSlot, arbNodePatch)
  .map(([nodeIdx, patch]) => ({
    kind: 'updateNode' as const,
    nodeIdx,
    patch,
  }));

const arbOpAddImage: fc.Arbitrary<Op> = fc
  .tuple(arbSlot, arbImageEntry)
  .map(([nodeIdx, image]) => ({
    kind: 'addImage' as const,
    nodeIdx,
    image,
  }));

const arbOpRemoveImage: fc.Arbitrary<Op> = fc
  .tuple(arbSlot, arbSlot)
  .map(([nodeIdx, imageIdx]) => ({
    kind: 'removeImage' as const,
    nodeIdx,
    imageIdx,
  }));

const arbOpMoveNode: fc.Arbitrary<Op> = fc
  .tuple(arbSlot, arbPosition)
  .map(([nodeIdx, position]) => ({
    kind: 'moveNode' as const,
    nodeIdx,
    position,
  }));

const arbOpSetCollapsed: fc.Arbitrary<Op> = fc
  .tuple(arbSlot, fc.boolean())
  .map(([nodeIdx, value]) => ({
    kind: 'setCollapsed' as const,
    nodeIdx,
    value,
  }));

const arbOpDeleteNodeOnly: fc.Arbitrary<Op> = arbSlot.map((nodeIdx) => ({
  kind: 'deleteNodeOnly' as const,
  nodeIdx,
}));

const arbOpDeleteSubtree: fc.Arbitrary<Op> = arbSlot.map((nodeIdx) => ({
  kind: 'deleteSubtree' as const,
  nodeIdx,
}));

/**
 * The op distribution is weighted so canvases actually grow. `addRoot` is
 * a no-op on every non-empty canvas, so it stays cheap; `addChild` is
 * amplified so a plan of 20–30 ops typically yields a canvas with a
 * handful of interior nodes; deletes are kept below growth so we still
 * regularly reach non-trivial sizes.
 */
const arbOp: fc.Arbitrary<Op> = fc.oneof(
  { arbitrary: arbOpAddRoot, weight: 2 },
  { arbitrary: arbOpAddChild, weight: 6 },
  { arbitrary: arbOpUpdateNode, weight: 2 },
  { arbitrary: arbOpAddImage, weight: 2 },
  { arbitrary: arbOpRemoveImage, weight: 1 },
  { arbitrary: arbOpMoveNode, weight: 2 },
  { arbitrary: arbOpSetCollapsed, weight: 2 },
  { arbitrary: arbOpDeleteNodeOnly, weight: 1 },
  { arbitrary: arbOpDeleteSubtree, weight: 1 },
);

/**
 * Apply a single operation to `c`, resolving abstract slot indices into
 * the current node/image list by modulo (so any generated index is always
 * meaningful when the target list is non-empty). Ops that target an
 * empty list return `c` unchanged; `addRoot` on a non-empty canvas is
 * handled by the mutator itself (also a no-op).
 */
function applyOp(c: Canvas, op: Op): Canvas {
  if (op.kind === 'addRoot') {
    return addRoot(c, { position: op.position });
  }

  if (c.nodes.length === 0) return c;

  const nodeIdx = op.nodeIdx % c.nodes.length;
  const target = c.nodes[nodeIdx]!; // safe: nodeIdx is in [0, nodes.length)

  switch (op.kind) {
    case 'addChild':
      return addChild(c, target.id, { position: op.position });
    case 'updateNode':
      return updateNode(c, target.id, op.patch);
    case 'addImage':
      return addImage(c, target.id, op.image);
    case 'removeImage': {
      if (target.images.length === 0) return c;
      const imgIdx = op.imageIdx % target.images.length;
      return removeImage(c, target.id, target.images[imgIdx]!.id);
    }
    case 'moveNode':
      return moveNode(c, target.id, op.position);
    case 'setCollapsed':
      return setCollapsed(c, target.id, op.value);
    case 'deleteNodeOnly':
      return deleteNodeOnly(c, target.id);
    case 'deleteSubtree':
      return deleteSubtree(c, target.id);
  }
}

/* -------------------------------------------------------------------------- */
/* arbCanvas                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A `Canvas` produced by folding a random sequence of 0–30 mutator
 * operations over `emptyCanvas()`. By construction every generated canvas
 * satisfies the four structural invariants enforced by
 * `canvasSchema.superRefine` — unique ids, ≤ 1 root (= 1 when non-empty),
 * no dangling `parentId`, no cycles — which is exactly Property 15.
 *
 * Individual property tests either consume the canvas directly (e.g.
 * Property 15 itself, Property 16 serialization round-trip) or `chain`
 * a canvas-scoped arbitrary onto it (e.g. `arbNodeId`, `arbParentChildPair`)
 * to draw an in-canvas id.
 */
export const arbCanvas: fc.Arbitrary<Canvas> = fc
  // `size: 'xlarge'` overrides fast-check's default small-biased sizing so
  // the op plan reliably lands in the middle of the [0, 30] range. Without
  // it the default bias produces mostly empty canvases (~70%), which
  // starves downstream property tests that need to draw an in-canvas node.
  .array(arbOp, { minLength: 0, maxLength: 30, size: 'xlarge' })
  .map((ops) => ops.reduce<Canvas>(applyOp, emptyCanvas()));

/* -------------------------------------------------------------------------- */
/* Canvas-scoped arbitraries                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Uniform over the ids present in `c`. Precondition: `c.nodes.length > 0`.
 * Callers that want to draw an id out of an arbitrary canvas should
 * `chain` this onto `arbCanvas.filter((c) => c.nodes.length > 0)`.
 */
export function arbNodeId(c: Canvas): fc.Arbitrary<UUID> {
  if (c.nodes.length === 0) {
    throw new Error('arbNodeId requires a non-empty canvas');
  }
  return fc.constantFrom(...c.nodes.map((n) => n.id));
}

/**
 * Uniform over the direct `(parentId, childId)` edges in `c`. Precondition:
 * `c` contains at least one non-root node. Callers should `chain` this
 * onto `arbCanvas.filter(hasParentChildEdge)` where the filter is trivially
 * `c.nodes.some((n) => n.parentId !== null)`.
 */
export function arbParentChildPair(
  c: Canvas,
): fc.Arbitrary<readonly [UUID, UUID]> {
  const pairs: Array<readonly [UUID, UUID]> = [];
  for (const n of c.nodes) {
    if (n.parentId !== null) pairs.push([n.parentId, n.id] as const);
  }
  if (pairs.length === 0) {
    throw new Error(
      'arbParentChildPair requires a canvas with ≥ 1 parent-child edge',
    );
  }
  return fc.constantFrom(...pairs);
}
