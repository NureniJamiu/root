import { useRouter } from '../../routing';
import { Button } from '../../ui';
import { PublicHeader } from './PublicHeader';

export function LandingPage(): JSX.Element {
  const { navigate } = useRouter();

  return (
    <div className="min-h-screen bg-[#fbf9f8] flex flex-col text-[#1b1c1c] selection:bg-[#dae2ff]">
      <PublicHeader />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#ebebeb] bg-[#ffffff] text-[11px] font-mono text-[#737785] mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#1357c9]" />
          Visual Hypothesis Graph & Research Workspace
        </div>

        <h1 className="text-4xl md:text-6xl font-serif font-normal tracking-tight text-[#1b1c1c] mb-6 leading-tight">
          Deconstruct complex ideas into structured scientific trees.
        </h1>

        <p className="text-base md:text-lg text-[#434653] font-serif max-w-2xl mb-16 leading-relaxed">
          Root gives researchers, thinkers, and teams a minimalist canvas to map premises,
          questions, findings, and conclusions with mathematical rigor.
        </p>

        <div className="flex items-center gap-4">
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate('/dashboard')}
            className="px-6 py-3 text-xs uppercase tracking-wider rounded-[2px]"
          >
            Launch Workbench
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate('/auth/register')}
            className="px-6 py-3 text-xs uppercase tracking-wider rounded-[2px]"
          >
            Create Account
          </Button>
        </div>
      </main>

      <footer className="w-full border-t border-[#ebebeb] py-6 px-6 text-center text-xs font-mono text-[#737785]">
        Root MVP · Architecture Scaffold
      </footer>
    </div>
  );
}
