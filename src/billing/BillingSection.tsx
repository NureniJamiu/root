/**
 * The billing part of AI settings: upgrade to Pro, or manage the
 * subscription in Stripe. Hidden until the server has Stripe set up.
 */

import { useEffect } from 'react';

import { Button } from '../ui/Button';
import { billingActions, useBillingStore } from './billing';

function day(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function BillingSection(): JSX.Element | null {
  const status = useBillingStore((s) => s.status);
  const busy = useBillingStore((s) => s.busy);
  const error = useBillingStore((s) => s.error);

  useEffect(() => {
    void billingActions.load();
  }, []);

  if (!status?.enabled) return null;

  const pro = status.plan === 'pro';
  let line: string;
  if (status.status === 'past_due') line = 'Your last payment did not go through. Update your card to keep Pro.';
  else if (pro && status.cancelAtPeriodEnd && status.periodEnd) line = `Pro ends on ${day(status.periodEnd)}.`;
  else if (pro && status.periodEnd) line = `Pro renews on ${day(status.periodEnd)}.`;
  else if (pro) line = 'You are on Pro.';
  else line = 'Pro adds drafting, the gap check, research and premium models, with 1,000 AI actions a month.';

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 rounded-[2px] border border-rule" data-testid="billing-section">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 font-serif text-[13px] leading-[19px] text-ink-read">{line}</p>
        <Button
          size="sm"
          variant={pro ? 'secondary' : 'primary'}
          loading={busy}
          onClick={() => void (pro ? billingActions.manage() : billingActions.upgrade())}
          data-testid={pro ? 'billing-manage' : 'billing-upgrade'}
        >
          {pro ? 'Manage billing' : 'Upgrade to Pro'}
        </Button>
      </div>
      {!pro && status.hasBillingAccount && (
        <button
          type="button"
          className="self-start font-mono text-[10px] text-accent hover:underline"
          onClick={() => void billingActions.manage()}
          disabled={busy}
        >
          Invoices and payment details
        </button>
      )}
      {status.testMode && (
        <span className="font-mono text-[9px] uppercase tracking-wider text-muted" data-testid="billing-test-mode">
          Test mode · use card 4242 4242 4242 4242
        </span>
      )}
      {error && (
        <p className="m-0 font-serif text-[13px] text-question" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
