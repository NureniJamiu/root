/**
 * `NodeEditor` — placeholder shell.
 *
 * The full editor (title / body / images / type selector, with 200-char
 * title cap, 20 000-char body cap and 2 MB image guard) is implemented
 * by task 11.1. This stub exists only so the public barrel `src/nodes`
 * can export `NodeEditor` alongside `NodeCard` (task 10.1) without
 * dangling references from `app/App.tsx`.
 *
 * The component intentionally renders nothing until 11.1 replaces it —
 * `App.tsx` will start mounting it once the editor UI is ready.
 */

import type { UUID } from '../data';

export interface NodeEditorProps {
  readonly nodeId: UUID;
  readonly onClose: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function NodeEditor(_props: NodeEditorProps): JSX.Element | null {
  return null;
}
