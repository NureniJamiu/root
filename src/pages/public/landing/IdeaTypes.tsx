/**
 * "Four kinds of idea": a sticky list of the idea types on the left and one
 * large panel per type on the right, which pile into a fanned stack on scroll. Each panel shows a small scene of what
 * that type does on a canvas, and the scene plays once as it scrolls in.
 * With reduced motion every scene is drawn in its finished state.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { useRouter } from '../../../routing';

import { canObserve, clamp01, easeOutCubic, useInView } from './motion';
import { Reveal } from './Reveal';
import { TYPE_COLOR } from './SceneCanvas';
import type { IdeaType } from './SceneCanvas';
import { Specimen } from './Specimen';

interface Kind {
  readonly type: IdeaType;
  readonly name: string;
  readonly lead: string;
  readonly body: string;
  readonly Scene: () => JSX.Element;
}

const KINDS: readonly Kind[] = [
  {
    type: 'topic',
    name: 'Topic',
    lead: 'Give every idea a home.',
    body: 'Topics are the subjects your canvas hangs from. Fold a branch down to one card when you are done with it, or reveal it one idea at a time.',
    Scene: TopicScene,
  },
  {
    type: 'finding',
    name: 'Finding',
    lead: 'Keep the proof with the point.',
    body: 'Findings hold what you know. Notes, images, sources and documents live inside the card, so evidence never drifts from the claim it backs.',
    Scene: FindingScene,
  },
  {
    type: 'question',
    name: 'Question',
    lead: 'Never lose an open thread.',
    body: 'Questions draw dashed and stay coral until something answers them, so the gaps in your thinking are the first thing you see.',
    Scene: QuestionScene,
  },
  {
    type: 'conclusion',
    name: 'Conclusion',
    lead: 'Land the thinking.',
    body: 'Conclusions mark where an argument ends up. Walk the room through the path that got you there, one card at a time.',
    Scene: ConclusionScene,
  },
];

/** Matches the media query in landing.css that turns the stack on. */
const STACK_QUERY = '(min-width: 1024px) and (min-height: 640px)';
/** Degrees each card turns more than the one beneath it. */
const TILT = 1.6;

const step = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

export function IdeaTypes(): JSX.Element {
  const { navigate } = useRouter();
  const panelRefs = useRef<(HTMLElement | null)[]>([]);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // One loop drives the stack: it tilts each card as it lands on the pile and
  // marks the top card of the pile as the active type.
  useEffect(() => {
    if (!canObserve()) return undefined;
    const stacked = window.matchMedia(STACK_QUERY);
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    const update = (): void => {
      frame = 0;
      const vh = window.innerHeight;
      const isStacked = stacked.matches;
      let next = 0;
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        const rest = isStacked ? parseFloat(getComputedStyle(el).top) || 0 : vh * 0.5;
        if (top <= rest + 4) next = i;
        const panel = panelRefs.current[i];
        if (!panel) return;
        const land = isStacked && !still.matches ? easeOutCubic(clamp01(1 - (top - rest) / (vh * 0.45))) : 0;
        panel.style.setProperty('--tilt', `${(-i * TILT * land).toFixed(3)}deg`);
      });
      setActive(next);
    };
    const schedule = (): void => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    stacked.addEventListener('change', schedule);
    still.addEventListener('change', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      stacked.removeEventListener('change', schedule);
      still.removeEventListener('change', schedule);
    };
  }, []);

  // In the stack every card is pinned, so scroll to where card i lands rather
  // than to where it sits on screen right now.
  const jump = (i: number): void => {
    const card = cardRefs.current[i];
    const stack = stackRef.current;
    if (!card || !stack) return;
    if (!window.matchMedia(STACK_QUERY).matches) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    const gap = parseFloat(getComputedStyle(stack).rowGap) || 0;
    let offset = 0;
    for (let k = 0; k < i; k++) offset += (cardRefs.current[k]?.offsetHeight ?? 0) + gap;
    const rest = parseFloat(getComputedStyle(card).top) || 0;
    const stackTop = stack.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: stackTop + offset - rest + 2, behavior: 'smooth' });
  };

  return (
    <section id="idea-types" className="bg-[#ffffff] scroll-mt-16">
      <div className="max-w-6xl mx-auto px-6 md:px-8 pt-24 md:pt-32 pb-24 md:pb-32 grid lg:grid-cols-[180px_minmax(0,1fr)] gap-x-14">
        <div className="hidden lg:block" />
        <div className="mb-14 md:mb-20 max-w-3xl">
          <Reveal as="p" variant="fade" className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#737785] mb-6">
            Idea types
          </Reveal>
          <Reveal
            as="h2"
            variant="mask"
            className="font-serif font-light text-[38px] md:text-[56px] leading-[1.04] tracking-[-0.025em] text-[#1b1c1c] mb-8"
          >
            Four kinds of idea. <span className="block italic text-[#9a9da8]">Each one does its own job.</span>
          </Reveal>
          <Reveal delay={160}>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="group inline-flex items-center gap-2 h-9 px-4 bg-[#f4f3f2] border border-[#ebebeb] rounded-[2px] font-mono text-[11px] uppercase tracking-[0.1em] text-[#1b1c1c] hover:border-[#1b1c1c] transition-colors"
            >
              Try them on a canvas
              <span className="transition-transform group-hover:translate-x-0.5" aria-hidden="true">
                ›
              </span>
            </button>
          </Reveal>
        </div>

        {/* Sticky list of types with a rail that fills as you read. */}
        <nav className="hidden lg:block" aria-label="Idea types">
          <div className="sticky top-32">
            <div className="relative pl-5">
              <span className="absolute left-0 top-1 bottom-1 w-px bg-[#ebebeb]" />
              <span
                className="absolute left-0 top-1 w-px lp-gradient-bar-vertical transition-[height] duration-500"
                style={{ height: `${((active + 1) / KINDS.length) * 100}%` }}
              />
              <ul className="flex flex-col gap-3">
                {KINDS.map((k, i) => (
                  <li key={k.type}>
                    <button
                      type="button"
                      onClick={() => jump(i)}
                      className={`relative flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-[0.1em] transition-colors ${
                        i === active ? 'text-[#1b1c1c]' : 'text-[#9a9da8] hover:text-[#434653]'
                      }`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full transition-transform duration-300"
                        style={{
                          background: TYPE_COLOR[k.type],
                          transform: `scale(${i === active ? 1.4 : 0.8})`,
                          opacity: i === active ? 1 : 0.5,
                        }}
                      />
                      {k.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </nav>

        {/* On large screens the cards pile up: each pins a little lower than the
            one before and tilts as it lands, so the stack fans out to the left. */}
        <div ref={stackRef} className="lp-stack lp-bleed-right flex flex-col gap-4 md:gap-5">
          {KINDS.map((k, i) => (
            <div
              key={k.type}
              ref={(el) => {
                cardRefs.current[i] = el;
              }}
              className="lp-stack-card"
              style={step(i)}
            >
              <KindPanel
                kind={k}
                index={i}
                panelRef={(el) => {
                  panelRefs.current[i] = el;
                }}
                onOpen={() => navigate('/dashboard')}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function KindPanel({
  kind,
  index,
  panelRef,
  onOpen,
}: {
  readonly kind: Kind;
  readonly index: number;
  readonly panelRef: (el: HTMLElement | null) => void;
  readonly onOpen: () => void;
}): JSX.Element {
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once: true, rootMargin: '0px 0px -25% 0px' });
  const color = TYPE_COLOR[kind.type];
  const { Scene } = kind;

  return (
    <article
      ref={(el) => {
        ref.current = el;
        panelRef(el);
      }}
      data-index={index}
      data-in={inView ? 'true' : 'false'}
      className="lp-kind relative bg-[#f6f5f4] border border-r-0 border-[#ebebeb] rounded-l-[4px] px-6 md:px-10 pt-8 md:pt-10 pb-8 overflow-hidden"
    >
      <div className="max-w-[820px]">
        <div className="flex items-center gap-3 mb-8 md:mb-10">
          <KindIcon type={kind.type} />
          <h3 className="font-serif font-light text-[26px] md:text-[30px] leading-none text-[#1b1c1c]">{kind.name}</h3>
          <span className="ml-auto font-mono text-[10px] tabular-nums text-[#9a9da8]">
            0{index + 1} / 0{KINDS.length}
          </span>
        </div>

        <div className="lp-kind-stage mx-auto max-w-[560px]">
          <Scene />
        </div>

        <div className="mt-8 md:mt-10 flex items-end justify-between gap-6">
          <p className="font-serif text-[16px] md:text-[17px] leading-[1.6] text-[#737785] max-w-[520px]">
            <span className="text-[#1b1c1c]">{kind.lead}</span> {kind.body}
          </p>
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Try ${kind.name.toLowerCase()} cards on a canvas`}
            className="shrink-0 w-9 h-9 rounded-full border border-[#dcdcdc] bg-[#ffffff] flex items-center justify-center text-[#434653] hover:text-[#ffffff] transition-colors"
            onMouseEnter={(e) => (e.currentTarget.style.background = color)}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
          >
            <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function KindIcon({ type }: { readonly type: IdeaType }): JSX.Element {
  const c = TYPE_COLOR[type];
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      {type === 'topic' && (
        <g stroke={c} strokeWidth={1.6} fill="none">
          <rect x="3" y="9" width="7" height="6" rx="1" fill={c} />
          <path d="M 10 12 C 13 12, 13 5, 16 5 M 10 12 L 16 12 M 10 12 C 13 12, 13 19, 16 19" />
          <rect x="16" y="3" width="5" height="4" rx="1" />
          <rect x="16" y="10" width="5" height="4" rx="1" />
          <rect x="16" y="17" width="5" height="4" rx="1" />
        </g>
      )}
      {type === 'finding' && (
        <g stroke={c} strokeWidth={1.6} fill="none">
          <rect x="4" y="3" width="13" height="17" rx="1.5" />
          <path d="M 7.5 8 h 6 M 7.5 11.5 h 6" />
          <circle cx="17" cy="17" r="4.5" fill={c} stroke="none" />
          <path d="M 15 17 l 1.5 1.5 l 2.7 -3" stroke="#ffffff" />
        </g>
      )}
      {type === 'question' && (
        <g fill="none" stroke={c} strokeWidth={1.6}>
          <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2.5" />
          <path d="M 9.5 9.5 a 2.5 2.5 0 1 1 3.5 2.3 c -0.7 0.3 -1 0.8 -1 1.6" />
          <circle cx="12" cy="16.8" r="0.9" fill={c} stroke="none" />
        </g>
      )}
      {type === 'conclusion' && (
        <g fill="none" stroke={c} strokeWidth={1.6}>
          <path d="M 6 21 V 3" />
          <path d="M 6 4 H 18 l -3 4 l 3 4 H 6" fill={c} />
        </g>
      )}
    </svg>
  );
}

/** A small app window; its bottom fades into the panel. */
function Window({
  title,
  action,
  children,
}: {
  readonly title: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="lp-kind-window bg-[#ffffff] border border-[#ebebeb] rounded-[4px] overflow-hidden shadow-[0_18px_40px_-28px_rgba(17,17,18,0.35)]">
      <div className="flex items-center justify-between h-9 px-3.5 border-b border-[#ebebeb]">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#737785] truncate">{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function MiniCard({
  type,
  title,
  meta,
  className = '',
  style,
}: {
  readonly type: IdeaType;
  readonly title: string;
  readonly meta?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
}): JSX.Element {
  const c = TYPE_COLOR[type];
  return (
    <div
      className={`bg-[#ffffff] rounded-[2px] overflow-hidden ${className}`}
      style={{
        border: `1px ${type === 'question' ? 'dashed' : 'solid'} ${c}`,
        ...style,
      }}
    >
      <div style={{ height: 3, background: c }} />
      <div className="px-2.5 py-1.5">
        <p className={`font-serif text-[12.5px] leading-tight text-[#1b1c1c] truncate ${type === 'conclusion' ? 'italic' : ''}`}>
          {title}
        </p>
        {meta && <p className="font-mono text-[8.5px] text-[#9a9da8] mt-0.5 truncate">{meta}</p>}
      </div>
    </div>
  );
}

function Chip({ children, tone = '#737785' }: { readonly children: ReactNode; readonly tone?: string }): JSX.Element {
  return (
    <span
      className="inline-flex items-center h-5 px-1.5 rounded-[2px] border font-mono text-[8.5px] uppercase tracking-[0.08em]"
      style={{ color: tone, borderColor: `${tone}55` }}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Scenes                                                                     */
/* -------------------------------------------------------------------------- */

/** A novel outline: one topic, three branches, one folded away. */
function TopicScene(): JSX.Element {
  const kids: readonly {
    title: string;
    meta: string;
    y: number;
    folded?: boolean;
  }[] = [
    { title: 'The midpoint twist', meta: '4 ideas', y: 18 },
    { title: 'The heist', meta: 'Folded · 6 ideas', y: 84, folded: true },
    { title: 'Does Mara make it out?', meta: 'Open question', y: 150 },
  ];
  return (
    <Window title="Canvas · Novel draft" action={<Chip>Reveal one by one</Chip>}>
      <div className="relative h-[220px] lp-grid-soft bg-[#fbfbfc]">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 560 220" preserveAspectRatio="none" aria-hidden="true">
          {kids.map((k, i) => (
            <path
              key={k.title}
              className="lp-kind-line"
              style={step(i)}
              d={`M 210 110 C 260 110, 260 ${k.y + 22}, 310 ${k.y + 22}`}
              stroke={TYPE_COLOR.topic}
              strokeWidth={1.5}
              fill="none"
              pathLength={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <MiniCard type="topic" title="Act two" meta="T-01 · 3 branches" className="absolute left-[5%] top-[84px] w-[31%]" />
        {kids.map((k, i) => (
          <div key={k.title} className="lp-pop absolute left-[55.5%] w-[38%]" style={{ ...step(i + 1), top: k.y }}>
            <MiniCard type={i === 2 ? 'question' : 'topic'} title={k.title} meta={k.meta} />
            {k.folded && (
              <>
                <span className="absolute -bottom-1 left-1 right-1 h-1 border-x border-b border-[#0051c3]/40 rounded-b-[2px] bg-[#ffffff]" />
                <span className="absolute -right-2.5 top-1/2 -translate-y-1/2 h-5 min-w-5 px-1 rounded-full bg-[#0051c3] text-[#ffffff] font-mono text-[9px] flex items-center justify-center">
                  +6
                </span>
              </>
            )}
          </div>
        ))}
      </div>
    </Window>
  );
}

/** A study finding with its evidence gathered inside it. */
function FindingScene(): JSX.Element {
  return (
    <Window title="Idea · F-04" action={<span className="font-mono text-[9px] text-[#2d7a4c]">● Saved</span>}>
      <div className="px-4 pt-4 pb-7">
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#2d7a4c] mb-1.5">Finding</p>
        <p className="font-serif text-[18px] leading-tight text-[#1b1c1c] mb-3">Sleep locks in what you learned</p>
        <p
          className="lp-pop font-serif text-[12.5px] leading-[1.5] text-[#434653] bg-[#fbf9f8] border border-[#ebebeb] rounded-[2px] px-3 py-2 mb-3"
          style={step(0)}
        >
          Recall was higher after a night of sleep than after the same hours awake. Revise the night before, not the morning of.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {(['chart', 'gel', 'board'] as const).map((k, i) => (
            <div key={k} className="lp-pop" style={step(i + 1)}>
              <Specimen kind={k} className="w-full h-[52px] rounded-[2px] border border-[#ebebeb]" />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="lp-pop" style={step(4)}>
            <Chip>pubmed.ncbi.nlm.nih.gov</Chip>
          </span>
          <span className="lp-pop" style={step(5)}>
            <Chip>lecture-notes-wk6.pdf</Chip>
          </span>
          <span className="lp-pop ml-auto" style={step(6)}>
            <span className="inline-flex items-center gap-1 h-5 px-2 rounded-[2px] bg-[#2d7a4c] text-[#ffffff] font-mono text-[8.5px] uppercase tracking-[0.08em]">
              ✓ Verified
            </span>
          </span>
        </div>
      </div>
    </Window>
  );
}

/** The open-questions list for a product launch. */
function QuestionScene(): JSX.Element {
  const rows: readonly { q: string; state: string; open: boolean }[] = [
    {
      q: 'Who makes the pricing call?',
      state: 'No answer yet · 2 days',
      open: true,
    },
    { q: 'Is the API ready by May?', state: '1 finding linked', open: true },
    { q: 'Do we need a waitlist?', state: 'Answered by C-02', open: false },
  ];
  return (
    <Window
      title="Questions · Spring launch"
      action={
        <span className="flex gap-1">
          <Chip tone="#de5052">Open 2</Chip>
          <Chip>Answered 5</Chip>
        </span>
      }
    >
      <div className="relative px-4 py-3">
        <svg className="absolute left-[27px] top-6 bottom-6 w-2 h-[calc(100%-48px)]" aria-hidden="true">
          <line x1="1" y1="0" x2="1" y2="100%" className="lp-march" stroke="#de5052" strokeWidth={1.5} strokeDasharray="4 4" />
        </svg>
        {rows.map((r, i) => (
          <div
            key={r.q}
            className="lp-pop relative flex items-center gap-3 py-2.5 border-b border-[#f1f1f1] last:border-0"
            style={step(i)}
          >
            <span
              className="relative z-[1] w-[14px] h-[14px] shrink-0 rounded-full flex items-center justify-center font-mono text-[8px] text-[#ffffff]"
              style={r.open ? { background: '#ffffff', border: '1.5px dashed #de5052' } : { background: '#521010' }}
            >
              {!r.open && '✓'}
            </span>
            <span className={`font-serif text-[14px] ${r.open ? 'text-[#1b1c1c]' : 'text-[#9a9da8] line-through'}`}>{r.q}</span>
            <span className="ml-auto font-mono text-[9px] text-right" style={{ color: r.open ? '#de5052' : '#521010' }}>
              {r.state}
            </span>
          </div>
        ))}
        <div
          className="lp-pop mt-2 flex items-center gap-2 h-8 px-2.5 border border-dashed border-[#de5052]/50 rounded-[2px] font-mono text-[9px] text-[#9a9da8]"
          style={step(3)}
        >
          <span className="text-[#de5052]">?</span> Ask something new…
        </div>
      </div>
    </Window>
  );
}

/** A walkthrough that lands on the conclusion. */
function ConclusionScene(): JSX.Element {
  const path: readonly { type: IdeaType; title: string }[] = [
    { type: 'topic', title: 'Pricing page' },
    { type: 'finding', title: 'Annual wins 3 to 1' },
    { type: 'question', title: 'Keep a free tier?' },
    { type: 'conclusion', title: 'Lead with annual' },
  ];
  return (
    <Window title="Walkthrough · Pricing review" action={<Chip tone="#521010">Presenting</Chip>}>
      <div className="px-4 pt-5 pb-4 lp-grid-soft bg-[#fbfbfc]">
        <div className="relative grid grid-cols-4 gap-3 items-center">
          <div className="absolute left-[12%] right-[12%] top-1/2 h-[2px] -translate-y-1/2 bg-[#ebebeb]" />
          <div className="lp-kind-path absolute left-[12%] right-[12%] top-1/2 h-[2px] lp-gradient-bar origin-left" />
          {path.map((p, i) => (
            <div key={p.title} className="lp-pop relative" style={step(i)}>
              <MiniCard
                type={p.type}
                title={p.title}
                className={i === 3 ? 'shadow-[0_10px_24px_-12px_rgba(82,16,16,0.6)] scale-[1.06]' : ''}
              />
            </div>
          ))}
        </div>
        <div
          className="lp-pop mt-5 bg-[#ffffff] border border-[#521010] rounded-[2px] overflow-hidden shadow-[0_14px_30px_-20px_rgba(82,16,16,0.5)]"
          style={step(4)}
        >
          <div className="h-[3px] bg-[#521010]" />
          <div className="px-4 py-3">
            <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#521010] mb-1">Conclusion · C-01</p>
            <p className="font-serif italic text-[18px] leading-tight text-[#1b1c1c] mb-2.5">Lead with annual billing</p>
            <ul className="flex flex-col gap-1 font-serif text-[12.5px] text-[#434653]">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2d7a4c]" /> Annual won the pricing test three to one
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#de5052]" /> Free tier stays for students, question closed
              </li>
            </ul>
          </div>
        </div>
        <div className="lp-pop mt-4 flex items-center gap-3" style={step(5)}>
          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[#9a9da8]">Step 4 / 4</span>
          <span className="flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="w-5 h-[3px] rounded-[1px]" style={{ background: TYPE_COLOR[path[i]?.type ?? 'topic'] }} />
            ))}
          </span>
          <span className="ml-auto font-serif italic text-[13px] text-[#521010]">Supported by 2 findings, 1 question closed</span>
        </div>
      </div>
    </Window>
  );
}
