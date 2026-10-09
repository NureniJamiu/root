/**
 * Integration tests for the App shell and its save pipeline.
 *
 * Requirements exercised: 2.1, 4.1, and the AUDIT §1 data-safety invariants:
 *   - the loaded canvas is not echoed back to the server;
 *   - nothing is saved before the first load completes;
 *   - switching projects never writes one project's canvas into another;
 *   - edits are saved to the project they were made in;
 *   - a failed delete leaves the project in the list.
 *
 * Mocking strategy:
 *   - `../canvas` is replaced with a lightweight stub so we avoid pulling in
 *     React Flow, which needs ResizeObserver and other DOM APIs jsdom lacks.
 *   - `../lib/projects-api` is replaced so the "server" is a map of canvases
 *     the test controls (including when each fetch resolves).
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addRoot, emptyCanvas, updateNode } from '../../data/mutators';
import { canvasActions, useCanvasStore } from '../../data/store';
import type { CanvasState } from '../../data/store';
import type { Canvas } from '../../data';
import type { ProjectItem } from '../../layout';
import { AppShell } from '../App';

/* -------------------------------------------------------------------------- */
/* Module mocks                                                               */
/* -------------------------------------------------------------------------- */

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

// The fake server: canvases by project id, plus the calls made against it.
const server = vi.hoisted(() => ({
  canvases: new Map<string, unknown>(),
  list: [] as unknown[],
  fetchGate: new Map<string, Promise<void>>(),
  deleteResult: true,
}));

const api = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  fetchProject: vi.fn(),
  createProjectApi: vi.fn(),
  updateProjectApi: vi.fn(),
  deleteProjectApi: vi.fn(),
}));

vi.mock('../../lib/projects-api', () => api);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function cleanState(): CanvasState {
  return {
    canvas: emptyCanvas(),
    selection: { nodeId: null },
    editor: { openNodeId: null },
    deletePrompt: { nodeId: null },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function project(title: string, canvas: Canvas): ProjectItem {
  return { id: canvas.id, title, nodeCount: canvas.nodes.length, updatedAt: canvas.updatedAt };
}

/** Seed the fake server with projects built from the given canvases. */
function seedServer(...canvases: Canvas[]): void {
  server.canvases.clear();
  server.list = canvases.map((c) => project(c.title || 'Untitled', c));
  for (const c of canvases) server.canvases.set(c.id, c);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Longer than the 500 ms save debounce. */
const PAST_DEBOUNCE_MS = 700;

async function renderShell(): Promise<void> {
  await act(async () => {
    render(<AppShell />);
  });
  await waitFor(() => expect(screen.queryByTestId('projects-load-failed')).not.toBeInTheDocument());
}

function rootCanvas(title: string): Canvas {
  const c = addRoot({ ...emptyCanvas(), title }, { position: { x: 0, y: 0 } });
  return updateNode(c, c.nodes[0]!.id, { title: `${title} root` });
}

/* -------------------------------------------------------------------------- */
/* Suite                                                                      */
/* -------------------------------------------------------------------------- */

describe('App shell — integration', () => {
  beforeEach(() => {
    useCanvasStore.setState(cleanState());
    localStorage.clear();
    server.fetchGate.clear();
    server.deleteResult = true;

    api.fetchProjects.mockReset().mockImplementation(async () => server.list);
    api.fetchProject.mockReset().mockImplementation(async (id: string) => {
      await server.fetchGate.get(id);
      const canvas = server.canvases.get(id);
      return canvas ? { id, title: '', nodeCount: 0, canvas, createdAt: '', updatedAt: '' } : null;
    });
    api.createProjectApi.mockReset().mockImplementation(async (payload: { id: string; title: string }) => ({
      id: payload.id,
      title: payload.title,
      nodeCount: 0,
      updatedAt: new Date().toISOString(),
    }));
    api.updateProjectApi.mockReset().mockResolvedValue({ ok: true, status: 200 });
    api.deleteProjectApi.mockReset().mockImplementation(async () => server.deleteResult);

    seedServer({ ...emptyCanvas(), title: 'Alpha' });
  });

  /* ---------------------------------------------------------------------- */
  /* R2.1 — empty-canvas affordance                                          */
  /* ---------------------------------------------------------------------- */

  it('shows btn-create-root when the loaded project has no nodes (R2.1)', async () => {
    await renderShell();
    expect(await screen.findByTestId('btn-create-root')).toBeVisible();
  });

  it('clicking btn-create-root adds a root node to the store (R2.1)', async () => {
    const user = userEvent.setup();
    await renderShell();

    await act(async () => {
      await user.click(await screen.findByTestId('btn-create-root'));
    });

    expect(useCanvasStore.getState().canvas.nodes).toHaveLength(1);
  });

  it('creating a root with a premise uses it as the title and adds nothing else', async () => {
    const user = userEvent.setup();
    await renderShell();

    await act(async () => {
      await user.type(await screen.findByLabelText(/Main Topic or Goal/i), 'My premise');
      await user.click(screen.getByTestId('btn-create-root'));
    });

    const { nodes } = useCanvasStore.getState().canvas;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.title).toBe('My premise');
    expect(nodes[0]!.body).toBe('');
  });

  it('pressing N on an empty canvas creates a blank root, not a demo tree', async () => {
    const user = userEvent.setup();
    await renderShell();
    await screen.findByTestId('btn-create-root');

    await act(async () => {
      await user.keyboard('n');
    });

    const { nodes } = useCanvasStore.getState().canvas;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.title).toBe('');
  });

  it('"Load example" fills the canvas in one step and undo restores the empty canvas', async () => {
    const user = userEvent.setup();
    await renderShell();

    await act(async () => {
      await user.click(await screen.findByTestId('btn-load-example'));
    });
    expect(useCanvasStore.getState().canvas.nodes).toHaveLength(4);

    act(() => canvasActions.undo());
    expect(useCanvasStore.getState().canvas.nodes).toHaveLength(0);
  });

  /* ---------------------------------------------------------------------- */
  /* Loading                                                                 */
  /* ---------------------------------------------------------------------- */

  it("loads the active project's canvas from the server on mount", async () => {
    const saved = rootCanvas('Saved');
    seedServer(saved);

    await renderShell();

    await waitFor(() => expect(useCanvasStore.getState().canvas.id).toBe(saved.id));
    expect(useCanvasStore.getState().canvas.nodes).toHaveLength(1);
  });

  it('does not write the freshly loaded canvas back to the server', async () => {
    seedServer(rootCanvas('Saved'));
    await renderShell();
    await waitFor(() => expect(useCanvasStore.getState().canvas.nodes).toHaveLength(1));

    await act(async () => {
      await sleep(PAST_DEBOUNCE_MS);
    });

    expect(api.updateProjectApi).not.toHaveBeenCalled();
  });

  it('never saves before the first load completes, even if the load is slow', async () => {
    const saved = rootCanvas('Saved');
    seedServer(saved);
    let release!: () => void;
    server.fetchGate.set(saved.id, new Promise<void>((resolve) => (release = resolve)));

    await act(async () => {
      render(<AppShell />);
    });
    await act(async () => {
      await sleep(PAST_DEBOUNCE_MS); // longer than the debounce, load still pending
    });
    expect(api.updateProjectApi).not.toHaveBeenCalled();

    await act(async () => {
      release();
    });
    await waitFor(() => expect(useCanvasStore.getState().canvas.id).toBe(saved.id));
    expect(api.updateProjectApi).not.toHaveBeenCalled();
  });

  it('reports a load failure instead of offering an editable, unsaveable canvas', async () => {
    api.fetchProjects.mockResolvedValue(null);

    await act(async () => {
      render(<AppShell />);
    });

    expect(await screen.findByTestId('projects-load-failed')).toBeVisible();
    expect(screen.queryByTestId('btn-create-root')).not.toBeInTheDocument();
  });

  /* ---------------------------------------------------------------------- */
  /* Saving                                                                  */
  /* ---------------------------------------------------------------------- */

  it('saves an edit to the project it was made in, with the debounce applied', async () => {
    const saved = rootCanvas('Saved');
    seedServer(saved);
    await renderShell();
    await waitFor(() => expect(useCanvasStore.getState().canvas.id).toBe(saved.id));

    act(() => canvasActions.updateNode(saved.nodes[0]!.id, { title: 'Edited' }));
    expect(api.updateProjectApi).not.toHaveBeenCalled(); // debounced

    await waitFor(() => expect(api.updateProjectApi).toHaveBeenCalledTimes(1), { timeout: 2000 });
    const [id, payload] = api.updateProjectApi.mock.calls[0]!;
    expect(id).toBe(saved.id);
    expect(payload.canvas.nodes[0].title).toBe('Edited');
  });

  it('renaming the project goes through the validated store action and is saved', async () => {
    const saved = rootCanvas('Saved');
    seedServer(saved);
    await renderShell();
    await waitFor(() => expect(useCanvasStore.getState().canvas.id).toBe(saved.id));

    act(() => canvasActions.setTitle('Renamed'));

    await waitFor(() => expect(api.updateProjectApi).toHaveBeenCalled(), { timeout: 2000 });
    expect(api.updateProjectApi.mock.calls.at(-1)![1].title).toBe('Renamed');
  });

  /* ---------------------------------------------------------------------- */
  /* Switching projects (AUDIT §1.1)                                         */
  /* ---------------------------------------------------------------------- */

  it('switching projects never writes the old canvas into the new project', async () => {
    const user = userEvent.setup();
    const a = rootCanvas('Alpha');
    const b = rootCanvas('Beta');
    seedServer(a, b); // list order: Alpha is active
    localStorage.setItem('root-ui:active-project-id', a.id);
    await renderShell();
    await waitFor(() => expect(useCanvasStore.getState().canvas.id).toBe(a.id));

    // Beta's canvas is slow to arrive.
    let release!: () => void;
    server.fetchGate.set(b.id, new Promise<void>((resolve) => (release = resolve)));

    await act(async () => {
      await user.click(screen.getByTestId(`project-item-${b.id}`));
    });
    await act(async () => {
      await sleep(PAST_DEBOUNCE_MS);
    });
    // While the fetch is pending nothing may have been written to Beta.
    expect(api.updateProjectApi.mock.calls.filter(([id]) => id === b.id)).toHaveLength(0);
    // The store still shows Alpha; it is only replaced when Beta has loaded.
    expect(useCanvasStore.getState().canvas.id).toBe(a.id);

    await act(async () => {
      release();
    });
    await waitFor(() => expect(useCanvasStore.getState().canvas.id).toBe(b.id));
    await act(async () => {
      await sleep(PAST_DEBOUNCE_MS);
    });
    expect(api.updateProjectApi.mock.calls.filter(([id]) => id === b.id)).toHaveLength(0);

    // After the switch, edits belong to Beta.
    act(() => canvasActions.updateNode(b.nodes[0]!.id, { title: 'Beta edited' }));
    await waitFor(
      () => expect(api.updateProjectApi.mock.calls.some(([id]) => id === b.id)).toBe(true),
      { timeout: 2000 },
    );
    const betaSaves = api.updateProjectApi.mock.calls.filter(([id]) => id === b.id);
    expect(betaSaves.every(([, p]) => p.canvas.id === b.id)).toBe(true);
  });

  it("an edit made just before switching is still saved to the project it belonged to", async () => {
    const user = userEvent.setup();
    const a = rootCanvas('Alpha');
    const b = rootCanvas('Beta');
    seedServer(a, b);
    localStorage.setItem('root-ui:active-project-id', a.id);
    await renderShell();
    await waitFor(() => expect(useCanvasStore.getState().canvas.id).toBe(a.id));

    act(() => canvasActions.updateNode(a.nodes[0]!.id, { title: 'Last-second edit' }));
    await act(async () => {
      await user.click(screen.getByTestId(`project-item-${b.id}`));
    });
    await waitFor(() => expect(useCanvasStore.getState().canvas.id).toBe(b.id));

    await waitFor(
      () => expect(api.updateProjectApi.mock.calls.some(([id]) => id === a.id)).toBe(true),
      { timeout: 2000 },
    );
    const alphaSave = api.updateProjectApi.mock.calls.find(([id]) => id === a.id)!;
    expect(alphaSave[1].canvas.nodes[0].title).toBe('Last-second edit');
    expect(api.updateProjectApi.mock.calls.filter(([id]) => id === b.id)).toHaveLength(0);
  });

  /* ---------------------------------------------------------------------- */
  /* Creating and deleting projects                                          */
  /* ---------------------------------------------------------------------- */

  it('names a new project after the lowest unused number, not the list length', async () => {
    const user = userEvent.setup();
    const one = { ...emptyCanvas(), title: 'Project 1' };
    const three = { ...emptyCanvas(), title: 'Project 3' };
    seedServer(one, three); // "Project 2" was deleted earlier
    await renderShell();

    await act(async () => {
      await user.click(screen.getByTestId('btn-new-project'));
    });

    await waitFor(() => expect(api.createProjectApi).toHaveBeenCalled());
    expect(api.createProjectApi.mock.calls[0]![0].title).toBe('Project 2');
  });

  it('keeps a project in the list when the server refuses to delete it', async () => {
    const user = userEvent.setup();
    const a = rootCanvas('Alpha');
    const b = rootCanvas('Beta');
    seedServer(a, b);
    await renderShell();
    server.deleteResult = false;

    await act(async () => {
      await user.click(screen.getByTestId(`btn-delete-project-${b.id}`));
    });
    await act(async () => {
      await user.click(screen.getByTestId(`btn-confirm-delete-project-${b.id}`));
    });

    expect(api.deleteProjectApi).toHaveBeenCalledWith(b.id);
    expect(screen.getByTestId(`project-item-${b.id}`)).toBeInTheDocument();
  });

  it('removes a project from the list once the server has deleted it', async () => {
    const user = userEvent.setup();
    const a = rootCanvas('Alpha');
    const b = rootCanvas('Beta');
    seedServer(a, b);
    await renderShell();

    await act(async () => {
      await user.click(screen.getByTestId(`btn-delete-project-${b.id}`));
    });
    await act(async () => {
      await user.click(screen.getByTestId(`btn-confirm-delete-project-${b.id}`));
    });

    await waitFor(() =>
      expect(screen.queryByTestId(`project-item-${b.id}`)).not.toBeInTheDocument(),
    );
  });

  /* ---------------------------------------------------------------------- */
  /* R4.1 — NodeEditor mounts / unmounts with editor.openNodeId             */
  /* ---------------------------------------------------------------------- */

  it('NodeEditor appears when editor.openNodeId is set and disappears on close (R4.1)', async () => {
    const saved = rootCanvas('Saved');
    seedServer(saved);
    await renderShell();
    await waitFor(() => expect(useCanvasStore.getState().canvas.id).toBe(saved.id));

    act(() => {
      canvasActions.openEditor(saved.nodes[0]!.id);
    });
    expect(screen.getByTestId('node-editor')).toBeInTheDocument();

    act(() => {
      canvasActions.closeEditor();
    });
    expect(screen.queryByTestId('node-editor')).not.toBeInTheDocument();
  });
});
