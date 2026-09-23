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
    sm: 'h-6 px-2 text-[11px] gap-1',
    md: 'h-8 px-3 text-[13px] gap-1.5',
    lg: 'h-9 px-4 text-[14px] gap-2',
  };

  const variantStyles: Record<ButtonVariant, { base: string; inline: React.CSSProperties }> = {
    primary: {
      base: 'bg-[#000000] text-[#ffffff] hover:bg-[#0051c3] active:bg-[#003b93] border border-[#000000] hover:border-[#0051c3]',
      inline: {},
    },
    cobalt: {
      base: 'bg-[#0051c3] text-[#ffffff] hover:bg-[#003b93] active:bg-[#002868] border border-[#0051c3]',
      inline: {},
    },
    secondary: {
      base: 'bg-[#ffffff] text-[#404040] hover:text-[#000000] border border-[#ebebeb] hover:border-[#000000] active:bg-[#f5f3f3]',
      inline: {},
    },
    ghost: {
      base: 'bg-transparent text-[#404040] hover:text-[#000000] hover:bg-[#f5f3f3] border border-transparent',
      inline: {},
    },
    destructive: {
      base: 'bg-transparent text-[#de5052] border border-[#de5052] hover:bg-[#de5052] hover:text-[#ffffff]',
      inline: {},
    },
    outline: {
      base: 'bg-[#ffffff] text-[#1b1c1c] border border-[#c3c6d6] hover:border-[#000000] active:bg-[#f5f3f3]',
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
