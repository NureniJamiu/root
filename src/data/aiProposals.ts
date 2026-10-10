/**
 * AI suggestions waiting for the person's say-so.
 *
 * Suggested ideas are never written to the canvas directly: they sit here,
 * render as dashed "ghost" cards, and only become real ideas when the person
 * presses Add (one undo step through `canvasActions.addIdeas`). Discard
 * leaves the canvas untouched.
 *
 * Pure state: the requests that fill it live in `src/ai`.
 */

import { create } from 'zustand';

import { canvasActions } from './store';
import type { NodeType, Position, UUID } from './types';

export interface GhostIdea {
  /** Local name, unique within the proposal. */
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly type: NodeType;
  /** Another suggestion this one hangs from, or null to hang from the anchor. */
  readonly parentKey: string | null;
  readonly position: Position;
}

export type AiProposalKind = 'map' | 'expand';

export interface AiProposal {
  readonly kind: AiProposalKind;
  /** The idea an expansion grows from; null for a topic map. */
  readonly anchorId: UUID | null;
  readonly ideas: readonly GhostIdea[];
  /** Keys the person switched off. */
  readonly excluded: readonly string[];
  /** Which model wrote it, shown in the review bar. */
  readonly modelLabel: string;
}

export interface AiPending {
  readonly kind: AiProposalKind;
  readonly anchorId: UUID | null;
}

export interface AiProposalState {
  proposal: AiProposal | null;
  pending: AiPending | null;
  error: string | null;
}

export const useAiProposalStore = create<AiProposalState>(() => ({ proposal: null, pending: null, error: null }));

/** Prefix of ghost card ids on the canvas, so they are never mistaken for ideas. */
export const GHOST_ID_PREFIX = 'ai-ghost:';

export function ghostId(key: string): string {
  return `${GHOST_ID_PREFIX}${key}`;
}

export function isGhostId(id: string): boolean {
  return id.startsWith(GHOST_ID_PREFIX);
}

/**
 * The ideas that will be added, each re-hung from its nearest included
 * ancestor when the suggestion it hung from was switched off.
 */
export function includedIdeas(proposal: AiProposal): Array<GhostIdea & { readonly parentKey: string | null }> {
  const excluded = new Set(proposal.excluded);
  const byKey = new Map(proposal.ideas.map((i) => [i.key, i]));
  const nearestIncluded = (key: string | null): string | null => {
    const seen = new Set<string>();
    let current = key;
    while (current !== null && !seen.has(current)) {
      if (!excluded.has(current)) return current;
      seen.add(current);
      current = byKey.get(current)?.parentKey ?? null;
    }
    return null;
  };
  return proposal.ideas
    .filter((i) => !excluded.has(i.key))
    .map((i) => ({ ...i, parentKey: nearestIncluded(i.parentKey) }));
}

export const aiProposalActions = {
  start(pending: AiPending): void {
    useAiProposalStore.setState({ pending, error: null, proposal: null });
  },
  fail(message: string): void {
    useAiProposalStore.setState({ pending: null, error: message });
  },
  propose(proposal: AiProposal): void {
    useAiProposalStore.setState({ proposal, pending: null, error: null });
  },
  toggle(key: string): void {
    const { proposal } = useAiProposalStore.getState();
    if (!proposal) return;
    const excluded = proposal.excluded.includes(key)
      ? proposal.excluded.filter((k) => k !== key)
      : [...proposal.excluded, key];
    useAiProposalStore.setState({ proposal: { ...proposal, excluded } });
  },
  /** Add the included suggestions as ideas. Returns their ids by key. */
  accept(): Record<string, UUID> {
    const { proposal } = useAiProposalStore.getState();
    if (!proposal) return {};
    const ids = canvasActions.addIdeas(
      includedIdeas(proposal).map((i) => ({
        key: i.key,
        parentKey: i.parentKey,
        parentId: proposal.anchorId,
        position: i.position,
        title: i.title,
        body: i.body,
        type: i.type,
      })),
    );
    useAiProposalStore.setState({ proposal: null });
    return ids;
  },
  /** Drop the proposal, any request in flight and any error. */
  clear(): void {
    useAiProposalStore.setState({ proposal: null, pending: null, error: null });
  },
  dismissError(): void {
    useAiProposalStore.setState({ error: null });
  },
};
