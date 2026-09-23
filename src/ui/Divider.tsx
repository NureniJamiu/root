import type { HTMLAttributes, ReactNode } from 'react';

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  readonly label?: ReactNode;
}

export function Divider({ label, className = '', style, ...rest }: DividerProps): JSX.Element {
  if (!label) {
    return (
      <div
        className={`w-full h-px bg-[#ebebeb] ${className}`}
        style={style}
        {...rest}
      />
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center w-full my-4 ${className}`}
      style={style}
      {...rest}
    >
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-[#ebebeb]" />
      </div>
      <div className="relative px-3 bg-[#ffffff] font-mono text-[9px] uppercase tracking-[0.08em] text-[#737785] select-none">
        {label}
      </div>
    </div>
  );
}
