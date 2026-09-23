import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant = 'default' | 'topic' | 'finding' | 'question' | 'conclusion' | 'muted';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly variant?: BadgeVariant;
  readonly dot?: boolean;
  readonly children: ReactNode;
}

const VARIANT_CONFIG: Record<BadgeVariant, { border: string; bg: string; text: string; dotColor: string }> = {
  default: {
    border: '#ebebeb',
    bg: '#ffffff',
    text: '#1b1c1c',
    dotColor: '#1b1c1c',
  },
  topic: {
    border: '#0051c3',
    bg: 'rgba(0, 81, 195, 0.08)',
    text: '#0051c3',
    dotColor: '#0051c3',
  },
  finding: {
    border: '#2d7a4c',
    bg: 'rgba(45, 122, 76, 0.08)',
    text: '#2d7a4c',
    dotColor: '#2d7a4c',
  },
  question: {
    border: '#de5052',
    bg: 'rgba(222, 80, 82, 0.08)',
    text: '#de5052',
    dotColor: '#de5052',
  },
  conclusion: {
    border: '#521010',
    bg: 'rgba(82, 16, 16, 0.08)',
    text: '#521010',
    dotColor: '#521010',
  },
  muted: {
    border: '#ebebeb',
    bg: '#f5f3f3',
    text: '#595959',
    dotColor: '#737785',
  },
};

export function Badge({
  variant = 'default',
  dot = false,
  children,
  className = '',
  style,
  ...rest
}: BadgeProps): JSX.Element {
  const conf = VARIANT_CONFIG[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[9px] font-medium leading-[12px] tracking-[0.06em] uppercase rounded-[2px] select-none ${className}`}
      style={{
        border: `1px solid ${conf.border}`,
        backgroundColor: conf.bg,
        color: conf.text,
        padding: '2px 6px',
        ...style,
      }}
      {...rest}
    >
      {dot && (
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: conf.dotColor }}
        />
      )}
      {children}
    </span>
  );
}
