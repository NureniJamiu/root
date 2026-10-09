/**
 * Zustand store and typed `canvasActions` for the Root MVP.
 *
 * The store is the single source of truth for the running app:
 *
 *   - `canvas`        — the persisted domain model (design.md §Data Models,
 *                        also the shape defined by `canvasSchema`).
 *   - `selection`     — which node or connector the user has selected on the
 *                        surface; both null when nothing is selected.
 *   - `editor`        — which node's `NodeEditor` is open; null when the
 *                        editor is closed.
 *   - `deletePrompt`  — which node's delete confirmation modal is open.
 *   - `viewport`      — pan and zoom state mirrored from React Flow so
 *                        persistence and non-React consumers can read it
 *                        without touching the RF instance.
 *
 * All writes to `canvas` route through `canvasActions`, which is the ONLY
 * documented mutation surface (Requirement 10.4). Each action:
 *
 *   1. Snapshots the current state.
 *   2. Invokes the pure mutator from `./mutators`.
 *   3. Re-validates the result with `canvasSchema.safeParse`. On failure
 *      the write is aborted and a `saveError` event is broadcast on the
 *      `storeEvents` bus (design.md §Error Handling — the store's parse
 *      is the "second line of defence" behind the mutator's guards).
 *   4. On success, commits the new canvas plus any coupled UI-state
 *      changes (e.g. opening the editor for a newly created node so
 *      R2.4 / R3.3 hold end-to-end).
 *
 * UI-state actions (`select`, `openEditor`, `closeEditor`,
 * `openDeletePrompt`, `closeDeletePrompt`, `setViewport`) are plain
 * `setState` calls; they bypass `safeParse` because they never touch
 * `canvas`.
 */

import { create } from 'zustand';

import { canvasSchema } from './schema';
import {
  addChild as mutAddChild,
  addImage as mutAddImage,
  addNode as mutAddNode,
  autoRouteEdge as mutAutoRouteEdge,
  collapseMany as mutCollapseMany,
  connect as mutConnect,
  deleteNodeOnly as mutDeleteNodeOnly,
  deleteSubtree as mutDeleteSubtree,
  emptyCanvas,
  expandMany as mutExpandMany,
  expandSubtree as mutExpandSubtree,
  moveNode as mutMoveNode,
  moveNodes as mutMoveNodes,
  removeEdge as mutRemoveEdge,
  removeImage as mutRemoveImage,
  setCanvasTitle as mutSetCanvasTitle,
  setCollapsed as mutSetCollapsed,
  updateEdge as mutUpdateEdge,
  updateNode as mutUpdateNode,
} from './mutators';
import type { ConnectorEnds, NodePatch } from './mutators';
import { emitSaveError } from './storeEvents';
import { subtreeIds } from './graph';
import type { Canvas, ImageEntry, NodeType, Position, Side, UUID } from './types';

/** The values the node editor saves in one go. */
export interface NodeEdits {
  readonly title: string;
  readonly body: string;
  readonly type: NodeType;
  readonly images: readonly ImageEntry[];
}

/* -------------------------------------------------------------------------- */
/* State shape                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The full store shape (design.md §Store Shape). Every field is required so
 * `exactOptionalPropertyTypes` doesn't force callers to remember to omit
 * "null-ish" branches — `null` is the well-defined "not selected / not
 * open" value.
 */
export interface CanvasState {
  canvas: Canvas;
  selection: { nodeId: UUID | null; edgeId: UUID | null };
  /** `isNew` marks an idea that was just added, so Cancel can discard it. */
  editor: { openNodeId: UUID | null; isNew?: boolean };
  deletePrompt: { nodeId: UUID | null };
  viewport: { x: number; y: number; zoom: number };
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The initial state used both by `useCanvasStore` and by tests that need a
 * clean slate. Broken out as a function so each call produces a fresh
 * `Canvas` (unique id and timestamp) rather than aliasing a module-level
 * object.
 */
function initialState(): CanvasState {
  return {
    canvas: emptyCanvas(),
    selection: { nodeId: null, edgeId: null },
    editor: { openNodeId: null },
    deletePrompt: { nodeId: null },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

/**
 * The React-bound Zustand hook. Components subscribe with a selector, e.g.
 * `useCanvasStore((s) => s.canvas.nodes)`. Direct mutation of the returned
 * state is not supported — write through `canvasActions`.
 */
export const useCanvasStore = create<CanvasState>(initialState);

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Diff two canvases and return the id of a node that appears in `after`
 * but not in `before`. Used by `addRoot` / `addChild` so the store can
 * open the editor on the freshly created node (R2.4 / R3.3). Returns
 * `null` when the mutator did not add a node (e.g. a guarded no-op that
 * somehow slipped through the identity check).
 */
function findNewNodeId(before: Canvas, after: Canvas): UUID | null {
  if (after.nodes.length !== before.nodes.length + 1) return null;
  const seen = new Set<UUID>(before.nodes.map((n) => n.id));
  for (const n of after.nodes) {
    if (!seen.has(n.id)) return n.id;
  }
  return null;
}

/**
 * Build the compact `SaveErrorDetail.message` string emitted when
 * `canvasSchema.safeParse` fails. Zod's `ZodError` can contain many
 * issues; we join the messages with `; ` so a toast has enough context
 * without dumping a full JSON dump into the DOM.
 */
function formatZodMessage(issues: readonly { message: string }[]): string {
  if (issues.length === 0) return 'invalid canvas';
  return issues.map((i) => i.message).join('; ');
}

/* -------------------------------------------------------------------------- */
/* Undo / redo history                                                        */
/* -------------------------------------------------------------------------- */

/** Most snapshots kept for undo. */
const HISTORY_LIMIT = 100;

/** Edits with the same key inside this window share one undo step. */
const COALESCE_WINDOW_MS = 1_000;

// Kept outside the store state: nothing renders from it, and the pure
// `Canvas` snapshots are cheap to hold because mutators share structure.
let undoStack: Canvas[] = [];
let redoStack: Canvas[] = [];
let lastCoalesceKey: string | null = null;
let lastCoalesceAt = 0;

function recordHistory(before: Canvas, coalesceKey: string | null): void {
  const at = Date.now();
  const coalesce =
    coalesceKey !== null &&
    coalesceKey === lastCoalesceKey &&
    at - lastCoalesceAt < COALESCE_WINDOW_MS;
  lastCoalesceKey = coalesceKey;
  lastCoalesceAt = at;
  redoStack = [];
  if (coalesce) return;
  undoStack.push(before);
  if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
}

function clearHistory(): void {
  undoStack = [];
  redoStack = [];
  lastCoalesceKey = null;
}

/** Drop UI state that points at a node the restored canvas no longer has. */
function uiForCanvas(canvas: Canvas, state: CanvasState): Partial<CanvasState> {
  const ids = new Set<UUID>(canvas.nodes.map((n) => n.id));
  const patch: Partial<CanvasState> = {};
  if (state.editor.openNodeId !== null && !ids.has(state.editor.openNodeId)) {
    patch.editor = { openNodeId: null };
  }
  if (state.deletePrompt.nodeId !== null && !ids.has(state.deletePrompt.nodeId)) {
    patch.deletePrompt = { nodeId: null };
  }
  const nodeGone = state.selection.nodeId !== null && !ids.has(state.selection.nodeId);
  const edgeGone =
    state.selection.edgeId !== null && !canvas.edges.some((e) => e.id === state.selection.edgeId);
  if (nodeGone || edgeGone) {
    patch.selection = {
      nodeId: nodeGone ? null : state.selection.nodeId,
      edgeId: edgeGone ? null : state.selection.edgeId,
    };
  }
  return patch;
}

/**
 * Shared write path. Invokes `compute`, checks for a guarded no-op via
 * reference identity, runs `safeParse`, and — on success — hands the
 * validated canvas to `commit`, which returns any coupled UI-state
 * changes.
 *
 * `commit` receives the current UI state along with the parsed canvas so
 * an action can (for example) clear `editor.openNodeId` when the node it
 * points to has just been deleted, without repeating the state snapshot
 * dance in every action body.
 */
function commitCanvasWrite(
  actionName: string,
  compute: (state: CanvasState) => Canvas,
  commit: (parsed: Canvas, state: CanvasState) => Partial<CanvasState>,
  coalesceKey: string | null = null,
): void {
  const state = useCanvasStore.getState();
  const before = state.canvas;
  const after = compute(state);
  // Guarded no-op: the mutator returned the same reference, meaning it
  // rejected the input at its own boundary (unknown id, oversize image,
  // etc.). Nothing to persist and no error to surface.
  if (after === before) return;
  const parsed = canvasSchema.safeParse(after);
  if (!parsed.success) {
    emitSaveError({
      action: actionName,
      message: formatZodMessage(parsed.error.issues),
    });
    return;
  }
  const patch = commit(parsed.data, state);
  // A removed connector cannot stay selected.
  const selection = patch.selection ?? state.selection;
  if (selection.edgeId !== null && !parsed.data.edges.some((e) => e.id === selection.edgeId)) {
    patch.selection = { ...selection, edgeId: null };
  }
  recordHistory(before, coalesceKey);
  useCanvasStore.setState({ canvas: parsed.data, ...patch });
}

/**
 * Clear `editor` / `deletePrompt` / `selection` when they point at a node
 * that has just been removed. Kept as a helper so `deleteNodeOnly` and
 * `deleteSubtree` share the exact same cleanup rules.
 */
function clearUiForRemoved(
  removed: ReadonlySet<UUID>,
  state: CanvasState,
): Partial<CanvasState> {
  const patch: Partial<CanvasState> = {};
  if (state.editor.openNodeId !== null && removed.has(state.editor.openNodeId)) {
    patch.editor = { openNodeId: null };
  }
  if (
    state.deletePrompt.nodeId !== null &&
    removed.has(state.deletePrompt.nodeId)
  ) {
    patch.deletePrompt = { nodeId: null };
  }
  if (state.selection.nodeId !== null && removed.has(state.selection.nodeId)) {
    patch.selection = { nodeId: null, edgeId: state.selection.edgeId };
  }
  return patch;
}

/* -------------------------------------------------------------------------- */
/* canvasActions                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The typed mutation surface for `useCanvasStore`. Components import this
 * object rather than reaching into `useCanvasStore.setState` — the design
 * treats `canvasActions` as the store's public API (design.md §Data Model
 * Layer — Public Surface, Requirement 10.4).
 *
 * Every action is a plain function so callers can pass them as event
 * handlers (`onClick={() => canvasActions.deleteSubtree(id)}`) without
 * binding.
 */
export const canvasActions = {
  /* ---------------------------------------------------------------------- */
  /* Canvas writes                                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * Add a new, unconnected idea at `position` and open its editor (the
   * editor's autoFocus then focuses the title field). Works on any canvas.
   */
  addNode(position: Position): void {
    commitCanvasWrite(
      'addNode',
      (s) => mutAddNode(s.canvas, { position }),
      (parsed, s) => {
        const newId = findNewNodeId(s.canvas, parsed);
        return newId === null ? {} : { editor: { openNodeId: newId, isNew: true } };
      },
    );
  },

  /**
   * Append an idea at `position`, connect `parentId` to it, and open its
   * editor. The connector uses the facing sides unless `sides` says
   * otherwise. Guarded: unknown parent is a no-op inside the mutator.
   */
  addChild(
    parentId: UUID,
    position: Position,
    sides?: { sourceSide?: Side; targetSide?: Side },
  ): void {
    commitCanvasWrite(
      'addChild',
      (s) => mutAddChild(s.canvas, parentId, { position, ...sides }),
      (parsed, s) => {
        const newId = findNewNodeId(s.canvas, parsed);
        return newId === null ? {} : { editor: { openNodeId: newId, isNew: true } };
      },
    );
  },

  /**
   * Shallow-patch `title` / `body` / `type` on the node identified by
   * `id`. Position, images, and collapse state have dedicated actions.
   */
  updateNode(id: UUID, patch: NodePatch): void {
    commitCanvasWrite(
      'updateNode',
      (s) => mutUpdateNode(s.canvas, id, patch),
      () => ({}),
      `updateNode:${id}`,
    );
  },

  /**
   * Commit everything the editor changed on `id` (text, type and images) as
   * one undo step, then close the editor. Nothing is written when the
   * values already match the node.
   */
  saveNodeEdits(id: UUID, edits: NodeEdits): void {
    const node = useCanvasStore.getState().canvas.nodes.find((n) => n.id === id);
    if (node === undefined) return;
    const keep = new Set(edits.images.map((img) => img.id));
    const had = new Set(node.images.map((img) => img.id));
    const removed = node.images.filter((img) => !keep.has(img.id));
    const added = edits.images.filter((img) => !had.has(img.id));
    const textChanged =
      node.title !== edits.title || node.body !== edits.body || node.type !== edits.type;
    if (textChanged || removed.length > 0 || added.length > 0) {
      commitCanvasWrite(
        'saveNodeEdits',
        (s) => {
          let next = textChanged
            ? mutUpdateNode(s.canvas, id, { title: edits.title, body: edits.body, type: edits.type })
            : s.canvas;
          for (const img of removed) next = mutRemoveImage(next, id, img.id);
          for (const img of added) next = mutAddImage(next, id, img);
          return next;
        },
        () => ({ editor: { openNodeId: null } }),
      );
    }
    useCanvasStore.setState({ editor: { openNodeId: null } });
  },

  /**
   * Cancel on a freshly added idea: take the idea (and its connector) back
   * out as if it had never been added, leaving no undo step behind. Falls
   * back to a plain delete when other edits landed after the add.
   */
  discardNewNode(id: UUID): void {
    const state = useCanvasStore.getState();
    const before = undoStack[undoStack.length - 1];
    const wasLastAdd =
      before !== undefined &&
      !before.nodes.some((n) => n.id === id) &&
      before.nodes.length === state.canvas.nodes.length - 1;
    if (wasLastAdd) {
      undoStack.pop();
      lastCoalesceKey = null;
      useCanvasStore.setState({
        canvas: before,
        ...uiForCanvas(before, state),
        editor: { openNodeId: null },
      });
      return;
    }
    commitCanvasWrite(
      'deleteNodeOnly',
      (s) => mutDeleteNodeOnly(s.canvas, id),
      (_parsed, s) => clearUiForRemoved(new Set<UUID>([id]), s),
    );
    useCanvasStore.setState({ editor: { openNodeId: null } });
  },

  /**
   * Append `image` to the node's image list. The mutator silently
   * rejects data URLs above 2 MB (R4.4); the editor is responsible for
   * surfacing that to the user via its own inline validation before
   * calling this action.
   */
  addImage(id: UUID, image: ImageEntry): void {
    commitCanvasWrite(
      'addImage',
      (s) => mutAddImage(s.canvas, id, image),
      () => ({}),
    );
  },

  /**
   * Remove the image identified by `imageId` from the node identified by
   * `id`. Guarded: unknown ids are no-ops.
   */
  removeImage(id: UUID, imageId: UUID): void {
    commitCanvasWrite(
      'removeImage',
      (s) => mutRemoveImage(s.canvas, id, imageId),
      () => ({}),
    );
  },

  /**
   * Commit `position` for the node identified by `id`. Called on
   * `onNodeDragStop` — interim positions are RF-only (R5.2).
   */
  moveNode(id: UUID, position: Position): void {
    commitCanvasWrite(
      'moveNode',
      (s) => mutMoveNode(s.canvas, id, position),
      () => ({}),
    );
  },

  /**
   * Commit the positions of several nodes as one edit (a multi-card drag).
   */
  moveNodes(positions: ReadonlyMap<UUID, Position>): void {
    commitCanvasWrite(
      'moveNodes',
      (s) => mutMoveNodes(s.canvas, positions),
      () => ({}),
    );
  },

  /**
   * Add a connector between two sides. Rejected silently (no write, no undo
   * step) for self-connections, unknown nodes and exact duplicates.
   */
  connect(ends: ConnectorEnds): void {
    commitCanvasWrite(
      'connect',
      (s) => mutConnect(s.canvas, ends),
      () => ({}),
    );
  },

  /** Re-attach a connector: move either end to another card or side. */
  updateEdge(edgeId: UUID, ends: ConnectorEnds): void {
    commitCanvasWrite(
      'updateEdge',
      (s) => mutUpdateEdge(s.canvas, edgeId, ends),
      () => ({}),
    );
  },

  /** Unpin both ends of a connector so it follows the facing sides again. */
  autoRouteEdge(edgeId: UUID): void {
    commitCanvasWrite(
      'autoRouteEdge',
      (s) => mutAutoRouteEdge(s.canvas, edgeId),
      () => ({}),
    );
  },

  /** Remove one connector; both cards stay. */
  removeEdge(edgeId: UUID): void {
    commitCanvasWrite(
      'removeEdge',
      (s) => mutRemoveEdge(s.canvas, edgeId),
      () => ({}),
    );
  },

  /**
   * Toggle the `collapsed` flag on the node identified by `id`.
   */
  setCollapsed(id: UUID, collapsed: boolean): void {
    commitCanvasWrite(
      'setCollapsed',
      (s) => mutSetCollapsed(s.canvas, id, collapsed),
      () => ({}),
    );
  },

  /**
   * Collapse several ideas in one undo step; `'all'` collapses every idea
   * that has something below it.
   */
  collapseNodes(ids: readonly UUID[] | 'all'): void {
    commitCanvasWrite(
      'collapseNodes',
      (s) => mutCollapseMany(s.canvas, ids === 'all' ? s.canvas.nodes.map((n) => n.id) : ids),
      () => ({}),
    );
  },

  /**
   * Expand several ideas and everything below them in one undo step;
   * `'all'` expands the whole canvas.
   */
  expandNodes(ids: readonly UUID[] | 'all'): void {
    commitCanvasWrite(
      'expandNodes',
      (s) => mutExpandMany(s.canvas, ids === 'all' ? s.canvas.nodes.map((n) => n.id) : ids),
      () => ({}),
    );
  },

  /**
   * Reveal the whole branch under `id`: clears `collapsed` on the node and
   * on every descendant (`setCollapsed` only reveals one level).
   */
  expandSubtree(id: UUID): void {
    commitCanvasWrite(
      'expandSubtree',
      (s) => mutExpandSubtree(s.canvas, id),
      () => ({}),
    );
  },

  /** Rename the canvas (project). Validated and timestamped like any edit. */
  setTitle(title: string): void {
    commitCanvasWrite(
      'setTitle',
      (s) => mutSetCanvasTitle(s.canvas, title),
      () => ({}),
      'setTitle',
    );
  },

  /**
   * Replace the canvas with a derived one (auto layout, loading an example).
   * The result goes through the same schema check as every other write and
   * is a single undo step.
   */
  applyCanvas(next: Canvas): void {
    commitCanvasWrite(
      'applyCanvas',
      () => next,
      (parsed, s) => uiForCanvas(parsed, s),
    );
  },

  /**
   * Swap in a canvas that was loaded from the server (project open/switch).
   * Resets selection, open dialogs and undo history: they belong to the
   * previous project.
   */
  loadCanvas(canvas: Canvas): void {
    clearHistory();
    useCanvasStore.setState({
      canvas,
      selection: { nodeId: null, edgeId: null },
      editor: { openNodeId: null },
      deletePrompt: { nodeId: null },
    });
  },

  /** Step back to the canvas before the last edit. */
  undo(): void {
    const previous = undoStack.pop();
    if (previous === undefined) return;
    const state = useCanvasStore.getState();
    redoStack.push(state.canvas);
    lastCoalesceKey = null;
    useCanvasStore.setState({ canvas: previous, ...uiForCanvas(previous, state) });
  },

  /** Re-apply an edit that was undone. */
  redo(): void {
    const next = redoStack.pop();
    if (next === undefined) return;
    const state = useCanvasStore.getState();
    undoStack.push(state.canvas);
    lastCoalesceKey = null;
    useCanvasStore.setState({ canvas: next, ...uiForCanvas(next, state) });
  },

  /**
   * Remove the node identified by `id` and its connectors; the ideas it
   * was connected to stay. Any open editor or delete prompt on the removed
   * node is closed as part of the same commit so the UI never points at a
   * phantom id.
   */
  deleteNodeOnly(id: UUID): void {
    commitCanvasWrite(
      'deleteNodeOnly',
      (s) => mutDeleteNodeOnly(s.canvas, id),
      (_parsed, s) => clearUiForRemoved(new Set<UUID>([id]), s),
    );
  },

  /**
   * Remove the node identified by `id` together with every idea that hangs
   * only from it. Any UI state pointing at *any* removed node —
   * editor, delete prompt, or selection — is cleared in the same commit.
   */
  deleteSubtree(id: UUID): void {
    // Compute the doomed set from the *pre*-mutation canvas so we
    // catch UI state that pointed at descendants, not just the target.
    // `commitCanvasWrite` runs `compute` before `commit`, so a fresh
    // read of the state inside `commit` still sees the pre-mutation
    // canvas via the `state` argument.
    commitCanvasWrite(
      'deleteSubtree',
      (s) => mutDeleteSubtree(s.canvas, id),
      (_parsed, s) => clearUiForRemoved(subtreeIds(s.canvas, id), s),
    );
  },

  /* ---------------------------------------------------------------------- */
  /* UI-state actions                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Set the currently selected node, or clear the selection with `null`.
   * Selecting a node deselects any connector. Pure UI-state; does not touch
   * `canvas`.
   */
  select(nodeId: UUID | null): void {
    useCanvasStore.setState({ selection: { nodeId, edgeId: null } });
  },

  /**
   * Select a connector (deselecting any node), or clear the selection with
   * `null`.
   */
  selectEdge(edgeId: UUID | null): void {
    useCanvasStore.setState({ selection: { nodeId: null, edgeId } });
  },

  /**
   * Open the `NodeEditor` on `nodeId`. Multiple editors are never open
   * at once — this simply overwrites the previous target.
   */
  openEditor(nodeId: UUID): void {
    useCanvasStore.setState({ editor: { openNodeId: nodeId } });
  },

  /**
   * Close the `NodeEditor`. Idempotent when nothing is open.
   */
  closeEditor(): void {
    useCanvasStore.setState({ editor: { openNodeId: null } });
  },

  /**
   * Open the delete confirmation modal for `nodeId`. The modal itself
   * decides whether both delete modes are offered (design.md §Delete
   * Prompt).
   */
  openDeletePrompt(nodeId: UUID): void {
    useCanvasStore.setState({ deletePrompt: { nodeId } });
  },

  /**
   * Close the delete confirmation modal. Idempotent.
   */
  closeDeletePrompt(): void {
    useCanvasStore.setState({ deletePrompt: { nodeId: null } });
  },

  /**
   * Mirror React Flow's viewport into the store so non-React consumers
   * (e.g. `computeChildPosition` in task 9.2) can read it without
   * touching the RF instance. `zoom` is expected to sit within
   * `[minZoom, maxZoom]` — the store does not clamp.
   */
  setViewport(viewport: { x: number; y: number; zoom: number }): void {
    useCanvasStore.setState({ viewport });
  },
} as const;
