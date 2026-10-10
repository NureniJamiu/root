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
 *   - Pure mutators       (from `./mutators`) — emptyCanvas, addNode,
 *                                              addChild, connect, updateEdge,
 *                                              removeEdge, updateNode, ...
 *   - Graph utilities     (from `./graph`)   — visibleNodeIds,
 *                                              descendantCount, subtreeIds,
 *                                              computeFacingSides, ...
 *   - Serialization       (from `./serialize`) — serializeCanvas, parseCanvas,
 *                                              ParseCanvasResult
 *
 * What is intentionally NOT exported:
 *   - `./ids` (`newId`) and `./time` (`now`) — internal helpers used by the
 *     mutators; feature code should never fabricate ids or timestamps
 *     directly, it should route through a mutator.
 *
 * Also re-exported from this barrel:
 *   - Zustand store         (from `./store`)       — CanvasState,
 *                                                    useCanvasStore,
 *                                                    canvasActions
 *   - Store event bus       (from `./storeEvents`) — emitSaveError,
 *                                                    onSaveError,
 *                                                    SaveErrorDetail
 */

export type { Canvas, Edge, ImageEntry, Node, NodeType, Position, Side, UUID } from './types';

export {
  canvasSchema,
  edgeSchema,
  imageEntrySchema,
  migrateLegacyCanvas,
  nodeSchema,
  nodeTypeSchema,
  positionSchema,
  sideSchema,
} from './schema';

export {
  addChild,
  addImage,
  addNode,
  autoRouteEdge,
  collapseMany,
  connect,
  deleteNodeOnly,
  deleteSubtree,
  emptyCanvas,
  expandMany,
  expandSubtree,
  moveNode,
  moveNodes,
  removeEdge,
  removeImage,
  revealChild,
  hideChild,
  setCanvasTitle,
  setCollapsed,
  updateEdge,
  updateNode,
} from './mutators';
export type { ConnectorEnds, NodePatch } from './mutators';

export {
  childReveals,
  computeFacingSides,
  connectionsOf,
  descendantCount,
  downstreamIds,
  edgeKey,
  exclusiveDownstreamIds,
  formatNodeLabel,
  hasHiddenChildren,
  hiddenDescendantCount,
  incomingIndex,
  isDuplicateEdge,
  nodeLabel,
  nodeOrdinal,
  nodeOrdinals,
  outgoingIndex,
  resolveEdgeSides,
  subtreeIds,
  visibleNodeIds,
} from './graph';

export {
  CANVAS_TITLE_MAX,
  IMAGE_DATA_URL_MAX_BYTES,
  NODE_BODY_MAX,
  NODE_TITLE_MAX,
} from './limits';

export { parseCanvas, serializeCanvas } from './serialize';
export type { ParseCanvasResult } from './serialize';

export { canvasActions, useCanvasStore } from './store';
export type { CanvasState, NodeEdits } from './store';

export { docLinksActions, useDocLinksStore } from './docLinks';
export type { DocLinksState } from './docLinks';

export { emitSaveError, onSaveError } from './storeEvents';
export type { SaveErrorDetail } from './storeEvents';
