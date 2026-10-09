/**
 * `App` — the top-level shell for the Root MVP.
 *
 * Responsibilities (Requirements 2.1, 2.4, 3.3, 13.1–13.5):
 *
 *   - Wire the project list, active project and save pipeline (`useProjects`)
 *     to the canvas store.
 *   - Render `CanvasView` for the node graph surface (R2.1).
 *   - Render `NodeEditor` when `state.editor.openNodeId !== null` (R2.4,
 *     R3.3).
 *   - Render `DeletePrompt` when `state.deletePrompt.nodeId !== null`
 *     (R7.1–7.6).
 *   - Empty-canvas affordance: when the loaded project has no ideas, offer to
 *     create the main idea or load the worked example (R2.1).
 *   - ErrorBoundary and toast surface live in their own modules.
 *
 * Import boundaries (design.md §Layered Dependency Table):
 *   - `app/` sits above all other layers and may import from `canvas/`,
 *     `nodes/`, `data/`, and `persistence/`.
 *   - `nodes/` and `canvas/` must NOT import from each other's internals;
 *     this file is the only legal cross-layer junction.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CanvasView, computeChildPosition, getMeasuredSizes } from '../canvas';
import type { CanvasViewControls, DragState } from '../canvas';
import {
  CANVAS_TITLE_MAX,
  canvasActions,
  rootNode,
  useCanvasStore,
} from '../data';
import type { NodeType, UUID } from '../data';
import {
  AppHeader,
  EmptyCanvasState,
  NodeInspectorRail,
  StructuralIndexRail,
} from '../layout';
import {
  DeletePrompt,
  NodeEditor,
  ToolbarCallbacksProvider,
} from '../nodes';
import type { DeleteMode, ToolbarCallbacks } from '../nodes';
import {
  UI_PROJECTS_OPEN_KEY,
  UI_INSPECTOR_OPEN_KEY,
} from '../persistence';
import { AuthProvider, useOptionalAuth } from '../auth';
import { RouterProvider, RootRouter } from '../routing';

import { ErrorBoundary } from './ErrorBoundary';
import { ToastSurface } from './Toasts';
import { buildExampleCanvas } from './exampleCanvas';
import { useProjects } from './useProjects';

export { ErrorBoundary };

// Handles for tests and the e2e suite. Development builds only.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  const debugWindow = window as unknown as Record<string, unknown>;
  debugWindow.__ROOT_CANVAS_STORE__ = useCanvasStore;
  debugWindow.__ROOT_CANVAS_ACTIONS__ = canvasActions;
}

/* -------------------------------------------------------------------------- */
/* ToolbarCallbacks — module scope so identity is stable across renders      */
/* -------------------------------------------------------------------------- */

/**
 * The concrete callback bundle installed on the toolbar context. Reads
 * the current canvas from the store, delegates to
 * `computeChildPosition` for a non-overlapping position (using the measured
 * card sizes), and hands the result to `canvasActions.addChild`.
 *
 * Held at module scope so its identity is stable across re-renders,
 * which avoids re-triggering context consumers on every `App` render.
 */
const toolbarCallbacks: ToolbarCallbacks = {
  onAddChild(parentId: UUID) {
    const { canvas } = useCanvasStore.getState();
    const position = computeChildPosition(canvas, parentId, getMeasuredSizes());
    canvasActions.addChild(parentId, position);
  },
};

/* -------------------------------------------------------------------------- */
/* AppShell                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Default center position for the first root node when created from the
 * empty-canvas affordance. Chosen to place the node near the visual center
 * of a typical viewport.
 */
const ROOT_INITIAL_POSITION = { x: 400, y: 300 } as const;

/** Below this width the sidebar and inspector are not shown together. */
const NARROW_VIEWPORT_QUERY = '(max-width: 1099px)';

function isNarrowViewport(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(NARROW_VIEWPORT_QUERY).matches;
}

function readPanePreference(key: string): boolean {
  try {
    const stored = localStorage.getItem(key);
    return stored !== null ? stored === 'true' : true;
  } catch {
    return true;
  }
}

function writePanePreference(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* preference is best-effort */
  }
}

export function AppShell(): JSX.Element {
  const canvas = useCanvasStore((s) => s.canvas);
  const openNodeId = useCanvasStore((s) => s.editor.openNodeId);
  const deleteNodeId = useCanvasStore((s) => s.deletePrompt.nodeId);
  const selectedNodeId = useCanvasStore((s) => s.selection.nodeId);
  const auth = useOptionalAuth();

  const canvasControlsRef = useRef<CanvasViewControls | null>(null);
  const handleControlsReady = useCallback((controls: CanvasViewControls) => {
    canvasControlsRef.current = controls;
  }, []);
  const [activeTypeFilter, setActiveTypeFilter] = useState<NodeType | null>(null);

  // Pane open/closed state — initialized from UI preferences in localStorage.
  // On a narrow viewport opening one pane closes the other so the canvas keeps
  // room to work in; that automatic close is not remembered as a preference.
  const [isProjectsOpen, setIsProjectsOpen] = useState<boolean>(
    () => readPanePreference(UI_PROJECTS_OPEN_KEY) && !(isNarrowViewport() && readPanePreference(UI_INSPECTOR_OPEN_KEY)),
  );
  const [isInspectorOpen, setIsInspectorOpen] = useState<boolean>(() =>
    readPanePreference(UI_INSPECTOR_OPEN_KEY),
  );

  const setProjectsOpen = useCallback((next: boolean) => {
    setIsProjectsOpen(next);
    writePanePreference(UI_PROJECTS_OPEN_KEY, next);
    if (next && isNarrowViewport()) setIsInspectorOpen(false);
  }, []);

  const setInspectorOpen = useCallback((next: boolean) => {
    setIsInspectorOpen(next);
    writePanePreference(UI_INSPECTOR_OPEN_KEY, next);
    if (next && isNarrowViewport()) setIsProjectsOpen(false);
  }, []);

  const [isPanActive, setIsPanActive] = useState(false);
  const [dragInfo, setDragInfo] = useState<DragState | null>(null);

  const { projects, activeProjectId, isLoading, saveStatus, createProject, selectProject, deleteProject } =
    useProjects({
      onActivated: () => {
        setTimeout(() => canvasControlsRef.current?.fitView(), 50);
      },
    });

  // Every idea except the root hangs off a branch, so branches = ideas - 1.
  const branchCount = Math.max(0, canvas.nodes.length - 1);

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

  /** Create the main idea; with a premise it becomes the idea's title. */
  const handleCreateRoot = useCallback((premise?: string) => {
    canvasActions.addRoot(ROOT_INITIAL_POSITION);
    const root = rootNode(useCanvasStore.getState().canvas);
    if (root && premise) canvasActions.updateNode(root.id, { title: premise });
  }, []);

  const handleLoadExample = useCallback(() => {
    canvasActions.applyCanvas(buildExampleCanvas(useCanvasStore.getState().canvas));
    setTimeout(() => canvasControlsRef.current?.fitView(), 50);
  }, []);

  // Selecting an idea reveals the inspector. Closing it is left to the
  // header toggle so the pane never disappears out from under the user.
  const handleNodeSelect = useCallback(() => {
    setInspectorOpen(true);
  }, [setInspectorOpen]);

  const handleCanvasPaneClick = useCallback(() => {
    canvasActions.select(null);
  }, []);

  const addIdeaParent = useMemo(
    () => canvas.nodes.find((n) => n.id === selectedNodeId) ?? rootNode(canvas),
    [canvas, selectedNodeId],
  );

  const handleAddIdea = useCallback(() => {
    if (!addIdeaParent) {
      handleCreateRoot();
      return;
    }
    toolbarCallbacks.onAddChild(addIdeaParent.id);
  }, [addIdeaParent, handleCreateRoot]);

  const navigateTo = useCallback((path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await auth?.signOut();
    } catch (_err) {
      /* ignore */
    }
    navigateTo('/auth/login');
  }, [auth, navigateTo]);

  const isReady = activeProjectId !== '';

  // Global shortcuts: N starts the first idea; Ctrl/Cmd+Z undoes, Shift+Z / Y redoes.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
        return;
      }
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isReady && useCanvasStore.getState().canvas.nodes.length === 0) {
          e.preventDefault();
          handleCreateRoot();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) canvasActions.redo();
          else canvasActions.undo();
        } else if (key === 'y') {
          e.preventDefault();
          canvasActions.redo();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCreateRoot, isReady]);

  return (
    <ToolbarCallbacksProvider value={toolbarCallbacks}>
      <div
        id="root-app"
        className="w-screen h-screen flex bg-[#f9f9fb] overflow-hidden select-none"
        style={{
          width: '100vw',
          height: '100vh',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Left: Projects sidebar — full height, owns brand + account */}
        <div
          className={`h-full transition-[width,opacity] duration-200 ease-out shrink-0 overflow-hidden ${
            isProjectsOpen ? 'w-[264px] opacity-100' : 'w-0 opacity-0 pointer-events-none'
          }`}
          aria-hidden={!isProjectsOpen}
        >
          <StructuralIndexRail
            nodeCount={canvas.nodes.length}
            onClose={() => setProjectsOpen(false)}
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={selectProject}
            onNewProject={createProject}
            onDeleteProject={deleteProject}
            onNavigateHome={() => navigateTo('/')}
            user={auth?.user ?? null}
            onSignOut={handleSignOut}
          />
        </div>

        {/* Right: workbench column (header above canvas + inspector) */}
        <div className="flex-1 min-w-0 h-full flex flex-col">
          <AppHeader
            title={canvas.title || 'Untitled Project'}
            titleMaxLength={CANVAS_TITLE_MAX}
            onTitleChange={(title) => canvasActions.setTitle(title)}
            nodeCount={canvas.nodes.length}
            branchCount={branchCount}
            onAddNode={handleAddIdea}
            addNodeDisabled={!isReady}
            addNodeHint={
              addIdeaParent
                ? `Add a sub-idea under “${addIdeaParent.title || 'Untitled idea'}”`
                : 'Create your main idea'
            }
            isSidebarOpen={isProjectsOpen}
            onToggleSidebar={() => setProjectsOpen(!isProjectsOpen)}
            isInspectorOpen={isInspectorOpen}
            onToggleInspector={() => setInspectorOpen(!isInspectorOpen)}
            activeTypeFilter={activeTypeFilter}
            onSelectTypeFilter={setActiveTypeFilter}
            onNavigateHome={() => navigateTo('/')}
          />

          <div className="flex-1 min-h-0 w-full flex overflow-hidden relative">
            {/* Center: Canvas Viewport */}
            <div className="flex-1 min-w-0 h-full relative overflow-hidden">
              <CanvasView
                onControlsReady={handleControlsReady}
                onNodeSelect={handleNodeSelect}
                onPaneClick={handleCanvasPaneClick}
                onDragChange={setDragInfo}
                isPanActive={isPanActive}
                onTogglePan={() => setIsPanActive((prev) => !prev)}
                highlightType={activeTypeFilter}
              />

              {/* Empty Canvas Affordance (R2.1) */}
              {isReady && canvas.nodes.length === 0 && (
                <EmptyCanvasState onCreateRoot={handleCreateRoot} onLoadExample={handleLoadExample} />
              )}

              {/* The projects could not be loaded: nothing can be saved, so say so. */}
              {!isLoading && !isReady && (
                <div
                  className="absolute inset-0 flex items-center justify-center z-20 p-4"
                  data-testid="projects-load-failed"
                >
                  <div className="max-w-[420px] bg-[#ffffff] border border-[#c3c6d6] rounded-[2px] p-6 text-center">
                    <h2 className="font-serif text-[20px] font-normal text-[#000000] m-0 mb-2">
                      Your projects couldn&apos;t be loaded
                    </h2>
                    <p className="font-serif text-[13px] leading-[20px] text-[#404040] m-0 mb-4">
                      Check your connection, then reload. Nothing you add here would be saved.
                    </p>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="h-8 px-4 bg-[#0051c3] hover:bg-[#003b93] text-white font-mono text-[11px] rounded-[2px] cursor-pointer"
                    >
                      Reload
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Node Inspector Rail (360px) */}
            <div
              className={`h-full transition-[width,opacity] duration-200 ease-out shrink-0 overflow-hidden ${
                isInspectorOpen ? 'w-[360px] opacity-100' : 'w-0 opacity-0 pointer-events-none'
              }`}
              aria-hidden={!isInspectorOpen}
            >
              <NodeInspectorRail
                onOpenEditor={(id) => canvasActions.openEditor(id)}
                onAddChild={(id) => toolbarCallbacks.onAddChild(id)}
                dragInfo={dragInfo}
                saveStatus={saveStatus}
              />
            </div>
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
