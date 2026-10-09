import { useCallback, useRef } from 'react';

import { clamp01, usePrefersReducedMotion, useScrollProgressCallback } from './motion';

interface ScrubTextProps {
  /** Words wrapped in `*asterisks*` are set in italic cobalt. */
  readonly text: string;
  readonly className?: string;
}

/**
 * A statement whose words ink in one after another as it scrolls up the
 * screen. Word opacity is written to the DOM directly, once per frame.
 */
export function ScrubText({ text, className = '' }: ScrubTextProps): JSX.Element {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduced = usePrefersReducedMotion();
  const words = text.split(' ');

  const onProgress = useCallback((p: number) => {
    const el = ref.current;
    if (!el) return;
    const spans = el.querySelectorAll<HTMLElement>('[data-word]');
    const n = spans.length;
    spans.forEach((span, i) => {
      const local = clamp01(p * (n + 4) - i);
      span.style.opacity = String(0.14 + 0.86 * local);
    });
  }, []);

  useScrollProgressCallback(ref, onProgress, { mode: 'enter', start: 0.85, end: 0.25, disabled: reduced });

  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => {
        const accent = w.startsWith('*');
        const clean = w.replace(/\*/g, '');
        return (
          <span
            key={i}
            data-word=""
            className={accent ? 'italic text-topic' : undefined}
            style={{ opacity: reduced ? 1 : 0.14, transition: 'opacity 120ms linear' }}
          >
            {clean}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </p>
  );
}
