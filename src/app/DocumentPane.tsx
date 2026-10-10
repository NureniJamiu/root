/**
 * `DocumentPane` — the writing side of the workbench: the open document's
 * title, save state, word count and outline toggle above the editor, or,
 * with nothing open, a start page (templates, recent documents, drafting
 * from the selected idea).
 *
 * The TipTap editor itself is loaded on demand the first time a document is
 * opened, so the canvas never pays for it.
 */

import { lazy, Suspense, useEffect, useState } from 'react';

import { DOCUMENT_TEMPLATES } from '../editor/templates';
import type { DocumentSummary } from '../lib/documents-api';
import type { SaveStatus } from '../lib/save-queue';

import type { UseDocuments } from './useDocuments';

const DocumentEditor = lazy(() => import('../editor/DocumentEditor'));

const OUTLINE_KEY = 'root-ui:doc-outline-open';

const SAVE_LABELS: Record<SaveStatus, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  error: 'Not saved, retrying',
};

function readOutlinePref(): boolean {
  try {
    return localStorage.getItem(OUTLINE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export interface DocumentPaneProps {
  readonly docs: UseDocuments;
  /** Title of the selected idea, when one is selected (offers "Draft from"). */
  readonly selectedIdeaTitle: string | null;
  readonly onDraftFromSelected: () => void;
  readonly onClosePane?: () => void;
}

export function DocumentPane({
  docs,
  selectedIdeaTitle,
  onDraftFromSelected,
  onClosePane,
}: DocumentPaneProps): JSX.Element {
  const { active, conflict } = docs;
  const [showOutline, setShowOutline] = useState(readOutlinePref);
  const [titleDraft, setTitleDraft] = useState(active?.title ?? '');

  useEffect(() => {
    setTitleDraft(active?.title ?? '');
    // Only when another document opens; typing updates the draft directly.
  }, [active?.id, active?.version]);

  const toggleOutline = (): void => {
    setShowOutline((v) => {
      try {
        localStorage.setItem(OUTLINE_KEY, String(!v));
      } catch {
        /* best-effort */
      }
      return !v;
    });
  };

  return (
    <section className="h-full w-full flex flex-col bg-paper min-w-0" aria-label="Document" data-testid="document-pane">
      <div className="h-11 px-3 border-b border-rule bg-panel flex items-center gap-2 shrink-0">
        {active ? (
          <>
            <button
              type="button"
              onClick={docs.close}
              className="w-7 h-7 inline-flex items-center justify-center rounded-[2px] text-muted hover:text-ink-strong hover:bg-sunken transition-colors cursor-pointer shrink-0"
              title="All documents"
              aria-label="All documents"
              data-testid="btn-doc-back"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
            <input
              value={titleDraft}
              onChange={(e) => {
                setTitleDraft(e.target.value);
                docs.rename(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (document.querySelector('[data-testid="doc-editor"]') as HTMLElement | null)?.focus();
                }
              }}
              maxLength={200}
              placeholder="Untitled document"
              aria-label="Document title"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none font-serif text-[17px] font-medium text-ink-strong placeholder:text-faint px-1 focus:bg-sunken rounded-[2px]"
              data-testid="doc-title-input"
            />
            <span className="font-mono text-[10px] text-muted whitespace-nowrap shrink-0" data-testid="doc-word-count">
              {docs.wordCount} {docs.wordCount === 1 ? 'word' : 'words'}
            </span>
            <span
              className="flex items-center gap-1.5 font-mono text-[10px] text-muted whitespace-nowrap shrink-0"
              role="status"
              data-testid="doc-save-status"
              data-status={docs.saveStatus}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  docs.saveStatus === 'error' ? 'bg-danger-fill' : docs.saveStatus === 'saving' ? 'bg-muted' : 'bg-accent'
                }`}
              />
              <span className={docs.saveStatus === 'error' ? 'text-danger' : undefined}>
                {SAVE_LABELS[docs.saveStatus]}
              </span>
            </span>
            <button
              type="button"
              onClick={toggleOutline}
              aria-pressed={showOutline}
              className={`h-7 px-2 rounded-[2px] font-mono text-[10px] transition-colors cursor-pointer shrink-0 ${
                showOutline ? 'bg-sunken-2 text-ink-strong' : 'text-muted hover:text-ink-strong hover:bg-sunken'
              }`}
              title="Show or hide the outline"
              data-testid="btn-doc-outline"
            >
              Outline
            </button>
          </>
        ) : (
          <span className="flex-1 font-mono text-[11px] font-medium tracking-[0.04em] uppercase text-ink">Documents</span>
        )}
        {onClosePane && (
          <button
            type="button"
            onClick={onClosePane}
            className="w-7 h-7 inline-flex items-center justify-center rounded-[2px] text-muted hover:text-ink-strong hover:bg-sunken transition-colors cursor-pointer shrink-0"
            title="Back to the canvas"
            aria-label="Back to the canvas"
            data-testid="btn-doc-close-pane"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {conflict && active && conflict.documentId === active.id && (
        <div
          className="px-4 py-2.5 border-b border-rule bg-danger-soft flex flex-wrap items-center gap-3 shrink-0"
          role="alert"
          data-testid="doc-conflict"
        >
          <span className="font-serif text-[14px] text-ink flex-1 min-w-[200px]">
            This document was changed in another tab or window. Which version do you want to keep?
          </span>
          <button
            type="button"
            onClick={() => docs.resolveConflict('stored')}
            className="h-7 px-3 rounded-[2px] border border-rule-strong bg-panel font-mono text-[10px] text-ink hover:border-ink cursor-pointer"
            data-testid="btn-conflict-load"
          >
            Load the other version
          </button>
          <button
            type="button"
            onClick={() => docs.resolveConflict('mine')}
            className="h-7 px-3 rounded-[2px] bg-accent text-on-accent font-mono text-[10px] hover:bg-accent-strong cursor-pointer"
            data-testid="btn-conflict-keep"
          >
            Keep mine
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {active ? (
          <Suspense fallback={<div className="p-8 font-mono text-[11px] text-muted">Opening the editor…</div>}>
            <DocumentEditor
              key={`${active.id}:${active.version}`}
              documentId={active.id}
              initialContent={active.content}
              onChange={docs.changeContent}
              showOutline={showOutline}
            />
          </Suspense>
        ) : (
          <StartPage
            documents={docs.documents}
            isOpening={docs.isOpening}
            onOpen={(id) => void docs.open(id)}
            onCreate={(title, content) => void docs.create({ ...(title ? { title } : {}), content })}
            selectedIdeaTitle={selectedIdeaTitle}
            onDraftFromSelected={onDraftFromSelected}
          />
        )}
      </div>
    </section>
  );
}

function StartPage({
  documents,
  isOpening,
  onOpen,
  onCreate,
  selectedIdeaTitle,
  onDraftFromSelected,
}: {
  readonly documents: readonly DocumentSummary[];
  readonly isOpening: boolean;
  readonly onOpen: (id: string) => void;
  readonly onCreate: (title: string | null, content: ReturnType<(typeof DOCUMENT_TEMPLATES)[number]['content']>) => void;
  readonly selectedIdeaTitle: string | null;
  readonly onDraftFromSelected: () => void;
}): JSX.Element {
  return (
    <div className="h-full overflow-y-auto" data-testid="doc-start">
      <div className="max-w-[680px] mx-auto px-6 py-10 flex flex-col gap-8">
        <div>
          <h2 className="m-0 font-serif text-[28px] font-normal text-ink-strong">Write up your research</h2>
          <p className="m-0 mt-2 font-serif text-[15px] leading-[23px] text-ink-read">
            Documents live next to your canvas. Type @ to cite an idea, drag a card in to embed it, and select
            text to turn it into a new idea.
          </p>
        </div>

        {selectedIdeaTitle !== null && (
          <button
            type="button"
            onClick={onDraftFromSelected}
            className="text-left p-4 rounded-[2px] border border-accent bg-panel hover:bg-sunken transition-colors cursor-pointer"
            data-testid="btn-start-draft-from-selected"
          >
            <span className="block font-mono text-[10px] uppercase tracking-[0.08em] text-accent">Draft from the canvas</span>
            <span className="block mt-1 font-serif text-[17px] text-ink-strong">
              Outline a document from “{selectedIdeaTitle || 'Untitled idea'}” and the ideas below it
            </span>
          </button>
        )}

        <div className="flex flex-col gap-3">
          <span className="font-mono text-[10px] font-medium tracking-[0.08em] uppercase text-ink-3">Start from</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DOCUMENT_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onCreate(t.id === 'blank' ? null : t.name, t.content())}
                className="text-left p-3 rounded-[2px] border border-rule-2 bg-panel hover:border-ink transition-colors cursor-pointer"
                data-testid={`doc-template-${t.id}`}
              >
                <span className="block font-serif text-[16px] text-ink-strong">{t.name}</span>
                <span className="block mt-0.5 font-serif text-[13px] leading-[18px] text-ink-3">{t.description}</span>
              </button>
            ))}
          </div>
        </div>

        {documents.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10px] font-medium tracking-[0.08em] uppercase text-ink-3">
              In this project
            </span>
            <ul className="m-0 p-0 list-none flex flex-col border-t border-rule">
              {documents.map((d) => (
                <li key={d.id} className="border-b border-rule">
                  <button
                    type="button"
                    disabled={isOpening}
                    onClick={() => onOpen(d.id)}
                    className="w-full text-left flex items-baseline gap-3 py-2.5 px-1 hover:bg-sunken transition-colors cursor-pointer disabled:cursor-wait"
                    data-testid={`doc-start-open-${d.id}`}
                  >
                    <span className="flex-1 min-w-0 truncate font-serif text-[16px] text-ink-strong">
                      {d.title || 'Untitled document'}
                    </span>
                    <span className="font-mono text-[10px] text-muted shrink-0">
                      {d.wordCount} words · {formatUpdated(d.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
