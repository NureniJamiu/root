import type { HTMLAttributes, ReactNode } from 'react';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
}

export function Kbd({ children, className = '', style, ...rest }: KbdProps): JSX.Element {
  return (
    <kbd
      className={`inline-flex items-center justify-center font-mono text-[9px] font-medium leading-[12px] uppercase px-1.5 py-0.5 rounded-[2px] bg-[#ffffff] text-[#1b1c1c] border border-[#c3c6d6] select-none ${className}`}
      style={{
        boxShadow: 'none',
        ...style,
      }}
      {...rest}
    >
      {children}
    </kbd>
  );
}
