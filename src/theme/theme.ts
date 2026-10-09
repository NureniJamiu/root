/**
 * Light / dark theme preference.
 *
 * The preference is 'light', 'dark' or 'system' (follow the OS setting) and
 * is kept in localStorage. The resolved theme is applied as the `dark` class
 * on <html>, which flips every colour token in theme/tokens.css. index.html
 * runs the same resolution inline before first paint so there is no flash.
 */

import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'root.theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

const listeners = new Set<() => void>();

function readStoredPreference(): ThemePreference {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    // Storage can be blocked (private mode); fall back to the system setting.
  }
  return 'system';
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

let preference: ThemePreference = typeof window === 'undefined' ? 'system' : readStoredPreference();

export function resolveTheme(pref: ThemePreference = preference): ResolvedTheme {
  if (pref === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return pref;
}

function applyTheme(): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme();
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.dataset.theme = resolved;
}

function notify(): void {
  applyTheme();
  listeners.forEach((listener) => listener());
}

export function getThemePreference(): ThemePreference {
  return preference;
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Not persisted; the choice still applies for this visit.
  }
  notify();
}

/** Apply the stored preference and follow OS changes while on 'system'. */
export function initTheme(): void {
  if (typeof window === 'undefined') return;
  applyTheme();
  if (typeof window.matchMedia === 'function') {
    window.matchMedia(DARK_QUERY).addEventListener?.('change', () => {
      if (preference === 'system') notify();
    });
  }
  // Keep tabs in step when the choice changes in another tab.
  window.addEventListener('storage', (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    preference = readStoredPreference();
    notify();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The stored preference and the theme it resolves to right now. */
export function useTheme(): { preference: ThemePreference; resolved: ResolvedTheme } {
  const pref = useSyncExternalStore(subscribe, getThemePreference, () => 'system' as ThemePreference);
  const resolved = useSyncExternalStore(
    subscribe,
    () => resolveTheme(),
    () => 'light' as ResolvedTheme,
  );
  return { preference: pref, resolved };
}
