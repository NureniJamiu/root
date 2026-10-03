import { useRouter } from '../../routing';
import { RootLogo } from '../../layout';
import { Button } from '../../ui';

export function PublicHeader(): JSX.Element {
  const { navigate } = useRouter();

  return (
    <header className="w-full border-b border-[#ebebeb] bg-[#ffffff] py-4 px-6 md:px-8 shrink-0">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div
            className="cursor-pointer hover:opacity-85 transition-opacity py-1 flex items-center"
            onClick={() => navigate('/')}
            title="Root"
          >
            <RootLogo className="h-10 w-auto min-w-[90px]" />
          </div>
          <nav className="hidden md:flex items-center gap-6 font-sans text-sm text-[#737785]">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="hover:text-[#000000] transition-colors py-1 cursor-pointer"
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => navigate('/about')}
              className="hover:text-[#000000] transition-colors py-1 cursor-pointer"
            >
              About
            </button>
            <button
              type="button"
              onClick={() => navigate('/pricing')}
              className="hover:text-[#000000] transition-colors py-1 cursor-pointer"
            >
              Pricing
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/auth/login')}
            className="text-xs uppercase tracking-wider text-[#1b1c1c] hover:bg-[#f5f3f3]"
          >
            Sign In
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="text-xs uppercase tracking-wider"
          >
            Open App
          </Button>
        </div>
      </div>
    </header>
  );
}
