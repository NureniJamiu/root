/**
 * The AI button in the header and its popover: map a topic onto the canvas,
 * see how many AI actions are left this month, and open AI settings.
 */

import { useEffect, useRef, useState } from 'react';

import { useAiProposalStore } from '../data';
import { findModel } from '../lib/ai/models';
import { SparkleIcon } from '../nodes';
import { Button } from '../ui/Button';
import { useAiConfigStore } from './aiConfig';
import type { AiPanelTab } from './AiPanel';

export interface AiMenuProps {
  readonly onMapTopic: (topic: string) => void;
  readonly onOpenSettings: () => void;
  /** Open the AI panel at a tool (Ask, Gap check, Tidy). */
  readonly onOpenPanel?: (tab: AiPanelTab) => void;
  /** No project is open, so nothing can be added. */
  readonly disabled?: boolean;
}

export function AiMenu({ onMapTopic, onOpenSettings, onOpenPanel, disabled = false }: AiMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const { config, status } = useAiConfigStore();
  const pending = useAiProposalStore((s) => s.pending);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const submit = (e: React.FormEvent): void => {
    e.preventDefault();
    const clean = topic.trim();
    if (!clean || pending || disabled) return;
    onMapTopic(clean);
    setTopic('');
    setOpen(false);
  };

  const fastModel = config ? findModel(config.models, config.activeModels.fast) : undefined;

  return (
    <div className="relative" ref={ref}>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`text-[11px] px-2 ${open ? 'bg-sunken-2 text-ink-strong' : ''}`}
        icon={<SparkleIcon className="w-3.5 h-3.5" />}
        data-testid="btn-ai-menu"
      >
        AI
      </Button>
      {open && (
        <div
          className="absolute right-0 top-[calc(100%+6px)] w-[320px] bg-panel border border-rule-strong rounded-[2px] p-3 z-50 flex flex-col gap-3"
          role="dialog"
          aria-label="AI"
          data-testid="ai-menu"
        >
          {status !== 'ready' || !config ? (
            <p className="m-0 font-serif text-[13px] text-ink-read">
              {status === 'error' ? 'AI settings could not be loaded. Try again shortly.' : 'Loading…'}
            </p>
          ) : !config.enabled ? (
            <>
              <p className="m-0 font-serif text-[13px] leading-[19px] text-ink-read">
                AI isn&apos;t set up yet. Add a free Google Gemini key in AI settings to map topics, expand ideas and
                draft documents.
              </p>
              <Button size="sm" variant="cobalt" onClick={onOpenSettings} data-testid="btn-ai-setup">
                Set up AI
              </Button>
            </>
          ) : (
            <>
              <form onSubmit={submit} className="flex flex-col gap-1.5">
                <label htmlFor="ai-map-topic" className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                  Map a topic
                </label>
                <div className="flex gap-1.5">
                  <input
                    id="ai-map-topic"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    maxLength={500}
                    placeholder="e.g. How sleep affects memory"
                    className="flex-1 min-w-0 h-8 px-2 rounded-[2px] border border-rule bg-paper text-[13px] text-ink-strong focus:outline-none focus:border-accent"
                    autoFocus
                    data-testid="ai-map-input"
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="cobalt"
                    disabled={!topic.trim() || pending !== null || disabled}
                    data-testid="ai-map-submit"
                  >
                    Map it
                  </Button>
                </div>
                <span className="font-serif text-[12px] text-ink-3">
                  Suggests a starting tree of ideas. You choose which to keep.
                </span>
              </form>
              {onOpenPanel && (
                <div className="flex flex-col gap-1" data-testid="ai-menu-tools">
                  {(
                    [
                      ['ask', 'Ask your project', 'Answers that cite your ideas and documents'],
                      ['review', 'Gap check', 'Unsupported conclusions, uncited claims, contradictions'],
                      ['tidy', 'Tidy suggestions', 'Better types, titles and missing connectors'],
                    ] as const
                  ).map(([tab, label, hint]) => (
                    <button
                      key={tab}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        setOpen(false);
                        onOpenPanel(tab);
                      }}
                      className="flex flex-col items-start text-left px-2 py-1.5 rounded-[2px] border border-rule hover:border-ink cursor-pointer disabled:opacity-50 disabled:cursor-default"
                      data-testid={`ai-open-${tab}`}
                    >
                      <span className="font-serif text-[13px] text-ink-strong">{label}</span>
                      <span className="font-serif text-[11.5px] text-ink-3">{hint}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="m-0 font-serif text-[12.5px] leading-[18px] text-ink-read">
                Hover an idea and press <SparkleIcon className="inline w-3 h-3 align-[-1px]" /> to suggest connected
                ideas.
              </p>
              <Allowance />
              {fastModel && <span className="font-mono text-[10px] text-muted">Using {fastModel.label}</span>}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
                data-testid="btn-ai-settings"
              >
                AI settings
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** "12 of 30 AI actions used this month" with a thin meter. */
export function Allowance(): JSX.Element | null {
  const config = useAiConfigStore((s) => s.config);
  if (!config) return null;
  const { used, limit, resetsAt } = config.allowance;
  const share = limit > 0 ? Math.min(1, used / limit) : 1;
  const resets = new Date(resetsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <div className="flex flex-col gap-1" data-testid="ai-allowance">
      <div className="flex justify-between font-mono text-[10px] text-muted">
        <span>
          {used} of {limit} AI actions used · {config.planLabel} plan
        </span>
        <span>resets {resets}</span>
      </div>
      <div className="h-1 rounded-full bg-sunken overflow-hidden">
        <div
          className={`h-full ${share >= 1 ? 'bg-question' : 'bg-accent'}`}
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      {config.keys.length > 0 && (
        <span className="font-serif text-[12px] text-ink-3">Calls on your own keys aren&apos;t counted.</span>
      )}
    </div>
  );
}
