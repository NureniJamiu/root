/**
 * The landing page footer: three numbered blocks of links on a hairline grid,
 * then Root's wordmark set across the full width with the R, the face and the
 * t joined by canvas connectors, then a slim legal line.
 *
 * The connectors draw in when the wordmark scrolls into view and the eyes
 * follow the pointer. With reduced motion the wordmark is drawn finished and
 * the eyes hold still.
 */

import { useEffect, useId, useRef } from 'react';
import type { MouseEvent, ReactNode } from 'react';

import { useRouter } from '../../../routing';
import type { AppRoute } from '../../../routing';

import { canObserve, useInView, usePrefersReducedMotion } from './motion';
import { TYPE_COLOR } from './SceneCanvas';
import type { IdeaType } from './SceneCanvas';

type FooterLink = { readonly label: string } & ({ readonly to: AppRoute } | { readonly section: string });

interface Block {
  readonly label: string;
  readonly mark: IdeaType;
  readonly columns: readonly (readonly FooterLink[])[];
}

const BLOCKS: readonly Block[] = [
  {
    label: 'Product',
    mark: 'topic',
    columns: [
      [
        { label: 'Overview', to: '/' },
        { label: 'About', to: '/about' },
        { label: 'Pricing', to: '/pricing' },
        { label: 'Open a canvas', to: '/dashboard' },
      ],
      [
        { label: 'Topics', section: 'idea-types' },
        { label: 'Findings', section: 'idea-types' },
        { label: 'Questions', section: 'idea-types' },
        { label: 'Conclusions', section: 'idea-types' },
      ],
    ],
  },
  {
    label: 'Account',
    mark: 'finding',
    columns: [
      [
        { label: 'Sign in', to: '/auth/login' },
        { label: 'Create an account', to: '/auth/register' },
        { label: 'Reset your password', to: '/auth/forgot-password' },
        { label: 'Your dashboard', to: '/dashboard' },
      ],
    ],
  },
];

export function SiteFooter(): JSX.Element {
  const { navigate } = useRouter();

  const follow = (link: FooterLink) => (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if ('section' in link) {
      document.getElementById(link.section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    navigate(link.to);
    window.scrollTo(0, 0);
  };

  const toTop = (): void => window.scrollTo({ top: 0, behavior: 'smooth' });

  return (
    <footer className="w-full bg-[#fbf9f8] text-[#1b1c1c]">
      {/* Blocks */}
      <div className="grid md:grid-cols-3 border-t border-[#ebebeb]">
        {BLOCKS.map((block, i) => (
          <BlockCell key={block.label} index={i} label={block.label} mark={block.mark}>
            <div className={`grid gap-x-6 gap-y-6 ${block.columns.length > 1 ? 'grid-cols-2' : ''}`}>
              {block.columns.map((col, c) => (
                <ul key={c} className="flex flex-col gap-1.5">
                  {col.map((link) => (
                    <li key={link.label}>
                      <a
                        href={'to' in link ? link.to : `#${link.section}`}
                        onClick={follow(link)}
                        className="lp-foot-link font-serif text-[17px] md:text-[18px] leading-[1.45] text-[#1b1c1c]"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </BlockCell>
        ))}

        <BlockCell index={2} label="Root" mark="question">
          <div className="flex flex-col gap-10 h-full justify-end">
            <p className="font-serif text-[17px] md:text-[18px] leading-[1.45] text-[#737785] max-w-[300px]">
              <span className="text-[#1b1c1c]">A canvas for ideas that branch.</span> Topics, findings, questions and conclusions,
              all in full view.
            </p>
            <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.1em]">
              <span className="inline-flex items-center gap-1.5 h-7 px-2.5 border border-[#ebebeb] rounded-[2px] bg-[#ffffff] text-[#2d7a4c]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2d7a4c] lp-foot-pulse" aria-hidden="true" />
                Free in beta
              </span>
              <button
                type="button"
                onClick={toTop}
                className="group inline-flex items-center gap-1.5 h-7 px-2.5 border border-[#ebebeb] rounded-[2px] uppercase tracking-[0.1em] text-[#434653] hover:border-[#1b1c1c] hover:text-[#1b1c1c] transition-colors"
              >
                Back to top
                <span className="transition-transform group-hover:-translate-y-0.5" aria-hidden="true">
                  ↑
                </span>
              </button>
            </div>
          </div>
        </BlockCell>
      </div>

      {/* Wordmark */}
      <div className="border-t border-[#ebebeb] bg-[#f4f3f2] overflow-hidden">
        <div className="px-4 md:px-7 pt-8 md:pt-12 pb-6 md:pb-10">
          <Wordmark />
        </div>
      </div>

      {/* Legal line */}
      <div className="border-t border-[#ebebeb] px-5 md:px-7 py-5 grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-6 font-mono text-[10px] uppercase tracking-[0.12em] text-[#737785]">
        <span className="text-[#1b1c1c]">©{new Date().getFullYear()} Root</span>
        <span>Visual idea mapping &amp; planning</span>
        <span className="md:text-center">Set in EB Garamond &amp; JetBrains Mono</span>
        <span className="md:text-right">Made for thinking out loud</span>
      </div>
    </footer>
  );
}

function BlockCell({
  index,
  label,
  mark,
  children,
}: {
  readonly index: number;
  readonly label: string;
  readonly mark: IdeaType;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col px-5 md:px-7 pt-6 pb-8 md:pb-10 md:min-h-[340px] border-b md:border-b-0 md:border-r last:border-r-0 border-[#ebebeb]">
      <div className="flex items-center justify-between mb-8 md:mb-auto">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#1b1c1c]">
          <span className="text-[#9a9da8]">0{index + 1} ·</span> {label}
        </span>
        <span className="w-2 h-2 rounded-[1px]" style={{ background: TYPE_COLOR[mark] }} aria-hidden="true" />
      </div>
      <div className="md:pt-16 flex-1 flex flex-col justify-end">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Wordmark                                                                   */
/* -------------------------------------------------------------------------- */

/** The face sits in the middle of a 600-wide line, the t at the far right. */
const FACE_X = 202;
const T_X = 406;
const INFINITY = 'M 98 44 C 98 24 140 24 140 44 C 140 64 98 64 98 44 C 98 24 56 24 56 44 C 56 64 98 64 98 44';
const MOUTH = 'M 80 70 Q 98 84 116 70';

function Wordmark(): JSX.Element {
  const gid = useId().replace(/:/g, '');
  const ref = useRef<SVGSVGElement>(null);
  const eyesRef = useRef<SVGGElement>(null);
  const reduced = usePrefersReducedMotion();
  const drawn = useInView(ref, { once: true, rootMargin: '0px 0px -10% 0px' });

  // Eyes follow the pointer while the wordmark is on screen.
  useEffect(() => {
    if (reduced || !canObserve()) return undefined;
    const svg = ref.current;
    const eyes = eyesRef.current;
    if (!svg || !eyes) return undefined;
    let visible = false;
    let frame = 0;
    let target = { x: 0, y: 0 };
    let now = { x: 0, y: 0 };
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      if (visible && !frame) frame = requestAnimationFrame(tick);
    });
    io.observe(svg);
    const onMove = (e: PointerEvent): void => {
      const r = svg.getBoundingClientRect();
      const cx = r.left + (r.width * (FACE_X + 98)) / 600;
      const cy = r.top + r.height * 0.44;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const len = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, len / 400);
      target = { x: (dx / len) * 3.2 * reach, y: (dy / len) * 2.6 * reach };
    };
    function tick(): void {
      frame = 0;
      now = { x: now.x + (target.x - now.x) * 0.14, y: now.y + (target.y - now.y) * 0.14 };
      eyes?.setAttribute('transform', `translate(${now.x.toFixed(2)} ${now.y.toFixed(2)})`);
      if (visible) frame = requestAnimationFrame(tick);
    }
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
    };
  }, [reduced]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 600 96"
      className="lp-logo lp-wordmark block w-full h-auto"
      data-in={drawn || reduced ? 'true' : 'false'}
      role="img"
      aria-label="Root"
      fill="none"
    >
      <defs>
        <linearGradient id={`${gid}-g`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#de5052" />
          <stop offset="100%" stopColor="#0051c3" />
        </linearGradient>
      </defs>

      {/* Connectors: a settled link from the R, an open (dashed) one to the t. */}
      <g className="lp-wordmark-link" style={{ transformOrigin: '84px 44px' }}>
        <line x1="84" y1="44" x2={FACE_X + 48} y2="44" stroke="#0051c3" strokeWidth="1.4" />
        <circle cx="84" cy="44" r="2.6" fill="#fbf9f8" stroke="#0051c3" strokeWidth="1.4" />
        <circle cx={FACE_X + 48} cy="44" r="2.2" fill="#0051c3" />
      </g>
      <g className="lp-wordmark-link lp-wordmark-link-late" style={{ transformOrigin: `${FACE_X + 148}px 44px` }}>
        <line x1={FACE_X + 148} y1="44" x2={T_X + 152} y2="44" stroke="#de5052" strokeWidth="1.4" strokeDasharray="5 4" />
        <circle cx={FACE_X + 148} cy="44" r="2.2" fill="#de5052" />
        <circle cx={T_X + 152} cy="44" r="2.6" fill="#fbf9f8" stroke="#de5052" strokeWidth="1.4" />
      </g>

      {/* R */}
      <g stroke="#0051c3" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="16" y1="10" x2="16" y2="78" />
        <path d="M 16 10 C 56 10 56 50 16 50" />
        <line x1="44" y1="50" x2="70" y2="78" />
      </g>

      {/* Face */}
      <g transform={`translate(${FACE_X} 0)`}>
        <path d={INFINITY} stroke={`url(#${gid}-g)`} strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
        <g className="lp-logo-mouth">
          <path d={MOUTH} stroke="#0051c3" strokeWidth="5.5" strokeLinecap="round" />
        </g>
        <g ref={eyesRef}>
          <g className="lp-logo-blink">
            <circle cx="82" cy="43" r="5" fill="#0f172a" />
            <circle cx="84" cy="42" r="1.8" fill="#ffffff" />
          </g>
          <g className="lp-logo-blink lp-logo-wink">
            <circle cx="114" cy="43" r="5" fill="#0f172a" />
            <circle cx="112" cy="42" r="1.8" fill="#ffffff" />
          </g>
        </g>
      </g>

      {/* t */}
      <g transform={`translate(${T_X} 0)`} stroke="#0051c3" strokeWidth="7.5" strokeLinecap="round">
        <line x1="164" y1="10" x2="164" y2="78" />
        <line x1="146" y1="36" x2="182" y2="36" />
      </g>
    </svg>
  );
}
