/**
 * Which research documents mention or embed each idea ("backlinks").
 *
 * Filled by the app from `/api/projects/:id/backlinks` and kept in step as
 * documents are saved, so a card can show "In 2 docs" and the inspector can
 * list the documents without loading them.
 */

import { create } from 'zustand';

import type { UUID } from './types';

export interface DocLinksState {
  /** idea id → ids of the documents that point at it. */
  readonly byIdea: Readonly<Record<UUID, readonly string[]>>;
  /** document id → its title, for lists. */
  readonly titles: Readonly<Record<string, string>>;
}

export const useDocLinksStore = create<DocLinksState>(() => ({ byIdea: {}, titles: {} }));

export const docLinksActions = {
  /** Replace everything (a project was opened or the server sent fresh links). */
  reset(byIdea: Readonly<Record<UUID, readonly string[]>>, titles: Readonly<Record<string, string>>): void {
    useDocLinksStore.setState({ byIdea, titles });
  },

  /** Record the ideas one document points at now, replacing what it pointed at before. */
  setDocumentLinks(documentId: string, ideaIds: readonly UUID[]): void {
    const wanted = new Set(ideaIds);
    const current = useDocLinksStore.getState().byIdea;
    const next: Record<UUID, readonly string[]> = {};
    let changed = false;
    for (const [ideaId, docs] of Object.entries(current)) {
      const has = docs.includes(documentId);
      if (has && !wanted.has(ideaId)) {
        changed = true;
        const rest = docs.filter((d) => d !== documentId);
        if (rest.length > 0) next[ideaId] = rest;
      } else {
        next[ideaId] = docs;
      }
    }
    for (const ideaId of wanted) {
      const docs = next[ideaId] ?? [];
      if (!docs.includes(documentId)) {
        changed = true;
        next[ideaId] = [...docs, documentId];
      }
    }
    if (changed) useDocLinksStore.setState({ byIdea: next });
  },

  setTitle(documentId: string, title: string): void {
    const titles = useDocLinksStore.getState().titles;
    if (titles[documentId] === title) return;
    useDocLinksStore.setState({ titles: { ...titles, [documentId]: title } });
  },

  /** Forget a deleted document. */
  removeDocument(documentId: string): void {
    docLinksActions.setDocumentLinks(documentId, []);
    const { [documentId]: _gone, ...titles } = useDocLinksStore.getState().titles;
    useDocLinksStore.setState({ titles });
  },
};
