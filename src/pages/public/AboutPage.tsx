import { useRouter } from '../../routing';

import { PublicSection, StaticPublicPage } from './StaticPublicPage';

const STEPS: readonly { n: string; title: string; body: string; color: string }[] = [
  {
    n: '01',
    title: 'Map the question',
    body: 'Start with a topic and let it branch. Mark each card as a topic, a finding, an open question or a conclusion, and connect them the way they actually relate.',
    color: 'rgb(var(--topic))',
  },
  {
    n: '02',
    title: 'Gather the evidence',
    body: 'Notes, links and images live inside the idea they support. Collapse a branch when it is settled; reveal it one idea at a time when you explain it.',
    color: 'rgb(var(--finding))',
  },
  {
    n: '03',
    title: 'Write it up',
    body: 'Open a document beside the canvas. Cite ideas with @, embed a card, or outline a first draft from a whole branch. Each card shows which documents cite it.',
    color: 'rgb(var(--question))',
  },
];

const PRINCIPLES: readonly { title: string; body: string }[] = [
  {
    title: 'Thinking is not a list.',
    body: 'Research loops back on itself. A canvas keeps the shape of the argument visible, so gaps and contradictions show up before they reach the draft.',
  },
  {
    title: 'The map and the writing belong together.',
    body: 'Switching between a mind-map tool and a word processor loses the links between them. In Root the document points back at the ideas it is built on.',
  },
  {
    title: 'Calm, and yours.',
    body: 'A quiet interface with nothing to configure. Your projects and documents are saved to your account and nobody else can open them.',
  },
];

export function AboutPage(): JSX.Element {
  const { navigate } = useRouter();
  return (
    <StaticPublicPage
      kicker="About Root"
      title="A canvas for research, with the writing built in."
      lede="Root is for students, researchers, writers and anyone working through a hard question. You map what you know on a canvas, then write it up in a document that stays connected to that map."
    >
      <PublicSection label="How it works">
        <ol className="m-0 p-0 list-none grid md:grid-cols-3 gap-8">
          {STEPS.map((s) => (
            <li key={s.n} className="flex flex-col gap-3">
              <span className="h-[3px] w-10" style={{ background: s.color }} aria-hidden="true" />
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">{s.n}</span>
              <h3 className="font-serif font-light text-[26px] leading-tight m-0">{s.title}</h3>
              <p className="font-serif text-[16px] leading-[1.6] text-ink-2 m-0">{s.body}</p>
            </li>
          ))}
        </ol>
      </PublicSection>

      <PublicSection label="What we believe">
        <div className="flex flex-col gap-10">
          {PRINCIPLES.map((p) => (
            <div key={p.title} className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3 md:gap-10">
              <h3 className="font-serif text-[22px] leading-snug m-0">{p.title}</h3>
              <p className="font-serif text-[17px] leading-[1.65] text-ink-2 m-0">{p.body}</p>
            </div>
          ))}
        </div>
      </PublicSection>

      <PublicSection label="Try it">
        <div className="flex flex-wrap items-center justify-between gap-6">
          <p className="font-serif text-[20px] leading-[1.5] m-0 max-w-xl">
            Root is free while in beta. Bring one question you are working on and see how it maps.
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center h-12 px-6 bg-inverse text-on-inverse font-mono text-[12px] uppercase tracking-[0.1em] rounded-[2px] hover:bg-accent hover:text-on-accent transition-colors"
          >
            Open your canvas →
          </button>
        </div>
      </PublicSection>
    </StaticPublicPage>
  );
}
