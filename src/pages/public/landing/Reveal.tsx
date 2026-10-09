import { useRef } from 'react';
import type { CSSProperties, ElementType, ReactNode } from 'react';

import { useInView } from './motion';

export type RevealVariant = 'rise' | 'fade' | 'scale' | 'left' | 'right' | 'mask';

interface RevealProps {
  readonly children: ReactNode;
  readonly as?: ElementType;
  readonly variant?: RevealVariant;
  /** Delay before this element starts, in ms. */
  readonly delay?: number;
  readonly className?: string;
  readonly style?: CSSProperties;
}

/**
 * Plays an entrance once the element scrolls into view. The motion itself
 * lives in `landing.css` (`.lp-reveal`), which also switches it off for
 * reduced motion.
 */
export function Reveal({
  children,
  as: Tag = 'div',
  variant = 'rise',
  delay = 0,
  className = '',
  style,
}: RevealProps): JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const shown = useInView(ref);

  return (
    <Tag
      ref={ref}
      className={`lp-reveal lp-reveal--${variant} ${shown ? 'is-shown' : ''} ${className}`}
      style={{ ...style, '--lp-delay': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
