import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { AppRoute, matchRoute } from './routes';

interface RouterContextValue {
  currentRoute: AppRoute;
  pathname: string;
  navigate: (to: AppRoute | string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function RouterProvider({ children }: { readonly children: React.ReactNode }): JSX.Element {
  const [pathname, setPathname] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname || '/';
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname || '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((to: AppRoute | string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', to);
      setPathname(to);
    }
  }, []);

  const currentRoute = useMemo(() => matchRoute(pathname), [pathname]);

  const value = useMemo(
    () => ({
      currentRoute,
      pathname,
      navigate,
    }),
    [currentRoute, pathname, navigate],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter(): RouterContextValue {
  const ctx = useContext(RouterContext);
  if (!ctx) {
    throw new Error('useRouter must be used within a RouterProvider');
  }
  return ctx;
}
