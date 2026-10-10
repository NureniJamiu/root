/**
 * The document schema, shared by the browser editor and the API server.
 *
 * Everything here is React-free so `server.ts` can import it: the server
 * builds the same ProseMirror schema with `getSchema()` and refuses any saved
 * document that does not fit it (see `lib/document-store.ts`).
 *
 * The browser adds editing-only behaviour on top (placeholder, suggestion
 * menus, React node views) in `editorExtensions.ts`; none of that changes the
 * shape of a saved document.
 */

import { getSchema, Node, mergeAttributes } from '@tiptap/core';
import type { AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import Mention from '@tiptap/extension-mention';
import UniqueID from '@tiptap/extension-unique-id';

import { IDEA_CARD, IDEA_REF } from './links';

export { IDEA_CARD, IDEA_REF, emptyDocument } from './links';

/** Block types that carry a stable `id` (jump-to-mention, deep links). */
export const BLOCK_ID_TYPES = ['heading', 'paragraph', 'blockquote', 'listItem', 'taskItem', IDEA_CARD];

/** Only these link protocols are kept; anything else (e.g. `javascript:`) is dropped. */
export const LINK_PROTOCOLS = ['http', 'https', 'mailto'];

export function isAllowedHref(href: string): boolean {
  try {
    const url = new URL(href, 'https://root.invalid');
    return ['http:', 'https:', 'mailto:'].includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * An inline mention of an idea. `id` is the idea's node id; `label` is the
 * idea's title when the mention was made, shown if the idea is later deleted.
 */
export const IdeaRef = Mention.extend({
  name: IDEA_REF,
  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, { 'data-idea-ref': '', 'data-node-id': node.attrs.id }),
      `@${node.attrs.label ?? ''}`,
    ];
  },
  parseHTML() {
    return [{ tag: 'span[data-idea-ref]' }];
  },
});

/** A block that shows an idea's card, live from the canvas. */
export const IdeaCard = Node.create({
  name: IDEA_CARD,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return {
      nodeId: { default: null, parseHTML: (el) => el.getAttribute('data-node-id') },
      label: { default: '', parseHTML: (el) => el.getAttribute('data-label') ?? '' },
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-idea-card]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-idea-card': '',
        'data-node-id': node.attrs.nodeId,
        'data-label': node.attrs.label,
      }),
      node.attrs.label || 'Idea',
    ];
  },
});

/**
 * The extensions that define what a document may contain. The browser passes
 * its own `ideaRef` / `ideaCard` (the same nodes plus menus and node views).
 */
export function schemaExtensions(
  overrides: { ideaRef?: AnyExtension; ideaCard?: AnyExtension } = {},
): AnyExtension[] {
  return [
    StarterKit.configure({
      link: {
        openOnClick: false,
        autolink: true,
        protocols: LINK_PROTOCOLS,
        isAllowedUri: (url) => isAllowedHref(url),
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    Highlight,
    Image.configure({ inline: false, allowBase64: false }),
    overrides.ideaRef ?? IdeaRef,
    overrides.ideaCard ?? IdeaCard,
    UniqueID.configure({ types: BLOCK_ID_TYPES }),
  ];
}

let cachedSchema: ReturnType<typeof getSchema> | null = null;

/** The ProseMirror schema of a Root document. */
export function documentSchema(): ReturnType<typeof getSchema> {
  cachedSchema ??= getSchema(schemaExtensions());
  return cachedSchema;
}


export { countWords, extractLinks } from './links';
export type { DocumentLinks } from './links';
