/**
 * "What people map": a pinned section where vertical scroll drives a
 * horizontal rail of use cases. The cards hang off one long connector, like
 * ideas on a canvas: every other card is pinned straight onto the line and
 * the rest dangle below on short strings. They sway with the speed of the
 * scroll and straighten up as they reach the middle of the screen. Styles
 * are written straight to the DOM once per frame, so scrolling does not
 * re-render React.
 *
 * With reduced motion the cards hang still in an ordinary scrollable row.
 */

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

import { clamp01, easeOutCubic, usePrefersReducedMotion } from './motion';
import { Reveal } from './Reveal';
import { TYPE_COLOR } from './SceneCanvas';
import type { IdeaType } from './SceneCanvas';

interface UseCase {
  readonly title: string;
  /** Colour of the port it hangs from. */
  readonly type: IdeaType;
  readonly body: string;
  /** Sketch: dots at [x, y, type], lines between dot indexes. */
  readonly dots: readonly (readonly [number, number, IdeaType])[];
  readonly lines: readonly (readonly [number, number])[];
}

const CASES: readonly UseCase[] = [
  {
    title: 'Plan a video',
    type: 'topic',
    body: 'Hook, beats, b-roll and the questions you still have to answer, laid out on one sheet before you film a frame.',
    dots: [[30, 80, 'topic'], [120, 30, 'finding'], [120, 80, 'question'], [120, 130, 'topic'], [210, 110, 'conclusion'], [210, 150, 'finding']],
    lines: [[0, 1], [0, 2], [0, 3], [2, 4], [3, 5]],
  },
  {
    title: 'Outline an article',
    type: 'finding',
    body: 'Put the thesis at the root and let sections, sources and counterpoints branch off it until the structure writes itself.',
    dots: [[120, 20, 'topic'], [50, 80, 'finding'], [120, 80, 'finding'], [190, 80, 'question'], [120, 145, 'conclusion']],
    lines: [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 4]],
  },
  {
    title: 'Map a research question',
    type: 'question',
    body: 'Track what you know, what you suspect and what is still open. Findings in green, questions in coral, conclusions in oxblood.',
    dots: [[30, 40, 'question'], [30, 120, 'topic'], [110, 30, 'finding'], [110, 90, 'finding'], [110, 150, 'question'], [200, 80, 'conclusion']],
    lines: [[0, 2], [1, 3], [1, 4], [2, 5], [3, 5]],
  },
  {
    title: 'Brainstorm a project',
    type: 'conclusion',
    body: 'Throw every idea onto the canvas, then drag, connect and collapse until the plan you actually want is the one left standing.',
    dots: [[120, 85, 'topic'], [40, 30, 'question'], [200, 30, 'finding'], [40, 140, 'finding'], [200, 140, 'question'], [120, 160, 'conclusion']],
    lines: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5]],
  },
  {
    title: 'Prepare a talk',
    type: 'topic',
    body: 'Build the argument once, then present it as a walkthrough, revealing one idea at a time so the room follows your reasoning.',
    dots: [[20, 90, 'topic'], [75, 90, 'finding'], [130, 90, 'finding'], [185, 90, 'question'], [230, 90, 'conclusion']],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    title: 'Study for an exam',
    type: 'finding',
    body: 'Put the syllabus at the root, hang what you know off each topic and flag the questions to ask before the day.',
    dots: [[125, 20, 'topic'], [40, 80, 'finding'], [125, 80, 'finding'], [210, 80, 'finding'], [40, 145, 'question'], [210, 145, 'question']],
    lines: [[0, 1], [0, 2], [0, 3], [1, 4], [3, 5]],
  },
  {
    title: 'Plot a story',
    type: 'question',
    body: 'Lay out the spine of the plot, branch off the what-ifs and see which ending the scenes actually earn.',
    dots: [[20, 70, 'topic'], [80, 70, 'finding'], [140, 70, 'question'], [210, 30, 'conclusion'], [210, 110, 'conclusion'], [110, 145, 'finding']],
    lines: [[0, 1], [1, 2], [2, 3], [2, 4], [1, 5]],
  },
  {
    title: 'Plan a launch',
    type: 'conclusion',
    body: 'Audience, message, channels and dates on one sheet, with every open risk in coral until somebody owns it.',
    dots: [[25, 90, 'topic'], [95, 30, 'question'], [95, 90, 'finding'], [95, 150, 'finding'], [170, 90, 'conclusion'], [225, 140, 'question']],
    lines: [[0, 1], [0, 2], [0, 3], [1, 4], [2, 4], [3, 4], [4, 5]],
  },
];

function Sketch({ useCase }: { readonly useCase: UseCase }): JSX.Element {
  return (
    <svg viewBox="0 0 250 180" className="w-full h-full" aria-hidden="true">
      {useCase.lines.map(([a, b]) => {
        const [x1, y1, t1] = useCase.dots[a] as readonly [number, number, IdeaType];
        const [x2, y2] = useCase.dots[b] as readonly [number, number, IdeaType];
        const mx = (x1 + x2) / 2;
        return (
          <path
            key={`${a}-${b}`}
            className="lp-sketch-line"
            d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
            stroke={TYPE_COLOR[t1]}
            strokeWidth={1.5}
            fill="none"
            pathLength={1}
          />
        );
      })}
      {useCase.dots.map(([x, y, type], i) => (
        <g key={i}>
          <rect x={x - 14} y={y - 8} width={28} height={16} rx={2} fill="rgb(var(--panel))" stroke={TYPE_COLOR[type]} strokeWidth={1.2} />
          <rect x={x - 14} y={y - 8} width={28} height={2.5} fill={TYPE_COLOR[type]} />
        </g>
      ))}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Geometry, in multiples of the card width so it scales with the screen.     */

/** Card width: smaller on short screens so a dangling card still fits. */
const CARD_W = 'min(300px, 30vh, 72vw)';
const CARD_H_RATIO = 1.4;
const STEP = 1.18; // pin to pin
const LINE_Y = 56; // px from the top of the stage
/** Every card hangs below the line; short and long strings keep the stagger. */
const SHORT = 0.12;
const LONG = 0.4;
const REST: readonly number[] = [-9, 7, -11, 8, -7, 10, -9, 6];

/** The type colours lifted so strings and pins read on the dark stage. */
const ON_DARK: Record<IdeaType, string> = {
  topic: '#6f9cf0',
  finding: '#5fb886',
  question: '#ef7a7c',
  conclusion: '#c98585',
};

const isShort = (i: number): boolean => i % 2 === 0;
const stringOf = (i: number): number => (isShort(i) ? SHORT : LONG);
const w = (k: number): string => `calc(${CARD_W} * ${k})`;

function CaseCard({ useCase, index }: { readonly useCase: UseCase; readonly index: number }): JSX.Element {
  return (
    <article
      className="lp-case flex flex-col bg-panel border border-ink rounded-[4px] overflow-hidden"
      style={{ width: CARD_W, height: w(CARD_H_RATIO) }}
    >
      <div className="flex items-center justify-between px-4 h-9 shrink-0 border-b border-rule font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: TYPE_COLOR[useCase.type] }} />
          Use case
        </span>
        <span className="tabular-nums">0{index + 1} / 0{CASES.length}</span>
      </div>
      <div className="px-4 pt-3 pb-1 bg-canvas border-b border-rule lp-grid-soft shrink-0" style={{ height: '34%' }}>
        <Sketch useCase={useCase} />
      </div>
      <div className="px-5 py-4 flex flex-col gap-2 min-h-0">
        <h3 className="font-serif font-light text-[clamp(20px,2.9vh,26px)] leading-tight tracking-[-0.01em] text-ink">
          {useCase.title}
        </h3>
        <p className="font-serif text-[clamp(13px,1.75vh,15px)] leading-[1.55] text-ink-2 line-clamp-4 [@media(max-height:780px)]:line-clamp-3">{useCase.body}</p>
      </div>
    </article>
  );
}

/** One card on its pin, hanging on a string so the line never crosses it. */
function Hanger({ useCase, index }: { readonly useCase: UseCase; readonly index: number }): JSX.Element {
  const color = ON_DARK[useCase.type];
  const len = stringOf(index);
  return (
    <div
      className="lp-hanger absolute"
      data-rest={REST[index] ?? 0}
      style={{
        left: w(0.62 + index * STEP),
        top: LINE_Y,
        transform: `rotate(${REST[index] ?? 0}deg)`,
        zIndex: 2,
      }}
    >
      <span
        className="absolute left-0 top-0 w-0 border-l-[1.5px] border-dashed"
        style={{ height: w(len), borderColor: color }}
        aria-hidden="true"
      />
      <span
        className="absolute w-2 h-2 -ml-1 -mt-1 rounded-full bg-panel"
        style={{ top: w(len), border: `1.5px solid ${color}`, zIndex: 3 }}
        aria-hidden="true"
      />
      <div className="absolute" style={{ left: w(-0.5), top: w(len) }}>
        <CaseCard useCase={useCase} index={index} />
      </div>
    </div>
  );
}

/**
 * The connector the cards hang from, with a port at every pin. In the pinned
 * rail it runs past both ends of the stage so it always reaches the screen edge.
 */
function Line({ bleed }: { readonly bleed: boolean }): JSX.Element {
  return (
    <div className="absolute inset-x-0 pointer-events-none" style={{ top: LINE_Y, zIndex: 1 }} aria-hidden="true">
      <div
        className="absolute -top-[0.75px] h-[1.5px] bg-sunken-3/80"
        style={bleed ? { left: '-100vw', right: '-100vw' } : { left: 0, right: 0 }}
      />
      {CASES.map((c, i) => (
        <span
          key={c.title}
          className="absolute -top-[5px] w-2.5 h-2.5 rounded-full -translate-x-1/2"
          style={
            {
              left: w(0.62 + i * STEP),
              background: ON_DARK[c.type],
              boxShadow: '0 0 0 3px rgb(var(--stage))',
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** Stage size: room for every pin plus the last card's swing. */
const STAGE_W = w(0.62 + (CASES.length - 1) * STEP + 0.75);
const STAGE_H = `calc(${LINE_Y}px + ${w((LONG + CARD_H_RATIO) * 1.03 + 0.06)})`;

function RailHeading(): JSX.Element {
  return (
    <div className="w-full max-w-6xl mx-auto px-6 md:px-8 mb-6 md:mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-faint mb-3">What people map</p>
        <h2 className="font-serif font-light text-[34px] md:text-[clamp(36px,5.8vh,52px)] leading-[1.05] tracking-[-0.02em] text-on-accent max-w-2xl">
          One canvas, <span className="italic text-[#b1c5ff]">whatever you are making.</span>
        </h2>
      </div>
      <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-faint">Keep scrolling →</p>
    </div>
  );
}

/**
 * A long, eased fade from the stage into the page below, so there is no
 * seam. Stops are mixes of the two theme colours, so it holds in both themes.
 */
const STAGE_FADE = `linear-gradient(to bottom, ${[
  [0, 0],
  [14, 4],
  [30, 14],
  [50, 34],
  [68, 62],
  [84, 86],
  [100, 100],
]
  .map(([at, mix]) => `color-mix(in srgb, rgb(var(--paper)) ${mix}%, rgb(var(--stage))) ${at}%`)
  .join(', ')})`;

/**
 * The section sits on a dark stage that enters with a rounded top edge over
 * the white section above and fades out into the page below.
 */
export function UseCaseRail(): JSX.Element {
  const reduced = usePrefersReducedMotion();
  return (
    <div className="bg-panel">
      <div className="lp-dark relative bg-stage rounded-t-[32px] md:rounded-t-[56px] overflow-clip">
        <div className="absolute inset-0 lp-grid-dark pointer-events-none" aria-hidden="true" />
        {reduced ? <RailStill /> : <RailPinned />}
      </div>
      <div
        className="h-[40vh]"
        style={{
          background:
            STAGE_FADE,
        }}
        aria-hidden="true"
      />
    </div>
  );
}

/** A low glow in the logo's colours, rising from the bottom of the stage. */
function Glow(): JSX.Element {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ maskImage: 'linear-gradient(to bottom, #000 55%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to bottom, #000 55%, transparent 100%)' }}
      aria-hidden="true"
    >
      <div
        className="absolute left-1/2 bottom-[-35%] w-[110%] h-[75%] -translate-x-1/2"
        style={{
          background:
            'radial-gradient(ellipse 45% 55% at 40% 60%, rgb(var(--topic) / 0.42), transparent 70%), radial-gradient(ellipse 35% 45% at 64% 62%, rgb(var(--question) / 0.26), transparent 70%)',
          filter: 'blur(20px)',
        }}
      />
    </div>
  );
}

function RailPinned(): JSX.Element {
  const sectionRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // One loop does the travel and the sway. The sway is a damped spring
  // kicked by how fast the rail is moving, so a quick flick sets the cards
  // swinging and they settle when you stop.
  useEffect(() => {
    let raf = 0;
    let lastX: number | null = null;
    let sway = 0;
    let swayV = 0;

    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const section = sectionRef.current;
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!section || !viewport || !track) return;
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      if (rect.bottom < -50 || rect.top > vh + 50) {
        lastX = null;
        return;
      }
      const span = rect.height - vh;
      const p = span > 0 ? clamp01(-rect.top / span) : 0;
      // offsetWidth, not scrollWidth: the line bleeds past the stage on purpose.
      const travel = Math.max(0, track.offsetWidth - viewport.clientWidth);
      const x = -travel * p;
      track.style.transform = `translate3d(${x}px, 0, 0)`;

      const v = lastX === null ? 0 : x - lastX;
      lastX = x;
      swayV += (-0.06 * sway - 0.16 * swayV) + v * 0.05;
      sway = Math.max(-14, Math.min(14, sway + swayV));

      const mid = window.innerWidth / 2;
      const hangers = track.querySelectorAll<HTMLElement>('.lp-hanger');
      hangers.forEach((el, i) => {
        const pin = el.getBoundingClientRect().left;
        const d = Math.abs(pin - mid) / (window.innerWidth * 0.5);
        const straighten = easeOutCubic(clamp01(1 - d * 2.4));
        const rest = Number(el.dataset['rest'] ?? 0);
        const weight = isShort(i) ? 0.8 : 1.2;
        el.style.transform = `rotate(${rest * (1 - 0.8 * straighten) + sway * weight}deg) scale(${1 + 0.03 * straighten})`;
        el.style.zIndex = String(straighten > 0.5 ? 4 : 2);
        el.classList.toggle('is-near', d < 0.5);
      });
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <section ref={sectionRef} className="relative" style={{ height: '480vh' }}>
      <div className="sticky top-0 h-screen flex flex-col justify-center overflow-hidden pt-14">
        <Glow />
        <RailHeading />
        <div ref={viewportRef} className="w-full">
          <div ref={trackRef} className="lp-rail-pad will-change-transform" style={{ width: 'max-content' }}>
            <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
              <Line bleed />
              {CASES.map((c, i) => (
                <Hanger key={c.title} useCase={c} index={i} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RailStill(): JSX.Element {
  return (
    <section className="py-24">
      <RailHeading />
      <Reveal variant="fade" className="is-near overflow-x-auto pt-16 pb-8">
        <div className="lp-rail-pad" style={{ width: 'max-content' }}>
          <div className="relative" style={{ width: STAGE_W, height: STAGE_H }}>
            <Line bleed={false} />
            {CASES.map((c, i) => (
              <Hanger key={c.title} useCase={c} index={i} />
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
