/**
 * Key constants for client-side storage.
 *
 * The source of truth for projects and canvas documents is the SQLite
 * database behind `/api/projects`. `localStorage` holds client-side UI
 * preferences only; canvas content is never mirrored into it, because the
 * browser storage is shared by every account that signs in on this device.
 */

export const UI_ACTIVE_PROJECT_KEY = 'root-ui:active-project-id' as const;
export const UI_PROJECTS_OPEN_KEY = 'root-ui:is-projects-open' as const;
export const UI_INSPECTOR_OPEN_KEY = 'root-ui:is-inspector-open' as const;
