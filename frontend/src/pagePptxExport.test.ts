// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  PptxGenJSMock,
  addImageMock,
  addNotesMock,
  addSlideMock,
  addTextMock,
  exportPageAsPngMock,
  getPagePngExportBoundsMock,
  writeMock,
} = vi.hoisted(() => {
  const addImageMock = vi.fn();
  const addNotesMock = vi.fn();
  const addTextMock = vi.fn();
  const addSlideMock = vi.fn(() => ({
    addImage: addImageMock,
    addNotes: addNotesMock,
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
    addImageMock,
    addNotesMock,
    addSlideMock,
    addTextMock,
    exportPageAsPngMock: vi.fn(),
    getPagePngExportBoundsMock: vi.fn(),
    writeMock,
  };
});

vi.mock('pptxgenjs', () => ({
  default: PptxGenJSMock,
}));

vi.mock('./pagePngExport', () => ({
  exportPageAsPng: exportPageAsPngMock,
  getPagePngExportBounds: getPagePngExportBoundsMock,
}));

import type { PageBoardData } from './api';
import { exportPageAsPptx, getPptxImagePlacement } from './pagePptxExport';

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
    addImageMock.mockReset();
    addNotesMock.mockReset();
    addSlideMock.mockClear();
    addTextMock.mockReset();
    exportPageAsPngMock.mockReset();
    getPagePngExportBoundsMock.mockReset();
    writeMock.mockReset();
  });

  it('fits the exported raster inside the slide content area', () => {
    const placement = getPptxImagePlacement({ width: 400, height: 200 });
    expect(placement.x).toBeCloseTo(0.575, 6);
    expect(placement.y).toBeCloseTo(0.9, 6);
    expect(placement.w).toBeCloseTo(8.85, 6);
    expect(placement.h).toBeCloseTo(4.425, 6);
  });

  it('rejects when the page has no exportable items', async () => {
    getPagePngExportBoundsMock.mockReturnValue(null);

    await expect(exportPageAsPptx(boardData)).rejects.toThrow(
      '目前 Page 沒有可匯出的物件。',
    );
    expect(exportPageAsPngMock).not.toHaveBeenCalled();
  });

  it('builds a one-slide pptx with the page name and raster snapshot', async () => {
    getPagePngExportBoundsMock.mockReturnValue({
      x: 96,
      y: 64,
      width: 400,
      height: 200,
    });
    exportPageAsPngMock.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
    writeMock.mockResolvedValue(new Blob(['pptx'], { type: 'application/zip' }));

    const result = await exportPageAsPptx(boardData);

    expect(result.type).toBe(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(PptxGenJSMock).toHaveBeenCalledTimes(1);
    expect(addSlideMock).toHaveBeenCalledTimes(1);
    expect(addTextMock).toHaveBeenCalledWith(
      'Sprint Plan',
      expect.objectContaining({
        bold: true,
        fontSize: 20,
      }),
    );
    const imageCall = addImageMock.mock.calls[0]?.[0];
    expect(imageCall).toBeDefined();
    expect(imageCall?.altText).toBe('Sprint Plan page snapshot');
    expect(imageCall?.data).toContain('data:image/png;base64,');
    expect(imageCall?.x).toBeCloseTo(0.575, 6);
    expect(imageCall?.y).toBeCloseTo(0.9, 6);
    expect(imageCall?.w).toBeCloseTo(8.85, 6);
    expect(imageCall?.h).toBeCloseTo(4.425, 6);
    expect(addNotesMock).toHaveBeenCalledWith('Whiteboard page export: Sprint Plan');
    expect(writeMock).toHaveBeenCalledWith({
      compression: true,
      outputType: 'blob',
    });
  });
});
