/**
 * Key constants for client-side storage and recovery.
 *
 * NOTE: The primary source of truth for projects and canvas documents
 * is the SQLite database via `/api/projects`.
 *
 * `localStorage` is strictly restricted to:
 *   1. Client-side UI preferences (active tab, collapsed rail toggles)
 *   2. Emergency crash recovery slot (RAW_KEY) when corrupt data is detected.
 */

// Legacy / recovery slots
export const CANVAS_KEY = 'root-mvp:canvas' as const;
export const RAW_KEY = 'root-mvp:canvas.raw' as const;

// Client UI Preferences (appropriate use of localStorage)
export const UI_ACTIVE_PROJECT_KEY = 'root-ui:active-project-id' as const;
export const UI_PROJECTS_OPEN_KEY = 'root-ui:is-projects-open' as const;
export const UI_INSPECTOR_OPEN_KEY = 'root-ui:is-inspector-open' as const;
