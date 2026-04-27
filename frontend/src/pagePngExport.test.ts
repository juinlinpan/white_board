// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { html2canvasMock } = vi.hoisted(() => ({
  html2canvasMock: vi.fn(),
}));

vi.mock('html2canvas', () => ({
  default: html2canvasMock,
}));

import type { PageBoardData } from './api';
import { exportPageAsPng, getPagePngExportBounds } from './pagePngExport';

describe('pagePngExport', () => {
  beforeEach(() => {
    html2canvasMock.mockReset();
    document.body.innerHTML = '';
  });

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

  it('uses html2canvas to render the export surface before encoding the PNG', async () => {
    const expectedBlob = new Blob(['png'], { type: 'image/png' });
    const renderedCanvas = document.createElement('canvas');
    Object.defineProperty(renderedCanvas, 'toBlob', {
      value: (callback: BlobCallback) => callback(expectedBlob),
    });
    html2canvasMock.mockResolvedValue(renderedCanvas);

    const boardData: PageBoardData = {
      page: {
        id: 'page-1',
        project_id: 'project-1',
        name: 'Page 1',
        sort_order: 0,
        viewport_x: 0,
        viewport_y: 0,
        zoom: 1,
        created_at: '2026-04-27T00:00:00.000Z',
        updated_at: '2026-04-27T00:00:00.000Z',
      },
      board_items: [
        {
          id: 'text-1',
          page_id: 'page-1',
          parent_item_id: null,
          category: 'small_item',
          type: 'text_box',
          title: null,
          content: 'Export me',
          content_format: 'plain_text',
          x: 120,
          y: 80,
          width: 160,
          height: 96,
          rotation: 0,
          z_index: 1,
          is_collapsed: false,
          style_json: null,
          data_json: null,
          created_at: '2026-04-27T00:00:00.000Z',
          updated_at: '2026-04-27T00:00:00.000Z',
        },
      ],
      connector_links: [],
    };

    const result = await exportPageAsPng(boardData);

    expect(result).toBe(expectedBlob);
    expect(html2canvasMock).toHaveBeenCalledTimes(1);
    expect(html2canvasMock.mock.calls[0]?.[0]).toBeInstanceOf(HTMLElement);
    expect(html2canvasMock.mock.calls[0]?.[1]).toMatchObject({
      backgroundColor: null,
      logging: false,
      useCORS: true,
    });
    expect(document.body.childElementCount).toBe(0);
  });
});
