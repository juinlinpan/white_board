import type { PageBoardData } from './api';
import { exportPageAsPng, getPagePngExportBounds } from './pagePngExport';

const PPTX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const SLIDE_WIDTH = 10;
const SLIDE_HEIGHT = 5.625;
const SLIDE_MARGIN = 0.3;
const TITLE_HEIGHT = 0.45;
const TITLE_GAP = 0.15;
let pptxGenJSImport: Promise<typeof import('pptxgenjs')> | null = null;

type ImagePlacement = {
  x: number;
  y: number;
  w: number;
  h: number;
};

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return window.btoa(binary);
}

async function blobToDataUri(blob: Blob): Promise<string> {
  const base64 = arrayBufferToBase64(await new Response(blob).arrayBuffer());
  return `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
}

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

export function getPptxImagePlacement(bounds: {
  width: number;
  height: number;
}): ImagePlacement {
  const contentTop = SLIDE_MARGIN + TITLE_HEIGHT + TITLE_GAP;
  const availableWidth = SLIDE_WIDTH - SLIDE_MARGIN * 2;
  const availableHeight = SLIDE_HEIGHT - contentTop - SLIDE_MARGIN;
  const scale = Math.min(
    availableWidth / Math.max(bounds.width, 1),
    availableHeight / Math.max(bounds.height, 1),
  );
  const width = bounds.width * scale;
  const height = bounds.height * scale;

  return {
    x: SLIDE_MARGIN + (availableWidth - width) / 2,
    y: contentTop + (availableHeight - height) / 2,
    w: width,
    h: height,
  };
}

export async function exportPageAsPptx(boardData: PageBoardData): Promise<Blob> {
  const bounds = getPagePngExportBounds(boardData.board_items);
  if (bounds === null) {
    throw new Error('目前 Page 沒有可匯出的物件。');
  }

  const pngBlob = await exportPageAsPng(boardData);
  const pngDataUri = await blobToDataUri(pngBlob);

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
  slide.addImage({
    data: pngDataUri,
    altText: `${boardData.page.name} page snapshot`,
    ...getPptxImagePlacement(bounds),
  });
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
