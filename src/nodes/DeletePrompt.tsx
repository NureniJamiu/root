/**
 * `DeletePrompt` — placeholder shell.
 *
 * The full delete-confirmation modal (Requirements 7.1–7.6, including
 * the leaf-node bypass and the root-with-children constraint) is
 * implemented by task 12.1. This stub exists only so the public barrel
 * `src/nodes` can export `DeletePrompt` alongside `NodeCard` (task 10.1)
 * without dangling references from `app/App.tsx`.
 */

import type { UUID } from '../data';

export interface DeletePromptProps {
  readonly nodeId: UUID;
  readonly onCancel: () => void;
  readonly onConfirmNodeOnly: () => void;
  readonly onConfirmSubtree: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function DeletePrompt(_props: DeletePromptProps): JSX.Element | null {
  return null;
}
