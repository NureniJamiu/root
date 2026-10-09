import React, { useState } from 'react';
import { useRouter } from '../../routing';
import { useAuth } from '../../auth';
import { AuthLayout } from './AuthLayout';
import { Button } from '../../ui';
import { authClient } from '../../lib/auth-client';

export function RegisterPage(): JSX.Element {
  const { navigate } = useRouter();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const { error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name,
      });
      if (signUpError) throw new Error(signUpError.message ?? 'Registration failed');
      await signIn(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  return (
    <AuthLayout title="Create Account" subtitle="Start organizing your ideas and creative projects">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className="block text-xs font-mono uppercase text-muted mb-1.5">
            Full Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Morgan"
            className="w-full text-sm bg-panel text-ink placeholder:text-faint border border-rule-2 px-3 py-2 rounded-sm focus:border-ink-strong outline-none font-sans"
          />
        </div>

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
          <label className="block text-xs font-mono uppercase text-muted mb-1.5">
            Password
          </label>
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
          Create Account
        </Button>

        <div className="text-center pt-2 border-t border-sunken">
          <span className="text-xs text-muted">Already registered? </span>
          <button
            type="button"
            onClick={() => navigate('/auth/login')}
            className="text-xs font-mono text-topic hover:underline ml-1"
          >
            Sign in
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
