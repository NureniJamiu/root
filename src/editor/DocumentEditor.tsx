/**
 * The research document editor (TipTap).
 *
 * Loaded on demand (`React.lazy`) so the canvas never pays for it. One editor
 * instance per open document: the parent keys this component by document id.
 *
 *   - Toolbar: block type, inline marks, lists, quote, table, image, cite.
 *   - Selection bubble: bold, italic, highlight, link and "Make idea", which
 *     sends the selected text to the canvas as a new idea (connected to the
 *     idea the surrounding section cites) and cites it in place.
 *   - Dropping an idea from the canvas embeds its card (Alt: cites it inline).
 *   - Outline of the document's headings for jumping around long drafts.
 */

import type { Editor, JSONContent } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { useCanvasStore } from '../data';
import { IDEA_DRAG_MIME } from '../nodes';

import { placeCursorAfterBlock, setActiveEditor } from './bridge';
import { useDocumentEditorServices } from './context';
import { IMAGE_MIME_TYPES, editorExtensions, uploadAndInsert } from './editorExtensions';
import { IDEA_CARD, IDEA_REF, isAllowedHref } from './schema';

import './editor.css';

export interface DocumentEditorProps {
  readonly documentId: string;
  readonly initialContent: JSONContent;
  /** Called with the full document after every change. */
  readonly onChange: (content: JSONContent) => void;
  readonly showOutline: boolean;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** The idea the text around `pos` is about: a citation earlier in the same block, else in the nearest heading above. */
export function contextIdeaAt(editor: Editor, pos: number): string | null {
  const { doc } = editor.state;
  const $pos = doc.resolve(pos);
  let found: string | null = null;
  $pos.parent.forEach((child, offset) => {
    if (child.type.name === IDEA_REF && $pos.start() + offset < pos) found = child.attrs.id as string;
  });
  if (found) return found;
  let headingIdea: string | null = null;
  doc.nodesBetween(0, pos, (node) => {
    if (node.type.name === 'heading') {
      let id: string | null = null;
      node.forEach((child) => {
        if (!id && child.type.name === IDEA_REF) id = child.attrs.id as string;
      });
      headingIdea = id;
      return false;
    }
    return true;
  });
  return headingIdea;
}

interface OutlineItem {
  readonly level: number;
  readonly text: string;
  readonly pos: number;
}

/** A citation's current idea title, or the title it was cited with. */
function ideaTitle(attrs: Record<string, unknown>): string {
  const idea = useCanvasStore.getState().canvas.nodes.find((n) => n.id === attrs.id);
  return (idea ? idea.title : (attrs.label as string)) || 'Untitled idea';
}

function readOutline(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      const text = node
        .textBetween(0, node.content.size, ' ', (leaf) => (leaf.type.name === IDEA_REF ? ideaTitle(leaf.attrs) : ''))
        .trim();
      items.push({ level: node.attrs.level as number, text: text || 'Untitled section', pos });
      return false;
    }
    return node.type.name === 'doc';
  });
  return items;
}

/* -------------------------------------------------------------------------- */
/* Small controls                                                             */
/* -------------------------------------------------------------------------- */

function ToolButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
  testId,
}: {
  readonly label: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
  readonly testId?: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`doc-tool ${active ? 'is-active' : ''}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

function LinkForm({ editor, onDone }: { readonly editor: Editor; readonly onDone: () => void }): JSX.Element {
  const current = (editor.getAttributes('link').href as string | undefined) ?? '';
  const [value, setValue] = useState(current);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const apply = (): void => {
    const raw = value.trim();
    if (raw === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      onDone();
      return;
    }
    const href = /^[a-z]+:/i.test(raw) ? raw : raw.includes('@') && !raw.includes('/') ? `mailto:${raw}` : `https://${raw}`;
    if (!isAllowedHref(href)) {
      setError(true);
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    onDone();
  };

  return (
    <form
      className="doc-link-form"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onDone();
            editor.commands.focus();
          }
        }}
        placeholder="Paste a link"
        aria-label="Link address"
        aria-invalid={error}
        data-testid="doc-link-input"
      />
      <button type="submit">{current ? 'Update' : 'Add'}</button>
      {current && (
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            onDone();
          }}
        >
          Remove
        </button>
      )}
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Toolbar                                                                    */
/* -------------------------------------------------------------------------- */

function Toolbar({ editor, onPickImage }: { readonly editor: Editor; readonly onPickImage: () => void }): JSX.Element {
  const [linkOpen, setLinkOpen] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive('heading', { level: 1 })
        ? 'h1'
        : e.isActive('heading', { level: 2 })
          ? 'h2'
          : e.isActive('heading', { level: 3 })
            ? 'h3'
            : 'p',
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      inTable: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const c = (): ReturnType<Editor['chain']> => editor.chain().focus();

  return (
    <div className="doc-toolbar" role="toolbar" aria-label="Formatting" data-testid="doc-toolbar">
      <ToolButton label="Undo" disabled={!state.canUndo} onClick={() => c().undo().run()}>
        ↶
      </ToolButton>
      <ToolButton label="Redo" disabled={!state.canRedo} onClick={() => c().redo().run()}>
        ↷
      </ToolButton>
      <span className="doc-tool-sep" />
      <select
        className="doc-block-select"
        aria-label="Text style"
        value={state.block}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'p') c().setParagraph().run();
          else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}
        data-testid="doc-block-select"
      >
        <option value="p">Text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="doc-tool-sep" />
      <ToolButton label="Bold (Ctrl+B)" active={state.bold} onClick={() => c().toggleBold().run()} testId="doc-tool-bold">
        <b>B</b>
      </ToolButton>
      <ToolButton label="Italic (Ctrl+I)" active={state.italic} onClick={() => c().toggleItalic().run()}>
        <i>I</i>
      </ToolButton>
      <ToolButton label="Underline (Ctrl+U)" active={state.underline} onClick={() => c().toggleUnderline().run()}>
        <u>U</u>
      </ToolButton>
      <ToolButton label="Strikethrough" active={state.strike} onClick={() => c().toggleStrike().run()}>
        <s>S</s>
      </ToolButton>
      <ToolButton label="Highlight" active={state.highlight} onClick={() => c().toggleHighlight().run()}>
        <span className="doc-tool-highlight">H</span>
      </ToolButton>
      <ToolButton label="Inline code" active={state.code} onClick={() => c().toggleCode().run()}>
        {'</>'}
      </ToolButton>
      <span className="doc-tool-anchor">
        <ToolButton label="Link" active={state.link || linkOpen} onClick={() => setLinkOpen((o) => !o)}>
          ↗
        </ToolButton>
        {linkOpen && (
          <span className="doc-popover">
            <LinkForm editor={editor} onDone={() => setLinkOpen(false)} />
          </span>
        )}
      </span>
      <span className="doc-tool-sep" />
      <ToolButton label="Bulleted list" active={state.bullet} onClick={() => c().toggleBulletList().run()}>
        •
      </ToolButton>
      <ToolButton label="Numbered list" active={state.ordered} onClick={() => c().toggleOrderedList().run()}>
        1.
      </ToolButton>
      <ToolButton label="Checklist" active={state.task} onClick={() => c().toggleTaskList().run()}>
        ☐
      </ToolButton>
      <ToolButton label="Quote" active={state.quote} onClick={() => c().toggleBlockquote().run()}>
        “
      </ToolButton>
      <ToolButton
        label={state.inTable ? 'Add a row below' : 'Table'}
        onClick={() =>
          state.inTable ? c().addRowAfter().run() : c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      >
        ▦
      </ToolButton>
      {state.inTable && (
        <>
          <ToolButton label="Add a column" onClick={() => c().addColumnAfter().run()}>
            ⊞
          </ToolButton>
          <ToolButton label="Delete table" onClick={() => c().deleteTable().run()}>
            ⊠
          </ToolButton>
        </>
      )}
      <ToolButton label="Image" onClick={onPickImage}>
        ▣
      </ToolButton>
      <span className="doc-tool-sep" />
      <ToolButton
        label="Cite an idea from the canvas (@)"
        onClick={() => c().insertContent(' @').run()}
        testId="doc-tool-cite"
      >
        @ Cite
      </ToolButton>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Selection bubble                                                           */
/* -------------------------------------------------------------------------- */

function SelectionBubble({ editor }: { readonly editor: Editor }): JSX.Element {
  const services = useDocumentEditorServices();
  const [linkOpen, setLinkOpen] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      highlight: e.isActive('highlight'),
      link: e.isActive('link'),
    }),
  });

  const makeIdea = (): void => {
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ', ' ').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const parent = contextIdeaAt(editor, from);
    const idea = services.createIdea(text, parent);
    if (!idea) return;
    editor
      .chain()
      .focus()
      .insertContentAt(to, [
        { type: 'text', text: ' ' },
        { type: IDEA_REF, attrs: { id: idea.id, label: idea.title } },
      ])
      .run();
  };

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'top', offset: 8 }}
      shouldShow={({ editor: e, state: s, from, to }) => {
        if (!e.isEditable || from === to) return false;
        if (s.selection instanceof NodeSelection) return false;
        if (e.isActive('codeBlock') || e.isActive(IDEA_CARD)) return false;
        return true;
      }}
      className="doc-bubble"
      data-testid="doc-bubble"
    >
      {linkOpen ? (
        <LinkForm editor={editor} onDone={() => setLinkOpen(false)} />
      ) : (
        <>
          <ToolButton label="Bold" active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <b>B</b>
          </ToolButton>
          <ToolButton label="Italic" active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <i>I</i>
          </ToolButton>
          <ToolButton
            label="Highlight"
            active={state.highlight}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            <span className="doc-tool-highlight">H</span>
          </ToolButton>
          <ToolButton label="Link" active={state.link} onClick={() => setLinkOpen(true)}>
            ↗
          </ToolButton>
          <span className="doc-tool-sep" />
          <button
            type="button"
            className="doc-bubble-idea"
            onMouseDown={(e) => e.preventDefault()}
            onClick={makeIdea}
            title="Add the selected text to the canvas as a new idea and cite it here"
            data-testid="doc-make-idea"
          >
            + Make idea
          </button>
        </>
      )}
    </BubbleMenu>
  );
}

/* -------------------------------------------------------------------------- */
/* Outline                                                                    */
/* -------------------------------------------------------------------------- */

function Outline({ editor }: { readonly editor: Editor }): JSX.Element {
  const items = useEditorState({ editor, selector: ({ editor: e }) => readOutline(e), equalityFn: sameOutline });
  return (
    <nav className="doc-outline" aria-label="Outline" data-testid="doc-outline">
      <div className="doc-outline-heading">Outline</div>
      {items.length === 0 ? (
        <p className="doc-outline-empty">Headings you add show up here.</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={`${item.pos}`} style={{ paddingLeft: `${(item.level - 1) * 12}px` }}>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setTextSelection(item.pos + 1).run();
                  const dom = editor.view.nodeDOM(item.pos);
                  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}

function sameOutline(a: OutlineItem[] | null, b: OutlineItem[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((x, i) => x.level === b[i]!.level && x.text === b[i]!.text && x.pos === b[i]!.pos);
}

/* -------------------------------------------------------------------------- */
/* Editor                                                                     */
/* -------------------------------------------------------------------------- */

export default function DocumentEditor({
  documentId,
  initialContent,
  onChange,
  showOutline,
}: DocumentEditorProps): JSX.Element {
  const services = useDocumentEditorServices();
  const servicesRef = useRef(services);
  servicesRef.current = services;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickImage = useCallback(() => fileInputRef.current?.click(), []);

  const extensions = useMemo(() => editorExtensions({ services: () => servicesRef.current, pickImage }), [pickImage]);

  const editor = useEditor(
    {
      extensions,
      content: initialContent,
      editorProps: {
        attributes: {
          class: 'doc-prose',
          'data-testid': 'doc-editor',
          'aria-label': 'Document',
          spellcheck: 'true',
        },
        handleDOMEvents: {
          dragover: (_view, event) => {
            if (event.dataTransfer?.types.includes(IDEA_DRAG_MIME)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }
            return false;
          },
        },
        handleDrop: (view, event) => {
          const id = event.dataTransfer?.getData(IDEA_DRAG_MIME);
          if (!id) return false;
          const idea = useCanvasStore.getState().canvas.nodes.find((n) => n.id === id);
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!idea || !at) return false;
          event.preventDefault();
          const label = idea.title || 'Untitled idea';
          const content = event.altKey
            ? [
                { type: IDEA_REF, attrs: { id: idea.id, label } },
                { type: 'text', text: ' ' },
              ]
            : { type: IDEA_CARD, attrs: { nodeId: idea.id, label } };
          const target = view.state.doc.resolve(at.pos);
          // Cards are blocks: drop them between blocks, not inside a line.
          const pos = event.altKey || target.depth === 0 ? at.pos : target.after(1);
          editor?.chain().focus().insertContentAt(pos, content).run();
          if (editor && !event.altKey) placeCursorAfterBlock(editor);
          return true;
        },
      },
      onUpdate: ({ editor: e }) => onChangeRef.current(e.getJSON()),
    },
    [documentId],
  );

  useEffect(() => {
    if (!editor) return undefined;
    setActiveEditor(editor, documentId);
    return () => setActiveEditor(null);
  }, [editor, documentId]);

  if (!editor) return <div className="doc-loading">Opening…</div>;

  return (
    <div className={`doc-editor ${showOutline ? 'has-outline' : ''}`}>
      <Toolbar editor={editor} onPickImage={pickImage} />
      <div className="doc-editor-body">
        {showOutline && <Outline editor={editor} />}
        <div className="doc-page">
          <EditorContent editor={editor} />
        </div>
      </div>
      <SelectionBubble editor={editor} />
      <input
        ref={fileInputRef}
        type="file"
        accept={IMAGE_MIME_TYPES.join(',')}
        hidden
        data-testid="doc-image-input"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length > 0) void uploadAndInsert(editor, servicesRef.current, files);
        }}
      />
    </div>
  );
}
