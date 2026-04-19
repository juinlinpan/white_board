import { describe, expect, it } from 'vitest';

import type { Page } from './api';
import { syncPageViewport } from './pageViewport';

function createPage(overrides: Partial<Page> = {}): Page {
  return {
    id: 'page-1',
    project_id: 'project-1',
    name: 'Page 1',
    sort_order: 0,
    viewport_x: 0,
    viewport_y: 0,
    zoom: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('syncPageViewport', () => {
  it('updates the targeted page viewport without touching other pages', () => {
    const pages = [
      createPage(),
      createPage({
        id: 'page-2',
        name: 'Page 2',
        viewport_x: 24,
        viewport_y: 48,
        zoom: 1.4,
      }),
    ];

    expect(
      syncPageViewport(pages, 'page-1', {
        x: 120,
        y: 80,
        zoom: 1.8,
      }),
    ).toEqual([
      createPage({
        viewport_x: 120,
        viewport_y: 80,
        zoom: 1.8,
      }),
      createPage({
        id: 'page-2',
        name: 'Page 2',
        viewport_x: 24,
        viewport_y: 48,
        zoom: 1.4,
      }),
    ]);
  });
});
