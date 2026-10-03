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
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#fbf9f8] text-[#1b1c1c] font-sans">
        <div className="w-6 h-6 border-2 border-[#1357c9] border-t-transparent rounded-full animate-spin mb-3" />
        <span className="font-mono text-xs tracking-wider text-[#737785] uppercase">
          Verifying session...
        </span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[#fbf9f8] text-[#1b1c1c] font-sans">
        <span className="font-mono text-xs tracking-wider text-[#737785] uppercase">
          Redirecting to sign in...
        </span>
      </div>
    );
  }

  return <>{children}</>;
}
