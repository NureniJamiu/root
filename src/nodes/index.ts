/**
 * Public barrel for the Node UI Layer.
 *
 * This is the ONLY surface the Canvas Layer and the App Layer may import
 * from `nodes/` (Requirement 10.2 / design.md §Layered Dependency Table).
 * Deep imports into `nodes/*` internals from `canvas/` are blocked at the
 * ESLint boundary.
 *
 * Exports:
 *   - `NodeCard`     — the presentational card, registered as the RF
 *                       `'research'` node type by `canvas/CanvasView`.
 *   - `NodeEditor`   — the title / body / images / type editor
 *                       (implemented by task 11.1; currently a stub).
 *   - `DeletePrompt` — the delete confirmation modal
 *                       (implemented by task 12.1; currently a stub).
 */

export { NodeCard } from './NodeCard';
export type { NodeCardData } from './NodeCard';

export { NodeEditor } from './NodeEditor';
export type { NodeEditorProps } from './NodeEditor';

export { DeletePrompt } from './DeletePrompt';
export type { DeletePromptProps, DeleteMode } from './DeletePrompt';

export {
  ToolbarCallbacksProvider,
  useToolbarCallbacks,
} from './toolbarCallbacks';
export type { ToolbarCallbacks } from './toolbarCallbacks';

export * from './icons';
