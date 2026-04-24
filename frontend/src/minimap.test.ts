import { describe, expect, it } from 'vitest';

import type { BoardItem } from './api';
import {
  getMinimapLayout,
  getViewportWorldBounds,
  worldToMinimap,
} from './minimap';
import { ITEM_CATEGORY, ITEM_TYPE, type Viewport } from './types';

function createItem(overrides: Partial<BoardItem>): BoardItem {
  return {
    id: 'item-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.text_box,
    title: null,
    content: null,
    content_format: null,
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    rotation: 0,
    z_index: 0,
    is_collapsed: false,
    style_json: null,
    data_json: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('minimap helpers', () => {
  it('converts viewport transform into world bounds', () => {
    const viewport: Viewport = {
      x: 240,
      y: 160,
      zoom: 1,
    };
    expect(
      getViewportWorldBounds(viewport, {
        width: 1000,
        height: 500,
      }),
    ).toEqual({
      x: -240,
      y: -160,
      width: 1000,
      height: 500,
    });
  });

  it('keeps viewport and item distribution inside minimap layout', () => {
    const layout = getMinimapLayout(
      [
        createItem({
          x: 400,
          y: 320,
          width: 180,
          height: 140,
        }),
      ],
      { x: 240, y: 160, zoom: 1 },
      { width: 1000, height: 600 },
      { width: 190, height: 130 },
    );

    const topLeft = worldToMinimap(
      layout.viewportBounds.x,
      layout.viewportBounds.y,
      layout,
    );
    const bottomRight = worldToMinimap(
      layout.viewportBounds.x + layout.viewportBounds.width,
      layout.viewportBounds.y + layout.viewportBounds.height,
      layout,
    );

    expect(topLeft.x).toBeGreaterThanOrEqual(0);
    expect(topLeft.y).toBeGreaterThanOrEqual(0);
    expect(bottomRight.x).toBeLessThanOrEqual(190);
    expect(bottomRight.y).toBeLessThanOrEqual(130);
  });
});
