import type { HTMLAttributes, ReactNode } from 'react';

export interface DividerProps extends HTMLAttributes<HTMLDivElement> {
  readonly label?: ReactNode;
}

export function Divider({ label, className = '', style, ...rest }: DividerProps): JSX.Element {
  if (!label) {
    return (
      <div
        className={`w-full h-px bg-rule ${className}`}
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
        <div className="w-full border-t border-rule" />
      </div>
      <div className="relative px-3 bg-panel font-mono text-[9px] uppercase tracking-[0.08em] text-muted select-none">
        {label}
      </div>
    </div>
  );
}
