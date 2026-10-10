/**
 * Application routes and navigation contracts.
 */

export type AppRoute =
  | '/'
  | '/about'
  | '/pricing'
  | '/auth/login'
  | '/auth/register'
  | '/auth/forgot-password'
  | '/auth/reset-password'
  | '/dashboard';

export interface RouteMatch {
  route: AppRoute;
  pathname: string;
}

/**
 * Normalizes browser pathname to a supported AppRoute or fallback.
 */
export function matchRoute(pathname: string): AppRoute {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';

  switch (cleanPath) {
    case '':
    case '/':
      return '/';
    case '/about':
      return '/about';
    case '/pricing':
      return '/pricing';
    case '/auth/login':
    case '/login':
      return '/auth/login';
    case '/auth/register':
    case '/register':
    case '/signup':
      return '/auth/register';
    case '/auth/forgot-password':
    case '/forgot-password':
      return '/auth/forgot-password';
    case '/auth/reset-password':
    case '/reset-password':
      return '/auth/reset-password';
    case '/dashboard':
    case '/app':
      return '/dashboard';
    default:
      return '/';
  }
}
