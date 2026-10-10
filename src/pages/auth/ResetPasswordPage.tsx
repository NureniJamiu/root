import { useMemo, useState } from 'react';
import { useRouter } from '../../routing';
import { AuthLayout } from './AuthLayout';
import { Button } from '../../ui';
import { authClient } from '../../lib/auth-client';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Choose a new password from the emailed link (`?token=…`). An expired or
 * already used link arrives as `?error=INVALID_TOKEN` and offers a new one.
 */
export function ResetPasswordPage(): JSX.Element {
  const { navigate } = useRouter();
  const { token, linkError } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return { token: params.get('token'), linkError: params.get('error') };
  }, []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (!token) return;
    setIsSaving(true);
    try {
      const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
      if (resetError) {
        setError(
          resetError.code === 'INVALID_TOKEN' || resetError.status === 400
            ? 'This reset link has expired or was already used. Ask for a new one.'
            : resetError.message ?? 'The password could not be changed. Try again.',
        );
        return;
      }
      setDone(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!token || linkError) {
    return (
      <AuthLayout title="Link Expired" subtitle="This password reset link is no longer valid">
        <div className="flex flex-col gap-4 text-center" data-testid="reset-password-invalid">
          <p className="text-sm text-ink-2 font-sans">
            Reset links work once and for one hour. Ask for a new link and use the latest email.
          </p>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => navigate('/auth/forgot-password')}
            className="w-full text-xs uppercase tracking-wider"
          >
            Send a New Link
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout title="Password Changed" subtitle="You can sign in with your new password">
        <div className="flex flex-col gap-4 text-center" data-testid="reset-password-done">
          <p className="text-sm text-ink-2 font-sans">
            For your security, you were signed out on your other devices.
          </p>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => navigate('/auth/login')}
            className="w-full text-xs uppercase tracking-wider"
          >
            Sign In
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a New Password" subtitle={`At least ${MIN_PASSWORD_LENGTH} characters`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="reset-password" className="block text-xs font-mono uppercase text-muted mb-1.5">
            New Password
          </label>
          <input
            id="reset-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            className="w-full text-sm bg-panel text-ink placeholder:text-faint border border-rule-2 px-3 py-2 rounded-sm focus:border-ink-strong outline-none font-sans"
          />
        </div>
        <div>
          <label htmlFor="reset-password-confirm" className="block text-xs font-mono uppercase text-muted mb-1.5">
            Repeat New Password
          </label>
          <input
            id="reset-password-confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
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
          disabled={isSaving}
          className="mt-2 w-full text-xs uppercase tracking-wider"
        >
          {isSaving ? 'Saving…' : 'Change Password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
