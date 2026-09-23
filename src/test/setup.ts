import '@testing-library/jest-dom';

/*
 * `localStorage` polyfill for the Vitest jsdom environment.
 *
 * Node.js (v22.4+) exposes an experimental `globalThis.localStorage`
 * stub that is enabled by `--experimental-webstorage` and configured
 * with `--localstorage-file=<path>`. When Node is started without a
 * valid path (as happens under Vitest here), Node still installs a
 * global `localStorage` object but it is a plain empty object with a
 * null prototype and no `Storage` methods. That stub shadows the
 * real Storage instance jsdom would otherwise expose on
 * `window.localStorage`, so any test-code call like
 * `localStorage.setItem` fails with "setItem is not a function".
 *
 * We fix the environment once, here, by installing a minimal in-
 * memory `Storage`-shaped object on both `globalThis` and `window`.
 * Persistence-layer code under test uses only the four standard
 * methods (`setItem`, `getItem`, `removeItem`, `clear`); those are
 * all we need to provide. Tests that want to observe writes
 * (`middleware.timing.test.ts`) spy on the polyfill's methods
 * directly rather than on `Storage.prototype`, because the polyfill
 * intentionally does not inherit from `Storage.prototype` (see the
 * warning above about Node's shadowing).
 */
function installLocalStoragePolyfill(): void {
  // If the environment already provides a working Storage
  // (real jsdom + no Node stub interfering), leave it alone. The
  // heuristic is "has a callable setItem" because a stubbed
  // localStorage lacks it.
  const existing = (globalThis as unknown as { localStorage?: unknown })
    .localStorage;
  if (
    existing !== undefined &&
    typeof (existing as { setItem?: unknown }).setItem === 'function'
  ) {
    return;
  }

  const store = new Map<string, string>();
  const polyfill = {
    get length(): number {
      return store.size;
    },
    key(index: number): string | null {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    },
    getItem(key: string): string | null {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string): void {
      store.set(String(key), String(value));
    },
    removeItem(key: string): void {
      store.delete(String(key));
    },
    clear(): void {
      store.clear();
    },
  };

  // Assign on both `globalThis` and `window` so bare `localStorage`
  // references and `window.localStorage` references resolve to the
  // same object. Under Vitest's jsdom environment `window` is
  // aliased to `globalThis`, but assigning both defensively is
  // cheap insurance against environment-config changes.
  Object.defineProperty(globalThis, 'localStorage', {
    value: polyfill,
    configurable: true,
    writable: true,
  });
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', {
      value: polyfill,
      configurable: true,
      writable: true,
    });
  }
}

installLocalStoragePolyfill();
