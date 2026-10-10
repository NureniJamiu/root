/**
 * `NodeEditor` — the title / body / images / type editor for a single Node
 * (Requirements 4.1–4.7, design.md §Editor Flow).
 *
 * The editor works on a local draft of the node (title, body, type and
 * images). Nothing reaches the store until the user saves:
 *
 *   - Save (button, Enter in the title, Cmd/Ctrl+Enter)
 *       → `canvasActions.saveNodeEdits(nodeId, draft)` — one undo step
 *   - Cancel (button, Esc, click-away while nothing changed)
 *       → `canvasActions.closeEditor()`, or `discardNewNode(nodeId)` when
 *         the idea was only just added, so cancelling an add leaves nothing
 *         behind.
 *
 * Structural caps come from `maxLength` on the inputs (200 / 20 000 —
 * design.md §Edge Cases and Boundary Conditions), and the body character
 * counter turns `#de5052` when fewer than 200 characters of headroom
 * remain. Image uploads are rejected above 2 MB with an inline message
 * ("Images must be under 2 MB.") — the store-level mutator enforces the
 * same guard, but surfacing rejection here keeps the failure visible to
 * the user rather than a silent no-op.
 *
 * Non-image files dragged onto the drop zone are silently ignored, and
 * the drop zone border flashes red once so the user knows the drop was
 * seen but rejected (design.md §Edge Cases and Boundary Conditions).
 *
 * The editor renders as an overlay with a translucent backdrop. Clicking
 * the backdrop cancels only while the draft is unchanged, so a stray click
 * never throws away typing.
 */

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';

import {
  IMAGE_DATA_URL_MAX_BYTES,
  NODE_BODY_MAX,
  NODE_TITLE_MAX,
  canvasActions,
  useCanvasStore,
} from '../data';
import type { ImageEntry, Node, NodeEdits, NodeType, UUID } from '../data';
import { Button } from '../ui';

import { typeStyles } from './typeStyles';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

type NoteFormat = 'bold' | 'italic' | 'list' | 'link';

const NOTE_FORMATS: ReadonlyArray<{ format: NoteFormat; label: string; glyph: string; className?: string }> = [
  { format: 'bold', label: 'Bold', glyph: 'B', className: 'font-bold' },
  { format: 'italic', label: 'Italic', glyph: 'I', className: 'italic font-serif text-[13px]' },
  { format: 'list', label: 'Bulleted list', glyph: '•' },
  { format: 'link', label: 'Link', glyph: '↗' },
];

/** Title cap (design.md §Edge Cases; Requirement 4.2). */
const TITLE_MAX = NODE_TITLE_MAX;

/** Body cap (design.md §Edge Cases; Requirement 4.3). */
const BODY_MAX = NODE_BODY_MAX;

/**
 * Threshold at which the body character counter switches to the
 * `#de5052` warning color — the last 200 characters of headroom.
 */
const BODY_COUNTER_WARN_AT = BODY_MAX - 200;

/**
 * Hard image cap. Applied against the size of the produced data URL
 * string so the check aligns with what actually gets persisted (the
 * `addImage` mutator applies the same 2 MB check on the serialized
 * form — see design.md §Image Handling, Requirement 4.4).
 */
const IMAGE_MAX_BYTES = IMAGE_DATA_URL_MAX_BYTES;

/** Buttons render in this fixed order (design.md §Editor Flow). */
const TYPE_ORDER: readonly NodeType[] = [
  'topic',
  'finding',
  'question',
  'conclusion',
];

/**
 * Palette color used when the character counter is in warn state, and
 * for the drop-zone-rejected border flash. Uses color.surface.strong
 * as the single "alert/action" accent in the new palette.
 */
const SECONDARY = 'var(--color-semantic-question)'; // warning accent, follows the theme

/**
 * How long the drop-zone border flashes when a non-image payload is
 * dropped. motion.duration.normal = 150ms from DESIGN.md.
 */
const FLASH_MS = 150; // motion.duration.normal

/** Display names for the type picker and header. */
const TYPE_LABEL: { readonly [K in NodeType]: string } = {
  topic: 'Topic',
  finding: 'Finding',
  question: 'Question',
  conclusion: 'Conclusion',
};

const FIELD_LABEL =
  'font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3';

const FIELD_INPUT =
  'w-full bg-panel text-ink border border-rule-strong rounded-[3px] outline-none placeholder:text-faint transition-[border-color,box-shadow] duration-150 hover:border-faint focus:border-topic focus:shadow-[0_0_0_3px_rgb(var(--topic)/0.12)]';

const KBD =
  'inline-flex items-center px-1 h-4 mr-1 rounded-[2px] border border-rule-2 bg-panel text-[9.5px] text-ink-read';

/** Shortcut hint for the save key: ⌘ on Apple platforms, Ctrl elsewhere. */
const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

/* -------------------------------------------------------------------------- */
/* Public types                                                               */
/* -------------------------------------------------------------------------- */

export interface NodeEditorProps {
  readonly nodeId: UUID;
  readonly onClose: () => void;
}

/* -------------------------------------------------------------------------- */
/* Selector                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Memoized-shape selector: locate the node by id on every render. The
 * canvas re-creates the node object on any mutation, so the selector's
 * return value changes reference exactly when the editor needs to
 * re-render.
 */
function selectNode(nodeId: UUID) {
  return (s: { canvas: { nodes: readonly Node[] } }): Node | undefined =>
    s.canvas.nodes.find((n) => n.id === nodeId);
}

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

function NodeEditorImpl({ nodeId, onClose }: NodeEditorProps): JSX.Element | null {
  const node = useCanvasStore(selectNode(nodeId));
  const isNew = useCanvasStore((s) => s.editor.openNodeId === nodeId && s.editor.isNew === true);

  // The draft is seeded once from the node; the store is only written on Save.
  const [draft, setDraft] = useState<NodeEdits | null>(() =>
    node === undefined
      ? null
      : { title: node.title, body: node.body, type: node.type, images: node.images },
  );
  const isDirty =
    node !== undefined &&
    draft !== null &&
    (draft.title !== node.title ||
      draft.body !== node.body ||
      draft.type !== node.type ||
      draft.images.length !== node.images.length ||
      draft.images.some((img, i) => img.id !== node.images[i]?.id));

  const [imageError, setImageError] = useState<string | null>(null);
  const [dropFlash, setDropFlash] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filePickerRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  /* ------------------------------------------------------------------ */
  /* Close plumbing                                                     */
  /* ------------------------------------------------------------------ */

  const cancel = useCallback((): void => {
    if (isNew) canvasActions.discardNewNode(nodeId);
    else canvasActions.closeEditor();
    onClose();
  }, [isNew, nodeId, onClose]);

  const save = useCallback((): void => {
    if (draft !== null) canvasActions.saveNodeEdits(nodeId, draft);
    else canvasActions.closeEditor();
    onClose();
  }, [draft, nodeId, onClose]);

  // Esc cancels and Cmd/Ctrl+Enter saves from anywhere in the document —
  // the editor does not need to hold focus for the shortcuts to work.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        save();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancel, save]);

  // Clear any pending flash timeout on unmount so we don't call
  // `setState` on a stale component.
  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current !== null) {
        clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = null;
      }
    };
  }, []);

  /* ------------------------------------------------------------------ */
  /* Image handling                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Flash the drop-zone border once. Any pending flash is cancelled so
   * successive rejected drops always show a fresh flash, rather than
   * dropping the second flash inside the tail of the first.
   */
  const flashDropZone = useCallback((): void => {
    if (flashTimeoutRef.current !== null) {
      clearTimeout(flashTimeoutRef.current);
    }
    setDropFlash(true);
    flashTimeoutRef.current = setTimeout(() => {
      setDropFlash(false);
      flashTimeoutRef.current = null;
    }, FLASH_MS);
  }, []);

  const ingestFile = useCallback(
    (file: File): void => {
      if (!file.type.startsWith('image/')) {
        // Non-image files are ignored; the border flash acknowledges
        // the drop was seen (design.md §Edge Cases).
        flashDropZone();
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          // FileReader.readAsDataURL should always yield a string;
          // guard the type narrowing for safety.
          return;
        }
        if (result.length > IMAGE_MAX_BYTES) {
          setImageError('Images must be under 2 MB.');
          return;
        }
        const entry: ImageEntry = {
          id: crypto.randomUUID(),
          dataUrl: result,
          addedAt: new Date().toISOString(),
        };
        setImageError(null);
        setDraft((d) => (d === null ? d : { ...d, images: [...d.images, entry] }));
      };
      reader.readAsDataURL(file);
    },
    [flashDropZone],
  );

  const ingestFiles = useCallback(
    (files: FileList | readonly File[]): void => {
      // Convert to an array so both `FileList` and readonly arrays work.
      const arr = Array.from(files);
      for (const file of arr) ingestFile(file);
    },
    [ingestFile],
  );

  const onDrop = useCallback(
    (e: ReactDragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      const { files } = e.dataTransfer;
      if (files.length === 0) return;
      ingestFiles(files);
    },
    [ingestFiles],
  );

  const onDragOver = useCallback(
    (e: ReactDragEvent<HTMLDivElement>): void => {
      // Required for the drop event to fire.
      e.preventDefault();
      e.stopPropagation();
    },
    [],
  );

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>): void => {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file !== null) files.push(file);
        }
      }
      if (files.length === 0) return;
      e.preventDefault();
      ingestFiles(files);
    },
    [ingestFiles],
  );

  const onPickFiles = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const { files } = e.target;
      if (files === null || files.length === 0) return;
      ingestFiles(files);
      // Reset the input so picking the same file twice in a row still
      // triggers `onChange`.
      e.target.value = '';
    },
    [ingestFiles],
  );

  const openFilePicker = useCallback((): void => {
    filePickerRef.current?.click();
  }, []);

  /* ------------------------------------------------------------------ */
  /* Text handlers                                                      */
  /* ------------------------------------------------------------------ */

  const onTitleChange = useCallback((e: ChangeEvent<HTMLInputElement>): void => {
    const title = e.target.value;
    setDraft((d) => (d === null ? d : { ...d, title }));
  }, []);

  const onTitleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>): void => {
      if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        save();
      }
    },
    [save],
  );

  const onBodyChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>): void => {
    const body = e.target.value;
    setDraft((d) => (d === null ? d : { ...d, body }));
  }, []);

  /**
   * Wrap the selected notes text in Markdown markers (or prefix each selected
   * line, for lists), keeping the selection on the same words.
   */
  const applyFormat = useCallback((format: NoteFormat): void => {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end, value } = el;
    let next: string;
    let selStart: number;
    let selEnd: number;
    if (format === 'list') {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const block = value.slice(lineStart, end);
      const listed = block
        .split('\n')
        .map((line) => (line.startsWith('- ') ? line : `- ${line}`))
        .join('\n');
      next = value.slice(0, lineStart) + listed + value.slice(end);
      selStart = lineStart;
      selEnd = lineStart + listed.length;
    } else {
      const marker = format === 'bold' ? '**' : format === 'italic' ? '*' : '';
      const selected = value.slice(start, end) || (format === 'link' ? 'link text' : 'text');
      const wrapped = format === 'link' ? `[${selected}](https://)` : `${marker}${selected}${marker}`;
      next = value.slice(0, start) + wrapped + value.slice(end);
      selStart = start + (format === 'link' ? 1 : marker.length);
      selEnd = selStart + selected.length;
    }
    if (next.length > BODY_MAX) return;
    setDraft((d) => (d === null ? d : { ...d, body: next }));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    });
  }, []);

  const onPickType = useCallback((t: NodeType): void => {
    setDraft((d) => (d === null ? d : { ...d, type: t }));
  }, []);

  const onRemoveImage = useCallback((imageId: UUID): void => {
    setDraft((d) => (d === null ? d : { ...d, images: d.images.filter((img) => img.id !== imageId) }));
  }, []);

  /* ------------------------------------------------------------------ */
  /* Click-away                                                         */
  /* ------------------------------------------------------------------ */

  const onBackdropMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      // Only close when the mousedown targets the backdrop itself; a
      // mousedown inside the panel bubbles here but with a different
      // target, so click-away is not falsely triggered by e.g.
      // selecting text in the body textarea.
      if (e.target === e.currentTarget && !isDirty) {
        cancel();
      }
    },
    [cancel, isDirty],
  );

  /* ------------------------------------------------------------------ */
  /* Derived UI                                                         */
  /* ------------------------------------------------------------------ */

  // Body counter color: red in the last 200 characters of headroom.
  const bodyLength = draft?.body.length ?? 0;
  const counterWarn = bodyLength > BODY_COUNTER_WARN_AT;

  // Drop zone border: solid text.tertiary normally, surface.strong during a flash.
  const dropZoneBorder = useMemo(() => {
    return dropFlash ? `1.5px solid ${SECONDARY}` : '1.5px dashed rgb(var(--rule-strong))'; // outline-variant
  }, [dropFlash]);

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  // Guard: node deleted while editor was open. Return `null` so the
  // parent's re-render can drop the editor cleanly.
  if (node === undefined || draft === null) return null;

  const typeLabel = TYPE_LABEL[draft.type];
  const accent = typeStyles[draft.type].border;

  return (
    <div
      // Backdrop: full-viewport overlay. `data-testid` lets component
      // tests target the click-away zone unambiguously.
      className="root-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      data-testid="node-editor-backdrop"
      onMouseDown={onBackdropMouseDown}
      role="dialog"
      aria-modal="true"
      aria-label={isNew ? 'New idea' : 'Edit idea'}
    >
      <div
        className="root-modal-panel flex flex-col w-[560px] max-w-full max-h-[90vh] bg-panel text-ink border border-rule-2 rounded-[4px] overflow-hidden"
        data-testid="node-editor"
        onPaste={onPaste}
      >
        {/* Header ------------------------------------------------------- */}
        <div className="relative flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-rule">
          <span
            className="absolute left-0 top-0 h-[3px] w-full transition-colors duration-200"
            style={{ background: accent }}
            aria-hidden="true"
          />
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted">
              {isNew ? 'New idea' : 'Edit idea'} · {typeLabel}
            </span>
            <h2 className="font-serif text-[22px] leading-[28px] font-normal text-ink-strong truncate">
              {draft.title.trim() || (isNew ? 'Untitled idea' : 'Untitled')}
            </h2>
          </div>
          <button
            type="button"
            onClick={cancel}
            aria-label="Close without saving"
            title="Close without saving (Esc)"
            className="shrink-0 w-8 h-8 -mr-2 inline-flex items-center justify-center rounded-[2px] text-muted hover:text-ink-strong hover:bg-sunken transition-colors cursor-pointer"
            data-testid="node-editor-dismiss"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body --------------------------------------------------------- */}
        <div className="flex flex-col gap-5 px-6 py-5 overflow-y-auto">
          {/* Title */}
          <label className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Title</span>
            <input
              ref={titleRef}
              type="text"
              value={draft.title}
              onChange={onTitleChange}
              onKeyDown={onTitleKeyDown}
              maxLength={TITLE_MAX}
              autoFocus
              placeholder="Name this idea"
              className={`${FIELD_INPUT} h-10 px-3 font-serif text-[16px]`}
              data-testid="node-editor-title"
            />
          </label>

          {/* Type picker */}
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Card type</span>
            <div
              className="grid grid-cols-4 gap-1 p-1 bg-sunken rounded-[3px]"
              role="group"
              aria-label="Card type"
              data-testid="node-editor-type-buttons"
            >
              {TYPE_ORDER.map((t) => {
                const style = typeStyles[t];
                const isSelected = draft.type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onPickType(t)}
                    aria-pressed={isSelected}
                    className={`h-8 inline-flex items-center justify-center gap-1.5 rounded-[2px] border font-mono text-[11px] transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-panel text-ink-strong'
                        : 'border-transparent text-ink-3 hover:text-ink-strong hover:bg-panel/60'
                    }`}
                    style={isSelected ? { borderColor: style.border } : undefined}
                    data-testid={`node-editor-type-${t}`}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: style.border }}
                      aria-hidden="true"
                    />
                    {TYPE_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <span className="flex items-baseline justify-between">
              <label htmlFor={`node-editor-body-${nodeId}`} className={FIELD_LABEL}>
                Notes &amp; details
              </label>
              <span
                className="font-mono text-[10px] tabular-nums"
                style={{ color: counterWarn ? SECONDARY : 'rgb(var(--muted))' }}
                data-testid="node-editor-body-counter"
              >
                {bodyLength}/{BODY_MAX}
              </span>
            </span>
            <div className="flex items-center gap-1" role="toolbar" aria-label="Format notes">
              {NOTE_FORMATS.map((f) => (
                <button
                  key={f.format}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => applyFormat(f.format)}
                  title={f.label}
                  aria-label={f.label}
                  className="h-6 min-w-6 px-1.5 inline-flex items-center justify-center rounded-[2px] border border-rule bg-panel text-ink-read hover:border-ink-strong hover:text-ink-strong transition-colors cursor-pointer font-mono text-[11px]"
                  data-testid={`node-editor-format-${f.format}`}
                >
                  <span className={f.className}>{f.glyph}</span>
                </button>
              ))}
              <span className="ml-auto font-mono text-[9.5px] text-faint">Markdown works: **bold**, *italic*, - lists</span>
            </div>
            <textarea
              id={`node-editor-body-${nodeId}`}
              ref={bodyRef}
              value={draft.body}
              onChange={onBodyChange}
              maxLength={BODY_MAX}
              rows={7}
              placeholder="Sources, evidence, open threads…"
              className={`${FIELD_INPUT} px-3 py-2 font-serif text-[14px] leading-[22px] resize-y min-h-[120px]`}
              data-testid="node-editor-body"
            />
          </div>

          {/* Images */}
          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>Images &amp; visuals</span>
            <div
              // Drop zone: dashed border. Border flashes red for FLASH_MS
              // on non-image drops.
              onDrop={onDrop}
              onDragOver={onDragOver}
              onDragEnter={onDragOver}
              className="flex flex-row items-center justify-center gap-3 px-4 py-4 rounded-[3px] bg-panel-2 transition-colors"
              style={{ border: dropZoneBorder }}
              data-testid="node-editor-drop-zone"
              data-flashing={dropFlash ? 'true' : 'false'}
            >
              <svg className="w-5 h-5 text-faint shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
              <span className="font-serif text-[13px] text-ink-3">Drop or paste images, or</span>
              <button
                type="button"
                onClick={openFilePicker}
                className="h-7 px-3 font-mono text-[11px] text-ink bg-panel border border-rule-strong rounded-[2px] hover:border-ink-strong transition-colors cursor-pointer"
                data-testid="node-editor-pick-file"
              >
                Choose files…
              </button>
              <input
                ref={filePickerRef}
                type="file"
                accept="image/*"
                multiple
                onChange={onPickFiles}
                style={{ display: 'none' }}
                data-testid="node-editor-file-input"
              />
            </div>

            {imageError !== null ? (
              <div
                className="font-mono text-[11px]"
                style={{ color: SECONDARY }}
                data-testid="node-editor-image-error"
                role="alert"
              >
                {imageError}
              </div>
            ) : null}

            {draft.images.length > 0 ? (
              <div className="flex flex-row flex-wrap gap-2 pt-1" data-testid="node-editor-image-list">
                {draft.images.map((img) => (
                  <div
                    key={img.id}
                    className="group relative rounded-[3px] border border-rule bg-panel p-0.5"
                  >
                    <img
                      src={img.dataUrl}
                      alt=""
                      className="block w-[72px] h-[72px] object-cover rounded-[2px]"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveImage(img.id)}
                      aria-label="Remove image"
                      className="absolute top-1 right-1 w-5 h-5 inline-flex items-center justify-center rounded-full bg-black/70 text-white text-[10px] opacity-80 group-hover:opacity-100 hover:bg-danger-fill transition-all cursor-pointer"
                      data-testid={`node-editor-remove-image-${img.id}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Footer ------------------------------------------------------- */}
        <div className="flex flex-row items-center justify-between gap-3 px-6 py-3.5 border-t border-rule bg-panel-2">
          <span className="hidden sm:inline-flex items-center gap-3 font-mono text-[10px] text-muted">
            <span><kbd className={KBD}>Esc</kbd> cancel</span>
            <span><kbd className={KBD}>{MOD_KEY}↵</kbd> save</span>
          </span>
          <div className="flex flex-row gap-2 ml-auto">
            <Button variant="secondary" size="md" onClick={cancel} data-testid="node-editor-cancel">
              Cancel
            </Button>
            <Button variant="cobalt" size="md" onClick={save} data-testid="node-editor-save">
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * `React.memo` so the editor only re-renders when its props (i.e.
 * `nodeId` / `onClose` identity) change or its store subscription
 * fires. Prevents unrelated store writes from causing a full editor
 * re-render.
 */
export const NodeEditor = memo(NodeEditorImpl);
NodeEditor.displayName = 'NodeEditor';
