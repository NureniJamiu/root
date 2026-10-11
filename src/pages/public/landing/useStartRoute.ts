import { useOptionalAuth } from '../../../auth';
import type { AppRoute } from '../../../routing/routes';

/**
 * Where a "start" button on the public pages should go: new visitors to
 * sign-up, people already signed in straight to their canvas.
 */
export function useStartRoute(): { readonly signedIn: boolean; readonly to: AppRoute } {
  const signedIn = useOptionalAuth()?.isAuthenticated ?? false;
  return { signedIn, to: signedIn ? '/dashboard' : '/auth/register' };
}
