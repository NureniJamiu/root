import type { Canvas } from '../data';
import type { ProjectItem } from '../layout';

export interface ProjectDetail {
  id: string;
  title: string;
  nodeCount: number;
  canvas: Canvas;
  createdAt: string;
  updatedAt: string;
}

const API_BASE = '/api/projects';

/**
 * Fetch list of all projects for the authenticated user (metadata summary).
 * Resolves to `null` when the server could not be reached.
 */
export async function fetchProjects(): Promise<ProjectItem[] | null> {
  try {
    const res = await fetch(API_BASE, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch projects: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Database fetchProjects failed:', err);
    return null;
  }
}

/**
 * Fetch a single project along with its full canvas graph document.
 */
export async function fetchProject(id: string): Promise<ProjectDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Failed to fetch project ${id}: ${res.status}`);
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`Database fetchProject(${id}) failed:`, err);
    return null;
  }
}

/**
 * Create a new project in the database.
 */
export async function createProjectApi(payload: {
  id?: string;
  title: string;
  canvas: Canvas;
}): Promise<ProjectItem | null> {
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Failed to create project: ${res.status}`);
    }
    const created = await res.json();
    return {
      id: created.id,
      title: created.title,
      nodeCount: created.nodeCount ?? 0,
      updatedAt: created.updatedAt,
    };
  } catch (err) {
    console.warn('Database createProject failed:', err);
    return null;
  }
}

export interface SaveResult {
  readonly ok: boolean;
  /** HTTP status, or 0 when the request never completed. */
  readonly status: number;
  /** Machine-readable reason from the server (e.g. `missing-image`). */
  readonly code?: string;
  readonly message?: string;
}

/**
 * Update project title or canvas in the database. Never throws; the result
 * says whether the server accepted the write and, if not, why.
 *
 * `keepalive` lets the request outlive the page (used while it unloads).
 */
export async function updateProjectApi(
  id: string,
  payload: {
    title?: string;
    canvas?: Canvas;
  },
  options: { keepalive?: boolean } = {},
): Promise<SaveResult> {
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
      ...(options.keepalive ? { keepalive: true } : {}),
    });
    if (res.ok) return { ok: true, status: res.status };
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    return {
      ok: false,
      status: res.status,
      ...(body.code ? { code: body.code } : {}),
      message: body.error ?? `Save failed (${res.status})`,
    };
  } catch (err) {
    console.warn(`Database updateProject(${id}) failed:`, err);
    return { ok: false, status: 0, message: 'Could not reach the server' };
  }
}

/**
 * Delete a project from the database.
 */
export async function deleteProjectApi(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    // A project that is already gone counts as deleted.
    return res.ok || res.status === 404;
  } catch (err) {
    console.warn(`Database deleteProject(${id}) failed:`, err);
    return false;
  }
}
