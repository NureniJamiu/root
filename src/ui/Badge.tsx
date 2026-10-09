import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant = 'default' | 'topic' | 'finding' | 'question' | 'conclusion' | 'muted';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  readonly variant?: BadgeVariant;
  readonly dot?: boolean;
  readonly children: ReactNode;
}

const VARIANT_CONFIG: Record<BadgeVariant, { border: string; bg: string; text: string; dotColor: string }> = {
  default: {
    border: 'rgb(var(--rule))',
    bg: 'rgb(var(--panel))',
    text: 'rgb(var(--ink))',
    dotColor: 'rgb(var(--ink))',
  },
  topic: {
    border: 'rgb(var(--topic))',
    bg: 'rgb(var(--topic) / 0.08)',
    text: 'rgb(var(--topic))',
    dotColor: 'rgb(var(--topic))',
  },
  finding: {
    border: 'rgb(var(--finding))',
    bg: 'rgb(var(--finding) / 0.08)',
    text: 'rgb(var(--finding))',
    dotColor: 'rgb(var(--finding))',
  },
  question: {
    border: 'rgb(var(--question))',
    bg: 'rgb(var(--question) / 0.08)',
    text: 'rgb(var(--question))',
    dotColor: 'rgb(var(--question))',
  },
  conclusion: {
    border: 'rgb(var(--conclusion))',
    bg: 'rgb(var(--conclusion) / 0.08)',
    text: 'rgb(var(--conclusion))',
    dotColor: 'rgb(var(--conclusion))',
  },
  muted: {
    border: 'rgb(var(--rule))',
    bg: 'rgb(var(--sunken))',
    text: 'rgb(var(--ink-3))',
    dotColor: 'rgb(var(--muted))',
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
