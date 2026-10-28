/**
 * The source reader: a panel over the canvas where a web page is read
 * without leaving Root. Select a passage and choose "Finding" or "Question"
 * to put it on the canvas as a card, quoted, with the page filled in as its
 * source, so the citation is right from the start.
 *
 * The page is fetched by the server (`/api/reader`) and arrives as plain
 * text blocks, so nothing from the page runs or renders as markup here.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import type { NodeType, Source } from '../data';
import { readPdfFile, readSource } from '../lib/reader-api';
import type { ReadResult, ReaderPage } from '../lib/reader-api';
import { today } from '../nodes/SourceFields';
import { Button } from '../ui/Button';

export interface SourceReaderProps {
  readonly open: boolean;
  /** An address to load when the panel opens (from an idea's "Read source"). */
  readonly initialUrl: string | null;
  readonly onClose: () => void;
  /** Put a passage on the canvas; returns false when it could not be added. */
  readonly onExtract: (type: Extract<NodeType, 'finding' | 'question'>, passage: string, source: Source) => boolean;
}

/** The page as a source record, quoting `passage`. */
export function sourceFromPage(page: ReaderPage, passage: string): Source {
  return {
    kind: page.kind,
    ...(page.title && page.title !== 'Pasted text' ? { title: page.title } : {}),
    ...(page.authors.length > 0 ? { authors: [...page.authors] } : {}),
    ...(page.published ? { published: page.published } : {}),
    ...(page.siteName ? { container: page.siteName } : {}),
    ...(page.url ? { url: page.url } : {}),
    ...(page.doi ? { doi: page.doi } : {}),
    accessed: today(),
    quote: passage,
  };
}

/**
 * A page made from pasted text, for sites the reader cannot open. The
 * address (if any) still becomes the source's link; details can be filled
 * in on the card afterwards.
 */
export function pageFromPaste(text: string, address: string): ReaderPage {
  let url = '';
  let host = '';
  try {
    const parsed = new URL(/^[a-z]+:\/\//i.test(address.trim()) ? address.trim() : `https://${address.trim()}`);
    if (address.trim() && (parsed.protocol === 'https:' || parsed.protocol === 'http:')) {
      url = parsed.href;
      host = parsed.hostname.replace(/^www\./, '');
    }
  } catch {
    /* no usable address: the source keeps the quote only */
  }
  const blocks = text
    .split(/\n\s*\n|\r?\n/)
    .map((t) => t.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((t) => ({ kind: 'paragraph' as const, text: t }));
  return { url, title: host || 'Pasted text', authors: [], published: null, siteName: host || null, doi: null, kind: 'web', blocks };
}

/** Half the width of the floating "Extract as" actions, so they stay inside the reader. */
const ACTIONS_HALF_WIDTH = 124;

interface Selected {
  readonly text: string;
  /** Where to float the actions, inside the scrolling body. */
  readonly top: number;
  readonly left: number;
}

export function SourceReader({ open, initialUrl, onClose, onExtract }: SourceReaderProps): JSX.Element {
  const [address, setAddress] = useState('');
  const [page, setPage] = useState<ReaderPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [extracted, setExtracted] = useState(0);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const pointerDownRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (url: string) => {
    const target = url.trim();
    if (!target) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setSelected(null);
    const result = await readSource(/^[a-z]+:\/\//i.test(target) ? target : `https://${target}`, controller.signal);
    if (controller.signal.aborted) return;
    show(result);
  }, []);

  const show = (result: ReadResult): void => {
    setLoading(false);
    if (result.ok) {
      setPage(result.page);
      setAddress(result.page.url);
      setExtracted(0);
      setPasting(false);
      bodyRef.current?.scrollTo({ top: 0 });
    } else if (result.message) {
      setError(result.message);
    }
  };

  /** A PDF from the person's computer, read in the browser. */
  const openFile = async (file: File): Promise<void> => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(true);
    setError(null);
    setSelected(null);
    show(await readPdfFile(file));
  };
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  // Opening on an idea's source loads it straight away.
  useEffect(() => {
    if (open && initialUrl && initialUrl !== page?.url) {
      setAddress(initialUrl);
      void load(initialUrl);
    }
    // Only when asked to open somewhere new, not on every page change.
  }, [open, initialUrl]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Follow the selection as it settles (a multi-click can finish after the last
  // mouseup), but not while a drag is still extending it.
  useEffect(() => {
    const onChange = (): void => {
      if (!pointerDownRef.current) onSelectionEnd();
    };
    document.addEventListener('selectionchange', onChange);
    return () => document.removeEventListener('selectionchange', onChange);
  }, []);

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault();
    void load(address);
  };

  /**
   * Track a selection made inside the page text. A triple-click selects a whole
   * paragraph and may end the selection in whatever follows the text, so the
   * selection is trimmed to the page text rather than rejected.
   */
  const onSelectionEnd = (): void => {
    const sel = window.getSelection();
    const body = bodyRef.current;
    const pageText = textRef.current;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !body || !pageText) {
      setSelected(null);
      return;
    }
    const range = sel.getRangeAt(0).cloneRange();
    const bounds = document.createRange();
    bounds.selectNodeContents(pageText);
    if (!range.intersectsNode(pageText)) {
      setSelected(null);
      return;
    }
    if (range.compareBoundaryPoints(Range.START_TO_START, bounds) < 0) range.setStart(bounds.startContainer, bounds.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, bounds) > 0) range.setEnd(bounds.endContainer, bounds.endOffset);
    const text = range.toString().replace(/\s+/g, ' ').trim();
    if (text.length < 3) {
      setSelected(null);
      return;
    }
    const rect = range.getBoundingClientRect();
    const box = body.getBoundingClientRect();
    setSelected({
      text,
      top: rect.top - box.top + body.scrollTop - 38,
      left: Math.min(Math.max(rect.left - box.left + rect.width / 2, ACTIONS_HALF_WIDTH), box.width - ACTIONS_HALF_WIDTH),
    });
  };

  const extract = (type: 'finding' | 'question'): void => {
    if (!page || !selected) return;
    if (onExtract(type, selected.text, sourceFromPage(page, selected.text))) {
      setExtracted((n) => n + 1);
      window.getSelection()?.removeAllRanges();
      setSelected(null);
    }
  };

  const meta = page
    ? [page.authors.slice(0, 3).join(', ') + (page.authors.length > 3 ? ' et al.' : ''), page.siteName, page.published]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <aside
      className={`absolute top-0 right-0 bottom-0 z-30 w-[460px] max-w-full bg-panel border-l border-rule-strong flex flex-col ${
        open ? '' : 'hidden'
      }`}
      style={{ boxShadow: '-10px 0 28px rgb(var(--shadow) / 0.10)' }}
      aria-label="Source reader"
      aria-hidden={!open}
      data-testid="source-reader"
      data-dragging={dragging ? 'true' : 'false'}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as globalThis.Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0];
        if (!file) return;
        e.preventDefault();
        setDragging(false);
        void openFile(file);
      }}
    >
      {dragging && (
        <div className="absolute inset-0 z-20 m-3 flex items-center justify-center border-2 border-dashed border-topic bg-panel/90 rounded-[4px] pointer-events-none">
          <span className="font-serif text-[16px] text-ink-strong">Drop a PDF to read it</span>
        </div>
      )}
      <div className="flex items-center gap-2 px-3 h-11 border-b border-rule shrink-0">
        <span className="flex-1 font-mono text-[11px] font-medium tracking-[0.04em] uppercase text-ink">Reader</span>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close reader" data-testid="source-reader-close">
          Close
        </Button>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2 px-3 py-2.5 border-b border-rule shrink-0">
        <input
          type="text"
          inputMode="url"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Address of an article, page or PDF"
          aria-label="Page address"
          className="flex-1 min-w-0 h-8 px-2.5 bg-panel text-ink border border-rule-strong rounded-[2px] font-mono text-[11.5px] outline-none placeholder:text-faint focus:border-topic"
          data-testid="source-reader-url"
        />
        <Button size="sm" variant="cobalt" type="submit" disabled={loading || !address.trim()} data-testid="source-reader-go">
          {loading ? 'Reading…' : 'Read'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
          title="Open a PDF from your computer (or drop one here)"
          data-testid="source-reader-open-pdf"
        >
          PDF…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void openFile(file);
          }}
          data-testid="source-reader-file"
        />
      </form>

      <div
        ref={bodyRef}
        className="relative flex-1 min-h-0 overflow-y-auto px-6 py-5"
        onMouseDown={() => {
          pointerDownRef.current = true;
        }}
        onMouseUp={() => {
          pointerDownRef.current = false;
          onSelectionEnd();
        }}
        onKeyUp={onSelectionEnd}
      >
        {error && (
          <p className="m-0 mb-4 px-3 py-2 bg-danger-soft text-danger font-serif text-[13px] rounded-[2px]" role="alert" data-testid="source-reader-error">
            {error}
          </p>
        )}

        {pasting && (
          <div className="flex flex-col gap-2 mb-5" data-testid="source-reader-paste">
            <p className="m-0 font-serif text-[13px] leading-[19px] text-ink-3">
              Copy the article from your browser and paste it here. The address above becomes the source&apos;s link;
              you can add the author and date on the card.
            </p>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              rows={8}
              placeholder="Paste the text of the page"
              aria-label="Pasted text"
              className="w-full px-2.5 py-2 bg-panel text-ink border border-rule-strong rounded-[2px] font-serif text-[14px] leading-[21px] outline-none focus:border-topic resize-y"
              data-testid="source-reader-paste-text"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="cobalt"
                disabled={!pasted.trim()}
                onClick={() => {
                  setPage(pageFromPaste(pasted, address));
                  setExtracted(0);
                  setError(null);
                  setPasting(false);
                }}
                data-testid="source-reader-paste-go"
              >
                Use this text
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPasting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {!pasting && (error || !page) && !loading && (
          <button
            type="button"
            onClick={() => setPasting(true)}
            className={`font-mono text-[10px] text-topic hover:underline cursor-pointer ${error ? 'mb-4 block' : 'hidden'}`}
            data-testid="source-reader-paste-open"
          >
            Paste the text instead
          </button>
        )}

        {!page && !loading && !error && !pasting && (
          <div className="pt-6 text-center">
            <h3 className="m-0 mb-1.5 font-serif text-[18px] font-normal text-ink-strong">Read a source here</h3>
            <p className="m-0 mx-auto max-w-[320px] font-serif text-[13px] leading-[20px] text-ink-3">
              Open a web page or a PDF, select a passage, and turn it into a Finding or a Question. The card keeps the
              quote and the page as its source, ready to cite.
            </p>
            <button
              type="button"
              onClick={() => setPasting(true)}
              className="mt-3 font-mono text-[10px] text-topic hover:underline cursor-pointer"
              data-testid="source-reader-paste-start"
            >
              Or paste text from a page
            </button>
          </div>
        )}

        {page && (
          <article className={loading ? 'opacity-50' : ''} data-testid="source-reader-page">
            <h2 className="m-0 font-serif text-[23px] leading-[1.25] font-medium text-ink-strong" data-testid="source-reader-title">
              {page.title}
            </h2>
            {meta && <p className="m-0 mt-1.5 font-mono text-[10px] text-muted">{meta}</p>}
            {page.url && (
              <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-1 font-mono text-[10px] text-topic hover:underline"
              >
                Open the original ↗
              </a>
            )}
            <div ref={textRef} className="mt-5 flex flex-col gap-3.5 font-serif text-[15px] leading-[25px] text-ink select-text" data-testid="source-reader-text">
              {page.blocks.map((b, i) =>
                b.kind === 'page' ? (
                  <div key={i} className="flex items-center gap-2 mt-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-faint select-none" aria-hidden="true">
                    <span className="h-px flex-1 bg-rule" />
                    {b.text}
                    <span className="h-px flex-1 bg-rule" />
                  </div>
                ) : b.kind === 'heading' ? (
                  <h3 key={i} className="m-0 mt-2 font-serif text-[17px] font-medium text-ink-strong">
                    {b.text}
                  </h3>
                ) : b.kind === 'quote' ? (
                  <blockquote key={i} className="m-0 pl-3 border-l-2 border-rule-strong italic text-ink-read">
                    {b.text}
                  </blockquote>
                ) : (
                  <p key={i} className={`m-0 ${b.kind === 'item' ? 'pl-4 relative before:content-["•"] before:absolute before:left-0 before:text-muted' : ''}`}>
                    {b.text}
                  </p>
                ),
              )}
            </div>
          </article>
        )}

        {selected && (
          <div
            className="absolute z-10 -translate-x-1/2 flex items-center gap-1 p-1 whitespace-nowrap select-none bg-inverse rounded-[3px] shadow-[0_8px_20px_-8px_rgb(var(--shadow)/0.5)]"
            style={{ top: Math.max(selected.top, 4), left: selected.left }}
            onMouseDown={(e) => e.preventDefault()}
            data-testid="source-reader-actions"
          >
            <span className="px-1.5 font-mono text-[9.5px] text-on-inverse/70">Extract as</span>
            {(['finding', 'question'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => extract(type)}
                className="h-6 px-2 rounded-[2px] font-mono text-[10.5px] text-on-inverse hover:bg-on-inverse/15 cursor-pointer inline-flex items-center gap-1.5"
                data-testid={`source-reader-extract-${type}`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: `rgb(var(--${type}))` }} aria-hidden="true" />
                {type === 'finding' ? 'Finding' : 'Question'}
              </button>
            ))}
          </div>
        )}
      </div>

      {page && (
        <div className="px-4 py-2.5 border-t border-rule font-mono text-[10px] text-muted shrink-0" role="status" data-testid="source-reader-status">
          {extracted === 0
            ? 'Select a passage to put it on the canvas.'
            : `${extracted} ${extracted === 1 ? 'card' : 'cards'} added from this page, each citing it.`}
        </div>
      )}
    </aside>
  );
}
