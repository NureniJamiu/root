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
 */
export async function fetchProjects(): Promise<ProjectItem[]> {
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
    console.warn('Database fetchProjects failed, operating in local mode:', err);
    return [];
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
  nodeCount?: number;
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

/**
 * Update project metadata or canvas in the database.
 */
export async function updateProjectApi(
  id: string,
  payload: {
    title?: string;
    canvas?: Canvas;
    nodeCount?: number;
  },
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch (err) {
    console.warn(`Database updateProject(${id}) failed:`, err);
    return false;
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
    return res.ok;
  } catch (err) {
    console.warn(`Database deleteProject(${id}) failed:`, err);
    return false;
  }
}
