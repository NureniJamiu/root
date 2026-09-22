/**
 * `localStorage` key constants for the Root MVP persistence layer.
 *
 * `CANVAS_KEY` is the slot the debounced middleware writes the serialized
 * `Canvas` document into on every 500 ms flush and on `beforeunload`
 * (R8.1, R8.2, R8.6). It is also the slot `loadInitialCanvas` reads on
 * app start (R8.3, R8.4).
 *
 * `RAW_KEY` is the recovery slot: when `parseCanvas` cannot deserialize
 * the payload found at `CANVAS_KEY` on load, the load path copies the
 * offending raw string here untouched (R8.5). Keeping the corrupted
 * payload out of the primary slot lets the app fall back to an empty
 * canvas without losing the bytes the user might want to inspect or
 * hand-fix later. The primary slot is intentionally left alone so a
 * subsequent write can overwrite it cleanly.
 *
 * Keys are namespaced with the `root-mvp:` prefix so this app can
 * coexist with other tools on the same origin without collision, and so
 * the `.raw` suffix is unambiguous when inspecting devtools.
 */

export const CANVAS_KEY = 'root-mvp:canvas' as const;
export const RAW_KEY = 'root-mvp:canvas.raw' as const;
