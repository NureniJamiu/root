/**
 * Public barrel for the Root MVP Data Model Layer.
 *
 * This module is the SOLE surface that `canvas/`, `nodes/`, `persistence/`,
 * and `app/` may import from `data/` (Requirements 10.4 and 10.5). Reaching
 * into individual files under `src/data/` from those layers is a layering
 * violation; the barrel exists so the data layer can be reorganized without
 * breaking consumers.
 *
 * What is exported:
 *   - TypeScript types    (from `./types`)   — Canvas, Node, NodeType,
 *                                              Position, ImageEntry, UUID
 *   - Zod schemas         (from `./schema`)  — canvasSchema, nodeSchema,
 *                                              nodeTypeSchema, positionSchema,
 *                                              imageEntrySchema
 *   - Pure mutators       (from `./mutators`) — emptyCanvas, addRoot,
 *                                              addChild, updateNode,
 *                                              addImage, removeImage,
 *                                              moveNode, setCollapsed,
 *                                              deleteNodeOnly, deleteSubtree,
 *                                              NodePatch
 *   - Tree utilities      (from `./tree`)    — childrenIndex, visibleNodeIds,
 *                                              descendantCount, subtreeIds,
 *                                              hasCycle, rootNode
 *   - Serialization       (from `./serialize`) — serializeCanvas, parseCanvas,
 *                                              ParseCanvasResult
 *
 * What is intentionally NOT exported:
 *   - `./ids` (`newId`) and `./time` (`now`) — internal helpers used by the
 *     mutators; feature code should never fabricate ids or timestamps
 *     directly, it should route through a mutator.
 *   - The Zustand store and `canvasActions` — added by task 6.1 once the
 *     store module exists.
 */

export type { Canvas, ImageEntry, Node, NodeType, Position, UUID } from './types';

export {
  canvasSchema,
  imageEntrySchema,
  nodeSchema,
  nodeTypeSchema,
  positionSchema,
} from './schema';

export {
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
} from './mutators';
export type { NodePatch } from './mutators';

export {
  childrenIndex,
  descendantCount,
  hasCycle,
  rootNode,
  subtreeIds,
  visibleNodeIds,
} from './tree';

export { parseCanvas, serializeCanvas } from './serialize';
export type { ParseCanvasResult } from './serialize';
