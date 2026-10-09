import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'cobalt' | 'secondary' | 'ghost' | 'destructive' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly icon?: ReactNode;
  readonly children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  disabled,
  style,
  ...rest
}: ButtonProps): JSX.Element {
  const sizeClasses: Record<ButtonSize, string> = {
    sm: 'h-7 px-3 py-1 text-[11px] gap-1.5',
    md: 'h-9 px-4 py-1.5 text-[13px] gap-2',
    lg: 'h-10 px-5 py-2 text-[14px] gap-2.5',
  };

  const variantStyles: Record<ButtonVariant, { base: string; inline: React.CSSProperties }> = {
    primary: {
      base: 'bg-inverse text-on-inverse hover:bg-accent hover:text-on-accent active:bg-accent-strong border border-inverse hover:border-accent',
      inline: {},
    },
    cobalt: {
      base: 'bg-accent text-on-accent hover:bg-accent-strong active:bg-accent-deep border border-accent',
      inline: {},
    },
    secondary: {
      base: 'bg-panel text-ink-read hover:text-ink-strong border border-rule hover:border-ink-strong active:bg-sunken',
      inline: {},
    },
    ghost: {
      base: 'bg-transparent text-ink-read hover:text-ink-strong hover:bg-sunken border border-transparent',
      inline: {},
    },
    destructive: {
      base: 'bg-transparent text-question border border-question hover:bg-question-fill hover:text-on-accent',
      inline: {},
    },
    outline: {
      base: 'bg-panel text-ink border border-rule-strong hover:border-ink-strong active:bg-sunken',
      inline: {},
    },
  };

  const { base, inline } = variantStyles[variant];

  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex items-center justify-center font-mono font-medium rounded-[2px] transition-colors duration-150 select-none whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${sizeClasses[size]} ${base} ${className}`}
      style={{
        boxShadow: 'none',
        ...inline,
        ...style,
      }}
      {...rest}
    >
      {icon && <span className="inline-flex shrink-0 items-center justify-center">{icon}</span>}
      {children}
    </button>
  );
}
