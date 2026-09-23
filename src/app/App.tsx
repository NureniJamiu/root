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
  useRef,
  useState,
} from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { CanvasView, computeChildPosition } from '../canvas';
import {
  canvasActions,
  useCanvasStore,
  onSaveError as onStoreSaveError,
} from '../data';
import type { UUID } from '../data';
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
} from '../persistence';

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
        bottom: 16,
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
            background: '#1a1a1a',
            color: '#ffffff',
            border: '1px solid #404040',
            borderRadius: 4,
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            pointerEvents: 'auto',
            fontFamily: 'Times, serif',
            fontSize: 14,
          }}
        >
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss"
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: 0,
              lineHeight: 1,
              fontFamily: 'inherit',
              fontSize: 16,
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

class ErrorBoundary extends Component<
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
            gap: 12,
            fontFamily: 'Times, serif',
            color: '#000000',
          }}
        >
          <p style={{ margin: 0 }}>Something went wrong.</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              border: '1px solid #404040',
              background: '#ffffff',
              color: '#000000',
              padding: '4px 12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
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

function AppShell(): JSX.Element {
  const canvas = useCanvasStore((s) => s.canvas);
  const openNodeId = useCanvasStore((s) => s.editor.openNodeId);
  const deleteNodeId = useCanvasStore((s) => s.deletePrompt.nodeId);

  // Stable cleanup ref so the effect teardown always cancels the latest
  // installed middleware without stale-closure issues.
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // 1. Load persisted canvas and seed the store.
    const initialCanvas = loadInitialCanvas();
    canvasActions; // ensure the actions object is initialized
    useCanvasStore.setState({ canvas: initialCanvas });

    // 2. Install the debounced persistence middleware.
    cleanupRef.current = installPersistenceMiddleware();

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

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

  const handleCreateRoot = useCallback(() => {
    canvasActions.addRoot(ROOT_INITIAL_POSITION);
  }, []);

  return (
    <ToolbarCallbacksProvider value={toolbarCallbacks}>
      <div
        id="root-app"
        style={{
          width: '100vw',
          height: '100vh',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Canvas surface — always rendered; CanvasView handles empty state
            by rendering an empty React Flow surface. The empty-canvas
            affordance overlay is layered on top when there are no nodes. */}
        <CanvasView />

        {/* Empty-canvas affordance (R2.1): shown only when the canvas has
            no nodes yet, so the user has a clear CTA to create the root. */}
        {canvas.nodes.length === 0 && (
          <div
            data-testid="empty-canvas-affordance"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <button
              type="button"
              onClick={handleCreateRoot}
              data-testid="btn-create-root"
              style={{
                border: '1px solid #404040',
                background: '#ffffff',
                color: '#000000',
                padding: '8px 20px',
                cursor: 'pointer',
                fontFamily: 'Times, serif',
                fontSize: 16,
                pointerEvents: 'auto',
              }}
            >
              Create root node
            </button>
          </div>
        )}

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
      <AppShell />
    </ErrorBoundary>
  );
}
