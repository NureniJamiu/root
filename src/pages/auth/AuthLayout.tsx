import React from 'react';
import { useRouter } from '../../routing';
import { RootLogo } from '../../layout/Logo';
import { ThemeToggle } from '../../ui';

interface AuthLayoutProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: React.ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps): JSX.Element {
  const { navigate } = useRouter();

  return (
    <div className="min-h-screen bg-paper flex flex-col justify-center items-center p-6 text-ink">
      <ThemeToggle className="fixed top-4 right-4" />
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 cursor-pointer" onClick={() => navigate('/')}>
          <RootLogo className="h-9 w-auto mb-3" />
          <h1 className="text-xl font-serif font-medium text-ink tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-muted font-sans mt-1">{subtitle}</p>}
        </div>

        <div className="bg-panel border border-rule rounded-sm p-6">
          {children}
        </div>

        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs font-mono text-muted hover:text-ink-strong transition-colors"
          >
            ← Back to Root home
          </button>
        </div>
      </div>
    </div>
  );
}
