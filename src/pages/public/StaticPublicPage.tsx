import { useRouter } from '../../routing';
import { PublicHeader } from './PublicHeader';
import { Button } from '../../ui';

interface StaticPublicPageProps {
  readonly title: string;
  readonly subtitle: string;
}

export function StaticPublicPage({ title, subtitle }: StaticPublicPageProps): JSX.Element {
  const { navigate } = useRouter();

  return (
    <div className="min-h-screen bg-[#fbf9f8] flex flex-col text-[#1b1c1c]">
      <PublicHeader />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 max-w-2xl mx-auto text-center">
        <h1 className="text-3xl font-serif text-[#1b1c1c] mb-4">{title}</h1>
        <p className="text-[#434653] font-serif mb-8">{subtitle}</p>

        <Button
          variant="secondary"
          size="md"
          onClick={() => navigate('/')}
          className="text-xs uppercase tracking-wider"
        >
          Return Home
        </Button>
      </main>
    </div>
  );
}
