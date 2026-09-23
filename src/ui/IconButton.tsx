import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly label: string;
  readonly children: ReactNode;
  readonly active?: boolean;
}

export function IconButton({
  label,
  children,
  active = false,
  className = '',
  style,
  ...rest
}: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-[2px] transition-colors duration-150 select-none cursor-pointer border ${
        active
          ? 'bg-[#f0eded] text-[#000000] border-[#000000]'
          : 'bg-[#ffffff] text-[#404040] hover:text-[#000000] border-[#ebebeb] hover:border-[#000000]'
      } ${className}`}
      style={{
        boxShadow: 'none',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
