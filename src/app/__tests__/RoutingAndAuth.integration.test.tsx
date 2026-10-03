import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

// Mock the canvas layer to prevent ReactFlow / jsdom DOM sizing errors
vi.mock('../../canvas', () => ({
  CanvasView: () => <div data-testid="mock-canvas-view" />,
  computeChildPosition: () => ({ x: 0, y: 0 }),
  NODE_WIDTH: 220,
  NODE_HEIGHT: 120,
  SIBLING_GAP: 40,
}));

vi.mock('reactflow', () => ({
  default: {},
  ReactFlow: () => <div />,
  Background: () => <div />,
  Controls: () => <div />,
  Handle: () => <div />,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
  useReactFlow: () => ({ getViewport: () => ({ x: 0, y: 0, zoom: 1 }) }),
  useNodes: () => [],
  useEdges: () => [],
}));

vi.mock('reactflow/dist/style.css', () => ({}));

let mockSession: { data: { user: { id: string; email: string; name?: string } } | null; isPending: boolean } = {
  data: null,
  isPending: false,
};

vi.mock('../../lib/auth-client', () => ({
  authClient: {
    useSession: () => mockSession,
    signIn: { email: vi.fn() },
    signOut: vi.fn(),
  },
}));

describe('App Router & Auth Gating Structure', () => {
  beforeEach(() => {
    localStorage.clear();
    mockSession = { data: null, isPending: false };
    window.history.pushState({}, '', '/');
  });

  it('renders landing page on root route ("/")', async () => {
    await act(async () => {
      render(<App />);
    });

    expect(screen.getByText(/Organize your ideas visually/i)).toBeInTheDocument();
    expect(screen.getByText(/Start Creating/i)).toBeInTheDocument();
  });

  it('navigates to auth login page when clicking Sign In', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(<App />);
    });

    const signInBtn = screen.getByRole('button', { name: /Sign In/i });
    await act(async () => {
      await user.click(signInBtn);
    });

    expect(screen.getByRole('heading', { name: /Sign In/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/you@example\.com/i)).toBeInTheDocument();
  });

  it('navigates to register page when requesting account creation', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(<App />);
    });

    const createAccountBtn = screen.getByRole('button', { name: /Create Account/i });
    await act(async () => {
      await user.click(createAccountBtn);
    });

    expect(screen.getByRole('heading', { name: /Create Account/i })).toBeInTheDocument();
  });

  it('gates the dashboard route redirecting unauthenticated users to login', async () => {
    window.history.pushState({}, '', '/dashboard');

    await act(async () => {
      render(<App />);
    });

    // Should redirect to login since not authenticated
    expect(screen.getByRole('heading', { name: /Sign In/i })).toBeInTheDocument();
  });

  it('allows access to dashboard when user is authenticated', async () => {
    mockSession = {
      data: { user: { id: 'usr_1', email: 'test@root.app', name: 'Tester' } },
      isPending: false,
    };
    window.history.pushState({}, '', '/dashboard');

    await act(async () => {
      render(<App />);
    });

    // AppHeader workbench title should be visible
    expect(screen.getByText(/Root — Untitled Project/i)).toBeInTheDocument();
  });
});
