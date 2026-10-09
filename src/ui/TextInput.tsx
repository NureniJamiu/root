import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly hasError?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { hasError = false, className = '', style, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={`w-full bg-panel text-ink-strong text-[13px] leading-[20px] font-mono placeholder:text-ink-3 rounded-[2px] border transition-colors duration-150 outline-none px-3 py-2 ${
        hasError
          ? 'border-question focus:border-question'
          : 'border-rule-strong hover:border-muted focus:border-ink-strong'
      } ${className}`}
      style={{
        boxShadow: 'none',
        ...style,
      }}
      {...rest}
    />
  );
});
