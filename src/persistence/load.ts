/**
 * Initial-canvas load path for the Root MVP.
 *
 * `loadInitialCanvas` is called once from `App`'s mount effect (task
 * 13.1) to decide what canvas the store should start with. Three
 * outcomes, corresponding to R8.3–R8.5:
 *
 *   - Nothing at `CANVAS_KEY` — first launch, or after storage was
 *     cleared. Return `emptyCanvas()`. (R8.4)
 *   - A parseable canvas at `CANVAS_KEY` — return it as-is. (R8.3)
 *   - An unparseable payload at `CANVAS_KEY` — copy the raw bytes to
 *     `RAW_KEY`, emit a `loadError` event so the shell can toast, and
 *     fall back to `emptyCanvas()`. The original bytes at `CANVAS_KEY`
 *     are left untouched so a subsequent successful write overwrites
 *     them cleanly; the raw copy at `RAW_KEY` is the recoverable
 *     artifact the user can inspect. (R8.5)
 *
 * The function never throws. `localStorage.getItem` can throw in
 * private-mode Safari and locked-down environments; we treat that as
 * "no saved canvas" (design.md §Error Handling — `localStorage.getItem`
 * failure → empty canvas). `localStorage.setItem` for the raw copy is
 * best-effort: if it too fails, we still emit the load error and
 * return an empty canvas.
 */

import { emptyCanvas, parseCanvas } from '../data';
import type { Canvas } from '../data';
import { CANVAS_KEY, RAW_KEY } from './keys';
import { emitLoadError } from './persistenceEvents';

/**
 * Read the persisted canvas from `localStorage` and validate it.
 *
 * Always synchronous. Always returns a `Canvas` — either the restored
 * document or `emptyCanvas()` for one of the fallback paths. Side
 * effects are limited to the recovery-slot write in the parse-failure
 * branch and the `loadError` event dispatch that accompanies it.
 */
export function loadInitialCanvas(): Canvas {
  let raw: string | null;
  try {
    raw = localStorage.getItem(CANVAS_KEY);
  } catch {
    // Access-denied / SecurityError. Treat as "no saved canvas" per
    // design.md; there is nothing to recover and nothing to toast.
    return emptyCanvas();
  }

  if (raw === null) return emptyCanvas();

  const result = parseCanvas(raw);
  if (result.ok) return result.canvas;

  // Preserve the raw bytes to `RAW_KEY` before we do anything else
  // (R8.5). This is best-effort — a failing write here does not change
  // the outcome, but the caller should still hear about the parse
  // failure via the event bus.
  try {
    localStorage.setItem(RAW_KEY, result.raw);
  } catch {
    // Swallow: we are already in an error path and the toast will
    // still be surfaced below.
  }

  emitLoadError({ message: result.error });
  return emptyCanvas();
}
