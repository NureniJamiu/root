/**
 * The browser-side document editor: the shared schema (`schema.ts`) plus the
 * behaviour that only matters while writing.
 *
 *   - `@` opens a list of ideas on the canvas. Enter cites the idea inline,
 *     Shift+Enter embeds its card.
 *   - `/` opens a list of blocks (headings, lists, table, image, idea...).
 *   - Placeholder text, smart quotes and dashes, a word count, and image
 *     paste/drop uploaded to the project.
 *
 * None of this changes the shape of a saved document, so the server can keep
 * validating against `documentSchema()`.
 */

import { Extension } from '@tiptap/core';
import type { AnyExtension, Editor, Range } from '@tiptap/core';
import FileHandler from '@tiptap/extension-file-handler';
import Typography from '@tiptap/extension-typography';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { PluginKey } from '@tiptap/pm/state';
import { ReactNodeViewRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { createElement } from 'react';

import { useCanvasStore } from '../data';
import type { NodeType } from '../data';

import { placeCursorAfterBlock } from './bridge';
import type { DocumentEditorServices } from './context';
import { IdeaCardView, IdeaRefView } from './nodeViews';
import { popupRenderer } from './suggestionMenu';
import type { MenuItem } from './suggestionMenu';
import { IDEA_CARD, IDEA_REF, IdeaCard, IdeaRef, schemaExtensions } from './schema';

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

const TYPE_HINT: Record<NodeType, string> = {
  topic: 'Topic',
  finding: 'Finding',
  question: 'Question',
  conclusion: 'Conclusion',
};

/* -------------------------------------------------------------------------- */
/* @ ideas                                                                    */
/* -------------------------------------------------------------------------- */

interface IdeaItem extends MenuItem {
  readonly id: string;
  readonly title: string;
}

/** Ideas whose title matches `query`, best matches first. */
export function matchIdeas(query: string, limit = 8): IdeaItem[] {
  const q = query.trim().toLowerCase();
  const nodes = useCanvasStore.getState().canvas.nodes;
  return nodes
    .map((n) => {
      const title = n.title.trim();
      const lower = title.toLowerCase();
      const rank = q === '' ? 1 : lower.startsWith(q) ? 0 : lower.includes(q) ? 1 : -1;
      return { n, title, rank };
    })
    .filter((m) => m.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map(({ n, title }) => ({
      key: n.id,
      id: n.id,
      title: title || 'Untitled idea',
      label: title || 'Untitled idea',
      hint: TYPE_HINT[n.type],
      color: `rgb(var(--${n.type}))`,
    }));
}

function insertIdea(editor: Editor, range: Range, item: { id: string; title: string }, embed: boolean): void {
  const chain = editor.chain().focus().deleteRange(range);
  if (embed) {
    chain.insertContent({ type: IDEA_CARD, attrs: { nodeId: item.id, label: item.title } }).run();
    placeCursorAfterBlock(editor);
    return;
  }
  chain
    .insertContent([
      { type: IDEA_REF, attrs: { id: item.id, label: item.title } },
      { type: 'text', text: ' ' },
    ])
    .run();
}

const EditorIdeaRef = IdeaRef.extend({
  addNodeView() {
    return ReactNodeViewRenderer(IdeaRefView, { as: 'span' });
  },
}).configure({
  suggestion: {
    char: '@',
    allowSpaces: true,
    items: ({ query }: { query: string }) => matchIdeas(query),
    command: ({ editor, range, props }: { editor: Editor; range: Range; props: IdeaItem & { embed?: boolean } }) =>
      insertIdea(editor, range, props, props.embed === true),
    render: popupRenderer<IdeaItem>({
      heading: 'Cite an idea',
      empty: 'No idea with that title on the canvas',
      footer: 'Enter cites · Shift+Enter embeds the card',
      allowEmbed: true,
    }),
  } as never,
});

const EditorIdeaCard = IdeaCard.extend({
  addNodeView() {
    return ReactNodeViewRenderer(IdeaCardView);
  },
});

/* -------------------------------------------------------------------------- */
/* / blocks                                                                   */
/* -------------------------------------------------------------------------- */

interface SlashItem extends MenuItem {
  readonly keywords: string;
  readonly run: (editor: Editor, range: Range) => void;
}

const glyph = (text: string): ReturnType<typeof createElement> => createElement('span', null, text);

function slashItems(pickImage: () => void): SlashItem[] {
  const block = (
    key: string,
    label: string,
    g: string,
    keywords: string,
    run: (editor: Editor, range: Range) => void,
    hint?: string,
  ): SlashItem => ({ key, label, glyph: glyph(g), keywords, run, ...(hint ? { hint } : {}) });
  return [
    block('text', 'Text', '¶', 'paragraph plain', (e, r) => e.chain().focus().deleteRange(r).setParagraph().run()),
    block('h1', 'Heading 1', 'H1', 'title big', (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 1 }).run(), '#'),
    block('h2', 'Heading 2', 'H2', 'section', (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 2 }).run(), '##'),
    block('h3', 'Heading 3', 'H3', 'subsection', (e, r) => e.chain().focus().deleteRange(r).setHeading({ level: 3 }).run(), '###'),
    block('bullets', 'Bulleted list', '•', 'unordered ul', (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(), '-'),
    block('numbers', 'Numbered list', '1.', 'ordered ol', (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(), '1.'),
    block('tasks', 'Checklist', '☐', 'todo task checkbox', (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(), '[ ]'),
    block('quote', 'Quote', '“', 'blockquote citation', (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(), '>'),
    block('code', 'Code block', '{}', 'pre snippet', (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(), '```'),
    block('table', 'Table', '▦', 'grid rows columns', (e, r) =>
      e.chain().focus().deleteRange(r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    ),
    block('divider', 'Divider', '—', 'rule horizontal line hr', (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(), '---'),
    block('image', 'Image', '▣', 'picture photo upload', (e, r) => {
      e.chain().focus().deleteRange(r).run();
      pickImage();
    }),
    block('cite', 'Cite an idea', '@', 'mention reference link canvas', (e, r) =>
      e.chain().focus().deleteRange(r).insertContent('@').run(),
    ),
  ];
}

const SlashCommand = Extension.create<{ pickImage: () => void }>({
  name: 'slashCommand',
  addOptions() {
    return { pickImage: () => undefined };
  },
  addProseMirrorPlugins() {
    const items = slashItems(() => this.options.pickImage());
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        startOfLine: false,
        allow: ({ state, range }) => {
          // Not inside code, and only at the start of a word.
          const $from = state.doc.resolve(range.from);
          if ($from.parent.type.spec.code) return false;
          const before = state.doc.textBetween(Math.max(0, range.from - 1), range.from);
          return before === '' || /\s/.test(before);
        },
        items: ({ query }) => {
          const q = query.toLowerCase();
          return items.filter((i) => `${i.label} ${i.keywords}`.toLowerCase().includes(q)).slice(0, 12);
        },
        command: ({ editor, range, props }) => props.run(editor, range),
        render: popupRenderer<SlashItem>({ heading: 'Insert', empty: 'Nothing matches' }),
      }),
    ];
  },
});

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

export interface EditorExtensionOptions {
  readonly services: () => DocumentEditorServices;
  /** Open the file picker for an image. */
  readonly pickImage: () => void;
}

export async function uploadAndInsert(
  editor: Editor,
  services: DocumentEditorServices,
  files: File[],
  pos?: number,
): Promise<void> {
  for (const file of files) {
    const src = await services.uploadImage(file);
    if (!src || editor.isDestroyed) continue;
    const image = { type: 'image', attrs: { src, alt: file.name.replace(/\.[^.]+$/, '') } };
    if (typeof pos === 'number') editor.chain().focus().insertContentAt(pos, image).run();
    else editor.chain().focus().insertContent(image).run();
  }
}

export function editorExtensions({ services, pickImage }: EditorExtensionOptions): AnyExtension[] {
  return [
    ...schemaExtensions({ ideaRef: EditorIdeaRef, ideaCard: EditorIdeaCard }),
    Placeholder.configure({
      placeholder: ({ node, pos }) => {
        if (node.type.name === 'heading') return `Heading ${node.attrs.level as number}`;
        return pos === 0 ? 'Start writing. Type / for blocks, @ to cite an idea.' : 'Type / for blocks, @ to cite an idea';
      },
      showOnlyCurrent: true,
      includeChildren: false,
    }),
    Typography,
    CharacterCount,
    SlashCommand.configure({ pickImage }),
    FileHandler.configure({
      allowedMimeTypes: IMAGE_MIME_TYPES,
      onDrop: (editor, files, pos) => void uploadAndInsert(editor, services(), files, pos),
      onPaste: (editor, files) => void uploadAndInsert(editor, services(), files),
    }),
  ];
}
