// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  PptxGenJSMock,
  addNotesMock,
  addShapeMock,
  addSlideMock,
  addTableMock,
  addTextMock,
  getPagePngExportBoundsMock,
  writeMock,
} = vi.hoisted(() => {
  const addNotesMock = vi.fn();
  const addShapeMock = vi.fn();
  const addTableMock = vi.fn();
  const addTextMock = vi.fn();
  const addSlideMock = vi.fn(() => ({
    addNotes: addNotesMock,
    addShape: addShapeMock,
    addTable: addTableMock,
    addText: addTextMock,
    background: undefined,
  }));
  const writeMock = vi.fn();
  const PptxGenJSMock = vi.fn().mockImplementation(() => ({
    addSlide: addSlideMock,
    author: '',
    company: '',
    layout: '',
    subject: '',
    title: '',
    write: writeMock,
  }));

  return {
    PptxGenJSMock,
    addNotesMock,
    addShapeMock,
    addSlideMock,
    addTableMock,
    addTextMock,
    getPagePngExportBoundsMock: vi.fn(),
    writeMock,
  };
});

vi.mock('pptxgenjs', () => ({
  default: PptxGenJSMock,
}));

vi.mock('./pagePngExport', () => ({
  getPagePngExportBounds: getPagePngExportBoundsMock,
}));

import type { PageBoardData } from './api';
import { exportPageAsPptx } from './pagePptxExport';

const boardData: PageBoardData = {
  page: {
    id: 'page-1',
    project_id: 'project-1',
    name: 'Sprint Plan',
    sort_order: 0,
    viewport_x: 0,
    viewport_y: 0,
    zoom: 1,
    created_at: '2026-04-27T00:00:00.000Z',
    updated_at: '2026-04-27T00:00:00.000Z',
  },
  board_items: [],
  connector_links: [],
};

describe('pagePptxExport', () => {
  beforeEach(() => {
    PptxGenJSMock.mockClear();
    addNotesMock.mockReset();
    addShapeMock.mockReset();
    addSlideMock.mockClear();
    addTableMock.mockReset();
    addTextMock.mockReset();
    getPagePngExportBoundsMock.mockReset();
    writeMock.mockReset();
  });

  it('rejects when the page has no exportable items', async () => {
    getPagePngExportBoundsMock.mockReturnValue(null);

    await expect(exportPageAsPptx(boardData)).rejects.toThrow(
      '目前 Page 沒有可匯出的物件。',
    );
  });

  it('builds a one-slide editable pptx using native objects', async () => {
    getPagePngExportBoundsMock.mockReturnValue({
      x: 0,
      y: 0,
      width: 480,
      height: 240,
    });
    writeMock.mockResolvedValue(new Blob(['pptx'], { type: 'application/zip' }));

    const result = await exportPageAsPptx({
      ...boardData,
      board_items: [
        {
          id: 'table-1',
          page_id: 'page-1',
          parent_item_id: null,
          category: 'shape',
          type: 'table',
          title: null,
          content: null,
          content_format: null,
          x: 0,
          y: 0,
          width: 240,
          height: 120,
          rotation: 0,
          z_index: 1,
          is_collapsed: false,
          style_json: null,
          data_json: JSON.stringify({
            rows: 1,
            cols: 2,
            colWidths: [0.5, 0.5],
            rowHeights: [1],
            cells: [[
              {
                id: 'c1',
                content: 'A1',
                rowSpan: 1,
                colSpan: 1,
                isCollapsed: true,
                childItemIds: [],
              },
              {
                id: 'c2',
                content: 'B1',
                rowSpan: 1,
                colSpan: 1,
                isCollapsed: true,
                childItemIds: [],
              },
            ]],
          }),
          created_at: '2026-04-27T00:00:00.000Z',
          updated_at: '2026-04-27T00:00:00.000Z',
        },
        {
          id: 'frame-1',
          page_id: 'page-1',
          parent_item_id: null,
          category: 'large_item',
          type: 'frame',
          title: 'Roadmap',
          content: null,
          content_format: null,
          x: 260,
          y: 20,
          width: 200,
          height: 140,
          rotation: 0,
          z_index: 2,
          is_collapsed: false,
          style_json: null,
          data_json: null,
          created_at: '2026-04-27T00:00:00.000Z',
          updated_at: '2026-04-27T00:00:00.000Z',
        },
        {
          id: 'text-1',
          page_id: 'page-1',
          parent_item_id: null,
          category: 'small_item',
          type: 'text_box',
          title: null,
          content: 'Task owner',
          content_format: null,
          x: 60,
          y: 140,
          width: 160,
          height: 80,
          rotation: 0,
          z_index: 3,
          is_collapsed: false,
          style_json: JSON.stringify({ textColor: '#334155' }),
          data_json: null,
          created_at: '2026-04-27T00:00:00.000Z',
          updated_at: '2026-04-27T00:00:00.000Z',
        },
      ],
    });

    expect(result.type).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(PptxGenJSMock).toHaveBeenCalledTimes(1);
    expect(addSlideMock).toHaveBeenCalledTimes(1);
    expect(addTableMock).toHaveBeenCalledTimes(1);
    expect(addShapeMock).toHaveBeenCalledTimes(1);
    expect(addTextMock).toHaveBeenCalledWith(
      'Task owner',
      expect.objectContaining({
        shapeName: 'rect',
      }),
    );
    expect(addNotesMock).toHaveBeenCalledWith('Whiteboard page export: Sprint Plan');
    expect(writeMock).toHaveBeenCalledWith({
      compression: true,
      outputType: 'blob',
    });
  });
});
