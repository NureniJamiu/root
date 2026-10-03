import { useRouter } from './RouterContext';
import {
  LandingPage,
  StaticPublicPage,
  LoginPage,
  RegisterPage,
  ForgotPasswordPage,
  DashboardPage,
} from '../pages';

export function RootRouter(): JSX.Element {
  const { currentRoute } = useRouter();

  switch (currentRoute) {
    case '/':
      return <LandingPage />;
    case '/about':
      return (
        <StaticPublicPage
          title="About Root"
          subtitle="A minimal workbench designed to ground scientific and systematic inquiry into directed hypothesis trees."
        />
      );
    case '/pricing':
      return (
        <StaticPublicPage
          title="Pricing & Plans"
          subtitle="Free and open for individual researchers. Team collaboration features coming soon."
        />
      );
    case '/auth/login':
      return <LoginPage />;
    case '/auth/register':
      return <RegisterPage />;
    case '/auth/forgot-password':
      return <ForgotPasswordPage />;
    case '/dashboard':
      return <DashboardPage />;
    default:
      return <LandingPage />;
  }
}
