import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth React client.
 *
 * Talks to the same origin as the app: in development the Vite proxy forwards
 * `/api` to the API server (port 3001), and in production a reverse proxy
 * should do the same. A same-origin base URL keeps the auth cookie and the
 * `/api/projects` calls on one origin.
 *
 * Use `authClient.useSession()` in components, and
 * `authClient.signIn.email()` / `authClient.signOut()` for actions.
 */
export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
});

export const { signIn, signUp, signOut, useSession } = authClient;
