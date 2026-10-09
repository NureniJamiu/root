import React, { useState } from 'react';
import { useRouter } from '../../routing';
import { useAuth } from '../../auth';
import { AuthLayout } from './AuthLayout';
import { Button } from '../../ui';

export function LoginPage(): JSX.Element {
  const { navigate } = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await signIn(email, password);
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    }
  };

  return (
    <AuthLayout title="Sign In" subtitle="Sign in to access your projects and ideas">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-mono uppercase text-muted mb-1.5">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full text-sm bg-panel text-ink placeholder:text-faint border border-rule-2 px-3 py-2 rounded-sm focus:border-ink-strong outline-none font-sans"
          />
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5">
            <label className="block text-xs font-mono uppercase text-muted">Password</label>
            <button
              type="button"
              onClick={() => navigate('/auth/forgot-password')}
              className="text-[11px] font-mono text-topic hover:underline"
            >
              Forgot?
            </button>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full text-sm bg-panel text-ink placeholder:text-faint border border-rule-2 px-3 py-2 rounded-sm focus:border-ink-strong outline-none font-sans"
          />
        </div>

        {error && (
          <p className="text-xs text-danger font-mono">{error}</p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="md"
          className="mt-2 w-full text-xs uppercase tracking-wider"
        >
          Sign In
        </Button>

        <div className="text-center pt-2 border-t border-sunken">
          <span className="text-xs text-muted">Need an account? </span>
          <button
            type="button"
            onClick={() => navigate('/auth/register')}
            className="text-xs font-mono text-topic hover:underline ml-1"
          >
            Create one
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
