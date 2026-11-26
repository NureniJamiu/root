/**
 * The post-intake view (product-decisions §4, M0 plan D10): the eight stages
 * as views over the canvas, the one in focus selected, the next steps for it
 * beside them, and the whole canvas one click away ("All stages").
 *
 * Stage state comes from `stageStates` (derived, never stored). Focusing a
 * stage dims the cards outside it; it never hides or moves anything.
 */
import { useState } from 'react';

import { STAGE_IDS, STAGES, stageStates, useCanvasStore } from '../data';
import type { NodeType, StageId, UUID } from '../data';
import { nextSteps } from './nextSteps';
import type { NextStepAction } from './nextSteps';

/** Short names for the stage list; the full name is the tooltip. */
const SHORT: Record<StageId, string> = {
  topic: 'Topic',
  problem: 'Problem',
  literature: 'Literature',
  framework: 'Framework',
  methodology: 'Methodology',
  data: 'Data',
  interpretation: 'Interpretation',
  documentation: 'Writing',
};

export interface StagePanelProps {
  /** The stage in focus, or null for all stages. */
  readonly focus: StageId | null;
  readonly onFocus: (stage: StageId | null) => void;
  readonly onAdd: (type: NodeType) => void;
  readonly onShow: (nodeId: UUID) => void;
  readonly onWrite: () => void;
  /** Run the intake again. */
  readonly onRerunIntake: () => void;
}

const MONO = 'font-mono text-[10px] uppercase tracking-[0.08em]';

export function StagePanel({ focus, onFocus, onAdd, onShow, onWrite, onRerunIntake }: StagePanelProps): JSX.Element {
  const canvas = useCanvasStore((s) => s.canvas);
  const [open, setOpen] = useState(true);
  const states = stageStates(canvas);
  const steps = nextSteps(canvas, focus);

  const run = (action: NextStepAction): void => {
    if (action.kind === 'add') onAdd(action.type);
    else if (action.kind === 'show') onShow(action.nodeId);
    else onWrite();
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`absolute top-3 left-3 z-10 h-7 px-2.5 bg-panel border border-rule rounded-[2px] text-ink-3 hover:text-ink-strong cursor-pointer ${MONO}`}
        data-testid="stage-panel-open"
      >
        Stages{focus ? ` · ${SHORT[focus]}` : ''}
      </button>
    );
  }

  return (
    <aside
      className="absolute top-3 left-3 z-10 w-[232px] max-h-[calc(100%-96px)] overflow-y-auto bg-panel border border-rule rounded-[3px] flex flex-col"
      style={{ boxShadow: '0 4px 16px rgb(var(--shadow) / 0.08)' }}
      aria-label="Research stages"
      data-testid="stage-panel"
    >
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
        <span className={`${MONO} text-ink-3`}>Research stages</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`bg-transparent border-0 p-0 text-ink-3 hover:text-ink-strong cursor-pointer ${MONO}`}
          data-testid="stage-panel-hide"
        >
          Hide
        </button>
      </div>

      <ol className="m-0 px-1.5 pb-1.5 list-none flex flex-col">
        {states.map((s) => {
          const selected = focus === s.stage;
          return (
            <li key={s.stage}>
              <button
                type="button"
                onClick={() => onFocus(s.stage)}
                aria-pressed={selected}
                title={STAGES[s.stage].label}
                className={`w-full flex items-center gap-2 px-1.5 h-7 rounded-[2px] border-0 cursor-pointer text-left ${
                  selected ? 'bg-sunken-2 text-ink-strong' : 'bg-transparent text-ink-read hover:bg-sunken'
                }`}
                data-testid={`stage-${s.stage}`}
                data-state={s.state}
              >
                <span className="font-mono text-[10px] text-ink-3 w-3 text-right">{STAGES[s.stage].order}</span>
                <span
                  aria-hidden="true"
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    s.state === 'in-progress' ? 'bg-topic' : 'border border-rule-strong'
                  }`}
                />
                <span className="flex-1 font-serif text-[13px]">{SHORT[s.stage]}</span>
                {s.issues.length > 0 && (
                  <span className="font-mono text-[10px] text-danger" data-testid={`stage-${s.stage}-issues`}>
                    {s.issues.length}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <span className="sr-only">
        {STAGE_IDS.length} stages; a filled dot means the stage has cards.
      </span>

      <div className="flex items-center justify-between px-3 pb-2.5">
        <button
          type="button"
          onClick={() => onFocus(null)}
          aria-pressed={focus === null}
          className={`bg-transparent border-0 p-0 cursor-pointer ${MONO} ${
            focus === null ? 'text-ink-strong' : 'text-topic hover:text-ink-strong'
          }`}
          data-testid="stage-all"
        >
          All stages
        </button>
        <button
          type="button"
          onClick={onRerunIntake}
          className={`bg-transparent border-0 p-0 text-ink-3 hover:text-ink-strong cursor-pointer ${MONO}`}
          data-testid="stage-rerun-intake"
        >
          Starting point
        </button>
      </div>

      <section className="border-t border-rule px-3 py-2.5 flex flex-col gap-2" data-testid="next-steps">
        <span className={`${MONO} text-ink-3`}>
          Next steps{focus ? ` · ${SHORT[focus]}` : ''}
        </span>
        {steps.length === 0 ? (
          <p className="m-0 font-serif text-[12.5px] leading-[18px] text-ink-3" data-testid="next-steps-empty">
            {focus ? 'Nothing to do in this stage for now.' : 'No checks need attention.'}
          </p>
        ) : (
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {steps.map((step) => (
              <li key={step.id} className="flex flex-col gap-1" data-testid={`next-step-${step.id}`}>
                <span className="font-serif text-[12.5px] leading-[18px] text-ink">{step.text}</span>
                {step.action && (
                  <button
                    type="button"
                    onClick={() => run(step.action!)}
                    className={`self-start bg-transparent border-0 p-0 text-topic hover:text-ink-strong cursor-pointer ${MONO}`}
                    data-testid={`next-step-${step.id}-action`}
                  >
                    {step.action.label}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
