/**
 * Zustand store and typed `canvasActions` for the Root MVP.
 *
 * The store is the single source of truth for the running app:
 *
 *   - `canvas`        — the persisted domain model (design.md §Data Models,
 *                        also the shape defined by `canvasSchema`).
 *   - `selection`     — which node the user has selected on the surface;
 *                        null when nothing is selected.
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
  addRoot as mutAddRoot,
  deleteNodeOnly as mutDeleteNodeOnly,
  deleteSubtree as mutDeleteSubtree,
  emptyCanvas,
  moveNode as mutMoveNode,
  removeImage as mutRemoveImage,
  setCollapsed as mutSetCollapsed,
  updateNode as mutUpdateNode,
} from './mutators';
import type { NodePatch } from './mutators';
import { emitSaveError } from './storeEvents';
import { subtreeIds } from './tree';
import type { Canvas, ImageEntry, Position, UUID } from './types';

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
  selection: { nodeId: UUID | null };
  editor: { openNodeId: UUID | null };
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
    selection: { nodeId: null },
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
    patch.selection = { nodeId: null };
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
   * Add the initial root node at `position` and open its editor with focus
   * intent (R2.4 — the editor's autoFocus prop then focuses the title
   * field). No-op when the canvas already has a root.
   */
  addRoot(position: Position): void {
    commitCanvasWrite(
      'addRoot',
      (s) => mutAddRoot(s.canvas, { position }),
      (parsed, s) => {
        const newId = findNewNodeId(s.canvas, parsed);
        return newId === null ? {} : { editor: { openNodeId: newId } };
      },
    );
  },

  /**
   * Append a child under `parentId` and open its editor (R3.3 — the
   * editor opens focused on the title so the user can start typing
   * immediately). Guarded: unknown parent is a no-op inside the mutator.
   */
  addChild(parentId: UUID, position: Position): void {
    commitCanvasWrite(
      'addChild',
      (s) => mutAddChild(s.canvas, parentId, { position }),
      (parsed, s) => {
        const newId = findNewNodeId(s.canvas, parsed);
        return newId === null ? {} : { editor: { openNodeId: newId } };
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
    );
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
   * Remove the node identified by `id`, reparenting its direct children
   * to the removed node's own parent (R7.1 / R7.3). Guarded at the
   * mutator boundary against root-with-children (R7.5). Any open editor
   * or delete prompt on the removed node is closed as part of the same
   * commit so the UI never points at a phantom id.
   */
  deleteNodeOnly(id: UUID): void {
    commitCanvasWrite(
      'deleteNodeOnly',
      (s) => mutDeleteNodeOnly(s.canvas, id),
      (_parsed, s) => clearUiForRemoved(new Set<UUID>([id]), s),
    );
  },

  /**
   * Remove the node identified by `id` together with every transitive
   * descendant (R7.4). Any UI state pointing at *any* removed node —
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
   * Pure UI-state; does not touch `canvas`.
   */
  select(nodeId: UUID | null): void {
    useCanvasStore.setState({ selection: { nodeId } });
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
