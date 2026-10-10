import { useState } from 'react';
import { useRouter } from '../../routing';
import { AuthLayout } from './AuthLayout';
import { Button } from '../../ui';
import { authClient } from '../../lib/auth-client';

/**
 * Ask for a password reset link. The server emails a link to
 * `/auth/reset-password?token=…` when the address has an account; the page
 * says the same thing either way so it does not reveal which emails exist.
 */
export function ForgotPasswordPage(): JSX.Element {
  const { navigate } = useRouter();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSending(true);
    try {
      const { error: requestError } = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });
      if (requestError) {
        setError(
          requestError.status === 429
            ? 'Too many requests. Wait a minute, then try again.'
            : requestError.message ?? 'The reset link could not be sent. Try again.',
        );
        return;
      }
      setSubmitted(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <AuthLayout title="Reset Password" subtitle="Enter your email and we will send you a link to choose a new password">
      {submitted ? (
        <div className="flex flex-col gap-4 text-center" data-testid="forgot-password-sent">
          <p className="text-sm text-ink-2 font-sans">
            If <strong>{email}</strong> has a Root account, a reset link is on its way. It works for one hour.
          </p>
          <p className="text-xs text-muted font-sans">Nothing arrived? Check your spam folder, or try again.</p>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => navigate('/auth/login')}
            className="w-full text-xs uppercase tracking-wider"
          >
            Return to Sign In
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="forgot-email" className="block text-xs font-mono uppercase text-muted mb-1.5">
              Email Address
            </label>
            <input
              id="forgot-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full text-sm bg-panel text-ink placeholder:text-faint border border-rule-2 px-3 py-2 rounded-sm focus:border-ink-strong outline-none font-sans"
            />
          </div>

          {error && (
            <p className="text-xs text-danger font-mono" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={isSending}
            className="mt-2 w-full text-xs uppercase tracking-wider"
          >
            {isSending ? 'Sending…' : 'Send Reset Link'}
          </Button>

          <div className="text-center pt-2 border-t border-sunken">
            <button
              type="button"
              onClick={() => navigate('/auth/login')}
              className="text-xs font-mono text-topic hover:underline"
            >
              Remembered your password? Sign in
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
