/**
 * `App` — the root component: error boundary, auth session and router. The
 * routes themselves (and the workbench in `AppShell`) load on demand.
 */

import { AuthProvider } from '../auth';
import { RouterProvider, RootRouter } from '../routing';

import { ErrorBoundary } from './ErrorBoundary';

export { ErrorBoundary };

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider>
          <RootRouter />
        </RouterProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
