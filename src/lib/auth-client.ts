import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth React client.
 * Talks to the auth API server running on port 3001.
 * Use `authClient.useSession()` in components, and
 * `authClient.signIn.email()` / `authClient.signOut()` for actions.
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_AUTH_API_URL ?? 'http://localhost:3001',
});

export const { signIn, signUp, signOut, useSession } = authClient;
