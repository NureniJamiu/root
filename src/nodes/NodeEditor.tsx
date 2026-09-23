/**
 * `NodeEditor` — the title / body / images / type editor for a single Node
 * (Requirements 4.1–4.7, design.md §Editor Flow).
 *
 * The editor is bound to a specific `nodeId` and reads its Node from the
 * Zustand store on every keystroke (via a memoized selector). Every user
 * action routes through `canvasActions` so the store remains the sole
 * mutation surface:
 *
 *   - Title / body typing         → `canvasActions.updateNode({...})`
 *   - Type button                 → `canvasActions.updateNode({type})`
 *   - Image drop / paste / pick   → `canvasActions.addImage(nodeId, entry)`
 *   - Image delete                → `canvasActions.removeImage(nodeId, id)`
 *   - Esc key / click-away        → `canvasActions.closeEditor()`
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
 * The editor renders as an overlay with a translucent backdrop; clicks
 * on the backdrop close the editor. The panel itself stops propagation
 * so interior clicks never register as click-away.
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
  MouseEvent as ReactMouseEvent,
} from 'react';

import { canvasActions, useCanvasStore } from '../data';
import type { ImageEntry, Node, NodeType, UUID } from '../data';

import { typeStyles } from './typeStyles';

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Title cap (design.md §Edge Cases; Requirement 4.2). */
const TITLE_MAX = 200;

/** Body cap (design.md §Edge Cases; Requirement 4.3). */
const BODY_MAX = 20_000;

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
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Buttons render in this fixed order (design.md §Editor Flow). */
const TYPE_ORDER: readonly NodeType[] = [
  'topic',
  'finding',
  'question',
  'conclusion',
];

/**
 * Palette color used for the selected type button's border and for the
 * body counter's normal state — pulled directly from the DESIGN.md
 * primary token so no ad-hoc hex leaks in.
 */
const PRIMARY = '#0051c3';

/**
 * Palette color used when the character counter is in warn state, and
 * for the drop-zone-rejected border flash.
 */
const SECONDARY = '#de5052';

/**
 * How long the drop-zone border flashes when a non-image payload is
 * dropped. 150 ms matches the app-wide transition duration from
 * DESIGN.md so the flash feels part of the design language.
 */
const FLASH_MS = 150;

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

  const [imageError, setImageError] = useState<string | null>(null);
  const [dropFlash, setDropFlash] = useState(false);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filePickerRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------------------ */
  /* Close plumbing                                                     */
  /* ------------------------------------------------------------------ */

  const close = useCallback((): void => {
    canvasActions.closeEditor();
    onClose();
  }, [onClose]);

  // Esc closes the editor from anywhere in the document — the editor
  // does not need to hold focus for the shortcut to work (design.md
  // §Editor Flow).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [close]);

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
        canvasActions.addImage(nodeId, entry);
      };
      reader.readAsDataURL(file);
    },
    [flashDropZone, nodeId],
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

  const onTitleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      canvasActions.updateNode(nodeId, { title: e.target.value });
    },
    [nodeId],
  );

  const onBodyChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>): void => {
      canvasActions.updateNode(nodeId, { body: e.target.value });
    },
    [nodeId],
  );

  const onPickType = useCallback(
    (t: NodeType): void => {
      canvasActions.updateNode(nodeId, { type: t });
    },
    [nodeId],
  );

  const onRemoveImage = useCallback(
    (imageId: UUID): void => {
      canvasActions.removeImage(nodeId, imageId);
    },
    [nodeId],
  );

  /* ------------------------------------------------------------------ */
  /* Click-away                                                         */
  /* ------------------------------------------------------------------ */

  const onBackdropMouseDown = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      // Only close when the mousedown targets the backdrop itself; a
      // mousedown inside the panel bubbles here but with a different
      // target, so click-away is not falsely triggered by e.g.
      // selecting text in the body textarea.
      if (e.target === e.currentTarget) {
        close();
      }
    },
    [close],
  );

  /* ------------------------------------------------------------------ */
  /* Derived UI                                                         */
  /* ------------------------------------------------------------------ */

  // Body counter color: red in the last 200 characters of headroom.
  const bodyLength = node?.body.length ?? 0;
  const counterWarn = bodyLength > BODY_COUNTER_WARN_AT;

  // Drop zone border: solid neutral-700 normally, red during a flash.
  const dropZoneBorder = useMemo(() => {
    return dropFlash ? `2px solid ${SECONDARY}` : '2px dashed #404040';
  }, [dropFlash]);

  /* ------------------------------------------------------------------ */
  /* Render                                                             */
  /* ------------------------------------------------------------------ */

  // Guard: node deleted while editor was open. Return `null` so the
  // parent's re-render can drop the editor cleanly.
  if (node === undefined) return null;

  return (
    <div
      // Backdrop: full-viewport overlay. `data-testid` lets component
      // tests target the click-away zone unambiguously.
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0, 0, 0, 0.35)' }}
      data-testid="node-editor-backdrop"
      onMouseDown={onBackdropMouseDown}
      role="dialog"
      aria-modal="true"
      aria-label="Node editor"
    >
      <div
        // Panel: opaque card carrying the editor UI. Clicks inside are
        // caught by React's synthetic system; the backdrop's mousedown
        // handler ignores events whose target is not the backdrop
        // itself, so this container does not need to `stopPropagation`.
        className="flex flex-col gap-3"
        style={{
          background: '#ffffff',
          color: '#000000',
          border: '1px solid #404040',
          borderRadius: 5,
          padding: 16,
          width: 480,
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
        data-testid="node-editor"
        onPaste={onPaste}
      >
        {/* Title -------------------------------------------------------- */}
        <label className="flex flex-col gap-1 text-body">
          <span style={{ color: '#595959' }}>Title</span>
          <input
            ref={titleRef}
            type="text"
            value={node.title}
            onChange={onTitleChange}
            maxLength={TITLE_MAX}
            autoFocus
            className="text-body"
            style={{
              border: '1px solid #404040',
              borderRadius: 2,
              padding: '4px 6px',
              background: '#ffffff',
              color: '#000000',
              outline: 'none',
              fontFamily: 'Times, serif',
            }}
            data-testid="node-editor-title"
          />
        </label>

        {/* Body --------------------------------------------------------- */}
        <label className="flex flex-col gap-1 text-body">
          <span style={{ color: '#595959' }}>Body</span>
          <textarea
            value={node.body}
            onChange={onBodyChange}
            maxLength={BODY_MAX}
            rows={8}
            className="text-body"
            style={{
              border: '1px solid #404040',
              borderRadius: 2,
              padding: '4px 6px',
              background: '#ffffff',
              color: '#000000',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'Times, serif',
            }}
            data-testid="node-editor-body"
          />
          <div
            className="text-body"
            style={{
              alignSelf: 'flex-end',
              color: counterWarn ? SECONDARY : '#595959',
            }}
            data-testid="node-editor-body-counter"
          >
            {bodyLength}/{BODY_MAX}
          </div>
        </label>

        {/* Type picker -------------------------------------------------- */}
        <div className="flex flex-col gap-1 text-body">
          <span style={{ color: '#595959' }}>Type</span>
          <div
            className="flex flex-row gap-2"
            data-testid="node-editor-type-buttons"
          >
            {TYPE_ORDER.map((t) => {
              const style = typeStyles[t];
              const isSelected = node.type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onPickType(t)}
                  aria-pressed={isSelected}
                  className="rounded-xs text-body transition-colors"
                  style={{
                    // Selection swaps the border to the 2 px primary
                    // stroke (matches NodeCard selection rule); the
                    // base stroke tracks the type's own border color.
                    border: isSelected
                      ? `2px solid ${PRIMARY}`
                      : `1px solid ${style.border}`,
                    background: style.background,
                    color: style.text,
                    padding: isSelected ? '3px 7px' : '4px 8px',
                    fontFamily: 'Times, serif',
                    cursor: 'pointer',
                  }}
                  data-testid={`node-editor-type-${t}`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Images ------------------------------------------------------- */}
        <div className="flex flex-col gap-2 text-body">
          <span style={{ color: '#595959' }}>Images</span>

          <div
            // Drop zone: dashed border, hollow center. Border flashes
            // red for FLASH_MS on non-image drops.
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragEnter={onDragOver}
            className="flex flex-col items-center justify-center gap-2 text-body transition-colors"
            style={{
              border: dropZoneBorder,
              borderRadius: 5,
              padding: 12,
              minHeight: 72,
              color: '#595959',
            }}
            data-testid="node-editor-drop-zone"
            data-flashing={dropFlash ? 'true' : 'false'}
          >
            <div>Drop images here, paste, or</div>
            <button
              type="button"
              onClick={openFilePicker}
              className="rounded-xs text-body"
              style={{
                border: '1px solid #404040',
                background: '#ffffff',
                color: '#000000',
                padding: '3px 8px',
                cursor: 'pointer',
                fontFamily: 'Times, serif',
              }}
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
              className="text-body"
              style={{ color: SECONDARY }}
              data-testid="node-editor-image-error"
              role="alert"
            >
              {imageError}
            </div>
          ) : null}

          {node.images.length > 0 ? (
            <div
              className="flex flex-row flex-wrap gap-2"
              data-testid="node-editor-image-list"
            >
              {node.images.map((img) => (
                <div
                  key={img.id}
                  className="relative"
                  style={{
                    border: '1px solid #404040',
                    borderRadius: 2,
                    padding: 2,
                    background: '#ffffff',
                  }}
                >
                  <img
                    src={img.dataUrl}
                    alt=""
                    style={{
                      width: 64,
                      height: 64,
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveImage(img.id)}
                    aria-label="Remove image"
                    className="rounded-xs text-body"
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 2,
                      border: '1px solid #404040',
                      background: '#ffffff',
                      color: '#000000',
                      padding: '0 4px',
                      cursor: 'pointer',
                      fontFamily: 'Times, serif',
                      lineHeight: 1.2,
                    }}
                    data-testid={`node-editor-remove-image-${img.id}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Footer ------------------------------------------------------- */}
        <div className="flex flex-row justify-end">
          <button
            type="button"
            onClick={close}
            className="rounded-xs text-body"
            style={{
              border: '1px solid #404040',
              background: '#ffffff',
              color: '#000000',
              padding: '4px 10px',
              cursor: 'pointer',
              fontFamily: 'Times, serif',
            }}
            data-testid="node-editor-close"
          >
            Close
          </button>
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
