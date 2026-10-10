/**
 * AI settings: the person's plan and allowance, which model runs their AI
 * features, and their own API keys (sealed on the server, never shown again).
 */

import { useState } from 'react';

import { FEATURES, FEATURE_LABELS } from '../lib/ai/plans';
import { KEYED_PROVIDERS, PROVIDER_LABELS } from '../lib/ai/models';
import type { KeyedProvider } from '../lib/ai/models';
import type { AiTestResult } from '../lib/ai/contracts';
import { Button } from '../ui/Button';
import { aiConfigActions, useAiConfigStore } from './aiConfig';
import { Allowance } from './AiMenu';
import { AiRequestError, aiApi } from './api';

const KEY_LINKS: Record<KeyedProvider, { url: string; hint: string }> = {
  google: { url: 'https://aistudio.google.com/apikey', hint: 'Free tier available from Google AI Studio.' },
  anthropic: { url: 'https://console.anthropic.com/settings/keys', hint: 'Paid; unlocks Claude models on any plan.' },
  openrouter: { url: 'https://openrouter.ai/keys', hint: 'Includes free models (marked “:free”).' },
};

export interface AiSettingsDialogProps {
  readonly onClose: () => void;
}

export function AiSettingsDialog({ onClose }: AiSettingsDialogProps): JSX.Element {
  const config = useAiConfigStore((s) => s.config);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof AiRequestError ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="root-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        className="root-modal-panel w-[560px] max-w-full max-h-[calc(100vh-32px)] overflow-y-auto bg-panel text-ink border border-rule-2 rounded-[4px]"
        data-testid="ai-settings"
      >
        <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-4">
          <div>
            <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted">Settings</span>
            <h2 id="ai-settings-title" className="m-0 font-serif text-[22px] font-normal text-ink-strong">
              AI
            </h2>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close" data-testid="ai-settings-close">
            Close
          </Button>
        </div>

        {!config ? (
          <p className="px-6 pb-6 m-0 font-serif text-[14px] text-ink-read">Loading…</p>
        ) : (
          <div className="px-6 pb-6 flex flex-col gap-6">
            {error && (
              <p className="m-0 font-serif text-[13px] text-question" role="alert">
                {error}
              </p>
            )}

            <Section title="Plan">
              <Allowance />
              <ul className="m-0 p-0 list-none grid grid-cols-2 gap-x-3 gap-y-1">
                {FEATURES.map((f) => {
                  const on = config.features.includes(f);
                  return (
                    <li key={f} className={`font-serif text-[13px] ${on ? 'text-ink' : 'text-faint'}`}>
                      {on ? '✓' : '—'} {FEATURE_LABELS[f]}
                      {!on && <span className="font-mono text-[9px] text-muted"> · Pro</span>}
                    </li>
                  );
                })}
              </ul>
            </Section>

            {(config.acceptRates ?? []).some((r) => r.offered > 0) && (
              <Section title="Suggestions kept this month">
                <ul className="m-0 p-0 list-none grid grid-cols-2 gap-x-3 gap-y-1" data-testid="ai-accept-rates">
                  {(config.acceptRates ?? [])
                    .filter((r) => r.offered > 0)
                    .map((r) => (
                      <li key={r.feature} className="font-serif text-[13px] text-ink">
                        {FEATURE_LABELS[r.feature]}{' '}
                        <span className="font-mono text-[10px] text-muted">
                          {r.accepted} of {r.offered} · {Math.round((r.accepted / r.offered) * 100)}%
                        </span>
                      </li>
                    ))}
                </ul>
              </Section>
            )}

            <Section title="Model">
              <div className="flex flex-col gap-1" role="radiogroup" aria-label="Model">
                <ModelRow
                  label="Automatic"
                  description="A fast model for suggestions and a stronger one for drafts."
                  checked={config.selectedModelId === null}
                  disabled={busy}
                  onSelect={() => void run(async () => aiConfigActions.set(await aiApi.setModel(null)))}
                  testId="ai-model-auto"
                />
                {config.models.map((m) => {
                  const usable = m.available && !m.locked;
                  const why = m.locked ? 'Pro plan or your own key' : !m.available ? 'Needs an API key' : null;
                  return (
                    <ModelRow
                      key={m.id}
                      label={m.label}
                      description={m.description}
                      badge={why ?? (m.tier === 'premium' ? 'Premium' : null)}
                      checked={config.selectedModelId === m.id}
                      disabled={busy || !usable}
                      onSelect={() => void run(async () => aiConfigActions.set(await aiApi.setModel(m.id)))}
                      testId={`ai-model-${m.id}`}
                    />
                  );
                })}
              </div>
            </Section>

            <Section title="Your API keys">
              <p className="m-0 font-serif text-[13px] leading-[19px] text-ink-read">
                Calls on your own key go straight to that provider and don&apos;t count against your monthly actions.
                Keys are encrypted on the server and never shown again.
              </p>
              <div className="flex flex-col gap-2">
                {KEYED_PROVIDERS.map((p) => (
                  <KeyRow
                    key={p}
                    provider={p}
                    last4={config.keys.find((k) => k.provider === p)?.last4 ?? null}
                    appHasKey={config.appProviders.includes(p)}
                    busy={busy}
                    onSave={(apiKey) => run(async () => aiConfigActions.set(await aiApi.setKey(p, apiKey)))}
                    onRemove={() => run(async () => aiConfigActions.set(await aiApi.removeKey(p)))}
                  />
                ))}
              </div>
              <p className="m-0 font-serif text-[12px] leading-[18px] text-ink-3">
                Free tiers may use what you send to improve the provider&apos;s models. Keep sensitive research on a
                paid key.
              </p>
            </Section>

            <Section title="Connection">
              <ConnectionTest />
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

/** Ask each model the AI features use for a one-word reply and show what came back. */
function ConnectionTest(): JSX.Element {
  const [results, setResults] = useState<readonly AiTestResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const test = async (): Promise<void> => {
    setTesting(true);
    setError(null);
    setResults(null);
    try {
      setResults((await aiApi.test()).results);
    } catch (err) {
      setError(err instanceof AiRequestError ? err.message : 'The test could not run. Try again.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2" data-testid="ai-connection">
      <div className="flex items-center gap-3">
        <Button size="sm" variant="secondary" disabled={testing} onClick={() => void test()} data-testid="ai-test-connection">
          {testing ? 'Testing…' : 'Test connection'}
        </Button>
        <span className="font-serif text-[12px] text-ink-3">Sends a one-word prompt to each model. Not counted.</span>
      </div>
      {error && (
        <p className="m-0 font-serif text-[13px] text-question" role="alert">
          {error}
        </p>
      )}
      {results && (
        <ul className="m-0 p-0 list-none flex flex-col gap-1" data-testid="ai-test-results">
          {results.map((r) => (
            <li key={r.role} className="font-serif text-[13px] leading-[19px]">
              <span className={r.ok ? 'text-ink' : 'text-question'}>{r.ok ? '✓' : '✕'}</span>{' '}
              <span className="text-ink-strong">{r.label ?? 'No model'}</span>
              <span className="font-mono text-[10px] text-muted">
                {' '}
                · {r.role === 'smart' ? 'drafts' : 'suggestions'}
                {r.ok ? ` · ${(r.ms / 1000).toFixed(1)}s` : ''}
              </span>
              {!r.ok && <span className="block text-ink-read break-words">{r.message}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: React.ReactNode }): JSX.Element {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-3">{title}</h3>
      {children}
    </section>
  );
}

function ModelRow({
  label,
  description,
  badge = null,
  checked,
  disabled,
  onSelect,
  testId,
}: {
  readonly label: string;
  readonly description: string;
  readonly badge?: string | null;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onSelect: () => void;
  readonly testId: string;
}): JSX.Element {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled && !checked}
      onClick={() => !checked && onSelect()}
      className={`flex items-start gap-2.5 text-left px-3 py-2 rounded-[2px] border transition-colors ${
        checked ? 'border-accent bg-sunken' : 'border-rule hover:border-ink'
      } disabled:opacity-50 disabled:hover:border-rule disabled:cursor-default cursor-pointer`}
      data-testid={testId}
    >
      <span
        aria-hidden="true"
        className={`mt-1 w-3 h-3 rounded-full border shrink-0 ${checked ? 'border-accent bg-accent' : 'border-rule-strong'}`}
      />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2">
          <span className="font-serif text-[14px] text-ink-strong">{label}</span>
          {badge && <span className="font-mono text-[9px] uppercase tracking-wider text-muted">{badge}</span>}
        </span>
        <span className="block font-serif text-[12.5px] text-ink-3">{description}</span>
      </span>
    </button>
  );
}

function KeyRow({
  provider,
  last4,
  appHasKey,
  busy,
  onSave,
  onRemove,
}: {
  readonly provider: KeyedProvider;
  readonly last4: string | null;
  readonly appHasKey: boolean;
  readonly busy: boolean;
  readonly onSave: (apiKey: string) => Promise<void>;
  readonly onRemove: () => Promise<void>;
}): JSX.Element {
  const [value, setValue] = useState('');
  const link = KEY_LINKS[provider];
  return (
    <div className="flex flex-col gap-1 px-3 py-2 rounded-[2px] border border-rule" data-testid={`ai-key-${provider}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-serif text-[14px] text-ink-strong">{PROVIDER_LABELS[provider]}</span>
        <a href={link.url} target="_blank" rel="noreferrer" className="font-mono text-[10px] text-accent hover:underline">
          Get a key
        </a>
      </div>
      {last4 ? (
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[12px] text-ink-read">Your key ····{last4}</span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void onRemove()}>
            Remove
          </Button>
        </div>
      ) : (
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const clean = value.trim();
            if (clean.length < 8) return;
            void onSave(clean).then(() => setValue(''));
          }}
        >
          <input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={appHasKey ? 'Optional: use your own key' : 'Paste an API key'}
            className="flex-1 min-w-0 h-8 px-2 rounded-[2px] border border-rule bg-paper text-[12px] font-mono text-ink-strong focus:outline-none focus:border-accent"
            aria-label={`${PROVIDER_LABELS[provider]} API key`}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={busy || value.trim().length < 8}>
            Save
          </Button>
        </form>
      )}
      <span className="font-serif text-[12px] text-ink-3">
        {appHasKey && !last4 ? 'Root already has a key for this provider. ' : ''}
        {link.hint}
      </span>
    </div>
  );
}
