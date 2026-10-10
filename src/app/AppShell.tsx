/**
 * `AppShell` — the signed-in workbench of the Root MVP (canvas, documents,
 * sidebars). Loaded with the dashboard route, so the public pages never
 * download it.
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
 *   - A new project is simply an empty canvas: ideas are added from the
 *     header, with N, or by double-clicking the canvas.
 *   - ErrorBoundary and toast surface live in their own modules.
 *
 * Import boundaries (design.md §Layered Dependency Table):
 *   - `app/` sits above all other layers and may import from `canvas/`,
 *     `nodes/`, `data/`, and `persistence/`.
 *   - `nodes/` and `canvas/` must NOT import from each other's internals;
 *     this file is the only legal cross-layer junction.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CanvasView, computeChildPosition, findFreePosition, getMeasuredSizes } from '../canvas';
import type { CanvasViewControls, DragState } from '../canvas';
import {
  CANVAS_TITLE_MAX,
  canvasActions,
  incomingIndex,
  useCanvasStore,
  visibleNodeIds,
} from '../data';
import type { NodeType, UUID } from '../data';
import { DocumentEditorContext } from '../editor/context';
import type { DocumentEditorServices } from '../editor/context';
import { insertIdeaIntoDocument, revealIdeaInDocument } from '../editor/bridge';
import { draftFromBranch } from '../editor/draftFromBranch';
import { uploadAsset } from '../lib/documents-api';
import {
  AppHeader,
  NodeInspectorRail,
  StructuralIndexRail,
} from '../layout';
import type { ViewMode } from '../layout';
import {
  DeletePrompt,
  NodeEditor,
  ToolbarCallbacksProvider,
} from '../nodes';
import type { DeleteMode, ToolbarCallbacks } from '../nodes';
import {
  emitSaveError,
  UI_PROJECTS_OPEN_KEY,
  UI_INSPECTOR_OPEN_KEY,
} from '../persistence';
import { useOptionalAuth } from '../auth';

import { DocumentPane } from './DocumentPane';
import { ToastSurface } from './Toasts';
import { useDocuments } from './useDocuments';
import { useProjects } from './useProjects';

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
 * card sizes), and hands the result to `canvasActions.addChild`, which also
 * connects the parent to the new idea.
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

/** Rendered size of a new card, used to centre it on a point. */
const NEW_CARD_SIZE = { width: 290, height: 140 } as const;

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

const VIEW_MODE_KEY = 'root-ui:view-mode';
/** Narrowest the document column may get in split view. */
const DOC_MIN_WIDTH = 520;
/** Narrowest the canvas may get in split view. */
const CANVAS_MIN_WIDTH = 360;
const DOC_WIDTH_KEY = 'root-ui:doc-width';

function readViewMode(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    return stored === 'split' || stored === 'write' ? stored : 'canvas';
  } catch {
    return 'canvas';
  }
}

function readDocWidth(): number {
  try {
    const stored = Number(localStorage.getItem(DOC_WIDTH_KEY));
    return Number.isFinite(stored) && stored >= DOC_MIN_WIDTH ? stored : 640;
  } catch {
    return 640;
  }
}

/** Title and notes for an idea made from selected document text. */
export function ideaFromText(text: string): { title: string; body: string } {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= 140) return { title: clean, body: '' };
  const sentence = /^(.{20,140}?[.!?])\s/.exec(clean);
  if (sentence) return { title: sentence[1]!, body: clean };
  const cut = clean.slice(0, 140);
  const space = cut.lastIndexOf(' ');
  return { title: `${(space > 60 ? cut.slice(0, space) : cut).trim()}…`, body: clean };
}

/** Make a hidden idea visible by revealing it from its parents, one step at a time. */
function revealOnCanvas(id: UUID): void {
  const { canvas } = useCanvasStore.getState();
  if (visibleNodeIds(canvas).has(id)) return;
  const incoming = incomingIndex(canvas);
  const chain: Array<{ parent: UUID; child: UUID }> = [];
  const seen = new Set<UUID>([id]);
  let current = id;
  const visible = visibleNodeIds(canvas);
  while (!visible.has(current)) {
    const edge = (incoming.get(current) ?? []).find((e) => !seen.has(e.source));
    if (!edge) break;
    chain.unshift({ parent: edge.source, child: current });
    seen.add(edge.source);
    current = edge.source;
  }
  for (const { parent, child } of chain) {
    if (!visibleNodeIds(useCanvasStore.getState().canvas).has(child)) canvasActions.revealChild(parent, child);
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

  const [viewMode, setViewModeState] = useState<ViewMode>(readViewMode);
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      /* best-effort */
    }
  }, []);
  const [docWidth, setDocWidth] = useState(readDocWidth);
  const workRef = useRef<HTMLDivElement>(null);

  const [isPanActive, setIsPanActive] = useState(false);
  const [dragInfo, setDragInfo] = useState<DragState | null>(null);

  const { projects, activeProjectId, isLoading, saveStatus, createProject, selectProject, deleteProject } =
    useProjects({
      onActivated: () => {
        setTimeout(() => canvasControlsRef.current?.fitView(), 50);
      },
    });

  const docs = useDocuments(activeProjectId);
  const { open: openDocument, create: createDocument, active: activeDocument } = docs;

  /** Make sure the document column is on screen. */
  const showDocuments = useCallback(() => {
    setViewModeState((mode) => {
      const next = mode === 'canvas' ? 'split' : mode;
      try {
        localStorage.setItem(VIEW_MODE_KEY, next);
      } catch {
        /* best-effort */
      }
      return next;
    });
  }, []);

  const focusIdea = useCallback(
    (id: UUID) => {
      if (!useCanvasStore.getState().canvas.nodes.some((n) => n.id === id)) return;
      revealOnCanvas(id);
      canvasActions.select(id);
      setViewModeState((mode) => (mode === 'write' ? 'split' : mode));
      setTimeout(() => canvasControlsRef.current?.focusNode(id), 60);
    },
    [],
  );

  const editorServices = useMemo<DocumentEditorServices>(
    () => ({
      focusIdea,
      createIdea: (text, parentId) => {
        const { title, body } = ideaFromText(text);
        if (!title) return null;
        const { canvas: current } = useCanvasStore.getState();
        const parentKnown = parentId !== null && current.nodes.some((n) => n.id === parentId);
        const position = parentKnown
          ? computeChildPosition(current, parentId, getMeasuredSizes())
          : (() => {
              const center = canvasControlsRef.current?.getViewportCenter() ?? { x: 400, y: 300 };
              return findFreePosition(
                current,
                { x: center.x - NEW_CARD_SIZE.width / 2, y: center.y - NEW_CARD_SIZE.height / 2 },
                getMeasuredSizes(),
              );
            })();
        const id = canvasActions.createIdea({ position, title, body, type: 'finding', parentId: parentKnown ? parentId : null });
        return id ? { id, title } : null;
      },
      uploadImage: async (file) => {
        if (!activeProjectId) return null;
        const result = await uploadAsset(activeProjectId, file);
        if (result.ok) return result.url;
        emitSaveError({ message: `Image not added: ${result.message}` });
        return null;
      },
    }),
    [activeProjectId, focusIdea],
  );

  const handleOpenDocument = useCallback(
    (id: string) => {
      showDocuments();
      void openDocument(id);
    },
    [openDocument, showDocuments],
  );

  const handleNewDocument = useCallback(() => {
    showDocuments();
    void createDocument();
  }, [createDocument, showDocuments]);

  const handleOpenDocumentAt = useCallback(
    (documentId: string, nodeId: UUID) => {
      showDocuments();
      revealIdeaInDocument(nodeId, documentId);
      void openDocument(documentId);
    },
    [openDocument, showDocuments],
  );

  const handleDraftFromBranch = useCallback(
    (nodeId: UUID) => {
      const draft = draftFromBranch(useCanvasStore.getState().canvas, nodeId);
      if (!draft) return;
      showDocuments();
      void createDocument({ title: draft.title, content: draft.content });
    },
    [createDocument, showDocuments],
  );

  const handleInsertInDocument = useCallback((nodeId: UUID) => {
    const idea = useCanvasStore.getState().canvas.nodes.find((n) => n.id === nodeId);
    if (idea) insertIdeaIntoDocument({ id: idea.id, title: idea.title }, 'card');
  }, []);

  /** Drag the divider between canvas and document. */
  const startResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const container = workRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const max = Math.max(DOC_MIN_WIDTH, rect.width - CANVAS_MIN_WIDTH);
      const next = Math.round(Math.min(max, Math.max(DOC_MIN_WIDTH, rect.right - ev.clientX)));
      setDocWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      setDocWidth((w) => {
        try {
          localStorage.setItem(DOC_WIDTH_KEY, String(w));
        } catch {
          /* best-effort */
        }
        return w;
      });
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
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

  /** Add an unconnected idea in the middle of what is on screen. */
  const handleAddFreeIdea = useCallback(() => {
    const { canvas: current } = useCanvasStore.getState();
    const center = canvasControlsRef.current?.getViewportCenter() ?? { x: 400, y: 300 };
    const position = findFreePosition(
      current,
      { x: center.x - NEW_CARD_SIZE.width / 2, y: center.y - NEW_CARD_SIZE.height / 2 },
      getMeasuredSizes(),
    );
    canvasActions.addNode(position);
  }, []);

  // Selecting an idea reveals the inspector. Closing it is left to the
  // header toggle so the pane never disappears out from under the user.
  const handleNodeSelect = useCallback(() => {
    setInspectorOpen(true);
  }, [setInspectorOpen]);

  // Ideas selected from outside the canvas (picking one in a card's list of
  // connected ideas) open the inspector the same way.
  const lastSelectedRef = useRef(selectedNodeId);
  useEffect(() => {
    if (selectedNodeId !== null && selectedNodeId !== lastSelectedRef.current) setInspectorOpen(true);
    lastSelectedRef.current = selectedNodeId;
  }, [selectedNodeId, setInspectorOpen]);

  const handleCanvasPaneClick = useCallback(() => {
    canvasActions.select(null);
  }, []);

  // With an idea selected, Add Idea connects the new card to it; otherwise the
  // new card stands alone in the middle of the view.
  const addIdeaParent = useMemo(
    () => canvas.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [canvas, selectedNodeId],
  );

  const handleAddIdea = useCallback(() => {
    if (addIdeaParent) toolbarCallbacks.onAddChild(addIdeaParent.id);
    else handleAddFreeIdea();
  }, [addIdeaParent, handleAddFreeIdea]);

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

  // Alt+1/2/3 switch between canvas, split and write, from anywhere but a form field.
  useEffect(() => {
    function handleViewKey(e: KeyboardEvent) {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const mode = ({ Digit1: 'canvas', Digit2: 'split', Digit3: 'write' } as const)[e.code as 'Digit1'];
      if (!mode) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      e.preventDefault();
      setViewMode(mode);
    }
    window.addEventListener('keydown', handleViewKey);
    return () => window.removeEventListener('keydown', handleViewKey);
  }, [setViewMode]);

  // Global shortcuts: N adds an idea; Ctrl/Cmd+Z undoes, Shift+Z / Y redoes.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) {
        return;
      }
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isReady) {
          e.preventDefault();
          handleAddIdea();
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
  }, [handleAddIdea, isReady]);

  // The canvas changes width with the view: keep the selected idea (or everything) in sight.
  const firstViewRef = useRef(true);
  useEffect(() => {
    if (firstViewRef.current) {
      firstViewRef.current = false;
      return undefined;
    }
    if (viewMode === 'write') return undefined;
    const timer = setTimeout(() => {
      const id = useCanvasStore.getState().selection.nodeId;
      if (id) canvasControlsRef.current?.focusNode(id);
      else canvasControlsRef.current?.fitView();
    }, 80);
    return () => clearTimeout(timer);
  }, [viewMode]);

  const showCanvas = viewMode !== 'write';
  const showDocs = viewMode !== 'canvas';
  const selectedIdea = selectedNodeId ? canvas.nodes.find((n) => n.id === selectedNodeId) ?? null : null;

  return (
    <DocumentEditorContext.Provider value={editorServices}>
    <ToolbarCallbacksProvider value={toolbarCallbacks}>
      <div
        id="root-app"
        className="w-screen h-screen flex bg-canvas overflow-hidden select-none"
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
            documents={docs.documents}
            activeDocumentId={showDocs ? activeDocument?.id ?? null : null}
            onOpenDocument={handleOpenDocument}
            onNewDocument={isReady ? handleNewDocument : undefined}
            onDeleteDocument={(id) => void docs.remove(id)}
          />
        </div>

        {/* Right: workbench column (header above canvas + inspector) */}
        <div className="flex-1 min-w-0 h-full flex flex-col">
          <AppHeader
            title={canvas.title || 'Untitled Project'}
            titleMaxLength={CANVAS_TITLE_MAX}
            onTitleChange={(title) => canvasActions.setTitle(title)}
            nodeCount={canvas.nodes.length}
            connectionCount={canvas.edges.length}
            onAddNode={handleAddIdea}
            addNodeDisabled={!isReady}
            addNodeHint={
              addIdeaParent
                ? `Add an idea connected to “${addIdeaParent.title || 'Untitled idea'}”`
                : 'Add an idea (or double-click the canvas)'
            }
            isSidebarOpen={isProjectsOpen}
            onToggleSidebar={() => setProjectsOpen(!isProjectsOpen)}
            isInspectorOpen={isInspectorOpen}
            onToggleInspector={() => setInspectorOpen(!isInspectorOpen)}
            activeTypeFilter={activeTypeFilter}
            onSelectTypeFilter={setActiveTypeFilter}
            onNavigateHome={() => navigateTo('/')}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />

          <div ref={workRef} className="flex-1 min-h-0 w-full flex overflow-hidden relative">
            {/* Center: Canvas Viewport (kept mounted in write view so it keeps its state) */}
            <div
              className={`flex-1 min-w-0 h-full relative overflow-hidden ${showCanvas ? '' : 'hidden'}`}
              aria-hidden={!showCanvas}
            >
              <CanvasView
                onControlsReady={handleControlsReady}
                onNodeSelect={handleNodeSelect}
                onPaneClick={handleCanvasPaneClick}
                onDragChange={setDragInfo}
                isPanActive={isPanActive}
                onTogglePan={() => setIsPanActive((prev) => !prev)}
                highlightType={activeTypeFilter}
              />

              {/* The projects could not be loaded: nothing can be saved, so say so. */}
              {!isLoading && !isReady && (
                <div
                  className="absolute inset-0 flex items-center justify-center z-20 p-4"
                  data-testid="projects-load-failed"
                >
                  <div className="max-w-[420px] bg-panel border border-rule-strong rounded-[2px] p-6 text-center">
                    <h2 className="font-serif text-[20px] font-normal text-ink-strong m-0 mb-2">
                      Your projects couldn&apos;t be loaded
                    </h2>
                    <p className="font-serif text-[13px] leading-[20px] text-ink-read m-0 mb-4">
                      Check your connection, then reload. Nothing you add here would be saved.
                    </p>
                    <button
                      type="button"
                      onClick={() => window.location.reload()}
                      className="h-8 px-4 bg-accent hover:bg-accent-strong text-white font-mono text-[11px] rounded-[2px] cursor-pointer"
                    >
                      Reload
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Document column: beside the canvas in split view, alone in write view */}
            {showDocs && (
              <>
                {showCanvas && (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize document"
                    onPointerDown={startResize}
                    className="w-1.5 -mx-[3px] h-full cursor-col-resize z-10 shrink-0 group flex justify-center"
                    data-testid="split-resizer"
                  >
                    <span className="w-px h-full bg-rule group-hover:bg-accent transition-colors" />
                  </div>
                )}
                <div
                  className={`h-full min-w-0 border-l border-rule ${showCanvas ? 'shrink-0' : 'flex-1'}`}
                  style={showCanvas ? { width: docWidth, maxWidth: `calc(100% - ${CANVAS_MIN_WIDTH}px)` } : undefined}
                >
                  <DocumentPane
                    docs={docs}
                    selectedIdeaTitle={selectedIdea ? selectedIdea.title : null}
                    onDraftFromSelected={() => selectedIdea && handleDraftFromBranch(selectedIdea.id)}
                    onClosePane={() => setViewMode('canvas')}
                  />
                </div>
              </>
            )}

            {/* Right: Node Inspector Rail (360px) */}
            <div
              className={`h-full transition-[width,opacity] duration-200 ease-out shrink-0 overflow-hidden ${
                isInspectorOpen && showCanvas ? 'w-[360px] opacity-100' : 'w-0 opacity-0 pointer-events-none'
              }`}
              aria-hidden={!isInspectorOpen || !showCanvas}
            >
              <NodeInspectorRail
                onOpenEditor={(id) => canvasActions.openEditor(id)}
                onAddChild={(id) => toolbarCallbacks.onAddChild(id)}
                dragInfo={dragInfo}
                saveStatus={saveStatus}
                onOpenDocumentAt={handleOpenDocumentAt}
                onInsertInDocument={showDocs && activeDocument ? handleInsertInDocument : undefined}
                onDraftFromBranch={isReady ? handleDraftFromBranch : undefined}
              />
            </div>
          </div>
        </div>

        {/* Node editor — rendered as a fixed overlay when a node is open. */}
        {openNodeId !== null && (
          <NodeEditor key={openNodeId} nodeId={openNodeId} onClose={handleEditorClose} />
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
    </DocumentEditorContext.Provider>
  );
}
