import { lazy, Suspense } from 'react';

import { useRouter } from './RouterContext';
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from '../pages/auth';

// The landing page (animations) and the dashboard (canvas, editor) are the two
// heavy routes; each loads only when it is visited.
const LandingPage = lazy(() => import('../pages/public/LandingPage').then((m) => ({ default: m.LandingPage })));
const AboutPage = lazy(() => import('../pages/public/AboutPage').then((m) => ({ default: m.AboutPage })));
const PricingPage = lazy(() => import('../pages/public/PricingPage').then((m) => ({ default: m.PricingPage })));
const DashboardPage = lazy(() => import('../pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));

function RouteFallback(): JSX.Element {
  return <div className="min-h-screen bg-paper" aria-busy="true" />;
}

function Route(): JSX.Element {
  const { currentRoute } = useRouter();

  switch (currentRoute) {
    case '/':
      return <LandingPage />;
    case '/about':
      return <AboutPage />;
    case '/pricing':
      return <PricingPage />;
    case '/auth/login':
      return <LoginPage />;
    case '/auth/register':
      return <RegisterPage />;
    case '/auth/forgot-password':
      return <ForgotPasswordPage />;
    case '/auth/reset-password':
      return <ResetPasswordPage />;
    case '/dashboard':
      return <DashboardPage />;
    default:
      return <LandingPage />;
  }
}

export function RootRouter(): JSX.Element {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Route />
    </Suspense>
  );
}
