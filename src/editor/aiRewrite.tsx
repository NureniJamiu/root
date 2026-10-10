/**
 * Rewriting selected document text with AI: improve, shorten, expand or
 * continue. The answer streams into a panel under the page; nothing changes
 * in the document until the person picks Replace or Insert below.
 *
 * Citations in the selection travel to the model as `[[<idea id>]]` markers
 * and come back as mentions, so a rewrite keeps its links to the canvas.
 */

import type { Editor, JSONContent } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { useEffect, useRef, useState } from 'react';

import { useCanvasStore } from '../data';
import type { RewriteAction } from '../lib/ai/contracts';

import { linkCitations } from './aiDraft';
import { useDocumentEditorServices } from './context';
import { IDEA_REF } from './links';

export const REWRITE_LABELS: Record<RewriteAction, string> = {
  improve: 'Improve',
  shorten: 'Shorten',
  expand: 'Expand',
  continue: 'Continue',
};

/** How much surrounding text goes with a request, for tone and continuity. */
const CONTEXT_CHARS = 1_500;

const leafText = (leaf: PMNode): string => (leaf.type.name === IDEA_REF ? `[[${String(leaf.attrs.id)}]]` : '');

export interface RewriteJob {
  readonly action: RewriteAction;
  readonly from: number;
  readonly to: number;
  /** The selection as sent, to check it is unchanged before replacing it. */
  readonly original: string;
}

/** Read the selection and its surroundings as the model sees them. */
export function readSelection(editor: Editor): { job: Omit<RewriteJob, 'action'>; before: string; after: string } | null {
  const { from, to } = editor.state.selection;
  const doc = editor.state.doc;
  const original = doc.textBetween(from, to, '\n\n', leafText).trim();
  if (!original) return null;
  return {
    job: { from, to, original },
    before: doc.textBetween(Math.max(0, from - CONTEXT_CHARS), from, '\n\n', leafText),
    after: doc.textBetween(to, Math.min(doc.content.size, to + CONTEXT_CHARS), '\n\n', leafText),
  };
}

/** Model text as document content: inline when it is one paragraph, paragraphs otherwise. */
export function rewriteToContent(text: string): { inline: boolean; content: JSONContent[] } {
  const byId = new Map(useCanvasStore.getState().canvas.nodes.map((n) => [n.id, n]));
  const paragraphs = text
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  const blocks = linkCitations(
    paragraphs.map((p) => ({ type: 'paragraph', content: [{ type: 'text', text: p }] })),
    byId,
  );
  if (blocks.length === 1) return { inline: true, content: blocks[0]!.content ?? [] };
  return { inline: false, content: blocks };
}

export interface AiRewritePanelProps {
  readonly editor: Editor;
  readonly job: RewriteJob;
  readonly before: string;
  readonly after: string;
  readonly onClose: () => void;
}

export function AiRewritePanel({ editor, job, before, after, onClose }: AiRewritePanelProps): JSX.Element {
  const services = useDocumentEditorServices();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<'writing' | 'done' | 'error'>('writing');
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!services.rewrite) {
      setStatus('error');
      setError('AI is not set up.');
      return undefined;
    }
    services
      .rewrite({ action: job.action, text: job.original, before, after }, setText, controller.signal)
      .then((full) => {
        setText(full);
        setStatus('done');
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'The AI request failed.');
      });
    return () => controller.abort();
    // One request per job: the context and services of the moment it started.
  }, [job]);

  const stillThere = (): boolean => {
    const size = editor.state.doc.content.size;
    if (job.to > size) return false;
    return editor.state.doc.textBetween(job.from, job.to, '\n\n', leafText).trim() === job.original;
  };

  const insertBelow = (): void => {
    const { content, inline } = rewriteToContent(text);
    const blocks = inline ? [{ type: 'paragraph', content }] : content;
    const doc = editor.state.doc;
    const at = doc.resolve(Math.min(job.to, doc.content.size));
    const pos = at.depth === 0 ? at.pos : at.after(1);
    editor.chain().focus().insertContentAt(pos, blocks).run();
    onClose();
  };

  const replace = (): void => {
    if (!stillThere()) {
      insertBelow();
      return;
    }
    const { content } = rewriteToContent(text);
    editor.chain().focus().insertContentAt({ from: job.from, to: job.to }, content).run();
    onClose();
  };

  const primaryIsInsert = job.action === 'continue';

  return (
    <div className="doc-ai-panel" role="region" aria-label="AI suggestion" data-testid="doc-ai-panel">
      <div className="doc-ai-panel-head">
        <span>
          ✦ {REWRITE_LABELS[job.action]}
          {status === 'writing' && <span className="doc-ai-panel-status"> · writing…</span>}
        </span>
        <button type="button" className="doc-ai-panel-close" onClick={onClose} aria-label="Discard suggestion">
          ✕
        </button>
      </div>
      {status === 'error' ? (
        <p className="doc-ai-panel-error" role="alert">
          {error}
        </p>
      ) : (
        <div className="doc-ai-panel-text" data-testid="doc-ai-text">
          {text || '…'}
        </div>
      )}
      <div className="doc-ai-panel-actions">
        {status === 'writing' ? (
          <button type="button" onClick={() => {
              controllerRef.current?.abort();
              setStatus('done');
            }} data-testid="doc-ai-stop">
            Stop
          </button>
        ) : status === 'done' && text.trim() ? (
          <>
            <button
              type="button"
              className="is-primary"
              onClick={primaryIsInsert ? insertBelow : replace}
              data-testid="doc-ai-apply"
            >
              {primaryIsInsert ? 'Insert below' : 'Replace'}
            </button>
            {!primaryIsInsert && (
              <button type="button" onClick={insertBelow} data-testid="doc-ai-insert">
                Insert below
              </button>
            )}
            <button type="button" onClick={onClose} data-testid="doc-ai-discard">
              Discard
            </button>
          </>
        ) : (
          <button type="button" onClick={onClose}>
            Close
          </button>
        )}
        <span className="doc-ai-panel-note">Check it before you keep it.</span>
      </div>
    </div>
  );
}
