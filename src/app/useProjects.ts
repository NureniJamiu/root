/**
 * `useProjects` — the dashboard's project list, active project and save
 * pipeline.
 *
 * The invariants this hook exists to keep (see AUDIT §1):
 *
 *   - A project becomes active only together with its own, fully loaded
 *     canvas (`activate`). The id and the canvas in the store are never out
 *     of step, so a save can never write one project's graph into another.
 *   - Nothing is saved before the first successful load, and the canvas that
 *     was just loaded is not echoed back to the server.
 *   - Saves go through a sequenced queue (`createSaveQueue`): one request at a
 *     time, latest snapshot wins, retried on failure, flushed on unload. The
 *     queue's status drives the "Saved / Saving / Not saved" indicator.
 *   - Failures to create or delete a project are reported and leave the list
 *     unchanged instead of pretending they worked.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { canvasActions, canvasSchema, emptyCanvas, useCanvasStore } from '../data';
import type { Canvas } from '../data';
import type { ProjectItem } from '../layout';
import { IMAGE_REF_DATA_URL } from '../lib/image-ref';
import {
  createProjectApi,
  deleteProjectApi,
  fetchProject,
  fetchProjects,
  updateProjectApi,
} from '../lib/projects-api';
import { createSaveQueue } from '../lib/save-queue';
import type { SaveOutcome, SaveQueue, SaveStatus } from '../lib/save-queue';
import { emitLoadError, emitSaveError, UI_ACTIVE_PROJECT_KEY } from '../persistence';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * "Project N" for the lowest N no existing project uses. Counting the list is
 * not enough: after deleting "Project 2" of three, the count says 3 again and
 * the new project would duplicate an existing name.
 */
export function nextProjectTitle(projects: readonly { readonly title: string }[]): string {
  const taken = new Set(projects.map((p) => p.title));
  let n = 1;
  while (taken.has(`Project ${n}`)) n += 1;
  return `Project ${n}`;
}

function imageIds(canvas: Canvas): string[] {
  return canvas.nodes.flatMap((n) => n.images.map((i) => i.id));
}

/** Replace the data of images the server already holds with a reference. */
function withImageRefs(canvas: Canvas, known: ReadonlySet<string>): Canvas {
  if (known.size === 0) return canvas;
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) =>
      node.images.some((i) => known.has(i.id))
        ? {
            ...node,
            images: node.images.map((i) =>
              known.has(i.id) ? { ...i, dataUrl: IMAGE_REF_DATA_URL } : i,
            ),
          }
        : node,
    ),
  };
}

function readStoredActiveId(): string | null {
  try {
    return localStorage.getItem(UI_ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
}

function storeActiveId(id: string): void {
  try {
    localStorage.setItem(UI_ACTIVE_PROJECT_KEY, id);
  } catch {
    /* the preference is best-effort */
  }
}

function toItem(canvas: Canvas, id: string): ProjectItem {
  return {
    id,
    title: canvas.title,
    nodeCount: canvas.nodes.length,
    updatedAt: canvas.updatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export interface UseProjectsOptions {
  /** Called after a different project's canvas has been put on screen. */
  readonly onActivated?: () => void;
}

export interface UseProjects {
  readonly projects: readonly ProjectItem[];
  /** Empty until the first project has loaded. */
  readonly activeProjectId: string;
  readonly isLoading: boolean;
  readonly saveStatus: SaveStatus;
  readonly createProject: () => Promise<void>;
  readonly selectProject: (id: string) => Promise<void>;
  readonly deleteProject: (id: string) => Promise<void>;
}

interface Loaded {
  readonly id: string | null;
  /** The exact canvas object that was loaded; edits are anything else. */
  readonly canvas: Canvas | null;
}

export function useProjects(options: UseProjectsOptions = {}): UseProjects {
  const [projects, setProjects] = useState<readonly ProjectItem[]>([]);
  const [activeProjectId, setActiveProjectId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');

  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const onActivatedRef = useRef(options.onActivated);
  onActivatedRef.current = options.onActivated;

  const loadedRef = useRef<Loaded>({ id: null, canvas: null });
  // Image ids each project already stores on the server.
  const knownImagesRef = useRef(new Map<string, Set<string>>());
  const switchSeqRef = useRef(0);
  const errorShownRef = useRef(false);

  /* ----------------------------- save queue ------------------------------ */

  const queueRef = useRef<SaveQueue<Canvas> | null>(null);
  if (queueRef.current === null) {
    queueRef.current = createSaveQueue<Canvas>({
      send: async (projectId, canvas, { keepalive }): Promise<SaveOutcome> => {
        const known = knownImagesRef.current.get(projectId) ?? new Set<string>();
        const attempt = (set: ReadonlySet<string>) =>
          updateProjectApi(
            projectId,
            { title: canvas.title, canvas: withImageRefs(canvas, set) },
            { keepalive },
          );

        let result = await attempt(known);
        if (!result.ok && result.code === 'missing-image') {
          // The server lost an image we thought it had: send everything.
          known.clear();
          result = await attempt(known);
        }
        if (result.ok) {
          for (const id of imageIds(canvas)) known.add(id);
          knownImagesRef.current.set(projectId, known);
          return { ok: true };
        }
        const retryable =
          result.status === 0 || result.status === 408 || result.status === 429 || result.status >= 500;
        return {
          ok: false,
          message: result.message ?? 'Save failed',
          fatal: !retryable,
        };
      },
      onStatus: (status) => {
        setSaveStatus(status);
        if (status === 'saved') errorShownRef.current = false;
      },
      onError: (_projectId, message) => {
        // One toast per failure streak; the queue keeps retrying quietly.
        if (errorShownRef.current) return;
        errorShownRef.current = true;
        emitSaveError({ message });
      },
    });
  }
  const queue = queueRef.current;

  /* ------------------------------ activation ----------------------------- */

  /** Put `canvas` on screen as the canvas of project `id`. */
  const activate = useCallback((id: string, canvas: Canvas) => {
    // Order matters: the ref is updated before the store, so the store
    // subscriber below sees the load for what it is and does not save it.
    loadedRef.current = { id, canvas };
    knownImagesRef.current.set(id, new Set(imageIds(canvas)));
    canvasActions.loadCanvas(canvas);
    setActiveProjectId(id);
    storeActiveId(id);
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...toItem(canvas, id), title: canvas.title || p.title } : p)));
    onActivatedRef.current?.();
  }, []);

  /** Fetch and validate a project's canvas; reports the failure itself. */
  const loadCanvasFor = useCallback(async (id: string): Promise<Canvas | null> => {
    const detail = await fetchProject(id);
    if (!detail) {
      emitLoadError({ message: 'That project could not be opened.' });
      return null;
    }
    const parsed = canvasSchema.safeParse(detail.canvas);
    if (!parsed.success) {
      emitLoadError({ message: 'That project is damaged and could not be opened.' });
      return null;
    }
    return parsed.data;
  }, []);

  /* --------------------- edits flow into the save queue ------------------ */

  useEffect(() => {
    return useCanvasStore.subscribe((state, prev) => {
      if (state.canvas === prev.canvas) return;
      const { id, canvas: loaded } = loadedRef.current;
      if (id === null || state.canvas === loaded) return;

      queue.schedule(id, state.canvas);
      const next = state.canvas;
      setProjects((list) =>
        list.map((p) =>
          p.id === id
            ? { ...p, title: next.title || p.title, nodeCount: next.nodes.length, updatedAt: next.updatedAt }
            : p,
        ),
      );
    });
  }, [queue]);

  /* ------------------------- flush when the page goes -------------------- */

  useEffect(() => {
    const onHide = () => queue.flushOnUnload();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void queue.flush();
    };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      // Leaving the dashboard: send what is pending, then stop saving.
      void queue.flush();
      loadedRef.current = { id: null, canvas: null };
    };
  }, [queue]);

  /* ------------------------------ initial load --------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const listed = await fetchProjects();
      if (cancelled) return;
      if (listed === null) {
        emitLoadError({ message: 'Could not load your projects. Check your connection and reload.' });
        setIsLoading(false);
        return;
      }

      let items = listed;
      if (items.length === 0) {
        const fresh: Canvas = { ...emptyCanvas(), title: 'Idea Canvas' };
        const created = await createProjectApi({ id: fresh.id, title: fresh.title, canvas: fresh });
        if (cancelled) return;
        if (!created) {
          emitLoadError({ message: 'Could not create your first project.' });
          setIsLoading(false);
          return;
        }
        items = [created];
      }

      const stored = readStoredActiveId();
      const activeId = items.some((p) => p.id === stored) ? (stored as string) : items[0]!.id;
      setProjects(items);

      const canvas = await loadCanvasFor(activeId);
      if (cancelled) return;
      setIsLoading(false);
      if (!canvas) return;
      activate(activeId, canvas);
      if (import.meta.env.DEV) {
        (window as unknown as { __ROOT_INITIALIZED__?: boolean }).__ROOT_INITIALIZED__ = true;
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [activate, loadCanvasFor]);

  /* ------------------------------- actions ------------------------------- */

  const selectProject = useCallback(
    async (id: string) => {
      if (id === loadedRef.current.id) return;
      const seq = ++switchSeqRef.current;
      // The current project keeps being saved by the queue while we fetch.
      const canvas = await loadCanvasFor(id);
      if (seq !== switchSeqRef.current || !canvas) return; // superseded, or failed
      activate(id, canvas);
    },
    [activate, loadCanvasFor],
  );

  const createProject = useCallback(async () => {
    const seq = ++switchSeqRef.current;
    const canvas: Canvas = { ...emptyCanvas(), title: nextProjectTitle(projectsRef.current) };
    const created = await createProjectApi({ id: canvas.id, title: canvas.title, canvas });
    if (!created) {
      emitSaveError({ message: 'Could not create the project. Check your connection and try again.' });
      return;
    }
    setProjects((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
    if (seq !== switchSeqRef.current) return; // the user opened another project meanwhile
    activate(created.id, canvas);
  }, [activate]);

  const deleteProject = useCallback(
    async (id: string) => {
      const previous = loadedRef.current;
      const wasActive = previous.id === id;
      const seq = ++switchSeqRef.current;

      // Stop saving the project we are deleting; undo that if the delete fails.
      queue.discard(id);
      if (wasActive) loadedRef.current = { id: null, canvas: null };

      const deleted = await deleteProjectApi(id);
      if (!deleted) {
        if (wasActive) {
          loadedRef.current = previous;
          const current = useCanvasStore.getState().canvas;
          if (current !== previous.canvas) queue.schedule(id, current);
        }
        emitSaveError({ message: 'Could not delete the project. Check your connection and try again.' });
        return;
      }

      knownImagesRef.current.delete(id);
      const remaining = projectsRef.current.filter((p) => p.id !== id);
      setProjects(remaining);
      if (!wasActive) return;

      const next = remaining[0];
      if (next) {
        const canvas = await loadCanvasFor(next.id);
        if (seq !== switchSeqRef.current) return;
        if (canvas) activate(next.id, canvas);
        return;
      }

      // Last project deleted: start over with a fresh one.
      const fresh: Canvas = { ...emptyCanvas(), title: 'Idea Canvas' };
      const created = await createProjectApi({ id: fresh.id, title: fresh.title, canvas: fresh });
      if (!created) {
        emitSaveError({ message: 'Could not create a new project.' });
        return;
      }
      setProjects([created]);
      activate(created.id, fresh);
    },
    [activate, loadCanvasFor, queue],
  );

  return {
    projects,
    activeProjectId,
    isLoading,
    saveStatus,
    createProject,
    selectProject,
    deleteProject,
  };
}
