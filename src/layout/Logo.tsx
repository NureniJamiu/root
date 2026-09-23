import type { SVGProps } from 'react';

/**
 * Official Root Logo component sourced from src/public/root-logo.svg.
 */
export function RootLogo(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg
      viewBox="0 0 206 96"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Root"
      fill="none"
      {...props}
    >
      <defs>
        <linearGradient id="rootLogoInfGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#de5052" />
          <stop offset="100%" stopColor="#0051c3" />
        </linearGradient>
      </defs>

      {/* R */}
      <g stroke="#0051c3" strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <line x1="16" y1="10" x2="16" y2="78" />
        <path d="M 16 10 C 56 10 56 50 16 50" />
        <line x1="44" y1="50" x2="70" y2="78" />
      </g>

      {/* infinity replacing "oo" */}
      <path
        d="M 98 44 C 98 24 140 24 140 44 C 140 64 98 64 98 44 C 98 24 56 24 56 44 C 56 64 98 64 98 44"
        stroke="url(#rootLogoInfGrad)"
        strokeWidth="7.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Mouth */}
      <path d="M 80 70 Q 98 84 116 70" stroke="#0051c3" strokeWidth="5.5" strokeLinecap="round" fill="none" />

      {/* Left pupil */}
      <circle cx="82" cy="43" r="5" fill="#0f172a" />
      <circle cx="84" cy="42" r="1.8" fill="white" />

      {/* Right pupil */}
      <circle cx="114" cy="43" r="5" fill="#0f172a" />
      <circle cx="112" cy="42" r="1.8" fill="white" />

      {/* t */}
      <g stroke="#0051c3" strokeWidth="7.5" strokeLinecap="round" fill="none">
        <line x1="164" y1="10" x2="164" y2="78" />
        <line x1="146" y1="36" x2="182" y2="36" />
      </g>
    </svg>
  );
}

/**
 * Official Root Mark / Logo component replacing the old black-and-white tree icon with root-logo.svg.
 */
export function RootMarkIcon({ className = '', size = 28 }: { className?: string; size?: number }): JSX.Element {
  return (
    <RootLogo
      className={`inline-block select-none shrink-0 ${className}`}
      style={{ height: size, width: 'auto' }}
    />
  );
}
