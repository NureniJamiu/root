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

const LATER: readonly string[] = [
  'Share a canvas or a document with a link',
  'Work on a project together',
  'Export documents to Word, PDF and Markdown',
];

const FAQ: readonly { q: string; a: string }[] = [
  {
    q: 'Is it really free?',
    a: 'Yes. Everything Root does today is free while it is in beta. There is no card to enter and no trial that runs out.',
  },
  {
    q: 'What happens to my work when paid plans arrive?',
    a: 'Your projects and documents stay in your account. We will say what changes, and when, well before it happens.',
  },
  {
    q: 'Who can see my research?',
    a: 'Only you. Projects and documents are tied to your account and the server refuses anyone else.',
  },
];

export function PricingPage(): JSX.Element {
  const { navigate } = useRouter();
  return (
    <StaticPublicPage
      kicker="Pricing"
      title="Free while in beta."
      lede="Every feature is open to everyone during the beta. Paid plans will come later, for teams and for sharing."
    >
      <PublicSection label="Plans">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="border border-ink rounded-[2px] p-6 flex flex-col gap-5 bg-panel" data-testid="plan-beta">
            <div className="flex items-baseline justify-between">
              <h3 className="font-serif text-[26px] font-light m-0">Beta</h3>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-finding">Available now</span>
            </div>
            <p className="font-serif text-[44px] font-light leading-none m-0">
              $0 <span className="text-[16px] text-muted">while in beta</span>
            </p>
            <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
              {INCLUDED.map((item) => (
                <li key={item} className="flex gap-2.5 font-serif text-[16px] leading-[1.45] text-ink-2">
                  <span className="text-finding" aria-hidden="true">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => navigate('/auth/register')}
              className="mt-auto h-11 bg-inverse text-on-inverse font-mono text-[11px] uppercase tracking-[0.1em] rounded-[2px] hover:bg-accent hover:text-on-accent transition-colors"
            >
              Create a free account
            </button>
          </div>
          <div className="border border-rule-2 rounded-[2px] p-6 flex flex-col gap-5" data-testid="plan-later">
            <div className="flex items-baseline justify-between">
              <h3 className="font-serif text-[26px] font-light m-0">Teams</h3>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Later</span>
            </div>
            <p className="font-serif text-[18px] leading-[1.5] text-ink-2 m-0">
              For groups who research and write together. What we are working on:
            </p>
            <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
              {LATER.map((item) => (
                <li key={item} className="flex gap-2.5 font-serif text-[16px] leading-[1.45] text-ink-2">
                  <span className="text-muted" aria-hidden="true">○</span>
                  {item}
                </li>
              ))}
            </ul>
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
