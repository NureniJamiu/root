import React, { useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useRouter } from '../routing';

interface AuthGuardProps {
  readonly children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps): JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();
  const { navigate } = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate('/auth/login');
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-paper text-ink font-sans">
        <div className="w-6 h-6 border-2 border-topic border-t-transparent rounded-full animate-spin mb-3" />
        <span className="font-mono text-xs tracking-wider text-muted uppercase">
          Verifying session...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-paper text-ink font-sans">
        <span className="font-mono text-xs tracking-wider text-muted uppercase">
          Redirecting to sign in...
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
