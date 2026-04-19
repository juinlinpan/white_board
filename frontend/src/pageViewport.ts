import type { Page } from './api';
import type { Viewport } from './types';

export function applyViewportToPage(page: Page, viewport: Viewport): Page {
  return {
    ...page,
    viewport_x: viewport.x,
    viewport_y: viewport.y,
    zoom: viewport.zoom,
  };
}

export function syncPageViewport(
  pages: Page[],
  pageId: string,
  viewport: Viewport,
): Page[] {
  return pages.map((page) =>
    page.id === pageId ? applyViewportToPage(page, viewport) : page,
  );
}
