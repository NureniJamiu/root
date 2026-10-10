import { createContext, useContext } from 'react';

import type { RewriteRequest } from '../lib/ai/contracts';

/** What the document editor needs from the app around it. */
export interface DocumentEditorServices {
  /** Select an idea on the canvas and bring it into view. */
  readonly focusIdea: (nodeId: string) => void;
  /**
   * Add an idea to the canvas from document text, connected from `parentId`
   * when given. Resolves to the new idea, or `null` when nothing was added.
   */
  readonly createIdea: (text: string, parentId: string | null) => { id: string; title: string } | null;
  /** Upload an image for the open project; resolves to its URL. */
  readonly uploadImage: (file: File) => Promise<string | null>;
  /**
   * Rewrite text with AI, streaming: `onText` gets everything written so far.
   * Absent when AI is not set up, which hides the AI actions.
   */
  readonly rewrite?: ((req: RewriteRequest, onText: (text: string) => void, signal: AbortSignal) => Promise<string>) | undefined;
}

const noop: DocumentEditorServices = {
  focusIdea: () => undefined,
  createIdea: () => null,
  uploadImage: async () => null,
};

export const DocumentEditorContext = createContext<DocumentEditorServices>(noop);

export function useDocumentEditorServices(): DocumentEditorServices {
  return useContext(DocumentEditorContext);
}
