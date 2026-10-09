/**
 * Motion helpers for the public landing page: easing, reduced-motion and
 * viewport hooks, and scroll progress.
 *
 * Every hook degrades to a still page where the browser APIs are missing
 * (jsdom in tests, very old browsers): nothing is hidden waiting for an
 * observer that never fires.
 */

import { useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

/* -------------------------------------------------------------------------- */
/* Math                                                                       */
/* -------------------------------------------------------------------------- */

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Where `v` sits between `a` and `b`, clamped to 0..1. */
export const range = (v: number, a: number, b: number): number => clamp01((v - a) / (b - a));

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/** Overshoots a little before settling, for things that pop into place. */
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

/** Mixes two `#rrggbb` colours. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number =>
    Math.round(lerp((pa >> shift) & 255, (pb >> shift) & 255, clamp01(t)));
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/* -------------------------------------------------------------------------- */
/* Environment                                                                */
/* -------------------------------------------------------------------------- */

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const canObserve = (): boolean =>
  typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function';

/** True when the visitor asked the system for less motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(REDUCED_QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(REDUCED_QUERY);
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}

/**
 * True once the element has entered the viewport (and stays true when
 * `once`). Without IntersectionObserver it reports `fallback`.
 */
export function useInView(
  ref: RefObject<Element>,
  { once = true, rootMargin = '0px 0px -12% 0px', threshold = 0, fallback = true } = {},
): boolean {
  const [inView, setInView] = useState(() => (canObserve() ? false : fallback));

  useEffect(() => {
    const el = ref.current;
    if (!el || !canObserve()) return undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, rootMargin, threshold]);

  return inView;
}

/* -------------------------------------------------------------------------- */
/* Scroll                                                                     */
/* -------------------------------------------------------------------------- */

type ProgressMode =
  /** 0 when the section's top meets the viewport top, 1 when its bottom meets the viewport bottom. For pinned (sticky) sections. */
  | 'pin'
  /** 0 when the element's top enters at the bottom of the viewport, 1 when its bottom leaves at the top. */
  | 'through'
  /** 0 when the element's top is at `start` of the viewport height, 1 when it reaches `end`. */
  | 'enter';

interface ProgressOptions {
  readonly mode?: ProgressMode;
  readonly start?: number;
  readonly end?: number;
  readonly disabled?: boolean;
}

function measure(el: Element, mode: ProgressMode, start: number, end: number): number {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || 1;
  if (mode === 'pin') {
    const span = rect.height - vh;
    return span > 0 ? clamp01(-rect.top / span) : rect.top <= 0 ? 1 : 0;
  }
  if (mode === 'through') {
    return clamp01((vh - rect.top) / (vh + rect.height));
  }
  return range(rect.top, vh * start, vh * end);
}

/**
 * Subscribes `onProgress` to the element's scroll progress. Reads happen
 * once per animation frame. Use this to write styles straight to the DOM
 * when a re-render per frame is not wanted.
 */
export function useScrollProgressCallback(
  ref: RefObject<Element>,
  onProgress: (p: number) => void,
  { mode = 'through', start = 0.9, end = 0.3, disabled = false }: ProgressOptions = {},
): void {
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || disabled || typeof window === 'undefined') return undefined;
    let frame = 0;
    const update = (): void => {
      frame = 0;
      onProgress(measure(el, mode, start, end));
    };
    const schedule = (): void => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [ref, onProgress, mode, start, end, disabled]);
}

/** The element's scroll progress as React state (see `useScrollProgressCallback`). */
export function useScrollProgress(ref: RefObject<Element>, options: ProgressOptions = {}): number {
  const [progress, setProgress] = useState(0);
  // Coarse steps keep re-renders cheap without visible stepping.
  const onProgress = useStableCallback((p: number) => setProgress(Math.round(p * 1000) / 1000));
  useScrollProgressCallback(ref, onProgress, options);
  return progress;
}

function useStableCallback<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  const [cb] = useState(() => fn);
  return cb;
}
