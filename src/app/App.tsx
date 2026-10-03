/**
 * `App` — the top-level shell for the Root MVP.
 *
 * Responsibilities (Requirements 2.1, 2.4, 3.3, 8.3, 8.4, 13.1–13.5):
 *
 *   - Mount effect: load the persisted canvas via `loadInitialCanvas()`,
 *     seed the store, and install the debounced persistence middleware;
 *     the cleanup runs on unmount (R8.3, R8.4).
 *   - Render `CanvasView` for the node graph surface (R2.1).
 *   - Render `NodeEditor` when `state.editor.openNodeId !== null` (R2.4,
 *     R3.3).
 *   - Render `DeletePrompt` when `state.deletePrompt.nodeId !== null`
 *     (R7.1–7.6).
 *   - Empty-canvas affordance: when `canvas.nodes.length === 0`, display a
 *     centered "Create root node" button that calls `canvasActions.addRoot`
 *     with a default center position (R2.1).
 *   - ErrorBoundary: wrap the whole tree so unhandled render errors are
 *     caught and shown as a plain fallback UI rather than a blank screen.
 *   - Toast surface: subscribe to `onSaveError` (from the data store) and
 *     to `onLoadError` / `onSaveError` (from the persistence layer); render
 *     dismissable toasts that auto-dismiss after 4 seconds.
 *
 * Import boundaries (design.md §Layered Dependency Table):
 *   - `app/` sits above all other layers and may import from `canvas/`,
 *     `nodes/`, `data/`, and `persistence/`.
 *   - `nodes/` and `canvas/` must NOT import from each other's internals;
 *     this file is the only legal cross-layer junction.
 */

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { CanvasView, computeChildPosition } from '../canvas';
import type { CanvasViewControls, DragState } from '../canvas';
import {
  canvasActions,
  emptyCanvas,
  parseCanvas,
  useCanvasStore,
  onSaveError as onStoreSaveError,
} from '../data';
import type { Canvas, NodeType, UUID } from '../data';
import {
  AppHeader,
  EmptyCanvasState,
  NodeInspectorRail,
  StructuralIndexRail,
} from '../layout';
import type { ProjectItem } from '../layout';
import {
  DeletePrompt,
  NodeEditor,
  ToolbarCallbacksProvider,
} from '../nodes';
import type { DeleteMode, ToolbarCallbacks } from '../nodes';
import {
  installPersistenceMiddleware,
  loadInitialCanvas,
  onLoadError,
  onSaveError as onPersistenceSaveError,
  UI_ACTIVE_PROJECT_KEY,
  UI_PROJECTS_OPEN_KEY,
  UI_INSPECTOR_OPEN_KEY,
} from '../persistence';
import { AuthProvider, useOptionalAuth } from '../auth';
import { RouterProvider, RootRouter } from '../routing';
import {
  fetchProjects,
  fetchProject,
  createProjectApi,
  updateProjectApi,
  deleteProjectApi,
} from '../lib/projects-api';

/* -------------------------------------------------------------------------- */
/* ToolbarCallbacks — module scope so identity is stable across renders      */
/* -------------------------------------------------------------------------- */

/**
 * The concrete callback bundle installed on the toolbar context. Reads
 * the current canvas from the store, delegates to
 * `computeChildPosition` for a non-overlapping position, and hands the
 * result to `canvasActions.addChild`.
 *
 * Held at module scope so its identity is stable across re-renders,
 * which avoids re-triggering context consumers on every `App` render.
 */
const toolbarCallbacks: ToolbarCallbacks = {
  onAddChild(parentId: UUID) {
    const { canvas } = useCanvasStore.getState();
    const position = computeChildPosition(canvas, parentId);
    canvasActions.addChild(parentId, position);
  },
};

/* -------------------------------------------------------------------------- */
/* Toast                                                                      */
/* -------------------------------------------------------------------------- */

interface Toast {
  id: number;
  message: string;
}

let toastCounter = 0;

/** How long (ms) before a toast auto-dismisses. */
const TOAST_LIFETIME_MS = 4_000;

function ToastSurface(): JSX.Element {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const addToast = useCallback((message: string) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, TOAST_LIFETIME_MS);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    // Subscribe to schema-level save errors from the data store.
    const unsubStore = onStoreSaveError((detail) => {
      addToast(`Save error (${detail.action}): ${detail.message}`);
    });
    // Subscribe to I/O-level save errors from the persistence middleware.
    const unsubPersistSave = onPersistenceSaveError((detail) => {
      addToast(`Storage write error: ${detail.message}`);
    });
    // Subscribe to load errors from the persistence layer.
    const unsubLoad = onLoadError((detail) => {
      addToast(`Could not restore saved canvas: ${detail.message}`);
    });
    return () => {
      unsubStore();
      unsubPersistSave();
      unsubLoad();
    };
  }, [addToast]);

  if (toasts.length === 0) return <></>;

  return (
    <div
      data-testid="toast-surface"
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 100,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid="toast"
          style={{
            background: '#191818',         // color.text.primary (dark surface for toasts)
            color: '#ffffff',              // color.surface.raised
            border: '1px solid #312e2e',   // color.text.tertiary
            borderRadius: 6,               // radius.xs
            padding: '8px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            pointerEvents: 'auto',
            fontSize: 13,                  // font.size.sm
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#ff3c00', // color.surface.strong
              flexShrink: 0,
            }}
          />
          <span style={{ letterSpacing: '-0.01em' }}>{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            className="transition-colors hover:text-[#ff3c00]"
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
              fontFamily: 'inherit',
              fontSize: 14,
              opacity: 0.8,
            }}
            data-testid="toast-dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* ErrorBoundary                                                              */
/* -------------------------------------------------------------------------- */

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  { readonly children: ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { readonly children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console so developers see the trace; no remote reporting.
    console.error('[Root ErrorBoundary]', error, info);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          data-testid="error-boundary-fallback"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: 12,                       // space.6
            color: '#191818',              // color.text.primary
          }}
        >
          <p style={{ margin: 0 }}>Something went wrong.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              border: '1px solid #312e2e',   // color.text.tertiary
              background: '#ffffff',          // color.surface.raised
              color: '#191818',               // color.text.primary
              padding: '4px 12px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* -------------------------------------------------------------------------- */
/* AppShell                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Default center position for the first root node when created from the
 * empty-canvas affordance. Chosen to place the node near the visual center
 * of a typical viewport.
 */
const ROOT_INITIAL_POSITION = { x: 400, y: 300 } as const;

export function AppShell(): JSX.Element {
  const canvas = useCanvasStore((s) => s.canvas);
  const openNodeId = useCanvasStore((s) => s.editor.openNodeId);
  const deleteNodeId = useCanvasStore((s) => s.deletePrompt.nodeId);
  const auth = useOptionalAuth();

  const [canvasControls, setCanvasControls] = useState<CanvasViewControls | null>(null);
  const [activeTypeFilter, setActiveTypeFilter] = useState<NodeType | null>(null);

  // Pane closable states — initialized from UI preferences in localStorage
  const [isProjectsOpen, setIsProjectsOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(UI_PROJECTS_OPEN_KEY);
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(UI_INSPECTOR_OPEN_KEY);
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleProjects = useCallback(() => {
    setIsProjectsOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(UI_PROJECTS_OPEN_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const toggleInspector = useCallback(() => {
    setIsInspectorOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(UI_INSPECTOR_OPEN_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);

  const [isPanActive, setIsPanActive] = useState(false);
  const [dragInfo, setDragInfo] = useState<DragState | null>(null);

  // Projects list state backed by SQLite Database
  const [projects, setProjects] = useState<readonly ProjectItem[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');

  // Compute branch count (distinct non-null parentIds)
  const branchCount = useMemo(() => {
    const parentIds = new Set(
      canvas.nodes
        .filter((n) => n.parentId !== null)
        .map((n) => n.parentId),
    );
    return parentIds.size;
  }, [canvas.nodes]);

  // Stable cleanup ref so the effect teardown always cancels the latest
  // installed middleware without stale-closure issues.
  const cleanupRef = useRef<(() => void) | null>(null);
  const dbSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function initializeDashboard() {
      // 1. One-time migration of any legacy database-like localStorage keys
      try {
        const legacyProjectsRaw = localStorage.getItem('root-mvp:projects');
        if (legacyProjectsRaw) {
          const legacyProjects: ProjectItem[] = JSON.parse(legacyProjectsRaw);
          for (const p of legacyProjects) {
            const rawCanvas = localStorage.getItem(`root-mvp:project:${p.id}`);
            let cData: Canvas | null = null;
            if (rawCanvas) {
              const parsed = parseCanvas(rawCanvas);
              if (parsed.ok) cData = parsed.canvas;
            }
            if (!cData) {
              cData = { ...emptyCanvas(), id: p.id, title: p.title };
            }
            await updateProjectApi(p.id, {
              title: p.title,
              canvas: cData,
              nodeCount: p.nodeCount,
            });
            localStorage.removeItem(`root-mvp:project:${p.id}`);
          }
          localStorage.removeItem('root-mvp:projects');
        }
      } catch (_err) {
        /* ignore */
      }

      // 2. Fetch projects from SQLite database
      const dbProjects = await fetchProjects();
      if (!isMounted) return;

      const fallbackCanvas = loadInitialCanvas();

      let activeId =
        localStorage.getItem(UI_ACTIVE_PROJECT_KEY) ||
        localStorage.getItem('root-mvp:active-project-id');
      let currentProjects = dbProjects;

      if (currentProjects.length === 0) {
        // Create initial default project in SQLite database
        const created = await createProjectApi({
          id: fallbackCanvas.id,
          title: fallbackCanvas.title || 'Idea Canvas',
          canvas: fallbackCanvas,
          nodeCount: fallbackCanvas.nodes.length,
        });
        const initialItem: ProjectItem = created ?? {
          id: fallbackCanvas.id,
          title: fallbackCanvas.title || 'Idea Canvas',
          nodeCount: fallbackCanvas.nodes.length,
          updatedAt: fallbackCanvas.updatedAt,
        };
        currentProjects = [initialItem];
        activeId = initialItem.id;
      }

      if (!activeId || !currentProjects.some((p) => p.id === activeId)) {
        activeId = currentProjects[0]!.id;
      }

      setProjects(currentProjects);
      setActiveProjectId(activeId);
      try {
        localStorage.setItem(UI_ACTIVE_PROJECT_KEY, activeId);
        localStorage.removeItem('root-mvp:active-project-id');
      } catch {}

      // 3. Load active project canvas document from database
      const projDetail = await fetchProject(activeId);
      if (!isMounted) return;

      const initialCanvas = projDetail?.canvas ?? fallbackCanvas;
      canvasActions; // ensure the actions object is initialized
      useCanvasStore.setState({ canvas: initialCanvas });
    }

    initializeDashboard();

    // 4. Install the debounced persistence middleware (for memory sync & emergency crash tolerance)
    cleanupRef.current = installPersistenceMiddleware();

    return () => {
      isMounted = false;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  // Sync active project canvas, title and node count to SQLite database in real time (debounced)
  useEffect(() => {
    if (!activeProjectId) return;

    // Optimistically update project summary in memory
    setProjects((prev) =>
      prev.map((p) =>
        p.id === activeProjectId
          ? {
              ...p,
              title: canvas.title || p.title,
              nodeCount: canvas.nodes.length,
              updatedAt: canvas.updatedAt,
            }
          : p,
      ),
    );

    // Debounce save to database (500ms)
    if (dbSyncTimeoutRef.current) {
      clearTimeout(dbSyncTimeoutRef.current);
    }
    dbSyncTimeoutRef.current = setTimeout(() => {
      updateProjectApi(activeProjectId, {
        title: canvas.title,
        canvas,
        nodeCount: canvas.nodes.length,
      });
    }, 500);

    return () => {
      if (dbSyncTimeoutRef.current) {
        clearTimeout(dbSyncTimeoutRef.current);
      }
    };
  }, [canvas, activeProjectId]);

  const handleNewProject = useCallback(async () => {
    // Flush current canvas to database before switching
    const currentCanvas = useCanvasStore.getState().canvas;
    if (activeProjectId) {
      await updateProjectApi(activeProjectId, {
        title: currentCanvas.title,
        canvas: currentCanvas,
        nodeCount: currentCanvas.nodes.length,
      });
    }

    const newCanvas: Canvas = {
      ...emptyCanvas(),
      title: `Project ${projects.length + 1}`,
    };

    const created = await createProjectApi({
      id: newCanvas.id,
      title: newCanvas.title,
      canvas: newCanvas,
      nodeCount: 0,
    });

    const newProjectItem: ProjectItem = created ?? {
      id: newCanvas.id,
      title: newCanvas.title,
      nodeCount: 0,
      updatedAt: newCanvas.updatedAt,
    };

    const nextProjects = [newProjectItem, ...projects.filter((p) => p.id !== newProjectItem.id)];
    setProjects(nextProjects);
    setActiveProjectId(newCanvas.id);
    try {
      localStorage.setItem(UI_ACTIVE_PROJECT_KEY, newCanvas.id);
    } catch (_err) {}

    useCanvasStore.setState({
      canvas: newCanvas,
      selection: { nodeId: null },
      editor: { openNodeId: null },
    });
  }, [projects, activeProjectId]);

  const handleSelectProject = useCallback(
    async (id: string) => {
      if (id === activeProjectId) return;
      // Flush current project canvas to database before switching
      const currentCanvas = useCanvasStore.getState().canvas;
      if (activeProjectId) {
        updateProjectApi(activeProjectId, {
          title: currentCanvas.title,
          canvas: currentCanvas,
          nodeCount: currentCanvas.nodes.length,
        });
      }

      const target = projects.find((p) => p.id === id);
      if (target) {
        setActiveProjectId(id);
        try {
          localStorage.setItem(UI_ACTIVE_PROJECT_KEY, id);
        } catch (_err) {}

        const projDetail = await fetchProject(id);
        const targetCanvas: Canvas = projDetail?.canvas ?? {
          ...emptyCanvas(),
          id: target.id,
          title: target.title,
        };

        useCanvasStore.setState({
          canvas: targetCanvas,
          selection: { nodeId: null },
          editor: { openNodeId: null },
        });
        setTimeout(() => canvasControls?.fitView(), 50);
      }
    },
    [activeProjectId, projects, canvasControls],
  );

  const handleDeleteProject = useCallback(
    async (idToDelete: string) => {
      deleteProjectApi(idToDelete);
      const remaining = projects.filter((p) => p.id !== idToDelete);

      if (idToDelete === activeProjectId) {
        if (remaining.length > 0) {
          const next = remaining[0]!;
          setProjects(remaining);
          setActiveProjectId(next.id);
          try {
            localStorage.setItem(UI_ACTIVE_PROJECT_KEY, next.id);
          } catch (_err) {}

          const nextProj = await fetchProject(next.id);
          const targetCanvas: Canvas = nextProj?.canvas ?? {
            ...emptyCanvas(),
            id: next.id,
            title: next.title,
          };
          useCanvasStore.setState({
            canvas: targetCanvas,
            selection: { nodeId: null },
            editor: { openNodeId: null },
          });
          setTimeout(() => canvasControls?.fitView(), 50);
        } else {
          // If all projects deleted, create a fresh default project in database
          const newCanvas: Canvas = {
            ...emptyCanvas(),
            title: 'Idea Canvas',
          };
          const created = await createProjectApi({
            id: newCanvas.id,
            title: newCanvas.title,
            canvas: newCanvas,
            nodeCount: 0,
          });
          const newProjectItem: ProjectItem = created ?? {
            id: newCanvas.id,
            title: newCanvas.title,
            nodeCount: 0,
            updatedAt: newCanvas.updatedAt,
          };
          setProjects([newProjectItem]);
          setActiveProjectId(newCanvas.id);
          try {
            localStorage.setItem(UI_ACTIVE_PROJECT_KEY, newCanvas.id);
          } catch (_err) {}
          useCanvasStore.setState({
            canvas: newCanvas,
            selection: { nodeId: null },
            editor: { openNodeId: null },
          });
        }
      } else {
        setProjects(remaining);
      }
    },
    [projects, activeProjectId, canvasControls],
  );

  const handleDeleteConfirm = useCallback(
    (mode: DeleteMode) => {
      if (deleteNodeId === null) return;
      if (mode === 'nodeOnly') {
        canvasActions.deleteNodeOnly(deleteNodeId);
      } else {
        canvasActions.deleteSubtree(deleteNodeId);
      }
    },
    [deleteNodeId],
  );

  const handleDeleteCancel = useCallback(() => {
    canvasActions.closeDeletePrompt();
  }, []);

  const handleEditorClose = useCallback(() => {
    canvasActions.closeEditor();
  }, []);

  const handleCreateRoot = useCallback((premise?: string) => {
    canvasActions.addRoot(ROOT_INITIAL_POSITION);
    const chosen = premise || 'Content Strategy: Launching a Video Series';
    setTimeout(() => {
      const root = useCanvasStore.getState().canvas.nodes[0];
      if (root) {
        if (!premise || chosen.includes('Content Strategy') || chosen.includes('Weekly Content Plan')) {
          canvasActions.updateNode(root.id, {
            title: chosen || 'Content Strategy: Launching a Video Series',
            body: 'Outlining topics, hooks, and production steps to produce high-impact, engaging content consistently.',
          });

          // Pre-populate branches matching visual guide
          canvasActions.addChild(root.id, { x: root.position.x + 380, y: root.position.y - 140 });
          canvasActions.addChild(root.id, { x: root.position.x + 380, y: root.position.y + 40 });
          canvasActions.addChild(root.id, { x: root.position.x + 380, y: root.position.y + 280 });

          setTimeout(() => {
            const nodes = useCanvasStore.getState().canvas.nodes;
            const qNode = nodes[1];
            const fNode = nodes[2];
            const cNode = nodes[3];
            if (qNode) {
              canvasActions.updateNode(qNode.id, {
                title: 'What core questions and hooks hook viewers first?',
                type: 'question',
                body: 'Reviewing top viewer comments, community questions, and real pain points to frame relatable hooks.',
              });
            }
            if (fNode) {
              canvasActions.updateNode(fNode.id, {
                title: 'Short visual breakdowns generate 3x higher retention',
                type: 'finding',
                body: 'Audience testing showed 73% higher completion rate when points are accompanied by clear visual cards and diagrams.',
              });
              canvasActions.addImage(fNode.id, {
                id: crypto.randomUUID(),
                dataUrl:
                  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="225" viewBox="0 0 400 225"><rect width="400" height="225" fill="%230b1120"/><rect x="30" y="30" width="100" height="70" rx="4" fill="%231e293b" stroke="%233b82f6" stroke-width="2"/><text x="80" y="70" fill="%23ffffff" font-family="sans-serif" font-size="12" text-anchor="middle">HOOK</text><path d="M130 65 L170 65" stroke="%233b82f6" stroke-width="2" stroke-dasharray="4"/><rect x="170" y="30" width="100" height="70" rx="4" fill="%231e293b" stroke="%2310b981" stroke-width="2"/><text x="220" y="70" fill="%23ffffff" font-family="sans-serif" font-size="12" text-anchor="middle">BREAKDOWN</text><path d="M270 65 L310 65" stroke="%2310b981" stroke-width="2" stroke-dasharray="4"/><rect x="310" y="30" width="60" height="70" rx="4" fill="%231e293b" stroke="%23f59e0b" stroke-width="2"/><text x="340" y="70" fill="%23ffffff" font-family="sans-serif" font-size="12" text-anchor="middle">CTA</text><path d="M80 140 Q200 110 320 170" stroke="%2338bdf8" stroke-width="3" fill="none"/><circle cx="80" cy="140" r="4" fill="%2338bdf8"/><circle cx="200" cy="125" r="4" fill="%2338bdf8"/><circle cx="320" cy="170" r="4" fill="%2338bdf8"/><text x="200" y="195" fill="%2394a3b8" font-family="sans-serif" font-size="11" text-anchor="middle">Retention Curve Across Video Sections</text></svg>',
                addedAt: new Date().toISOString(),
              });
              canvasActions.select(fNode.id);
            }
            if (cNode) {
              canvasActions.updateNode(cNode.id, {
                title: 'Publish weekly 5-minute guides with actionable takeaways',
                type: 'conclusion',
                body: 'Adopt a simple 3-part formula: intriguing hook, 3 visual examples, and one concrete action step to test immediately.',
              });
            }
          }, 0);
        } else {
          canvasActions.updateNode(root.id, { title: chosen });
        }
      }
    }, 0);
  }, []);

  // When a node is selected, ensure the node inspector slides open
  const handleNodeSelect = useCallback(() => {
    setIsInspectorOpen(true);
  }, []);

  // When clicking on empty canvas pane, close the inspector
  const handleCanvasPaneClick = useCallback(() => {
    setIsInspectorOpen(false);
    canvasActions.select(null);
  }, []);

  // Clicking anywhere outside the canvas (if not on a node or another node) closes the inspector
  useEffect(() => {
    function handleGlobalPointerDown(e: MouseEvent) {
      if (!isInspectorOpen) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // If clicking inside the node inspector rail, keep open
      if (target.closest('[data-testid="node-inspector-rail"]')) return;
      // If clicking a node card or interactive element on a node, keep open
      if (target.closest('.react-flow__node') || target.closest('[data-testid^="node-card-"]')) return;
      // If clicking buttons that toggle/open inspector or dialogs, keep open
      if (
        target.closest('[data-testid="btn-toggle-inspector"]') ||
        target.closest('[data-testid="btn-open-inspector"]') ||
        target.closest('[data-testid="node-editor"]') ||
        target.closest('[data-testid="delete-prompt"]')
      ) {
        return;
      }

      // Otherwise, close inspector pane
      setIsInspectorOpen(false);
      canvasActions.select(null);
    }

    window.addEventListener('pointerdown', handleGlobalPointerDown);
    return () => window.removeEventListener('pointerdown', handleGlobalPointerDown);
  }, [isInspectorOpen]);

  // Global shortcut: press 'N' or 'n' to create root node when canvas has no nodes
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        (e.key === 'n' || e.key === 'N') &&
        !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)
      ) {
        if (useCanvasStore.getState().canvas.nodes.length === 0) {
          e.preventDefault();
          handleCreateRoot();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateRoot]);

  return (
    <ToolbarCallbacksProvider value={toolbarCallbacks}>
      <div
        id="root-app"
        className="w-screen h-screen flex flex-col bg-[#f9f9fb] overflow-hidden select-none"
        style={{
          width: '100vw',
          height: '100vh',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top App Header */}
        <AppHeader
          title={canvas.title || 'Root — Untitled Project'}
          onTitleChange={(title) => {
            const currentCanvas = useCanvasStore.getState().canvas;
            useCanvasStore.setState({ canvas: { ...currentCanvas, title } });
          }}
          nodeCount={canvas.nodes.length}
          branchCount={branchCount}
          zoomPercent={canvasControls?.zoomPercent ?? 100}
          onZoomIn={() => canvasControls?.zoomIn()}
          onZoomOut={() => canvasControls?.zoomOut()}
          onFitView={() => canvasControls?.fitView()}
          onCenterRoot={() => canvasControls?.centerRoot()}
          onAddNode={() => {
            if (canvas.nodes.length === 0) {
              handleCreateRoot();
            } else {
              const root = canvas.nodes[0];
              if (root) toolbarCallbacks.onAddChild(root.id);
            }
          }}
          isPanActive={isPanActive}
          onTogglePan={() => setIsPanActive((prev) => !prev)}
          isSidebarOpen={isProjectsOpen}
          onToggleSidebar={toggleProjects}
          isInspectorOpen={isInspectorOpen}
          onToggleInspector={toggleInspector}
          activeTypeFilter={activeTypeFilter}
          onSelectTypeFilter={setActiveTypeFilter}
          onNavigateHome={() => {
            if (typeof window !== 'undefined') {
              window.history.pushState({}, '', '/');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}
          onSignOut={async () => {
            try {
              await auth?.signOut();
            } catch (_err) {
              /* ignore */
            }
            if (typeof window !== 'undefined') {
              window.history.pushState({}, '', '/auth/login');
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }}
        />

        {/* 3-Pane Workbench Body */}
        <div className="flex-1 w-full flex overflow-hidden relative">
          {/* Left: Projects Rail (280px) with slide transition */}
          <div
            className={`h-full transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
              isProjectsOpen
                ? 'w-[280px] translate-x-0 opacity-100'
                : 'w-0 -translate-x-full opacity-0 pointer-events-none'
            }`}
          >
            <StructuralIndexRail
              nodeCount={canvas.nodes.length}
              isOpen={isProjectsOpen}
              onClose={() => {
                setIsProjectsOpen(false);
                try {
                  localStorage.setItem(UI_PROJECTS_OPEN_KEY, 'false');
                } catch {}
              }}
              projects={projects}
              activeProjectId={activeProjectId}
              onSelectProject={handleSelectProject}
              onNewProject={handleNewProject}
              onDeleteProject={handleDeleteProject}
            />
          </div>

          {/* Center: Canvas Viewport */}
          <div className="flex-1 h-full relative overflow-hidden">
            {/* If Projects sidebar is closed, provide a dock toggle button at top-left of canvas */}
            {!isProjectsOpen && (
              <button
                type="button"
                onClick={() => setIsProjectsOpen(true)}
                className="absolute top-3 left-3 z-20 p-1.5 bg-[#ffffff] border border-[#ebebeb] hover:border-[#000000] rounded-[2px] shadow-sm text-[#737785] hover:text-[#000000] transition-all cursor-pointer"
                title="Open Projects Sidebar"
                aria-label="Open Projects Sidebar"
                data-testid="btn-open-projects"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M9 3v18" />
                  <path d="m14 9-3 3 3 3" />
                </svg>
              </button>
            )}

            {/* If Node Inspector is closed, provide a dock toggle button at top-right of canvas */}
            {!isInspectorOpen && (
              <button
                type="button"
                onClick={() => setIsInspectorOpen(true)}
                className="absolute top-3 right-3 z-20 p-1.5 bg-[#ffffff] border border-[#ebebeb] hover:border-[#000000] rounded-[2px] shadow-sm text-[#737785] hover:text-[#000000] transition-all cursor-pointer"
                title="Open Node Inspector"
                aria-label="Open Node Inspector"
                data-testid="btn-open-inspector"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect width="18" height="18" x="3" y="3" rx="2" />
                  <path d="M15 3v18" />
                  <path d="m10 15 3-3-3-3" />
                </svg>
              </button>
            )}

            <CanvasView
              onControlsReady={setCanvasControls}
              onNodeSelect={handleNodeSelect}
              onPaneClick={handleCanvasPaneClick}
              onDragChange={setDragInfo}
              isPanActive={isPanActive}
            />

            {/* Empty Canvas Affordance (R2.1) */}
            {canvas.nodes.length === 0 && (
              <EmptyCanvasState onCreateRoot={handleCreateRoot} />
            )}
          </div>

          {/* Right: Node Inspector Rail (360px) with slide transition */}
          <div
            className={`h-full transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${
              isInspectorOpen
                ? 'w-[360px] translate-x-0 opacity-100'
                : 'w-0 translate-x-full opacity-0 pointer-events-none'
            }`}
          >
            <NodeInspectorRail
              isOpen={isInspectorOpen}
              onClose={() => {
                setIsInspectorOpen(false);
                try {
                  localStorage.setItem(UI_INSPECTOR_OPEN_KEY, 'false');
                } catch {}
              }}
              onOpenEditor={(id) => canvasActions.openEditor(id)}
              onAddChild={(id) => toolbarCallbacks.onAddChild(id)}
              dragInfo={dragInfo}
            />
          </div>
        </div>

        {/* Node editor — rendered as a fixed overlay when a node is open. */}
        {openNodeId !== null && (
          <NodeEditor nodeId={openNodeId} onClose={handleEditorClose} />
        )}

        {/* Delete prompt — rendered as a fixed overlay when a delete is
            pending. */}
        {deleteNodeId !== null && (
          <DeletePrompt
            nodeId={deleteNodeId}
            onCancel={handleDeleteCancel}
            onConfirm={handleDeleteConfirm}
          />
        )}

        {/* Toast surface — subscribes to error buses and renders toasts. */}
        <ToastSurface />
      </div>
    </ToolbarCallbacksProvider>
  );
}

/* -------------------------------------------------------------------------- */
/* Public export                                                              */
/* -------------------------------------------------------------------------- */

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
