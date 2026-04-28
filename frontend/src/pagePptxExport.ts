import type { BoardItem, PageBoardData } from './api';
import { getPagePngExportBounds } from './pagePngExport';
import { parseBoardItemStyle, resolveBoardItemStyle } from './itemStyles';
import { parseTableData } from './tableData';
import { ITEM_TYPE } from './types';

const PPTX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const SLIDE_WIDTH = 10;
const SLIDE_HEIGHT = 5.625;
const SLIDE_MARGIN = 0.3;
const TITLE_HEIGHT = 0.45;
const TITLE_GAP = 0.15;
const FRAME_FOOTER_RATIO = 0.72;
let pptxGenJSImport: Promise<typeof import('pptxgenjs')> | null = null;

type Placement = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type LayoutTransform = {
  scale: number;
  offsetX: number;
  offsetY: number;
};

function toPptxBlob(output: string | ArrayBuffer | Blob | Uint8Array): Blob {
  if (output instanceof Blob) {
    return output;
  }

  if (typeof output === 'string' || output instanceof ArrayBuffer) {
    return new Blob([output], { type: PPTX_MIME_TYPE });
  }

  const bytes = new Uint8Array(output.byteLength);
  bytes.set(output);
  return new Blob([bytes.buffer], { type: PPTX_MIME_TYPE });
}

async function createPptxInstance() {
  pptxGenJSImport ??= import('pptxgenjs');
  const module = await pptxGenJSImport;
  return new module.default();
}

function toPptxColor(color: string | undefined | null, fallback = 'F8FAFC'): string {
  if (!color) {
    return fallback;
  }
  const normalized = color.replace('#', '').trim();
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  return fallback;
}

function getContentLayoutTransform(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): LayoutTransform {
  const contentTop = SLIDE_MARGIN + TITLE_HEIGHT + TITLE_GAP;
  const availableWidth = SLIDE_WIDTH - SLIDE_MARGIN * 2;
  const availableHeight = SLIDE_HEIGHT - contentTop - SLIDE_MARGIN;
  const scale = Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
  );

  return {
    scale,
    offsetX: SLIDE_MARGIN + (availableWidth - bounds.width * scale) / 2,
    offsetY: contentTop + (availableHeight - bounds.height * scale) / 2,
  };
}

function projectItemPlacement(
  item: BoardItem,
  bounds: { x: number; y: number; width: number; height: number },
  transform: LayoutTransform,
): Placement {
  return {
    x: transform.offsetX + (item.x - bounds.x) * transform.scale,
    y: transform.offsetY + (item.y - bounds.y) * transform.scale,
    w: Math.max(item.width * transform.scale, 0.06),
    h: Math.max(item.height * transform.scale, 0.06),
  };
}

function getTextContent(item: BoardItem): string {
  const content = item.content?.trim();
  if (content && content.length > 0) {
    return content;
  }
  const title = item.title?.trim();
  if (title && title.length > 0) {
    return title;
  }
  return item.type;
}

function renderTableAsNativeTable(slide: any, item: BoardItem, placement: Placement): void {
  const table = parseTableData(item.data_json);
  const rows: Array<Array<string | Record<string, unknown>>> = [];

  for (let rowIndex = 0; rowIndex < table.rows; rowIndex += 1) {
    const row: Array<string | Record<string, unknown>> = [];
    for (let colIndex = 0; colIndex < table.cols; colIndex += 1) {
      const cell = table.cells[rowIndex]?.[colIndex] ?? null;
      if (cell === null) {
        row.push('');
        continue;
      }
      row.push({
        text: cell.content,
        options: {
          rowspan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
          colspan: cell.colSpan > 1 ? cell.colSpan : undefined,
          fill: {
            color: toPptxColor(cell.backgroundColor, 'FFFFFF'),
          },
          margin: 1,
          valign: 'middle',
        },
      });
    }
    rows.push(row);
  }

  slide.addTable(rows, {
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    color: '0F172A',
    border: {
      pt: 1,
      color: 'CBD5E1',
    },
    colW: table.colWidths.map((fraction) => Math.max(fraction * placement.w, 0.08)),
    rowH: table.rowHeights.map((fraction) => Math.max(fraction * placement.h, 0.08)),
    valign: 'middle',
    fontFace: 'Arial',
    fontSize: 12,
  });
}

function renderFrameAsFooterRect(slide: any, item: BoardItem, placement: Placement): void {
  const style = resolveBoardItemStyle(item);
  const frameName = item.title?.trim() || item.content?.trim() || 'frame';
  const footerHeight = Math.max(placement.h * FRAME_FOOTER_RATIO, 0.15);
  const footerY = placement.y + placement.h - footerHeight;

  slide.addShape('rect', {
    x: placement.x,
    y: footerY,
    w: placement.w,
    h: footerHeight,
    fill: {
      color: toPptxColor(style.backgroundColor, 'E2E8F0'),
      transparency: 10,
    },
    line: {
      color: '94A3B8',
      pt: 1,
    },
  });

  slide.addText(frameName, {
    x: placement.x,
    y: Math.max(placement.y - 0.22, SLIDE_MARGIN + TITLE_HEIGHT + 0.02),
    w: placement.w,
    h: 0.2,
    bold: true,
    color: toPptxColor(style.textColor, '0F172A'),
    fontFace: 'Arial',
    fontSize: 12,
    margin: 0,
    valign: 'mid',
    align: 'left',
  });
}

function renderAsTextBox(slide: any, item: BoardItem, placement: Placement): void {
  const style = resolveBoardItemStyle(item);
  const parsed = parseBoardItemStyle(item.style_json);
  slide.addText(getTextContent(item), {
    x: placement.x,
    y: placement.y,
    w: placement.w,
    h: placement.h,
    shapeName: 'rect',
    fill: {
      color: toPptxColor(
        parsed.backgroundColor,
        item.type === ITEM_TYPE.text_box ? 'FFFFFF' : toPptxColor(style.backgroundColor),
      ),
      transparency: item.type === ITEM_TYPE.text_box ? 100 : 0,
    },
    line: {
      color: '94A3B8',
      pt: item.type === ITEM_TYPE.text_box ? 0.5 : 1,
    },
    color: toPptxColor(style.textColor, '0F172A'),
    fontFace: 'Arial',
    fontSize: Math.max(Math.min(style.fontSize * 0.7, 24), 9),
    bold: style.fontWeight === 'bold',
    italic: style.fontStyle === 'italic',
    valign: 'top',
    margin: 3,
    breakLine: true,
  });
}

export async function exportPageAsPptx(boardData: PageBoardData): Promise<Blob> {
  const bounds = getPagePngExportBounds(boardData.board_items);
  if (bounds === null) {
    throw new Error('目前 Page 沒有可匯出的物件。');
  }

  const transform = getContentLayoutTransform(bounds);
  const pptx = await createPptxInstance();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'Whiteboard Planner';
  pptx.company = 'Whiteboard Planner';
  pptx.subject = 'Whiteboard page export';
  pptx.title = boardData.page.name;

  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addText(boardData.page.name, {
    x: SLIDE_MARGIN,
    y: SLIDE_MARGIN,
    w: SLIDE_WIDTH - SLIDE_MARGIN * 2,
    h: TITLE_HEIGHT,
    bold: true,
    color: '111827',
    fontFace: 'Arial',
    fontSize: 20,
    margin: 0,
    valign: 'middle',
  });

  const orderedItems = [...boardData.board_items].sort((left, right) => {
    if (left.z_index !== right.z_index) {
      return left.z_index - right.z_index;
    }
    return left.created_at.localeCompare(right.created_at);
  });

  for (const item of orderedItems) {
    const placement = projectItemPlacement(item, bounds, transform);
    if (item.type === ITEM_TYPE.table) {
      renderTableAsNativeTable(slide, item, placement);
      continue;
    }
    if (item.type === ITEM_TYPE.frame) {
      renderFrameAsFooterRect(slide, item, placement);
      continue;
    }
    renderAsTextBox(slide, item, placement);
  }

  slide.addNotes(`Whiteboard page export: ${boardData.page.name}`);

  const output = await pptx.write({
    compression: true,
    outputType: 'blob',
  });
  const outputBlob = toPptxBlob(output);

  if (outputBlob.size === 0) {
    throw new Error('PPTX 匯出失敗，無法產生檔案。');
  }

  return outputBlob.type === PPTX_MIME_TYPE
    ? outputBlob
    : new Blob([outputBlob], { type: PPTX_MIME_TYPE });
}
