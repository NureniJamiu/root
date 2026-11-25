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

import type { AiFeature } from '../lib/ai/plans';
import { PROVENANCE_MODEL_MAX } from './limits';
import { aiProvenance } from './model';
import type { RelationId } from './model';
import { canvasActions } from './store';
import { now } from './time';
import type { NodeType, Position, UUID } from './types';

export interface GhostIdea {
  /** Local name, unique within the proposal. */
  readonly key: string;
  readonly title: string;
  readonly body: string;
  readonly type: NodeType;
  /** Another suggestion this one hangs from, or null to hang from the anchor. */
  readonly parentKey: string | null;
  /**
   * What the connector from its parent (or the anchor) means, shown on the
   * ghost connector; null for a plain link.
   */
  readonly relation: RelationId | null;
  readonly position: Position;
}

export type AiProposalKind = 'map' | 'expand' | 'capture' | 'research';

/** The AI feature each kind of proposal comes from, recorded on accepted ideas. */
const FEATURE_BY_KIND = {
  map: 'ai.map',
  expand: 'ai.expand',
  capture: 'ai.capture',
  research: 'ai.research',
} as const satisfies Record<AiProposalKind, AiFeature>;

/** Recorded when a proposal carries no model label, which the provenance shape requires. */
const UNKNOWN_MODEL = 'Unknown model';

export interface AiProposal {
  readonly kind: AiProposalKind;
  /** The idea an expansion grows from; null for a topic map. */
  readonly anchorId: UUID | null;
  readonly ideas: readonly GhostIdea[];
  /** Keys the person switched off. */
  readonly excluded: readonly string[];
  /** Which model wrote it, shown in the review bar. */
  readonly modelLabel: string;
  /** More about where it came from, such as the sources a research run read. */
  readonly detail?: string;
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
 * ancestor when the suggestion it hung from was switched off. A re-hung idea
 * loses its relation: it was proposed for the parent that was switched off,
 * and the preview shows the re-hung connector as a plain link.
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
    .map((i) => {
      const parentKey = nearestIncluded(i.parentKey);
      return { ...i, parentKey, relation: parentKey === i.parentKey ? i.relation : null };
    });
}

/** Told how many suggestions were shown and kept, each time a proposal is added or dropped. */
type DecisionListener = (kind: AiProposalKind, offered: number, accepted: number) => void;
let decisionListener: DecisionListener | null = null;

export function setAiDecisionListener(listener: DecisionListener | null): void {
  decisionListener = listener;
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
    const included = includedIdeas(proposal);
    const ids = canvasActions.addIdeas(
      included.map((i) => ({
        key: i.key,
        parentKey: i.parentKey,
        parentId: proposal.anchorId,
        position: i.position,
        title: i.title,
        body: i.body,
        type: i.type,
        relation: i.relation,
      })),
      aiProvenance({
        feature: FEATURE_BY_KIND[proposal.kind],
        model: proposal.modelLabel.trim().slice(0, PROVENANCE_MODEL_MAX) || UNKNOWN_MODEL,
        acceptedAt: now(),
      }),
    );
    useAiProposalStore.setState({ proposal: null });
    decisionListener?.(proposal.kind, proposal.ideas.length, included.length);
    return ids;
  },
  /** Drop the proposal, any request in flight and any error. */
  clear(): void {
    const { proposal } = useAiProposalStore.getState();
    useAiProposalStore.setState({ proposal: null, pending: null, error: null });
    if (proposal) decisionListener?.(proposal.kind, proposal.ideas.length, 0);
  },
  dismissError(): void {
    useAiProposalStore.setState({ error: null });
  },
};
