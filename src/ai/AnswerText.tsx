/**
 * AI text with citations: light Markdown (as idea notes use) where
 * `[[idea:<id>]]` and `[[doc:<id>#<block>]]` markers become chips that jump
 * to the idea on the canvas or the passage in its document.
 *
 * Rendered as React elements, never as HTML, so nothing in an answer can
 * inject markup.
 */

import { Fragment } from 'react';
import type { ReactNode } from 'react';

import { useCanvasStore } from '../data';
import type { NodeType } from '../data';
import { parseSourceMarker } from '../lib/ai/citations';
import type { AiSource } from '../lib/ai/contracts';
import { parseMarkdown } from '../lib/markdown';
import type { Inline } from '../lib/markdown';

export interface SourceNavigation {
  readonly onIdea: (ideaId: string) => void;
  readonly onPassage: (documentId: string, blockId: string | null) => void;
  /** A document's title, or null when it no longer exists. */
  readonly documentTitle: (documentId: string) => string | null;
}

const TYPE_DOT: Record<NodeType, string> = {
  topic: 'bg-topic',
  finding: 'bg-finding',
  question: 'bg-question',
  conclusion: 'bg-conclusion',
};

const MARKER = /\[\[((?:idea|doc):[^\]]+)\]\]/g;

/** A chip for one source; shows what it points at, or that it is gone. */
export function SourceChip({ source, nav }: { readonly source: AiSource; readonly nav: SourceNavigation }): JSX.Element {
  const idea = useCanvasStore((s) =>
    source.kind === 'idea' ? s.canvas.nodes.find((n) => n.id === source.ideaId) ?? null : null,
  );
  if (source.kind === 'idea') {
    if (!idea) return <span className="ai-chip ai-chip-gone">deleted idea</span>;
    return (
      <button
        type="button"
        className="ai-chip"
        onClick={() => nav.onIdea(idea.id)}
        title={`Show “${idea.title || 'Untitled idea'}” on the canvas`}
        data-testid="ai-source-idea"
      >
        <span className={`ai-chip-dot ${TYPE_DOT[idea.type]}`} aria-hidden="true" />
        {idea.title || 'Untitled idea'}
      </button>
    );
  }
  const title = nav.documentTitle(source.documentId);
  if (title === null) return <span className="ai-chip ai-chip-gone">deleted document</span>;
  return (
    <button
      type="button"
      className="ai-chip"
      onClick={() => nav.onPassage(source.documentId, source.blockId)}
      title={`Open “${title || 'Untitled document'}” at this passage`}
      data-testid="ai-source-doc"
    >
      <span aria-hidden="true">§</span>
      {title || 'Untitled document'}
    </button>
  );
}

function renderRuns(runs: readonly Inline[], nav: SourceNavigation, key: string): ReactNode[] {
  return runs.map((run, i) => {
    const parts: ReactNode[] = [];
    let last = 0;
    for (const m of run.text.matchAll(MARKER)) {
      if (m.index! > last) parts.push(run.text.slice(last, m.index));
      const source = parseSourceMarker(m[1]!);
      if (source) parts.push(<SourceChip key={`${key}-${i}-${m.index}`} source={source} nav={nav} />);
      last = m.index! + m[0].length;
    }
    if (last < run.text.length) parts.push(run.text.slice(last));
    let node: ReactNode = <>{parts}</>;
    if (run.code) node = <code className="md-code">{node}</code>;
    if (run.bold) node = <strong className="font-semibold text-ink-strong">{node}</strong>;
    if (run.italic) node = <em>{node}</em>;
    if (run.strike) node = <s>{node}</s>;
    if (run.href) {
      node = (
        <a href={run.href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline underline-offset-2">
          {node}
        </a>
      );
    }
    return <Fragment key={`${key}-${i}`}>{node}</Fragment>;
  });
}

export function AnswerText({ text, nav }: { readonly text: string; readonly nav: SourceNavigation }): JSX.Element {
  const blocks = parseMarkdown(text);
  return (
    <div className="md-text ai-answer">
      {blocks.map((block, b) => {
        if (block.kind === 'heading') {
          return (
            <p key={b} className="font-semibold text-ink-strong">
              {renderRuns(block.inlines, nav, `h${b}`)}
            </p>
          );
        }
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={b} className={block.ordered ? 'md-ol' : 'md-ul'}>
              {block.items.map((item, i) => (
                <li key={i}>{renderRuns(item, nav, `l${b}-${i}`)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={b}>
            {block.lines.map((line, l) => (
              <Fragment key={l}>
                {l > 0 && <br />}
                {renderRuns(line, nav, `p${b}-${l}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
