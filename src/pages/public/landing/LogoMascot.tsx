/**
 * The face from Root's logo (the two eye loops, the pupils and the smile,
 * without the R and the t), brought to life.
 *
 * MascotStage plays a short routine on its own as soon as it comes into
 * view: the two loops roll in from the sides and join into the infinity, the
 * pupils drop into place, the smile swings up, then the face blinks, glances
 * around, does a flip and winks. Once assembled its eyes follow the pointer
 * and it blinks now and then. It plays again the next time it scrolls back
 * into view. Every attribute is written straight to the SVG once per frame,
 * so nothing re-renders.
 *
 * AnimatedLogo is the full logo for the navbar, with eyes that look around
 * and blink and a smile that breathes, all in CSS.
 *
 * With reduced motion both show the finished, still face.
 */

import { useEffect, useId, useRef } from 'react';

import { canObserve, clamp01, easeInOutCubic, easeOutBack, easeOutCubic, lerp, range, usePrefersReducedMotion } from './motion';

const LOOP_L = { x: 77, y: 44 };
const LOOP_R = { x: 119, y: 44 };
const PUPIL_L = { x: 82, y: 43 };
const PUPIL_R = { x: 114, y: 43 };
const INFINITY = 'M 98 44 C 98 24 140 24 140 44 C 140 64 98 64 98 44 C 98 24 56 24 56 44 C 56 64 98 64 98 44';
const MOUTH = 'M 80 70 Q 98 84 116 70';
const FACE_CENTER = { x: 98, y: 55 };

const easeOutBounce = (t: number): number => {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t - 1.5 / d) ** 2 + 0.75;
  if (t < 2.5 / d) return n * (t - 2.25 / d) ** 2 + 0.9375;
  return n * (t - 2.625 / d) ** 2 + 0.984375;
};
/** 0 → 1 → 0 across [a, b]. */
const bump = (p: number, a: number, b: number): number => Math.sin(range(p, a, b) * Math.PI);
const DEG = 180 / Math.PI;

interface Pose {
  readonly loopL: { x: number; y: number; rot: number; rx: number };
  readonly loopR: { x: number; y: number; rot: number; rx: number };
  readonly loops: number; // opacity of the separate loops
  readonly infinity: number; // opacity of the joined infinity
  readonly draw: number; // how much of the infinity stroke is drawn
  readonly pupilL: { y: number; o: number; sy: number };
  readonly pupilR: { y: number; o: number; sy: number };
  readonly look: { x: number; y: number };
  readonly mouth: { y: number; rot: number; o: number; sy: number };
  readonly face: { sx: number; sy: number; y: number };
  readonly shadow: number;
}

/** The whole performance as a pure function of progress through it (0 to 1). */
function poseAt(p: number): Pose {
  // Act 1: the loops roll in from either side, hopping a little as they go.
  const tl = easeOutCubic(range(p, 0.02, 0.24));
  const tr = easeOutCubic(range(p, 0.05, 0.26));
  const lx = lerp(-80, LOOP_L.x, tl);
  const rx = lerp(280, LOOP_R.x, tr);
  const hop = (t: number): number => Math.abs(Math.sin(t * Math.PI * 3)) * 9 * (1 - t);
  const stretch = range(p, 0.2, 0.27);

  // Act 2: they meet, squash, and become one infinity.
  const join = range(p, 0.25, 0.31);
  const squash = bump(p, 0.26, 0.36);

  // Act 3: pupils drop in, the smile swings up.
  const dl = easeOutBounce(range(p, 0.32, 0.44));
  const dr = easeOutBounce(range(p, 0.35, 0.47));
  const m = range(p, 0.44, 0.54);
  const mb = easeOutBack(m);

  // Act 4: blink, glance left and right, flip, wink.
  const blink = 1 - 0.9 * bump(p, 0.56, 0.59);
  const glance = Math.sin(range(p, 0.6, 0.7) * Math.PI * 2) * -3.2;
  const flip = easeInOutCubic(range(p, 0.72, 0.82));
  const wink = 1 - 0.9 * bump(p, 0.86, 0.9);
  const grin = bump(p, 0.85, 0.93);

  const lift = Math.sin(flip * Math.PI) * 16;

  return {
    loopL: {
      x: lx,
      y: LOOP_L.y - hop(tl),
      rot: ((lx - LOOP_L.x) / 15) * DEG,
      rx: lerp(15, 21, stretch),
    },
    loopR: {
      x: rx,
      y: LOOP_R.y - hop(tr),
      rot: ((rx - LOOP_R.x) / 15) * DEG,
      rx: lerp(15, 21, stretch),
    },
    loops: 1 - join,
    infinity: join,
    draw: join,
    pupilL: { y: lerp(-70, 0, dl), o: range(p, 0.32, 0.34), sy: blink },
    pupilR: {
      y: lerp(-70, 0, dr),
      o: range(p, 0.35, 0.37),
      sy: Math.min(blink, wink),
    },
    look: { x: glance, y: 0 },
    mouth: {
      y: lerp(46, 0, mb),
      rot: lerp(-180, 0, mb),
      o: range(p, 0.44, 0.47),
      sy: 1 + 0.45 * grin,
    },
    face: {
      sx: (1 + 0.09 * squash) * Math.cos(flip * Math.PI * 2),
      sy: 1 - 0.1 * squash,
      y: -lift,
    },
    shadow: clamp01(Math.max(tl, tr)) * (1 - lift / 40),
  };
}

const FINAL = poseAt(1);

/** Length of the routine, from the loops rolling in to the wink. */
const SHOW_MS = 7600;

export function MascotStage({ className = '' }: { readonly className?: string }): JSX.Element {
  const reduced = usePrefersReducedMotion();
  const gid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (reduced) return undefined;
    const svg = svgRef.current;
    if (!svg) return undefined;
    const q = <T extends SVGElement>(sel: string): T => svg.querySelector(sel) as T;
    const el = {
      loopL: q<SVGGElement>('[data-m="loopL"]'),
      loopR: q<SVGGElement>('[data-m="loopR"]'),
      ellL: q<SVGEllipseElement>('[data-m="loopL"] ellipse'),
      ellR: q<SVGEllipseElement>('[data-m="loopR"] ellipse'),
      inf: q<SVGPathElement>('[data-m="inf"]'),
      pupilL: q<SVGGElement>('[data-m="pupilL"]'),
      pupilR: q<SVGGElement>('[data-m="pupilR"]'),
      lidL: q<SVGGElement>('[data-m="lidL"]'),
      lidR: q<SVGGElement>('[data-m="lidR"]'),
      mouth: q<SVGGElement>('[data-m="mouth"]'),
      face: q<SVGGElement>('[data-m="face"]'),
      shadow: q<SVGEllipseElement>('[data-m="shadow"]'),
    };

    // Eyes follow the pointer once the face is together.
    const pointer = { x: 0, y: 0, seen: false };
    const look = { x: 0, y: 0 };
    const onMove = (e: PointerEvent): void => {
      const r = svg.getBoundingClientRect();
      pointer.x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      pointer.y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      pointer.seen = true;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    // The show starts when the face is well into view, and resets once it
    // has finished and been scrolled away, so it plays again next time.
    let visible = !canObserve();
    let start: number | null = null;
    let done = false;
    const io = canObserve()
      ? new IntersectionObserver(
          ([entry]) => {
            visible = entry?.isIntersecting ?? false;
            if (!visible && done) {
              start = null;
              done = false;
            }
          },
          { threshold: 0.45 },
        )
      : null;
    io?.observe(svg);

    let raf = 0;
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      if (!visible && start === null) return;
      if (start === null) start = now;
      const p = clamp01((now - start) / SHOW_MS);
      if (p >= 1) done = true;
      const s = poseAt(p);

      const assembled = range(p, 0.5, 0.55);
      const tx = pointer.seen ? Math.max(-1, Math.min(1, pointer.x)) * 3 : 0;
      const ty = pointer.seen ? Math.max(-1, Math.min(1, pointer.y)) * 2 : 0;
      look.x += (tx * assembled - look.x) * 0.12;
      look.y += (ty * assembled - look.y) * 0.12;
      // An idle blink every few seconds, once the eyes are in.
      const idleBlink = assembled > 0.99 && now % 4300 < 130 ? 0.12 : 1;
      const bob = Math.sin(now / 950) * 1.6 * assembled;

      el.loopL.setAttribute('transform', `translate(${s.loopL.x} ${s.loopL.y}) rotate(${s.loopL.rot})`);
      el.loopR.setAttribute('transform', `translate(${s.loopR.x} ${s.loopR.y}) rotate(${s.loopR.rot})`);
      el.ellL.setAttribute('rx', String(s.loopL.rx));
      el.ellR.setAttribute('rx', String(s.loopR.rx));
      el.loopL.style.opacity = String(s.loops);
      el.loopR.style.opacity = String(s.loops);
      el.inf.style.opacity = String(s.infinity);
      el.inf.style.strokeDashoffset = String(1 - s.draw);
      const lx = s.look.x + look.x;
      const ly = s.look.y + look.y;
      el.pupilL.setAttribute('transform', `translate(${lx} ${s.pupilL.y + ly})`);
      el.pupilR.setAttribute('transform', `translate(${lx} ${s.pupilR.y + ly})`);
      el.pupilL.style.opacity = String(s.pupilL.o);
      el.pupilR.style.opacity = String(s.pupilR.o);
      el.lidL.setAttribute('transform', lid(PUPIL_L, s.pupilL.sy * idleBlink));
      el.lidR.setAttribute('transform', lid(PUPIL_R, s.pupilR.sy * idleBlink));
      el.mouth.setAttribute(
        'transform',
        `translate(0 ${s.mouth.y}) rotate(${s.mouth.rot} 98 74) translate(98 70) scale(1 ${s.mouth.sy}) translate(-98 -70)`,
      );
      el.mouth.style.opacity = String(s.mouth.o);
      el.face.setAttribute(
        'transform',
        `translate(0 ${s.face.y + bob}) translate(${FACE_CENTER.x} ${FACE_CENTER.y}) scale(${s.face.sx} ${s.face.sy}) translate(${-FACE_CENTER.x} ${-FACE_CENTER.y})`,
      );
      el.shadow.setAttribute('rx', String(34 * s.shadow * (1 - bob / 30)));
      el.shadow.style.opacity = String(0.5 * s.shadow);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      io?.disconnect();
      window.removeEventListener('pointermove', onMove);
    };
  }, [reduced]);

  // First paint: the finished face when motion is reduced, the empty stage otherwise.
  const s = reduced ? FINAL : poseAt(0);
  return (
    <svg
      ref={svgRef}
      viewBox="18 -2 160 104"
      className={`overflow-visible ${className}`}
      role="img"
      aria-label="Root's logo face"
    >
      <defs>
        <linearGradient id={`${gid}-g`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgb(var(--brand-from))" />
          <stop offset="100%" stopColor="rgb(var(--brand-to))" />
        </linearGradient>
        <linearGradient id={`${gid}-inf`} x1="56" y1="0" x2="140" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgb(var(--brand-from))" />
          <stop offset="100%" stopColor="rgb(var(--brand-to))" />
        </linearGradient>
        <radialGradient id={`${gid}-sh`}>
          <stop offset="0%" stopColor="rgb(var(--ink))" stopOpacity={0.35} />
          <stop offset="100%" stopColor="rgb(var(--ink))" stopOpacity={0} />
        </radialGradient>
      </defs>

      <ellipse data-m="shadow" cx={98} cy={96} rx={34 * s.shadow} ry={4} fill={`url(#${gid}-sh)`} opacity={0.5 * s.shadow} />

      <g data-m="face">
        <g data-m="loopL" transform={`translate(${s.loopL.x} ${s.loopL.y}) rotate(${s.loopL.rot})`} opacity={s.loops}>
          <ellipse rx={s.loopL.rx} ry={15} fill="none" stroke={`url(#${gid}-g)`} strokeWidth={7.5} />
        </g>
        <g data-m="loopR" transform={`translate(${s.loopR.x} ${s.loopR.y}) rotate(${s.loopR.rot})`} opacity={s.loops}>
          <ellipse rx={s.loopR.rx} ry={15} fill="none" stroke={`url(#${gid}-g)`} strokeWidth={7.5} />
        </g>
        <path
          data-m="inf"
          d={INFINITY}
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - s.draw}
          opacity={s.infinity}
          stroke={`url(#${gid}-inf)`}
          strokeWidth={7.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        <g
          data-m="mouth"
          opacity={s.mouth.o}
          transform={reduced ? undefined : `translate(0 ${s.mouth.y}) rotate(${s.mouth.rot} 98 74)`}
        >
          <path d={MOUTH} stroke="rgb(var(--topic))" strokeWidth={5.5} strokeLinecap="round" fill="none" />
        </g>

        <g data-m="pupilL" opacity={s.pupilL.o} transform={`translate(0 ${s.pupilL.y})`}>
          <g data-m="lidL">
            <circle cx={PUPIL_L.x} cy={PUPIL_L.y} r={5} fill="rgb(var(--ink))" />
            <circle cx={PUPIL_L.x + 2} cy={PUPIL_L.y - 1} r={1.8} fill="rgb(var(--panel))" />
          </g>
        </g>
        <g data-m="pupilR" opacity={s.pupilR.o} transform={`translate(0 ${s.pupilR.y})`}>
          <g data-m="lidR">
            <circle cx={PUPIL_R.x} cy={PUPIL_R.y} r={5} fill="rgb(var(--ink))" />
            <circle cx={PUPIL_R.x - 2} cy={PUPIL_R.y - 1} r={1.8} fill="rgb(var(--panel))" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/** Squash a pupil vertically about its own centre: a blink. */
function lid(c: { x: number; y: number }, sy: number): string {
  return `translate(${c.x} ${c.y}) scale(1 ${sy}) translate(${-c.x} ${-c.y})`;
}

/* -------------------------------------------------------------------------- */
/* Navbar logo                                                                */
/* -------------------------------------------------------------------------- */

/** The full Root logo with a living face. Motion is CSS only (landing.css). */
export function AnimatedLogo({ className = '' }: { readonly className?: string }): JSX.Element {
  const gid = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 206 96" xmlns="http://www.w3.org/2000/svg" aria-label="Root" fill="none" className={`lp-logo ${className}`}>
      <defs>
        <linearGradient id={`${gid}-g`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgb(var(--brand-from))" />
          <stop offset="100%" stopColor="rgb(var(--brand-to))" />
        </linearGradient>
      </defs>
      <g stroke="rgb(var(--topic))" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1="16" y1="10" x2="16" y2="78" />
        <path d="M 16 10 C 56 10 56 50 16 50" />
        <line x1="44" y1="50" x2="70" y2="78" />
      </g>
      <path
        className="lp-logo-loops"
        d={INFINITY}
        stroke={`url(#${gid}-g)`}
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <g className="lp-logo-mouth">
        <path d={MOUTH} stroke="rgb(var(--topic))" strokeWidth="5.5" strokeLinecap="round" fill="none" />
      </g>
      <g className="lp-logo-look">
        <g className="lp-logo-blink">
          <circle cx="82" cy="43" r="5" fill="rgb(var(--ink))" />
          <circle cx="84" cy="42" r="1.8" fill="white" />
        </g>
        <g className="lp-logo-blink lp-logo-wink">
          <circle cx="114" cy="43" r="5" fill="rgb(var(--ink))" />
          <circle cx="112" cy="42" r="1.8" fill="white" />
        </g>
      </g>
      <g stroke="rgb(var(--topic))" strokeWidth="7.5" strokeLinecap="round" fill="none">
        <line x1="164" y1="10" x2="164" y2="78" />
        <line x1="146" y1="36" x2="182" y2="36" />
      </g>
    </svg>
  );
}
