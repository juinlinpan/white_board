import { describe, expect, it } from 'vitest';

import type { Page } from './api';
import { resolveProjectEntryPageId } from './workspaceNavigation';

function buildPage(id: string, projectId = 'project-1'): Page {
  return {
    id,
    project_id: projectId,
    name: id,
    sort_order: 0,
    viewport_x: 0,
    viewport_y: 0,
    zoom: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('resolveProjectEntryPageId', () => {
  it('uses the preferred page when one is provided', () => {
    expect(
      resolveProjectEntryPageId({
        preferredPageId: 'page-2',
        targetProjectId: 'project-1',
        selectedProjectId: 'project-1',
        selectedPageId: 'page-1',
        pages: [buildPage('page-1'), buildPage('page-2')],
      }),
    ).toBe('page-2');
  });

  it('keeps the current page when reopening the currently selected project', () => {
    expect(
      resolveProjectEntryPageId({
        preferredPageId: null,
        targetProjectId: 'project-1',
        selectedProjectId: 'project-1',
        selectedPageId: 'page-2',
        pages: [buildPage('page-1'), buildPage('page-2')],
      }),
    ).toBe('page-2');
  });

  it('falls back to the first page when the current project has no selected page', () => {
    expect(
      resolveProjectEntryPageId({
        preferredPageId: null,
        targetProjectId: 'project-1',
        selectedProjectId: 'project-1',
        selectedPageId: null,
        pages: [buildPage('page-1'), buildPage('page-2')],
      }),
    ).toBe('page-1');
  });

  it('returns null when switching to another project without a known page yet', () => {
    expect(
      resolveProjectEntryPageId({
        preferredPageId: null,
        targetProjectId: 'project-2',
        selectedProjectId: 'project-1',
        selectedPageId: 'page-1',
        pages: [buildPage('page-1', 'project-1')],
      }),
    ).toBeNull();
  });
});
