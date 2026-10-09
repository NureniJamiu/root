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
    <div className="min-h-screen bg-paper flex flex-col text-ink">
      <PublicHeader />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 max-w-2xl mx-auto text-center">
        <h1 className="text-3xl font-serif text-ink mb-4">{title}</h1>
        <p className="text-ink-2 font-serif mb-8">{subtitle}</p>

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
