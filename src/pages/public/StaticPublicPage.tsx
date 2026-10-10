import type { ReactNode } from 'react';

import { PublicHeader } from './PublicHeader';
import { SiteFooter } from './landing/SiteFooter';

interface StaticPublicPageProps {
  /** Small mono label above the title. */
  readonly kicker: string;
  readonly title: string;
  readonly lede: string;
  readonly children?: ReactNode;
}

/** Shared frame for the public text pages (About, Pricing). */
export function StaticPublicPage({ kicker, title, lede, children }: StaticPublicPageProps): JSX.Element {
  return (
    <div className="min-h-screen bg-paper flex flex-col text-ink">
      <PublicHeader />

      <main className="flex-1">
        <header className="max-w-4xl mx-auto px-6 pt-16 md:pt-24 pb-12 md:pb-16">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted mb-6">{kicker}</p>
          <h1 className="font-serif font-light text-[40px] md:text-[64px] leading-[1.04] tracking-[-0.03em] text-ink m-0">
            {title}
          </h1>
          <p className="font-serif text-[19px] md:text-[22px] leading-[1.55] text-ink-2 mt-6 max-w-2xl">{lede}</p>
        </header>
        {children}
      </main>

      <SiteFooter />
    </div>
  );
}

/** A titled band of a public page, ruled off from the one before. */
export function PublicSection({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <section className="max-w-4xl mx-auto px-6 py-12 md:py-16 border-t border-rule">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted m-0 mb-8">{label}</h2>
      {children}
    </section>
  );
}
