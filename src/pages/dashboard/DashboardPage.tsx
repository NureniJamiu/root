import { AppShell } from '../../app/App';
import { AuthGuard } from '../../auth';

/**
 * DashboardPage represents the gated workbench area.
 * Protected by AuthGuard.
 */
export function DashboardPage(): JSX.Element {
  return (
    <AuthGuard>
      <AppShell />
    </AuthGuard>
  );
}
