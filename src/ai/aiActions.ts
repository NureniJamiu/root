/**
 * The AI requests the canvas makes, and turning their answers into ghost
 * suggestions placed on the canvas (see `data/aiProposals.ts`).
 */

import { aiProposalActions, useAiProposalStore, useCanvasStore } from '../data';
import type { GhostIdea, Position, UUID } from '../data';
import { layoutExpansion, layoutMap } from '../canvas/ghostLayout';
import { getMeasuredSizes } from '../canvas/measuredSizes';
import type { DraftResponse, IdeaSuggestion, SuggestionsResponse } from '../lib/ai/contracts';
import { aiConfigActions } from './aiConfig';
import { AiRequestError, aiApi } from './api';
import { toPromptCanvas } from './promptCanvas';

let controller: AbortController | null = null;

function begin(): AbortSignal {
  controller?.abort();
  controller = new AbortController();
  return controller.signal;
}

function messageFor(error: unknown): string | null {
  if (error instanceof AiRequestError) return error.code === 'aborted' ? null : error.message;
  return 'The AI request failed.';
}

function toGhosts(ideas: readonly IdeaSuggestion[], positions: ReadonlyMap<string, Position>): GhostIdea[] {
  return ideas.map((i) => ({
    key: i.key,
    title: i.title,
    body: i.body,
    type: i.type,
    parentKey: i.parent,
    position: positions.get(i.key) ?? { x: 0, y: 0 },
  }));
}

function settle(res: SuggestionsResponse): void {
  aiConfigActions.setAllowance(res.allowance);
}

export const aiActions = {
  /** Suggest ideas that connect from `nodeId`. */
  async expandIdea(nodeId: UUID, guidance?: string): Promise<void> {
    const signal = begin();
    aiProposalActions.start({ kind: 'expand', anchorId: nodeId });
    try {
      const canvas = useCanvasStore.getState().canvas;
      const res = await aiApi.expand(
        { focusId: nodeId, canvas: toPromptCanvas(canvas, [nodeId]), ...(guidance ? { guidance } : {}) },
        signal,
      );
      settle(res);
      const latest = useCanvasStore.getState().canvas;
      if (!latest.nodes.some((n) => n.id === nodeId)) {
        aiProposalActions.clear();
        return;
      }
      const positions = layoutExpansion(
        latest,
        nodeId,
        res.ideas.map((i) => ({ key: i.key, type: i.type, parentKey: i.parent })),
        getMeasuredSizes(),
      );
      aiProposalActions.propose({
        kind: 'expand',
        anchorId: nodeId,
        ideas: toGhosts(res.ideas, positions),
        excluded: [],
        modelLabel: res.model.label,
      });
    } catch (error) {
      const message = messageFor(error);
      if (message) aiProposalActions.fail(message);
      else aiProposalActions.clear();
    }
  },

  /** Start a map from a topic. `viewCenter` places it when the canvas is empty. */
  async mapTopic(topic: string, viewCenter: Position, guidance?: string): Promise<void> {
    const signal = begin();
    aiProposalActions.start({ kind: 'map', anchorId: null });
    try {
      const res = await aiApi.map({ topic, ...(guidance ? { guidance } : {}) }, signal);
      settle(res);
      const positions = layoutMap(
        useCanvasStore.getState().canvas,
        res.ideas.map((i) => ({ key: i.key, type: i.type, parentKey: i.parent })),
        viewCenter,
        getMeasuredSizes(),
      );
      aiProposalActions.propose({
        kind: 'map',
        anchorId: null,
        ideas: toGhosts(res.ideas, positions),
        excluded: [],
        modelLabel: res.model.label,
      });
    } catch (error) {
      const message = messageFor(error);
      if (message) aiProposalActions.fail(message);
      else aiProposalActions.clear();
    }
  },

  /** Stop the request in flight, if any. */
  cancel(): void {
    controller?.abort();
    controller = null;
    if (useAiProposalStore.getState().pending) aiProposalActions.clear();
  },

  /** Draft a document from the branch under `rootId`. Throws `AiRequestError`. */
  async draft(rootId: UUID, signal?: AbortSignal): Promise<DraftResponse> {
    const canvas = useCanvasStore.getState().canvas;
    const res = await aiApi.draft({ rootId, canvas: toPromptCanvas(canvas, [rootId]) }, signal);
    aiConfigActions.setAllowance(res.allowance);
    return res;
  },
};
