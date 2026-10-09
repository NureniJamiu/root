import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  fetchProjects,
  fetchProject,
  createProjectApi,
  updateProjectApi,
  deleteProjectApi,
} from '../projects-api';
import { emptyCanvas } from '../../data';

describe('Projects API Client & Database Boundary', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fetchProjects calls GET /api/projects with credentials and returns items', async () => {
    const mockProjects = [
      {
        id: 'proj-1',
        title: 'Project 1',
        nodeCount: 3,
        updatedAt: '2026-10-03T10:00:00Z',
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockProjects,
    });

    const result = await fetchProjects();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/projects', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    expect(result).toEqual(mockProjects);
  });

  it('fetchProject calls GET /api/projects/:id and returns project with canvas', async () => {
    const mockCanvas = emptyCanvas();
    const mockDetail = {
      id: 'proj-1',
      title: 'Project 1',
      nodeCount: 0,
      canvas: mockCanvas,
      createdAt: '2026-10-03T10:00:00Z',
      updatedAt: '2026-10-03T10:00:00Z',
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockDetail,
    });

    const result = await fetchProject('proj-1');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/projects/proj-1', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    expect(result).toEqual(mockDetail);
  });

  it('createProjectApi calls POST /api/projects', async () => {
    const canvas = emptyCanvas();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: canvas.id,
        title: 'New Research Project',
        nodeCount: 0,
        updatedAt: '2026-10-03T10:00:00Z',
      }),
    });

    const result = await createProjectApi({
      id: canvas.id,
      title: 'New Research Project',
      canvas,
      nodeCount: 0,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/projects',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    expect(result?.id).toBe(canvas.id);
  });

  it('updateProjectApi calls PUT /api/projects/:id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
    });

    const canvas = emptyCanvas();
    const success = await updateProjectApi('proj-1', {
      title: 'Updated Title',
      canvas,
      nodeCount: 2,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/projects/proj-1',
      expect.objectContaining({
        method: 'PUT',
      }),
    );
    expect(success).toBe(true);
  });

  it('deleteProjectApi calls DELETE /api/projects/:id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
    });

    const success = await deleteProjectApi('proj-1');
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/projects/proj-1', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    expect(success).toBe(true);
  });
});
