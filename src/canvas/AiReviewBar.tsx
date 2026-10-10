/**
 * The bar above the canvas while AI is working or has suggestions waiting:
 * "Thinking…", then "6 suggested ideas · Add 6 · Discard", or the error.
 */

import { useEffect } from 'react';

import { aiProposalActions, useAiProposalStore } from '../data';
import type { AiProposalKind, UUID } from '../data';

const PENDING_LABELS: Record<AiProposalKind, string> = {
  map: 'Mapping the topic…',
  expand: 'Thinking of connected ideas…',
  capture: 'Turning the text into ideas…',
};

export interface AiReviewBarProps {
  /** Called with the new ideas' ids after Add. */
  readonly onAccepted?: (ids: UUID[]) => void;
  /** Stops the request in flight. */
  readonly onCancel?: () => void;
}

export function AiReviewBar({ onAccepted, onCancel }: AiReviewBarProps): JSX.Element | null {
  const proposal = useAiProposalStore((s) => s.proposal);
  const pending = useAiProposalStore((s) => s.pending);
  const error = useAiProposalStore((s) => s.error);

  const total = proposal?.ideas.length ?? 0;
  const included = total - (proposal?.excluded.length ?? 0);

  const accept = (): void => {
    const ids = Object.values(aiProposalActions.accept());
    onAccepted?.(ids);
  };

  // Enter adds, Escape discards, while suggestions are showing.
  useEffect(() => {
    if (!proposal && !pending) return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (pending) onCancel?.();
        else aiProposalActions.clear();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [proposal, pending, onCancel]);

  if (!proposal && !pending && !error) return null;

  return (
    <div
      className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-panel border border-rule rounded-[3px] pl-3 pr-1 py-1 text-[12px] text-ink-read max-w-[calc(100%-32px)]"
      style={{ boxShadow: '0 6px 18px rgb(var(--shadow) / 0.12)' }}
      role="status"
      aria-live="polite"
      data-testid="ai-review-bar"
    >
      {pending && (
        <>
          <span className="inline-block w-2 h-2 rounded-full bg-topic animate-pulse" aria-hidden="true" />
          <span>{PENDING_LABELS[pending.kind]}</span>
          <BarButton onClick={() => onCancel?.()} testId="ai-cancel">
            Stop
          </BarButton>
        </>
      )}
      {!pending && proposal && (
        <>
          <span className="truncate">
            <span className="text-ink-strong font-medium">
              {total} suggested {total === 1 ? 'idea' : 'ideas'}
            </span>
            <span className="text-muted"> · {proposal.modelLabel} · click a card to leave it out</span>
          </span>
          <BarButton onClick={accept} disabled={included === 0} primary testId="ai-accept">
            Add {included}
          </BarButton>
          <BarButton onClick={() => aiProposalActions.clear()} testId="ai-discard">
            Discard
          </BarButton>
        </>
      )}
      {!pending && !proposal && error && (
        <>
          <span className="text-question">{error}</span>
          <BarButton onClick={() => aiProposalActions.dismissError()} testId="ai-dismiss-error">
            OK
          </BarButton>
        </>
      )}
    </div>
  );
}

function BarButton({
  onClick,
  children,
  primary = false,
  disabled = false,
  testId,
}: {
  readonly onClick: () => void;
  readonly children: React.ReactNode;
  readonly primary?: boolean;
  readonly disabled?: boolean;
  readonly testId: string;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-7 px-3 rounded-[2px] border text-[11.5px] whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default ${
        primary
          ? 'bg-accent text-on-accent border-accent hover:bg-accent-strong'
          : 'bg-panel text-ink-read border-rule hover:text-ink-strong hover:border-ink-strong'
      }`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
