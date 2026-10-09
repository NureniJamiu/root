/**
 * Step-by-step reveal ("walkthrough") for presenting a canvas.
 *
 * Collapsed ideas hide everything below them. A walkthrough shows those
 * hidden ideas again one at a time — each press of Next reveals the next
 * idea connected to what is already on screen — so a presenter can walk an
 * audience through the research without giving away what comes next.
 *
 * What a walkthrough has revealed is view state only: it is kept here, not
 * in the canvas, and is never saved. Ending a walkthrough part-way puts the
 * canvas back the way it was (handy for a retake). Revealing the last
 * hidden idea expands the walked-through ideas for real, so the canvas then
 * stays as shown.
 *
 * The scope is either the whole canvas (`roots === null`) or the branches
 * below a set of ideas (usually the selection).
 */

import { create } from 'zustand';

import { canvasActions, downstreamIds, outgoingIndex, useCanvasStore, visibleNodeIds } from '../data';
import type { Canvas, UUID } from '../data';

export interface WalkthroughState {
  readonly active: boolean;
  /** Ideas whose branches are walked through; `null` walks the whole canvas. */
  readonly roots: readonly UUID[] | null;
  /** Ideas revealed so far, in order (the last one is undone by Back). */
  readonly revealed: readonly UUID[];
  /** How many ideas were hidden in scope when the walkthrough started. */
  readonly total: number;
}

const idle: WalkthroughState = { active: false, roots: null, revealed: [], total: 0 };

export const useWalkthroughStore = create<WalkthroughState>(() => idle);

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** Ideas on screen: those the collapse flags leave visible plus `revealed`. */
export function shownNodeIds(canvas: Canvas, revealed: readonly UUID[]): Set<UUID> {
  const shown = visibleNodeIds(canvas);
  if (revealed.length > 0) {
    const ids = new Set(canvas.nodes.map((n) => n.id));
    for (const id of revealed) if (ids.has(id)) shown.add(id);
  }
  return shown;
}

/** Reading order on the canvas: top to bottom, then left to right. */
function byReadingOrder(canvas: Canvas): (a: UUID, b: UUID) => number {
  const pos = new Map(canvas.nodes.map((n) => [n.id, n.position]));
  return (a, b) => {
    const pa = pos.get(a);
    const pb = pos.get(b);
    if (!pa || !pb) return 0;
    return pa.y - pb.y || pa.x - pb.x;
  };
}

/**
 * Where the walk starts: the scope's roots, or for the whole canvas the shown
 * ideas nothing shown points at (then every other shown idea, so ideas that
 * hang off a loop are still reached).
 */
function startIds(canvas: Canvas, shown: ReadonlySet<UUID>, roots: readonly UUID[] | null): UUID[] {
  const order = byReadingOrder(canvas);
  if (roots !== null) return roots.filter((id) => shown.has(id)).sort(order);
  const pointedAt = new Set(canvas.edges.filter((e) => shown.has(e.source)).map((e) => e.target));
  const all = [...shown].sort(order);
  return [...all.filter((id) => !pointedAt.has(id)), ...all.filter((id) => pointedAt.has(id))];
}

/**
 * The next hidden idea to reveal: walking out from each start idea in
 * reading order, level by level, the first idea that is not shown yet but
 * is connected from one that is. `null` when nothing in scope is hidden.
 */
export function nextToReveal(
  canvas: Canvas,
  shown: ReadonlySet<UUID>,
  roots: readonly UUID[] | null,
): UUID | null {
  const out = outgoingIndex(canvas);
  const order = byReadingOrder(canvas);
  const visited = new Set<UUID>();
  for (const start of startIds(canvas, shown, roots)) {
    if (visited.has(start)) continue;
    visited.add(start);
    const queue: UUID[] = [start];
    while (queue.length > 0) {
      const current = queue.shift() as UUID;
      const targets = (out.get(current) ?? []).map((e) => e.target).sort(order);
      for (const target of targets) {
        if (!shown.has(target)) return target;
        if (visited.has(target)) continue;
        visited.add(target);
        queue.push(target);
      }
    }
  }
  return null;
}

/** Ideas in scope that are still hidden. */
export function hiddenInScope(
  canvas: Canvas,
  shown: ReadonlySet<UUID>,
  roots: readonly UUID[] | null,
): Set<UUID> {
  const hidden = new Set<UUID>();
  if (roots === null) {
    for (const n of canvas.nodes) if (!shown.has(n.id)) hidden.add(n.id);
    return hidden;
  }
  for (const root of roots) {
    for (const id of downstreamIds(canvas, root)) if (!shown.has(id)) hidden.add(id);
  }
  return hidden;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                    */
/* -------------------------------------------------------------------------- */

function currentShown(): Set<UUID> {
  return shownNodeIds(useCanvasStore.getState().canvas, useWalkthroughStore.getState().revealed);
}

export const walkthroughActions = {
  /**
   * Start walking through `roots` (or the whole canvas with `null`). When
   * nothing in scope is hidden yet, the scope is collapsed first so there is
   * something to reveal.
   */
  start(roots: readonly UUID[] | null): void {
    let canvas = useCanvasStore.getState().canvas;
    if (hiddenInScope(canvas, visibleNodeIds(canvas), roots).size === 0) {
      canvasActions.collapseNodes(roots ?? 'all');
      canvas = useCanvasStore.getState().canvas;
    }
    const total = hiddenInScope(canvas, visibleNodeIds(canvas), roots).size;
    useWalkthroughStore.setState({ active: true, roots, revealed: [], total });
  },

  /** Reveal the next hidden idea. Returns its id, or `null` when done. */
  next(): UUID | null {
    const state = useWalkthroughStore.getState();
    if (!state.active) return null;
    const canvas = useCanvasStore.getState().canvas;
    const id = nextToReveal(canvas, currentShown(), state.roots);
    if (id === null) return null;
    const revealed = [...state.revealed, id];
    useWalkthroughStore.setState({ revealed });
    // Everything is on screen: make it stick by expanding for real.
    if (hiddenInScope(canvas, shownNodeIds(canvas, revealed), state.roots).size === 0) {
      walkthroughActions.commit();
    }
    return id;
  },

  /** Hide the most recently revealed idea again. */
  back(): void {
    const state = useWalkthroughStore.getState();
    if (!state.active || state.revealed.length === 0) return;
    useWalkthroughStore.setState({ revealed: state.revealed.slice(0, -1) });
  },

  /** Reveal everything left in scope at once and keep it expanded. */
  showAll(): void {
    const state = useWalkthroughStore.getState();
    if (!state.active) return;
    walkthroughActions.commit();
  },

  /** Expand the scope in the canvas itself and drop the view-only reveals. */
  commit(): void {
    const { roots } = useWalkthroughStore.getState();
    canvasActions.expandNodes(roots ?? 'all');
    useWalkthroughStore.setState({ revealed: [] });
  },

  /** Leave the walkthrough. Ideas revealed so far are hidden again. */
  end(): void {
    useWalkthroughStore.setState(idle);
  },
};
