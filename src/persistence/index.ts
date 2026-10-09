/**
 * Public barrel for the Root MVP Persistence Layer.
 *
 * Canvas documents live in SQLite behind `/api/projects` (see
 * `src/lib/projects-api.ts` and `src/app/useProjects.ts`). What remains here:
 *
 *   - storage keys for UI preferences kept in `localStorage`
 *   - `persistenceEvents` — the event bus the toast surface subscribes to for
 *     load and save failures
 */

export {
  UI_ACTIVE_PROJECT_KEY,
  UI_PROJECTS_OPEN_KEY,
  UI_INSPECTOR_OPEN_KEY,
} from './keys';
export {
  emitLoadError,
  emitSaveError,
  onLoadError,
  onSaveError,
  persistenceEvents,
} from './persistenceEvents';
export type {
  LoadErrorDetail,
  SaveErrorDetail,
} from './persistenceEvents';
