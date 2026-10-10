import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

// Mock the canvas layer to prevent ReactFlow / jsdom DOM sizing errors
vi.mock('../../canvas', () => ({
  CanvasView: () => <div data-testid="mock-canvas-view" />,
  computeChildPosition: () => ({ x: 0, y: 0 }),
  computeTreeLayout: (canvas: unknown) => canvas,
  getMeasuredSizes: () => new Map(),
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

// Documents are not under test here: an empty list for every project.
vi.mock('../../lib/documents-api', () => ({
  fetchDocuments: async () => [],
  fetchBacklinks: async () => ({}),
  fetchDocument: async () => null,
  createDocumentApi: async () => null,
  updateDocumentApi: async () => ({ ok: false, status: 0, message: 'offline' }),
  deleteDocumentApi: async () => true,
  uploadAsset: async () => ({ ok: false, message: 'offline' }),
}));

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

// Routes load on demand; give the first render of each a moment under a busy test run.
const LAZY = { timeout: 8000 };

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

    expect(await screen.findByText(/Map your research. Write it up./i, {}, LAZY)).toBeInTheDocument();
    expect(screen.getByText(/Start Creating/i)).toBeInTheDocument();
  });

  it('navigates to auth login page when clicking Sign In', async () => {
    const user = userEvent.setup();
    await act(async () => {
      render(<App />);
    });

    const signInBtn = await screen.findByRole('button', { name: /Sign In/i }, LAZY);
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

    const createAccountBtn = await screen.findByRole('button', { name: /Create Account/i }, LAZY);
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
    expect(await screen.findByRole('heading', { name: /Sign In/i }, LAZY)).toBeInTheDocument();
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

    // AppHeader workbench title and the signed-in profile should be visible
    expect(await screen.findByText(/Untitled Project/i, {}, LAZY)).toBeInTheDocument();
    expect(screen.getByTestId('rail-user-profile')).toHaveTextContent('test@root.app');
  });
});
