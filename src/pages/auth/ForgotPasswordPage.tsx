import { useState } from 'react';
import { useRouter } from '../../routing';
import { AuthLayout } from './AuthLayout';
import { Button } from '../../ui';

export function ForgotPasswordPage(): JSX.Element {
  const { navigate } = useRouter();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <AuthLayout title="Reset Password" subtitle="Enter your email to receive recovery instructions">
      {submitted ? (
        <div className="flex flex-col gap-4 text-center">
          <p className="text-xs text-[#434653] font-sans">
            Instructions to reset your password have been sent to <strong>{email || 'your email'}</strong>.
          </p>
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
            <label className="block text-xs font-mono uppercase text-[#737785] mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full text-sm border border-[#ebebeb] px-3 py-2 rounded-sm focus:border-[#000000] outline-none font-sans"
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="md"
            className="mt-2 w-full text-xs uppercase tracking-wider"
          >
            Send Reset Instructions
          </Button>

          <div className="text-center pt-2 border-t border-[#f5f3f3]">
            <button
              type="button"
              onClick={() => navigate('/auth/login')}
              className="text-xs font-mono text-[#0051c3] hover:underline"
            >
              Remembered your password? Sign in
            </button>
          </div>
        </form>
      )}
    </AuthLayout>
  );
}
