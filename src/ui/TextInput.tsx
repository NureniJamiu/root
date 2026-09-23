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
      className={`w-full bg-[#ffffff] text-[#000000] text-[13px] leading-[20px] font-mono placeholder:text-[#595959] rounded-[2px] border transition-colors duration-150 outline-none px-3 py-2 ${
        hasError
          ? 'border-[#de5052] focus:border-[#de5052]'
          : 'border-[#c3c6d6] hover:border-[#737785] focus:border-[#000000]'
      } ${className}`}
      style={{
        boxShadow: 'none',
        ...style,
      }}
      {...rest}
    />
  );
});
