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
          subtitle="A clean visual canvas designed to help creators, writers, and thinkers turn scattered ideas into clear, connected plans."
        />
      );
    case '/pricing':
      return (
        <StaticPublicPage
          title="Simple, Free While in Beta"
          subtitle="Free for individual creators and thinkers. Team collaboration and sharing features coming soon."
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
