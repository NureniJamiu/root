import type { SVGProps } from 'react';

/** Sidebar glyph: a panel with its left column marked. */
export function PanelLeftIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

/** Inspector glyph: a panel with its right column marked. */
export function PanelRightIcon(props: SVGProps<SVGSVGElement>): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" {...props}>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M15 3v18" />
    </svg>
  );
}
