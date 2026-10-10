/**
 * A small bridge between the open document editor and the rest of the app,
 * so canvas-side controls (the inspector's "Insert in document", backlinks)
 * can act on the document without holding the editor themselves.
 */

import type { Editor } from '@tiptap/core';

import { IDEA_CARD, IDEA_REF } from './links';

let active: Editor | null = null;
let activeDocumentId: string | null = null;
let pendingReveal: { nodeId: string; documentId: string | null; block?: boolean } | null = null;
const listeners = new Set<() => void>();

export function setActiveEditor(editor: Editor | null, documentId: string | null = null): void {
  active = editor;
  activeDocumentId = editor ? documentId : null;
  if (editor && pendingReveal && (pendingReveal.documentId === null || pendingReveal.documentId === documentId)) {
    const { nodeId, block } = pendingReveal;
    pendingReveal = null;
    // Let the first render settle so scrolling lands on the right block.
    requestAnimationFrame(() => (block ? revealBlockInDocument(nodeId) : revealIdeaInDocument(nodeId)));
  }
  listeners.forEach((fn) => fn());
}

export function getActiveEditor(): Editor | null {
  return active && !active.isDestroyed ? active : null;
}

/** Re-render when a document editor opens or closes. */
export function subscribeActiveEditor(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * After inserting a card the card itself is selected, so the next key would
 * replace it. Put the cursor in the line after it instead.
 */
export function placeCursorAfterBlock(editor: Editor): void {
  const { selection } = editor.state;
  if (selection.empty) return;
  editor.commands.setTextSelection(Math.min(selection.to + 1, editor.state.doc.content.size));
}

/** Insert an idea at the cursor: a live card, or an inline mention. */
export function insertIdeaIntoDocument(
  idea: { id: string; title: string },
  mode: 'card' | 'mention' = 'card',
): boolean {
  const editor = getActiveEditor();
  if (!editor) return false;
  const label = idea.title || 'Untitled idea';
  const content =
    mode === 'card'
      ? { type: IDEA_CARD, attrs: { nodeId: idea.id, label } }
      : [{ type: IDEA_REF, attrs: { id: idea.id, label } }, { type: 'text', text: ' ' }];
  const done = editor.chain().focus().insertContent(content).run();
  if (done && mode === 'card') placeCursorAfterBlock(editor);
  return done;
}

/**
 * Select the first place the document mentions or embeds `nodeId` and scroll
 * it into view. If that document's editor is not open yet (`documentId`
 * names another one, or none is open), it happens as soon as it opens.
 */
export function revealIdeaInDocument(nodeId: string, documentId: string | null = null): boolean {
  const editor = getActiveEditor();
  if (!editor || (documentId !== null && documentId !== activeDocumentId)) {
    pendingReveal = { nodeId, documentId };
    return false;
  }
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (
      (node.type.name === IDEA_REF && node.attrs.id === nodeId) ||
      (node.type.name === IDEA_CARD && node.attrs.nodeId === nodeId)
    ) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found === null) return false;
  editor.chain().focus().setNodeSelection(found).scrollIntoView().run();
  const dom = editor.view.nodeDOM(found);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return true;
}

/**
 * Scroll to the block with id `blockId` and put the cursor in it. Like
 * `revealIdeaInDocument`, it waits for `documentId` to open when needed.
 */
export function revealBlockInDocument(blockId: string, documentId: string | null = null): boolean {
  const editor = getActiveEditor();
  if (!editor || (documentId !== null && documentId !== activeDocumentId)) {
    pendingReveal = { nodeId: blockId, documentId, block: true };
    return false;
  }
  let found: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.attrs.id === blockId) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found === null) return false;
  const pos: number = found;
  if (editor.state.doc.nodeAt(pos)?.isTextblock) editor.chain().focus().setTextSelection(pos + 1).run();
  else editor.chain().focus().setNodeSelection(pos).run();
  const dom = editor.view.nodeDOM(pos);
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return true;
}

export function clearPendingReveal(): void {
  pendingReveal = null;
}
