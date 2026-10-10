/**
 * `MarkdownText` — renders an idea's notes with light formatting.
 *
 * The notes stay a plain Markdown string in the data model; `parseMarkdown`
 * turns them into a small tree that is rendered here as React elements (never
 * as HTML), so nothing in a note can inject markup.
 */

import { Fragment, memo, useMemo } from 'react';
import type { ReactNode } from 'react';

import { parseMarkdown } from '../lib/markdown';
import type { Inline } from '../lib/markdown';

function renderInline(runs: readonly Inline[], keyPrefix: string): ReactNode[] {
  return runs.map((run, i) => {
    let node: ReactNode = run.text;
    if (run.code) node = <code className="md-code">{node}</code>;
    if (run.bold) node = <strong className="font-semibold text-ink-strong">{node}</strong>;
    if (run.italic) node = <em>{node}</em>;
    if (run.strike) node = <s>{node}</s>;
    if (run.href) {
      node = (
        <a
          href={run.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-accent underline underline-offset-2"
          // A link inside a card must not start a drag or select the card.
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {node}
        </a>
      );
    }
    return <Fragment key={`${keyPrefix}-${i}`}>{node}</Fragment>;
  });
}

export interface MarkdownTextProps {
  readonly source: string;
  readonly className?: string;
  readonly testId?: string;
}

function MarkdownTextImpl({ source, className, testId }: MarkdownTextProps): JSX.Element {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div className={`md-text ${className ?? ''}`} data-testid={testId}>
      {blocks.map((block, b) => {
        if (block.kind === 'heading') {
          return (
            <p key={b} className="md-heading font-semibold text-ink-strong">
              {renderInline(block.inlines, `h${b}`)}
            </p>
          );
        }
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={b} className={block.ordered ? 'md-ol' : 'md-ul'}>
              {block.items.map((item, i) => (
                <li key={i}>{renderInline(item, `l${b}-${i}`)}</li>
              ))}
            </List>
          );
        }
        return (
          <p key={b}>
            {block.lines.map((line, l) => (
              <Fragment key={l}>
                {l > 0 && (
                  <>
                    {'\n'}
                    <br />
                  </>
                )}
                {renderInline(line, `p${b}-${l}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

export const MarkdownText = memo(MarkdownTextImpl);
