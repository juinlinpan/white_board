import { describe, expect, it } from 'vitest';

import { getPagePngExportBounds } from './pagePngExport';

describe('pagePngExport', () => {
  it('returns null when the page has no items', () => {
    expect(getPagePngExportBounds([])).toBeNull();
  });

  it('exports only visible item bounds and ignores children hidden by collapsed frames', () => {
    expect(
      getPagePngExportBounds([
        {
          id: 'frame-1',
          page_id: 'page-1',
          parent_item_id: null,
          category: 'large_item',
          type: 'frame',
          title: 'Frame',
          content: null,
          content_format: null,
          x: 100,
          y: 120,
          width: 240,
          height: 180,
          rotation: 0,
          z_index: 1,
          is_collapsed: true,
          style_json: null,
          data_json: null,
          created_at: '2026-04-27T00:00:00.000Z',
          updated_at: '2026-04-27T00:00:00.000Z',
        },
        {
          id: 'note-hidden',
          page_id: 'page-1',
          parent_item_id: 'frame-1',
          category: 'small_item',
          type: 'sticky_note',
          title: null,
          content: 'Hidden child',
          content_format: null,
          x: 420,
          y: 320,
          width: 160,
          height: 140,
          rotation: 0,
          z_index: 2,
          is_collapsed: false,
          style_json: null,
          data_json: null,
          created_at: '2026-04-27T00:00:00.000Z',
          updated_at: '2026-04-27T00:00:00.000Z',
        },
      ]),
    ).toEqual({
      x: 76,
      y: 96,
      width: 288,
      height: 228,
    });
  });
});
