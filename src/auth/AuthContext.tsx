import React, { createContext, useContext, useMemo, useCallback } from 'react';
import type { AuthState, AuthUser } from './types';
import { authClient } from '../lib/auth-client';

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { readonly children: React.ReactNode }): JSX.Element {
  const { data: session, isPending: isLoading } = authClient.useSession();

  const user: AuthUser | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name ?? undefined,
      }
    : null;

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await authClient.signIn.email({ email, password });
    if (error) {
      throw new Error(error.message ?? 'Sign in failed');
    }
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      signIn,
      signOut,
    }),
    [user, isLoading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
