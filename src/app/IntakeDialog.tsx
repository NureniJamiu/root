/**
 * The new-project intake (M0 plan D10, product-decisions §3 "C then B"): one
 * question about where the researcher is, at most one follow-up, then the
 * workspace. It only seeds state; it is skippable and can be run again.
 */
import { useEffect, useRef, useState } from 'react';

import type { IntakeAnswer } from '../data';
import { Button } from '../ui/Button';

export interface IntakeResult {
  readonly answer: IntakeAnswer;
  /** The topic (has-topic), or pasted objectives and questions (objectives-drafted). */
  readonly text?: string;
}

export interface IntakeDialogProps {
  readonly onComplete: (result: IntakeResult) => void;
  /** Close without answering: a blank canvas, nothing seeded. */
  readonly onSkip: () => void;
  /** Whether AI can turn pasted objectives into suggested cards. */
  readonly aiAvailable: boolean;
  /** Run again on an existing project, rather than for a new one. */
  readonly rerun?: boolean;
}

const OPTIONS: ReadonlyArray<{ readonly answer: IntakeAnswer; readonly label: string; readonly hint: string }> = [
  { answer: 'no-topic', label: 'I don’t have a topic yet', hint: 'Start by exploring what to research.' },
  { answer: 'has-topic', label: 'I have a topic', hint: 'Frame the problem, objectives and questions.' },
  {
    answer: 'objectives-drafted',
    label: 'My topic is approved and I’ve drafted objectives',
    hint: 'Bring in your objectives and research questions.',
  },
  { answer: 'collected-data', label: 'I’ve collected data', hint: 'Record what you found and connect it.' },
  { answer: 'writing-up', label: 'I’m writing up', hint: 'Turn the structure into your document.' },
];

const TITLES: Partial<Record<IntakeAnswer, string>> = {
  'has-topic': 'What is your topic?',
  'objectives-drafted': 'Paste your objectives or questions',
};

export function IntakeDialog({ onComplete, onSkip, aiAvailable, rerun = false }: IntakeDialogProps): JSX.Element {
  const [answer, setAnswer] = useState<IntakeAnswer | null>(null);
  const [text, setText] = useState('');
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  useEffect(() => {
    if (answer) fieldRef.current?.focus();
  }, [answer]);

  const choose = (next: IntakeAnswer): void => {
    // Only two answers need a follow-up; the rest open the workspace at once.
    if (next === 'has-topic' || (next === 'objectives-drafted' && aiAvailable)) setAnswer(next);
    else onComplete({ answer: next });
  };

  const finish = (): void => {
    if (!answer) return;
    const clean = text.trim();
    onComplete(clean ? { answer, text: clean } : { answer });
  };

  const field =
    'w-full bg-panel text-ink border border-rule-strong rounded-[3px] outline-none px-3 py-2 font-serif text-[14px] focus:border-topic';

  return (
    <div
      className="root-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onSkip();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="intake-title"
        className="root-modal-panel w-[480px] max-w-full bg-panel text-ink border border-rule-2 rounded-[4px] p-6 flex flex-col gap-4"
        data-testid="intake"
      >
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
            {rerun ? 'Starting point' : 'New project'}
          </span>
          <h2 id="intake-title" className="m-0 font-serif text-[22px] font-light text-ink-strong">
            {(answer && TITLES[answer]) ?? 'Where are you with this research?'}
          </h2>
        </div>

        {answer === null && (
          <ul className="m-0 p-0 list-none flex flex-col gap-1.5">
            {OPTIONS.map((o) => (
              <li key={o.answer}>
                <button
                  type="button"
                  onClick={() => choose(o.answer)}
                  className="w-full text-left px-3 py-2.5 border border-rule-2 rounded-[3px] bg-panel hover:border-topic hover:bg-sunken cursor-pointer flex flex-col gap-0.5"
                  data-testid={`intake-${o.answer}`}
                >
                  <span className="font-serif text-[14px] text-ink-strong">{o.label}</span>
                  <span className="font-serif text-[12.5px] text-ink-3">{o.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {answer === 'has-topic' && (
          <input
            ref={(el) => {
              fieldRef.current = el;
            }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) finish();
            }}
            maxLength={200}
            placeholder="For example: how remote work affects team trust"
            className={field}
            data-testid="intake-topic"
          />
        )}

        {answer === 'objectives-drafted' && (
          <>
            <textarea
              ref={(el) => {
                fieldRef.current = el;
              }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              maxLength={8000}
              placeholder="Paste your aim, objectives, research questions or hypotheses."
              className={`${field} resize-y`}
              data-testid="intake-objectives"
            />
            <p className="m-0 font-serif text-[12.5px] leading-[18px] text-ink-3">
              AI suggests cards from what you paste. Nothing is added until you choose which to keep. You can leave
              this empty and add them yourself.
            </p>
          </>
        )}

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={answer === null ? onSkip : () => setAnswer(null)}
            className="bg-transparent border-0 p-0 font-mono text-[11px] text-ink-3 hover:text-ink-strong cursor-pointer"
            data-testid={answer === null ? 'intake-skip' : 'intake-back'}
          >
            {answer === null ? (rerun ? 'Keep things as they are' : 'Start with a blank canvas') : 'Back'}
          </button>
          {answer !== null && (
            <Button
              size="sm"
              variant="cobalt"
              onClick={finish}
              disabled={answer === 'has-topic' && !text.trim()}
              data-testid="intake-continue"
            >
              Continue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
