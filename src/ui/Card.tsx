import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode;
}

export function Card({ children, className = '', style, ...rest }: CardProps): JSX.Element {
  return (
    <div
      className={`bg-[#ffffff] border border-[#ebebeb] rounded-[2px] ${className}`}
      style={{
        boxShadow: 'none',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
