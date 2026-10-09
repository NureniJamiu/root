import React from 'react';
import { useRouter } from '../../routing';
import { RootLogo } from '../../layout';

interface AuthLayoutProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: React.ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps): JSX.Element {
  const { navigate } = useRouter();

  return (
    <div className="min-h-screen bg-[#fbf9f8] flex flex-col justify-center items-center p-6 text-[#1b1c1c]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8 cursor-pointer" onClick={() => navigate('/')}>
          <RootLogo className="h-9 w-auto mb-3" />
          <h1 className="text-xl font-serif font-medium text-[#1b1c1c] tracking-tight">{title}</h1>
          {subtitle && <p className="text-xs text-[#737785] font-sans mt-1">{subtitle}</p>}
        </div>

        <div className="bg-[#ffffff] border border-[#ebebeb] rounded-sm p-6">
          {children}
        </div>

        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-xs font-mono text-[#737785] hover:text-[#000000] transition-colors"
          >
            ← Back to Root home
          </button>
        </div>
      </div>
    </div>
  );
}
