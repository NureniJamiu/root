/**
 * The document pane shown in the product film and the "How it works" story
 * when the map gets written up: a title, a section, a paragraph that cites
 * an idea through the @ menu, an idea card dragged in from the canvas, and
 * a sentence turned into a new idea (shown here as becoming a chip in
 * place). Drawn after the app's document editor
 * (toolbar, serif page, idea chips and embedded cards). Everything it shows
 * comes from `DocState`, so the script decides what is written when.
 */

import { withAlpha } from './motion';
import { TYPE_COLOR } from './SceneCanvas';
import type { IdeaType } from './SceneCanvas';

export const DOC_W = 420;

export interface DocIdea {
  readonly type: IdeaType;
  readonly title: string;
}

export interface DocContent {
  /** The canvas the document belongs to, shown under the title. */
  readonly canvas: string;
  readonly title: string;
  readonly heading: string;
  /** Paragraph text before the citation. */
  readonly before: string;
  /** What is typed after `@` to find the idea. */
  readonly query: string;
  readonly cite: DocIdea;
  /** Other matches listed under the cited idea in the @ menu. */
  readonly others: readonly DocIdea[];
  /** Paragraph text after the citation. */
  readonly after: string;
  /** The card dragged in from the canvas. */
  readonly card: DocIdea & { readonly note: string };
  /** A sentence written below the card, then made into an idea. */
  readonly next?: string;
}

export interface DocState {
  /** 0 = off stage, 1 = docked. */
  readonly slide: number;
  readonly saving: boolean;
  readonly titleChars: number;
  readonly headingChars: number;
  readonly beforeChars: number;
  /** Characters of `@` + query typed. */
  readonly queryChars: number;
  /** The @ menu, 0..1. */
  readonly menu: number;
  /** The citation chip, 0..1; replaces the typed query. */
  readonly cite: number;
  readonly afterChars: number;
  /** Where the caret blinks. */
  readonly caret: 'title' | 'heading' | 'body' | 'next' | null;
  /** The drop line shown while a card is dragged over the page, 0..1. */
  readonly dropLine: number;
  /** The embedded card, 0..1. */
  readonly card: number;
  readonly nextChars: number;
  /** How much of `next` is selected, from its end, 0..1. */
  readonly select: number;
  /** The selection bubble, 0..1. */
  readonly bubble: number;
  /** The chip of the idea made from the selection, 0..1. */
  readonly made: number;
}

export const DOC_CLOSED: DocState = {
  slide: 0,
  saving: false,
  titleChars: 0,
  headingChars: 0,
  beforeChars: 0,
  queryChars: 0,
  menu: 0,
  cite: 0,
  afterChars: 0,
  caret: null,
  dropLine: 0,
  card: 0,
  nextChars: 0,
  select: 0,
  bubble: 0,
  made: 0,
};

const TYPE_LABEL: Readonly<Record<IdeaType, string>> = {
  topic: 'Topic',
  finding: 'Finding',
  question: 'Question',
  conclusion: 'Conclusion',
};

const words = (text: string): number => text.split(/\s+/).filter(Boolean).length;

function Caret({ on }: { readonly on: boolean }): JSX.Element | null {
  return on ? <span className="lp-caret" /> : null;
}

/** An idea cited inline, after the editor's `.idea-ref`. */
function Chip({ idea, p }: { readonly idea: DocIdea; readonly p: number }): JSX.Element {
  const color = TYPE_COLOR[idea.type];
  return (
    <span
      className="inline-flex items-baseline gap-1 px-[4px] rounded-[2px] text-ink-strong"
      style={{
        background: withAlpha(color, 0.1 + 0.12 * (1 - p)),
        borderBottom: `1px solid ${withAlpha(color, 0.6)}`,
        opacity: 0.3 + 0.7 * p,
      }}
    >
      <span
        className="inline-block shrink-0 rounded-full"
        style={{ width: 5, height: 5, background: color, transform: 'translateY(-1px)' }}
      />
      {idea.title}
    </span>
  );
}

const TOOLS: readonly string[] = ['B', 'I', 'U', '|', 'H2', '•', '1.', '“', '|', '@', '▣'];

interface FilmDocumentProps {
  readonly state: DocState;
  readonly content: DocContent;
  readonly width?: number;
}

export function FilmDocument({ state, content, width = DOC_W }: FilmDocumentProps): JSX.Element | null {
  if (state.slide <= 0) return null;
  const title = content.title.slice(0, state.titleChars);
  const heading = content.heading.slice(0, state.headingChars);
  const before = content.before.slice(0, state.beforeChars);
  const query = `@${content.query}`.slice(0, state.queryChars);
  const after = content.after.slice(0, state.afterChars);
  const next = (content.next ?? '').slice(0, state.nextChars);
  const selected = Math.round(next.length * state.select);
  const cited = state.cite > 0;
  const written = [title, heading, before, cited ? content.cite.title : query, after, state.card >= 1 ? content.card.title : '', next];
  const wordCount = words(written.join(' '));
  const citations = (cited ? 1 : 0) + (state.card >= 1 ? 1 : 0) + (state.made > 0.5 ? 1 : 0);
  const cardColor = TYPE_COLOR[content.card.type];

  return (
    <div
      className="absolute top-0 right-0 h-full bg-panel border-l border-ink flex flex-col"
      style={{
        width,
        transform: `translateX(${(1 - state.slide) * (width + 24)}px)`,
        boxShadow: `-18px 0 40px -24px rgb(var(--shadow) / ${0.35 * state.slide})`,
      }}
    >
      {/* Header */}
      <div className="h-10 shrink-0 px-4 flex items-center justify-between border-b border-rule">
        <span className="font-mono text-[10.5px] font-medium tracking-[0.04em] uppercase text-ink">Document · Draft</span>
        <div className="flex items-center gap-3 font-mono text-[9px] text-muted">
          <span className="tabular-nums">{wordCount} words</span>
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${state.saving ? 'bg-muted' : 'bg-accent'}`} />
            {state.saving ? 'Saving…' : 'Saved'}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="h-8 shrink-0 px-3 flex items-center gap-0.5 border-b border-rule bg-paper" aria-hidden="true">
        {TOOLS.map((t, i) =>
          t === '|' ? (
            <span key={i} className="w-px h-3.5 mx-1 bg-rule-2" />
          ) : (
            <span
              key={i}
              className={`min-w-[20px] h-[20px] px-1 flex items-center justify-center rounded-[2px] font-mono text-[9.5px] ${
                t === '@' && state.menu > 0.5 ? 'bg-sunken-2 text-ink' : 'text-ink-2'
              }`}
            >
              {t}
            </span>
          ),
        )}
      </div>

      {/* Page */}
      <div className="relative flex-1 overflow-hidden px-7 pt-5 font-serif">
        <div className="text-[22px] font-medium leading-[1.2] tracking-[-0.01em] text-ink-strong min-h-[27px]">
          {title}
          <Caret on={state.caret === 'title'} />
          {title.length === 0 && state.caret !== 'title' && <span className="text-faint">Untitled document</span>}
        </div>
        <div className="mt-1.5 mb-4 font-mono text-[8.5px] uppercase tracking-[0.08em] text-faint">
          {content.canvas}
          {citations > 0 && ` · ${citations} ${citations === 1 ? 'idea' : 'ideas'} cited`}
        </div>

        {(heading.length > 0 || state.caret === 'heading') && (
          <div className="text-[16px] font-medium leading-tight text-ink-strong mb-2">
            {heading}
            <Caret on={state.caret === 'heading'} />
          </div>
        )}

        <div className="relative">
          {(before.length > 0 || state.caret === 'body') && (
            <p className="m-0 text-[13px] leading-[20px] text-ink">
              {before}
              {cited ? <Chip idea={content.cite} p={state.cite} /> : query && <span className="text-topic">{query}</span>}
              {cited && ' '}
              {after}
              <Caret on={state.caret === 'body'} />
            </p>
          )}

          {/* @ menu */}
          {state.menu > 0 && (
            <div
              className="absolute left-10 top-full mt-1.5 z-10 w-[236px] bg-panel border border-rule-strong rounded-[2px] overflow-hidden"
              style={{
                opacity: state.menu,
                transform: `translateY(${(1 - state.menu) * -6}px)`,
                boxShadow: '0 12px 32px rgb(var(--shadow) / 0.16)',
              }}
            >
              <div className="px-2.5 py-1.5 border-b border-rule font-mono text-[8.5px] uppercase tracking-[0.06em] text-muted">
                Cite an idea
              </div>
              <div className="p-1">
                {[content.cite, ...content.others].map((idea, i) => (
                  <div
                    key={idea.title}
                    className={`flex items-center gap-2 px-1.5 py-1 rounded-[2px] ${i === 0 ? 'bg-sunken-2' : ''}`}
                  >
                    <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: TYPE_COLOR[idea.type] }} />
                    <span className="flex-1 min-w-0 truncate text-[12.5px] text-ink">{idea.title}</span>
                    <span className="font-mono text-[8.5px] text-faint">{TYPE_LABEL[idea.type]}</span>
                  </div>
                ))}
              </div>
              <div className="px-2.5 py-1.5 border-t border-rule font-mono text-[8px] tracking-[0.04em] text-muted">
                Enter cites · Shift+Enter embeds the card
              </div>
            </div>
          )}
        </div>

        {/* The card dragged in from the canvas */}
        {(state.dropLine > 0 || state.card > 0) && (
          <div className="relative mt-3">
            {state.card <= 0 && (
              <div className="h-[2px] rounded-full bg-accent" style={{ opacity: state.dropLine }} />
            )}
            {state.card > 0 && (
              <div
                className="flex bg-panel border border-rule-2 rounded-[2px] overflow-hidden"
                style={{ opacity: state.card, transform: `translateY(${(1 - state.card) * 8}px)` }}
              >
                <div className="w-[3px] shrink-0" style={{ background: cardColor }} />
                <div className="flex-1 min-w-0 px-3 pt-2 pb-2.5">
                  <div className="font-mono text-[8.5px] uppercase tracking-[0.08em]" style={{ color: cardColor }}>
                    {TYPE_LABEL[content.card.type]}
                  </div>
                  <div
                    className={`text-[15px] leading-[1.25] text-ink-strong ${content.card.type === 'conclusion' ? 'italic' : ''}`}
                  >
                    {content.card.title}
                  </div>
                  <div className="mt-0.5 text-[11.5px] leading-[1.45] text-ink-2 line-clamp-2">{content.card.note}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* A sentence made into a new idea */}
        {(next.length > 0 || state.caret === 'next') && (
          <div className="relative mt-3">
            {state.bubble > 0 && state.made < 1 && (
              <div
                className="absolute left-0 bottom-full mb-1.5 z-10 flex items-center gap-0.5 p-[3px] bg-panel border border-rule-strong rounded-[2px]"
                style={{
                  opacity: state.bubble * (1 - state.made),
                  transform: `translateY(${(1 - state.bubble) * 4}px)`,
                  boxShadow: '0 8px 24px rgb(var(--shadow) / 0.14)',
                }}
              >
                {['B', 'I', '⌁'].map((t) => (
                  <span key={t} className="w-5 h-5 flex items-center justify-center font-mono text-[9.5px] text-ink-2">
                    {t}
                  </span>
                ))}
                <span className="h-5 px-2 flex items-center rounded-[2px] bg-accent text-on-accent font-mono text-[9.5px] whitespace-nowrap">
                  + Make idea
                </span>
              </div>
            )}
            <p className="m-0 text-[13px] leading-[20px] text-ink">
              {next.slice(0, next.length - selected)}
              {selected > 0 &&
                (state.made > 0 ? (
                  <Chip idea={{ type: 'finding', title: next.slice(next.length - selected) }} p={state.made} />
                ) : (
                  <span style={{ background: 'rgb(var(--accent) / 0.2)' }}>{next.slice(next.length - selected)}</span>
                ))}
              <Caret on={state.caret === 'next'} />
            </p>
          </div>
        )}

        {/* The empty line below, as the editor shows it */}
        {state.card >= 1 && state.caret !== 'next' && state.select <= 0 && (
          <p className="m-0 mt-3 text-[13px] leading-[20px] text-faint">Type / for blocks, @ to cite an idea</p>
        )}
      </div>
    </div>
  );
}
