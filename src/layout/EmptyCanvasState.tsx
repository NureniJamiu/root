import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Divider } from '../ui/Divider';
import { TextInput } from '../ui/TextInput';

export interface EmptyCanvasStateProps {
  readonly onCreateRoot: (premise?: string) => void;
}

const TEMPLATES = [
  {
    title: 'Hypothesis Tree',
    subtitle: 'Deductive Path',
    premise: 'Primary Hypothesis: Core Premise & Deductive Path',
  },
  {
    title: 'Literature Review',
    subtitle: 'Corpus Synthesis',
    premise: 'Systematic Literature Review: Corpus Synthesis',
  },
  {
    title: 'Protocol Assay',
    subtitle: 'Method Branches',
    premise: 'Experimental Protocol Assay & Methodology',
  },
] as const;

export function EmptyCanvasState({ onCreateRoot }: EmptyCanvasStateProps): JSX.Element {
  const [premise, setPremise] = useState('');

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    onCreateRoot(premise.trim() || undefined);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      data-testid="empty-canvas-affordance"
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 p-4"
    >
      <div
        className="pointer-events-auto w-full max-w-[540px] bg-[#ffffff] border border-[#c3c6d6] rounded-[2px] p-7 select-none"
        style={{ boxShadow: 'none' }}
      >
        {/* Stage & Sub-header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 font-mono text-[9px] font-medium tracking-[0.06em] uppercase text-[#0051c3]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#0051c3]" />
            Canvas Initializer • Root Node
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#737785]">
            STAGE-00
          </span>
        </div>

        {/* Headline */}
        <h2 className="font-serif text-[30px] font-light leading-[36px] tracking-[-0.01em] text-[#000000] m-0 mb-2">
          Initiate Research Tree
        </h2>

        {/* Narrative Description */}
        <p className="font-serif text-[13px] leading-[20px] text-[#404040] m-0 mb-6">
          Every scholarly inquiry begins with a foundational premise or core question. Establish the root topic to branch findings, hypotheses, and evidentiary conclusions.
        </p>

        {/* Input Premise Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="root-premise-input"
              className="font-mono text-[9px] uppercase font-medium tracking-[0.06em] text-[#595959]"
            >
              Root Topic Premise
            </label>
            <TextInput
              id="root-premise-input"
              value={premise}
              onChange={(e) => setPremise(e.target.value.slice(0, 120))}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Molecular Drivers of Cellular Senescence"
              maxLength={120}
              className="font-serif text-[14px]"
            />
            <div className="flex items-center justify-between font-mono text-[9px] text-[#595959] pt-0.5">
              <span className="flex items-center gap-1">
                Classification defaults to <Badge variant="topic">TOPIC</Badge>
              </span>
              <span>{premise.length}/120</span>
            </div>
          </div>

          {/* Action Button */}
          <Button
            type="submit"
            variant="cobalt"
            size="lg"
            data-testid="btn-create-root"
            className="w-full justify-between mt-1 h-9"
          >
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span>+ Create Root Node</span>
            </span>
            <span className="font-mono text-[9px] bg-[rgba(255,255,255,0.2)] px-2 py-0.5 rounded-[2px] text-white tracking-wide">
              Return ↵
            </span>
          </Button>
        </form>

        {/* Divider */}
        <Divider label="OR INITIALIZE FROM TEMPLATE" />

        {/* 3 Template Cards */}
        <div className="grid grid-cols-3 gap-2">
          {TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.title}
              type="button"
              onClick={() => onCreateRoot(tmpl.premise)}
              className="flex flex-col text-left p-2.5 bg-[#fbf9f8] border border-[#ebebeb] rounded-[2px] hover:border-[#000000] hover:bg-[#f5f3f3] transition-colors cursor-pointer group"
            >
              <span className="font-mono text-[11px] font-medium text-[#000000] group-hover:text-[#0051c3] leading-snug">
                {tmpl.title}
              </span>
              <span className="font-mono text-[9px] text-[#595959] mt-0.5">
                {tmpl.subtitle}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
