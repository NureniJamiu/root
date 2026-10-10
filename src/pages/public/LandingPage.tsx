import { useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';

import { RootLogo } from '../../layout/Logo';
import { useRouter } from '../../routing';

import { ProductFilm } from './landing/ProductFilm';
import { IdeaTypes } from './landing/IdeaTypes';
import { SiteFooter } from './landing/SiteFooter';
import { Reveal } from './landing/Reveal';
import { ScrollStory } from './landing/ScrollStory';
import { ScrubText } from './landing/ScrubText';
import { UseCaseRail } from './landing/UseCaseRail';
import { easeOutCubic, usePrefersReducedMotion, useScrollProgressCallback } from './landing/motion';
import { TYPE_COLOR } from './landing/SceneCanvas';
import type { IdeaType } from './landing/SceneCanvas';
import { PublicHeader } from './PublicHeader';
import './landing/landing.css';

const delay = (ms: number): CSSProperties => ({ '--lp-delay': `${ms}ms` }) as CSSProperties;

export function LandingPage(): JSX.Element {
  return (
    <div className="lp-page min-h-screen bg-paper flex flex-col text-ink selection:bg-topic-soft">
      <PublicHeader wide />

      <main className="flex-1">
        <Hero />
        <Statement />
        <ScrollStory />
        <IdeaTypes />
        <UseCaseRail />
        <Details />
        <FinalCta />
      </main>

      <SiteFooter />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

/* Idea chips tucked behind the film; they slide out into the margins as you scroll. */
const PEEKERS: readonly { type: IdeaType; label: string; className: string; depth: number; float: string }[] = [
  { type: 'topic', label: 'Plastic-eating enzymes', className: 'left-[3%] top-[2.2%]', depth: 0.8, float: '0s' },
  { type: 'question', label: 'Can it scale?', className: 'right-[9%] top-[2.2%]', depth: 1.5, float: '-2s' },
  { type: 'finding', label: 'Five mutations confirmed', className: 'left-[12%] bottom-[2.4%]', depth: 1.2, float: '-4s' },
  { type: 'conclusion', label: 'AI shortens design', className: 'right-[3%] bottom-[2.4%]', depth: 0.6, float: '-1s' },
];

const BLOBS: readonly { className: string; color: string; depth: number; delay: string }[] = [
  { className: 'left-[-10%] top-[-20%] w-[55%] h-[70%]', color: 'rgb(var(--topic) / 0.32)', depth: -60, delay: '0s' },
  { className: 'right-[-12%] top-[10%] w-[50%] h-[65%]', color: 'rgb(var(--question) / 0.26)', depth: 90, delay: '-8s' },
  { className: 'left-[25%] bottom-[-30%] w-[55%] h-[60%]', color: 'rgb(var(--lp-blob-periwinkle) / 0.7)', depth: 40, delay: '-14s' },
  { className: 'left-[45%] top-[-25%] w-[35%] h-[45%]', color: 'rgb(var(--lp-blob-light) / 0.85)', depth: -30, delay: '-4s' },
];

/* Branch lines across the wash, in a 1000 x 600 box stretched to fit. */
const WASH_LINES: readonly string[] = [
  'M 0 120 C 160 120, 180 40, 330 40 S 520 90, 640 20',
  'M 1000 210 C 860 210, 840 320, 700 330 S 520 300, 430 380',
  'M 0 470 C 140 470, 200 560, 360 560 S 600 520, 760 590',
  'M 1000 520 C 900 520, 880 450, 780 450',
];

const MADE_FOR: readonly { type: IdeaType; label: string }[] = [
  { type: 'topic', label: 'Research' },
  { type: 'finding', label: 'Literature reviews' },
  { type: 'question', label: 'Theses' },
  { type: 'conclusion', label: 'Articles' },
  { type: 'topic', label: 'Interviews' },
  { type: 'finding', label: 'Strategy' },
];

function Hero(): JSX.Element {
  const { navigate } = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const filmRef = useRef<HTMLDivElement>(null);
  const peekRefs = useRef<(HTMLDivElement | null)[]>([]);
  const blobRefs = useRef<(HTMLDivElement | null)[]>([]);
  const reduced = usePrefersReducedMotion();

  // As the stage rises the film lies flat, the chips slide out from behind
  // it and the wash drifts at its own pace.
  const onProgress = useCallback((p: number) => {
    const e = easeOutCubic(p);
    if (filmRef.current) {
      filmRef.current.style.transform = `perspective(1800px) rotateX(${(1 - e) * 9}deg) scale(${0.95 + 0.05 * e})`;
    }
    peekRefs.current.forEach((el, i) => {
      const d = PEEKERS[i]?.depth ?? 1;
      if (el) el.style.transform = `translate3d(0, ${(1 - e) * 70 * d}px, 0)`;
    });
    blobRefs.current.forEach((el, i) => {
      if (el) el.style.transform = `translate3d(0, ${p * (BLOBS[i]?.depth ?? 0)}px, 0)`;
    });
  }, []);
  useScrollProgressCallback(stageRef, onProgress, { mode: 'enter', start: 0.95, end: 0.1, disabled: reduced });

  return (
    <section className="relative">
      <div className="max-w-[1400px] mx-auto px-5 md:px-10">
        <div className="pt-14 md:pt-24 lg:pt-28 pb-10 md:pb-14 grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-7 lg:gap-16 items-end">
          <h1
            className="font-serif font-light text-ink tracking-[-0.035em] leading-[1.02]"
            style={{ fontSize: 'clamp(42px, 6.4vw, 100px)', textWrap: 'balance' } as CSSProperties}
          >
            <span className="lp-line" style={delay(100)}>
              <span>Map your research. Write it up.</span>
            </span>
          </h1>
          <p
            className="lp-fade-up font-serif text-[18px] md:text-[21px] leading-[1.55] text-ink-2 max-w-xl lg:pb-3"
            style={delay(380)}
          >
            Root is a canvas for research. Ideas branch, questions stay open and the evidence lives inside the point it
            supports. When the picture is clear, write it up in a document beside the canvas that cites your ideas as
            you go.
          </p>
        </div>

        <div className="lp-rule h-px bg-sunken-3" style={delay(300)} aria-hidden="true" />

        <div className="lp-fade-up py-7 md:py-9 flex flex-wrap items-center justify-between gap-5" style={delay(560)}>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="group inline-flex items-center gap-3 h-12 pl-1.5 pr-6 bg-inverse text-on-inverse font-mono text-[12px] uppercase tracking-[0.1em] rounded-[2px] hover:bg-accent hover:text-on-accent transition-colors duration-200"
            >
              <span className="lp-arrow-box w-9 h-9 rounded-[2px] bg-on-inverse text-inverse flex items-center justify-center text-[15px]" aria-hidden="true">
                →
              </span>
              Start Creating
            </button>
            <button
              type="button"
              onClick={() => navigate('/auth/register')}
              className="inline-flex items-center h-12 px-6 bg-panel border border-rule-strong text-ink font-mono text-[12px] uppercase tracking-[0.1em] rounded-[2px] hover:border-ink transition-colors duration-200"
            >
              Create Account
            </button>
          </div>
          <p className="hidden sm:flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-finding-fill" />
            Free while in beta · No setup
          </p>
        </div>

        <div
          ref={stageRef}
          id="film"
          className="lp-wash lp-fade-up relative overflow-hidden rounded-[6px] border border-[rgb(var(--lp-wash-border))]"
          style={delay(720)}
        >
          {BLOBS.map((b, i) => (
            <div
              key={b.color}
              ref={(el) => {
                blobRefs.current[i] = el;
              }}
              className={`lp-wash-blob ${b.className}`}
              aria-hidden="true"
            >
              <span style={{ background: b.color, '--lp-drift-delay': b.delay } as CSSProperties} />
            </div>
          ))}
          <div className="absolute inset-0 lp-wash-grid pointer-events-none" aria-hidden="true" />
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 1000 600"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {WASH_LINES.map((d, i) => (
              <path
                key={d}
                d={d}
                pathLength={1}
                className="lp-wash-line"
                style={delay(1100 + i * 180)}
                fill="none"
                stroke="rgb(var(--lp-wash-line))"
                strokeOpacity={0.85}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div className="absolute inset-0 lp-grain pointer-events-none" aria-hidden="true" />

          {PEEKERS.map((c, i) => (
            <div
              key={c.label}
              ref={(el) => {
                peekRefs.current[i] = el;
              }}
              className={`absolute hidden md:block pointer-events-none ${c.className}`}
              aria-hidden="true"
            >
              <div
                className="lp-float flex items-center gap-2 bg-panel border rounded-[2px] pr-3 h-9 overflow-hidden shadow-[0_8px_24px_-12px_rgb(var(--shadow)/0.35)]"
                style={{ borderColor: TYPE_COLOR[c.type], '--lp-float-delay': c.float } as CSSProperties}
              >
                <span className="w-[3px] self-stretch" style={{ background: TYPE_COLOR[c.type] }} />
                <span className="font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: TYPE_COLOR[c.type] }}>
                  {c.type}
                </span>
                <span className="font-serif text-[15px] text-ink whitespace-nowrap">{c.label}</span>
              </div>
            </div>
          ))}

          <div className="relative px-3 py-4 sm:px-[5%] sm:py-[4.5%] lg:px-[6.5%] lg:py-[5%]">
            <div
              ref={filmRef}
              className="lp-film-frame max-w-[min(1120px,calc((100svh-250px)*1.6))] mx-auto rounded-[4px] shadow-[0_40px_90px_-40px_rgb(var(--shadow)/0.55),0_12px_30px_-18px_rgb(var(--accent-deep)/0.35)]"
            >
              <ProductFilm />
            </div>
          </div>
        </div>

        <div className="lp-fade-up border-x border-b border-rule rounded-b-[6px] -mt-[6px] pt-[6px] bg-panel" style={delay(900)}>
          <div className="px-5 md:px-10 py-6 md:py-7 flex flex-wrap items-center justify-center lg:justify-between gap-x-10 gap-y-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">Made for</span>
            {MADE_FOR.map((m) => (
              <span key={m.label} className="flex items-center gap-2.5 font-serif italic text-[19px] md:text-[22px] text-faint">
                <span className="w-2 h-2 rounded-[1px]" style={{ background: TYPE_COLOR[m.type], opacity: 0.8 }} />
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="h-20 md:h-32" aria-hidden="true" />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Statement                                                                  */
/* -------------------------------------------------------------------------- */

function Statement(): JSX.Element {
  return (
    <section className="border-y border-rule bg-panel">
      <div className="max-w-5xl mx-auto px-6 py-28 md:py-40">
        <Reveal as="p" variant="fade" className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted mb-8">
          Why a canvas
        </Reveal>
        <ScrubText
          className="font-serif font-light text-[32px] md:text-[54px] leading-[1.12] tracking-[-0.02em] text-ink"
          text="Linear notes flatten how thinking actually works. Ideas branch, loop back and raise new questions. Root lets them grow the way they really do: *outward,* *connected,* and in full view."
        />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Details                                                                    */
/* -------------------------------------------------------------------------- */

const DETAILS: readonly { kicker: string; title: string; body: string }[] = [
  {
    kicker: 'Write beside it',
    title: 'From map to draft.',
    body: 'Open a document next to the canvas. Type @ to cite an idea, drag a card in, or select a sentence and make it a new idea. Every citation stays linked both ways.',
  },
  {
    kicker: 'Collapse & reveal',
    title: 'See only what matters.',
    body: 'Fold a branch to a single card, or reveal its ideas one at a time while you talk them through.',
  },
  {
    kicker: 'Images & notes',
    title: 'Keep the evidence close.',
    body: 'Attach images and formatted notes to any idea so the proof sits next to the point it supports. Everything saves to your account as you go.',
  },
];

function Details(): JSX.Element {
  return (
    <section className="max-w-6xl mx-auto px-6 md:px-8 py-24 md:py-32">
      <div className="grid md:grid-cols-3 border-t border-ink">
        {DETAILS.map((d, i) => (
          <Reveal
            key={d.kicker}
            delay={i * 130}
            className={`pt-8 pb-4 md:pr-8 ${i > 0 ? 'md:pl-8 md:border-l border-rule' : ''}`}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted mb-4">
              <span className="text-topic">0{i + 1}</span> · {d.kicker}
            </p>
            <h3 className="font-serif font-light text-[28px] leading-tight tracking-[-0.01em] mb-3">{d.title}</h3>
            <p className="font-serif text-[16px] leading-[1.6] text-ink-2">{d.body}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Final call to action                                                       */
/* -------------------------------------------------------------------------- */

function FinalCta(): JSX.Element {
  const { navigate } = useRouter();

  return (
    <section className="relative overflow-hidden bg-stage text-on-accent">
      <div className="absolute inset-0 lp-grid-dark pointer-events-none" aria-hidden="true" />
      <div className="relative max-w-4xl mx-auto px-6 py-28 md:py-40 text-center flex flex-col items-center">
        <Reveal variant="scale">
          <div className="bg-paper rounded-[4px] px-5 py-3 mb-10 inline-block">
            <RootLogo style={{ height: 44, width: 'auto' }} />
          </div>
        </Reveal>
        <Reveal as="h2" variant="mask" delay={100} className="font-serif font-light text-[40px] md:text-[72px] leading-[1.02] tracking-[-0.03em] mb-6">
          Give your next question <span className="italic text-[#b1c5ff]">room to branch.</span>
        </Reveal>
        <Reveal as="p" delay={220} className="font-serif text-[18px] md:text-[20px] leading-[1.6] text-rule-strong max-w-xl mb-12">
          Free while in beta. Map the question, gather the evidence and write it up, without leaving the page.
        </Reveal>
        <Reveal delay={320}>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="group inline-flex items-center gap-3 h-12 px-7 bg-white text-stage font-mono text-[12px] uppercase tracking-[0.1em] rounded-[2px] hover:bg-accent hover:text-on-accent transition-colors duration-200"
          >
            Open your canvas
            <span className="inline-block transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true">
              →
            </span>
          </button>
        </Reveal>
      </div>
    </section>
  );
}
