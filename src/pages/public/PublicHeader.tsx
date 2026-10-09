import { useEffect, useRef } from 'react';

import { useRouter } from '../../routing';
import type { AppRoute } from '../../routing/routes';
import { Button, ThemeToggle } from '../../ui';
import { AnimatedLogo } from './landing/LogoMascot';
import './landing/landing.css';

const NAV: readonly { label: string; to: AppRoute }[] = [
  { label: 'OVERVIEW', to: '/' },
  { label: 'ABOUT', to: '/about' },
  { label: 'PRICING', to: '/pricing' },
];

/**
 * Sticky public header. It sits flat on the page at the top, then picks up
 * a paper backdrop and hairline once the page scrolls, with a thin
 * coral-to-cobalt line along its bottom edge showing how far down the page
 * the reader is.
 */
/** `wide` lines the header up with the landing page's full-width hero. */
export function PublicHeader({ wide = false }: { readonly wide?: boolean } = {}): JSX.Element {
  const { navigate, pathname } = useRouter();
  const headerRef = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = (): void => {
      frame = 0;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const y = window.scrollY;
      headerRef.current?.toggleAttribute('data-scrolled', y > 8);
      if (barRef.current) barRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
    };
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, []);

  const go = (to: AppRoute) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(to);
  };

  return (
    <header
      ref={headerRef}
      className={`lp-header group sticky top-0 z-50 w-full border-b border-transparent bg-paper/0 py-4 ${wide ? 'px-5 md:px-10' : 'px-6 md:px-8'} shrink-0 data-[scrolled]:py-2.5 data-[scrolled]:bg-paper/85 data-[scrolled]:border-rule data-[scrolled]:backdrop-blur-md`}
    >
      <div className={`${wide ? 'max-w-[1400px]' : 'max-w-6xl'} mx-auto flex items-center justify-between`}>
        <div className="flex items-center gap-8">
          <a
            href="/"
            onClick={go('/')}
            className="cursor-pointer hover:opacity-85 transition-opacity py-1 flex items-center"
            title="Root"
          >
            <AnimatedLogo className="h-10 w-auto min-w-[90px] transition-[height] duration-300 group-data-[scrolled]:h-8" />
          </a>
          <nav className="hidden md:flex items-center gap-6 font-mono font-medium text-xs uppercase tracking-wider text-muted">
            {NAV.map((item) => (
              <a
                key={item.to}
                href={item.to}
                onClick={go(item.to)}
                className={`relative hover:text-ink-strong transition-colors py-1 cursor-pointer uppercase after:absolute after:left-0 after:-bottom-0.5 after:h-px after:w-full after:bg-inverse after:origin-left after:transition-transform after:duration-300 ${
                  pathname === item.to ? 'text-ink-strong after:scale-x-100' : 'after:scale-x-0 hover:after:scale-x-100'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/auth/login')}
            className="text-xs uppercase tracking-wider text-ink hover:bg-sunken"
          >
            Sign In
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="text-xs uppercase tracking-wider"
          >
            Get Started
          </Button>
        </div>
      </div>

      <div
        ref={barRef}
        className="absolute left-0 right-0 -bottom-px h-[2px] lp-gradient-bar origin-left"
        style={{ transform: 'scaleX(0)' }}
        aria-hidden="true"
      />
    </header>
  );
}
