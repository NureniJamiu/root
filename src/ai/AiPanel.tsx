/**
 * The AI side panel: Ask your project, Gap check and Tidy suggestions.
 *
 * Kept mounted while hidden so a conversation survives closing the panel;
 * the app gives it a fresh `key` per project, so nothing carries over from
 * one project to another.
 */

import { useEffect, useRef, useState } from 'react';

import { canvasActions, useCanvasStore } from '../data';
import type { NodePatch, UUID } from '../data';
import type { ReviewIssue, ReviewKind, TidySuggestion } from '../lib/ai/contracts';
import { FEATURE_LABELS, cheapestPlanFor, PLAN_DEFINITIONS } from '../lib/ai/plans';
import type { Feature } from '../lib/ai/plans';
import { Button } from '../ui/Button';
import { aiConfigActions, useAiFeature } from './aiConfig';
import { AnswerText, SourceChip } from './AnswerText';
import type { SourceNavigation } from './AnswerText';
import { AiRequestError, aiApi } from './api';
import { toPromptCanvas } from './promptCanvas';

export type AiPanelTab = 'ask' | 'review' | 'tidy';

const TABS: ReadonlyArray<{ id: AiPanelTab; label: string }> = [
  { id: 'ask', label: 'Ask' },
  { id: 'review', label: 'Gap check' },
  { id: 'tidy', label: 'Tidy' },
];

export interface AiPanelProps {
  readonly projectId: string;
  readonly open: boolean;
  readonly tab: AiPanelTab;
  readonly onTabChange: (tab: AiPanelTab) => void;
  readonly onClose: () => void;
  readonly nav: SourceNavigation;
}

function errorMessage(error: unknown): string | null {
  if (error instanceof AiRequestError) return error.code === 'aborted' ? null : error.message;
  return 'The AI request failed.';
}

export function AiPanel({ projectId, open, tab, onTabChange, onClose, nav }: AiPanelProps): JSX.Element {
  return (
    <aside
      className={`absolute top-0 right-0 bottom-0 z-30 w-[400px] max-w-full bg-panel border-l border-rule-strong flex flex-col ${
        open ? '' : 'hidden'
      }`}
      style={{ boxShadow: '-10px 0 28px rgb(var(--shadow) / 0.10)' }}
      aria-label="AI"
      aria-hidden={!open}
      data-testid="ai-panel"
    >
      <div className="flex items-center gap-1 px-3 h-11 border-b border-rule shrink-0">
        <div role="tablist" aria-label="AI tools" className="flex gap-1 flex-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTabChange(t.id)}
              className={`h-7 px-2.5 rounded-[2px] font-mono text-[11px] cursor-pointer transition-colors ${
                tab === t.id ? 'bg-sunken-2 text-ink-strong' : 'text-muted hover:text-ink-strong'
              }`}
              data-testid={`ai-tab-${t.id}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close AI panel" data-testid="ai-panel-close">
          Close
        </Button>
      </div>
      <div className={`flex-1 min-h-0 flex flex-col ${tab === 'ask' ? '' : 'hidden'}`}>
        <AskTab projectId={projectId} nav={nav} active={open && tab === 'ask'} />
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto ${tab === 'review' ? '' : 'hidden'}`}>
        <ReviewTab projectId={projectId} nav={nav} />
      </div>
      <div className={`flex-1 min-h-0 overflow-y-auto ${tab === 'tidy' ? '' : 'hidden'}`}>
        <TidyTab />
      </div>
    </aside>
  );
}

/** "Gap check is part of the Pro plan." */
function UpgradeNote({ feature }: { readonly feature: Feature }): JSX.Element {
  const plan = cheapestPlanFor(feature);
  return (
    <p className="m-0 font-serif text-[13px] leading-[19px] text-ink-read" data-testid="ai-upgrade-note">
      {FEATURE_LABELS[feature]} is part of the {plan ? PLAN_DEFINITIONS[plan].label : 'a paid'} plan.
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Ask                                                                        */
/* -------------------------------------------------------------------------- */

interface Turn {
  readonly question: string;
  readonly answer: string;
  readonly status: 'streaming' | 'done' | 'error' | 'stopped';
  readonly error?: string;
  readonly model?: string | null;
  readonly search?: string | null;
}

const SEARCH_NOTES: Record<string, string> = {
  whole: 'read the whole project',
  meaning: 'searched the project by meaning',
  words: 'searched the project by words',
};

function AskTab({
  projectId,
  nav,
  active,
}: {
  readonly projectId: string;
  readonly nav: SourceNavigation;
  readonly active: boolean;
}): JSX.Element {
  const allowed = useAiFeature('ai.ask');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const controller = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const busy = turns.at(-1)?.status === 'streaming';

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (active) inputRef.current?.focus();
  }, [active]);
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [turns]);

  const update = (patch: Partial<Turn>): void =>
    setTurns((all) => [...all.slice(0, -1), { ...all.at(-1)!, ...patch }]);

  const ask = async (): Promise<void> => {
    const clean = question.trim();
    if (!clean || busy) return;
    const history = turns
      .filter((t) => t.status === 'done')
      .map((t) => ({ question: t.question.slice(0, 2_000), answer: t.answer.slice(0, 8_000) }));
    setQuestion('');
    setTurns((all) => [...all, { question: clean, answer: '', status: 'streaming' }]);
    controller.current = new AbortController();
    try {
      const res = await aiApi.ask({ projectId, question: clean, history: history.slice(-10) }, (text) => update({ answer: text }), controller.current.signal);
      update({ answer: res.text, status: 'done', model: res.model, search: res.search });
    } catch (error) {
      const message = errorMessage(error);
      update(message ? { status: 'error', error: message } : { status: 'stopped' });
    } finally {
      controller.current = null;
      void aiConfigActions.load(true);
    }
  };

  if (!allowed) {
    return (
      <div className="p-4">
        <UpgradeNote feature="ai.ask" />
      </div>
    );
  }

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-4" data-testid="ai-ask-turns">
        {turns.length === 0 && (
          <div className="flex flex-col gap-2 font-serif text-[13px] leading-[19px] text-ink-read">
            <p className="m-0">
              Ask anything about this project. Answers come only from your ideas and documents, and cite them, so you
              can check every claim.
            </p>
            <p className="m-0 text-ink-3">
              For example: “What evidence supports my main conclusion?” or “Which questions are still open?”
            </p>
          </div>
        )}
        {turns.map((turn, i) => (
          <div key={i} className="flex flex-col gap-1.5" data-testid="ai-ask-turn">
            <p className="m-0 self-end max-w-[85%] px-2.5 py-1.5 rounded-[3px] bg-sunken font-serif text-[13px] text-ink-strong whitespace-pre-wrap">
              {turn.question}
            </p>
            {turn.answer && (
              <div className="font-serif text-[13.5px] leading-[20px] text-ink" data-testid="ai-ask-answer">
                <AnswerText text={turn.answer} nav={nav} />
              </div>
            )}
            {turn.status === 'streaming' && !turn.answer && (
              <span className="font-mono text-[10px] text-muted animate-pulse">Reading the project…</span>
            )}
            {turn.status === 'error' && (
              <p className="m-0 font-serif text-[13px] text-question" role="alert">
                {turn.error}
              </p>
            )}
            {turn.status === 'stopped' && <span className="font-mono text-[10px] text-muted">Stopped.</span>}
            {turn.status === 'done' && (turn.model || turn.search) && (
              <span className="font-mono text-[10px] text-muted">
                {[turn.model, turn.search ? SEARCH_NOTES[turn.search] : null].filter(Boolean).join(' · ')}
              </span>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form
        className="shrink-0 border-t border-rule p-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <textarea
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void ask();
            }
          }}
          maxLength={2_000}
          rows={2}
          placeholder="Ask about this project…"
          aria-label="Question"
          className="w-full resize-none px-2 py-1.5 rounded-[2px] border border-rule bg-paper font-serif text-[13px] text-ink-strong focus:outline-none focus:border-accent select-text"
          data-testid="ai-ask-input"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || turns.length === 0}
            onClick={() => setTurns([])}
            data-testid="ai-ask-clear"
          >
            New conversation
          </Button>
          {busy ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => controller.current?.abort()} data-testid="ai-ask-stop">
              Stop
            </Button>
          ) : (
            <Button type="submit" size="sm" variant="cobalt" disabled={!question.trim()} data-testid="ai-ask-submit">
              Ask
            </Button>
          )}
        </div>
      </form>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Gap check                                                                  */
/* -------------------------------------------------------------------------- */

const KIND_LABELS: Record<ReviewKind, string> = {
  unsupported: 'Unsupported',
  uncited: 'Uncited claim',
  contradiction: 'Contradiction',
  gap: 'Gap',
};

function ReviewTab({ projectId, nav }: { readonly projectId: string; readonly nav: SourceNavigation }): JSX.Element {
  const allowed = useAiFeature('ai.review');
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'busy' }
    | { status: 'done'; issues: ReviewIssue[]; model: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const run = async (): Promise<void> => {
    controller.current = new AbortController();
    setState({ status: 'busy' });
    try {
      const res = await aiApi.review(projectId, controller.current.signal);
      aiConfigActions.setAllowance(res.allowance);
      setState({ status: 'done', issues: res.issues, model: res.model.label });
    } catch (error) {
      const message = errorMessage(error);
      setState(message ? { status: 'error', message } : { status: 'idle' });
    } finally {
      controller.current = null;
    }
  };

  return (
    <div className="p-4 flex flex-col gap-3" data-testid="ai-review">
      <p className="m-0 font-serif text-[13px] leading-[19px] text-ink-read">
        Looks for conclusions without findings, claims in your documents that cite nothing, ideas that contradict each
        other, and obvious gaps.
      </p>
      {!allowed ? (
        <UpgradeNote feature="ai.review" />
      ) : (
        <div className="flex gap-2">
          <Button size="sm" variant="cobalt" disabled={state.status === 'busy'} onClick={() => void run()} data-testid="ai-review-run">
            {state.status === 'busy' ? 'Checking…' : state.status === 'done' ? 'Check again' : 'Check this project'}
          </Button>
          {state.status === 'busy' && (
            <Button size="sm" variant="ghost" onClick={() => controller.current?.abort()}>
              Stop
            </Button>
          )}
        </div>
      )}
      {state.status === 'error' && (
        <p className="m-0 font-serif text-[13px] text-question" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'done' && state.issues.length === 0 && (
        <p className="m-0 font-serif text-[13px] text-ink">No weak spots found.</p>
      )}
      {state.status === 'done' && state.issues.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-col gap-2.5" data-testid="ai-review-issues">
          {state.issues.map((issue, i) => (
            <li key={i} className="flex flex-col gap-1 p-2.5 rounded-[2px] border border-rule" data-testid="ai-review-issue">
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                {KIND_LABELS[issue.kind]}
                {issue.rule ? ' · rule' : ''}
              </span>
              <span className="font-serif text-[13px] leading-[19px] text-ink-strong">{issue.message}</span>
              {issue.suggestion && <span className="font-serif text-[12.5px] leading-[18px] text-ink-3">{issue.suggestion}</span>}
              {issue.sources.length > 0 && (
                <span className="flex flex-wrap gap-y-1 -mx-0.5">
                  {issue.sources.map((source, j) => (
                    <SourceChip key={j} source={source} nav={nav} />
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {state.status === 'done' && <span className="font-mono text-[10px] text-muted">{state.model}</span>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Tidy                                                                       */
/* -------------------------------------------------------------------------- */

function describeTidy(s: TidySuggestion, titleOf: (id: UUID) => string | null): string | null {
  if (s.kind === 'connect') {
    const a = titleOf(s.sourceId);
    const b = titleOf(s.targetId);
    return a !== null && b !== null ? `Connect “${a}” → “${b}”` : null;
  }
  const t = titleOf(s.ideaId);
  if (t === null) return null;
  return s.kind === 'retype' ? `Make “${t}” a ${s.type}` : `Rename “${t}” to “${s.title}”`;
}

function TidyTab(): JSX.Element {
  const allowed = useAiFeature('ai.tidy');
  const nodes = useCanvasStore((s) => s.canvas.nodes);
  const [state, setState] = useState<
    | { status: 'idle' }
    | { status: 'busy' }
    | { status: 'done'; suggestions: TidySuggestion[]; model: string }
    | { status: 'applied'; count: number }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const titleOf = (id: UUID): string | null => {
    const node = nodes.find((n) => n.id === id);
    return node ? node.title || 'Untitled idea' : null;
  };

  const run = async (): Promise<void> => {
    controller.current = new AbortController();
    setState({ status: 'busy' });
    setSkipped(new Set());
    try {
      const res = await aiApi.tidy({ canvas: toPromptCanvas(useCanvasStore.getState().canvas) }, controller.current.signal);
      aiConfigActions.setAllowance(res.allowance);
      setState({ status: 'done', suggestions: res.suggestions, model: res.model.label });
    } catch (error) {
      const message = errorMessage(error);
      setState(message ? { status: 'error', message } : { status: 'idle' });
    } finally {
      controller.current = null;
    }
  };

  const shown = state.status === 'done' ? state.suggestions.map((s, i) => ({ s, i, text: describeTidy(s, titleOf) })).filter((x) => x.text !== null) : [];
  const chosen = shown.filter((x) => !skipped.has(x.i));

  const apply = (): void => {
    const updates: Array<{ id: UUID; patch: NodePatch }> = [];
    const connections: Array<{ source: UUID; target: UUID }> = [];
    for (const { s } of chosen) {
      if (s.kind === 'connect') connections.push({ source: s.sourceId, target: s.targetId });
      else if (s.kind === 'retype') updates.push({ id: s.ideaId, patch: { type: s.type } });
      else updates.push({ id: s.ideaId, patch: { title: s.title } });
    }
    const count = canvasActions.applyEdits({ updates, connections });
    aiApi.feedback({ feature: 'ai.tidy', offered: Math.min(shown.length, 100), accepted: Math.min(count, 100) });
    setState({ status: 'applied', count });
  };

  const dismiss = (): void => {
    aiApi.feedback({ feature: 'ai.tidy', offered: Math.min(shown.length, 100), accepted: 0 });
    setState({ status: 'idle' });
  };

  return (
    <div className="p-4 flex flex-col gap-3" data-testid="ai-tidy">
      <p className="m-0 font-serif text-[13px] leading-[19px] text-ink-read">
        Suggests better types and titles for your ideas and connectors that are missing. Nothing changes until you
        apply it, and it all undoes in one step.
      </p>
      {!allowed ? (
        <UpgradeNote feature="ai.tidy" />
      ) : (
        state.status !== 'done' && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="cobalt"
              disabled={state.status === 'busy' || nodes.length === 0}
              onClick={() => void run()}
              data-testid="ai-tidy-run"
            >
              {state.status === 'busy' ? 'Looking…' : 'Suggest tidying'}
            </Button>
            {state.status === 'busy' && (
              <Button size="sm" variant="ghost" onClick={() => controller.current?.abort()}>
                Stop
              </Button>
            )}
          </div>
        )
      )}
      {state.status === 'error' && (
        <p className="m-0 font-serif text-[13px] text-question" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'applied' && (
        <p className="m-0 font-serif text-[13px] text-ink" role="status">
          Applied {state.count} {state.count === 1 ? 'change' : 'changes'}. Undo with Ctrl+Z (⌘Z on a Mac).
        </p>
      )}
      {state.status === 'done' && shown.length === 0 && (
        <>
          <p className="m-0 font-serif text-[13px] text-ink">Your canvas already looks tidy.</p>
          <Button size="sm" variant="secondary" onClick={() => setState({ status: 'idle' })}>
            OK
          </Button>
        </>
      )}
      {state.status === 'done' && shown.length > 0 && (
        <>
          <ul className="m-0 p-0 list-none flex flex-col gap-2" data-testid="ai-tidy-suggestions">
            {shown.map(({ s, i, text }) => (
              <li key={i}>
                <label className="flex items-start gap-2 p-2 rounded-[2px] border border-rule cursor-pointer hover:border-ink">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={!skipped.has(i)}
                    onChange={() =>
                      setSkipped((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-serif text-[13px] leading-[19px] text-ink-strong">{text}</span>
                    {s.reason && <span className="font-serif text-[12px] leading-[17px] text-ink-3">{s.reason}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="cobalt" disabled={chosen.length === 0} onClick={apply} data-testid="ai-tidy-apply">
              Apply {chosen.length}
            </Button>
            <Button size="sm" variant="ghost" onClick={dismiss} data-testid="ai-tidy-dismiss">
              Dismiss
            </Button>
            <span className="ml-auto font-mono text-[10px] text-muted">{state.model}</span>
          </div>
        </>
      )}
    </div>
  );
}
