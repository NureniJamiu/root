import { createContext, useContext } from 'react';

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
