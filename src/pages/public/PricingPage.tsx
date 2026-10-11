import { useEffect, useState } from 'react';

import { useOptionalAuth } from '../../auth';
import { billingActions, billingApi, formatPrice, useBillingStore } from '../../billing';
import type { BillingPrice } from '../../lib/billing/contracts';
import { useRouter } from '../../routing';

import { PublicSection, StaticPublicPage } from './StaticPublicPage';

const INCLUDED: readonly string[] = [
  'Unlimited projects and canvases',
  'Unlimited research documents with @ citations and embedded cards',
  'Draft a document from any branch of the canvas',
  'Images and formatted notes on every idea',
  'Saved to your account, in any browser you sign in from',
  'Light and dark themes',
];

const FREE_AI: readonly string[] = [
  '30 AI actions a month',
  'Map a topic, expand ideas and rewrite text',
  'Ask your project, with citations',
  'Tidy suggestions, walkthrough scripts and image captions',
];

const PRO_AI: readonly string[] = [
  '1,000 AI actions a month',
  'Everything in Free',
  'Draft with AI: a written-up document from a branch',
  'Gap check for unsupported or contradicting claims',
  'Research a question on Wikipedia, OpenAlex and the web',
  'Premium models, such as Claude',
];

const FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'What counts as an AI action?',
    a: 'Each time Root asks a model for you: one map, one rewrite, one answer. Calls on your own API key are never counted, on any plan.',
  },
  {
    q: 'Can I cancel Pro?',
    a: 'Any time, from AI settings. You keep Pro until the end of the period you paid for, then move back to Free. Your work stays where it is.',
  },
  {
    q: 'Who can see my research?',
    a: 'Only you. Projects and documents are tied to your account and the server refuses anyone else.',
  },
];

function PlanList({ items, muted = false }: { readonly items: readonly string[]; readonly muted?: boolean }): JSX.Element {
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2.5 font-serif text-[16px] leading-[1.45] text-ink-2">
          <span className={muted ? 'text-muted' : 'text-finding'} aria-hidden="true">
            ✓
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

const CTA =
  'mt-auto h-11 font-mono text-[11px] uppercase tracking-[0.1em] rounded-[2px] transition-colors disabled:opacity-60';

export function PricingPage(): JSX.Element {
  const { navigate } = useRouter();
  const signedIn = useOptionalAuth()?.isAuthenticated ?? false;
  const busy = useBillingStore((s) => s.busy);
  const error = useBillingStore((s) => s.error);
  const [price, setPrice] = useState<BillingPrice | null>(null);

  useEffect(() => {
    billingApi
      .price()
      .then(setPrice)
      .catch(() => setPrice(null));
  }, []);

  return (
    <StaticPublicPage
      kicker="Pricing"
      title="Free to research. Pro to go further."
      lede="Every project, document and canvas feature is free. Pro adds more AI: drafting, the gap check, research and premium models."
    >
      <PublicSection label="Plans">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-rule-2 rounded-[2px] p-6 flex flex-col gap-5" data-testid="plan-free">
            <div className="flex items-baseline justify-between">
              <h3 className="font-serif text-[26px] font-light m-0">Free</h3>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">For everyone</span>
            </div>
            <p className="font-serif text-[44px] font-light leading-none m-0">$0</p>
            <PlanList items={INCLUDED} />
            <PlanList items={FREE_AI} />
            <button
              type="button"
              onClick={() => navigate(signedIn ? '/dashboard' : '/auth/register')}
              className={`${CTA} border border-ink text-ink hover:bg-inverse hover:text-on-inverse`}
            >
              {signedIn ? 'Open Root' : 'Create a free account'}
            </button>
          </div>
          <div className="border border-ink rounded-[2px] p-6 flex flex-col gap-5 bg-panel" data-testid="plan-pro">
            <div className="flex items-baseline justify-between">
              <h3 className="font-serif text-[26px] font-light m-0">Pro</h3>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-finding">More AI</span>
            </div>
            <p className="font-serif text-[44px] font-light leading-none m-0" data-testid="plan-pro-price">
              {price ? formatPrice(price) : 'Pro'}
              {price && <span className="text-[16px] text-muted"> a {price.interval}</span>}
            </p>
            <PlanList items={PRO_AI} />
            <button
              type="button"
              disabled={busy}
              onClick={() => (signedIn ? void billingActions.upgrade() : navigate('/auth/register'))}
              className={`${CTA} bg-inverse text-on-inverse hover:bg-accent hover:text-on-accent`}
              data-testid="plan-pro-cta"
            >
              {signedIn ? 'Upgrade to Pro' : 'Start free, upgrade any time'}
            </button>
            {error && (
              <p className="m-0 font-serif text-[14px] text-question" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      </PublicSection>

      <PublicSection label="Questions">
        <dl className="m-0 flex flex-col gap-8">
          {FAQ.map((f) => (
            <div key={f.q} className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-2 md:gap-10">
              <dt className="font-serif text-[20px] leading-snug">{f.q}</dt>
              <dd className="m-0 font-serif text-[17px] leading-[1.65] text-ink-2">{f.a}</dd>
            </div>
          ))}
        </dl>
      </PublicSection>
    </StaticPublicPage>
  );
}
