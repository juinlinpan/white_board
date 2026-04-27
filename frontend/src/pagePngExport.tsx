import type { CSSProperties, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';

import type { BoardItem, PageBoardData } from './api';
import {
  getConnectorPoints,
  getFrameChildren,
  getItemMagnetBounds,
  isFrame,
  isHiddenByCollapsedFrame,
  isLegacyConnectorArrow,
  sortItemsByLayer,
  summarizeFrameChild,
} from './canvasHelpers';
import { CANVAS_GRID_SIZE } from './canvasConstants';
import {
  CANVAS_BACKGROUND_STORAGE_KEY,
  DEFAULT_CANVAS_BACKGROUND_MODE,
  parseCanvasBackgroundMode,
  type CanvasBackgroundMode,
} from './canvasBackground';
import { BoardItemRenderer } from './items/BoardItemRenderer';
import { ArrowConnector } from './items/ArrowConnector';

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const EXPORT_PADDING = 24;
const MAX_EXPORT_SCALE = 2;

function getVisibleItems(items: BoardItem[]): BoardItem[] {
  return sortItemsByLayer(items).filter((item) => !isHiddenByCollapsedFrame(item, items));
}

export function getPagePngExportBounds(items: BoardItem[]): Rect | null {
  const visibleItems = getVisibleItems(items);
  if (visibleItems.length === 0) {
    return null;
  }

  const bounds = visibleItems.map(getItemMagnetBounds);
  const left = Math.min(...bounds.map((item) => item.x)) - EXPORT_PADDING;
  const top = Math.min(...bounds.map((item) => item.y)) - EXPORT_PADDING;
  const right = Math.max(...bounds.map((item) => item.x + item.width)) + EXPORT_PADDING;
  const bottom = Math.max(...bounds.map((item) => item.y + item.height)) + EXPORT_PADDING;

  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function getCanvasBackgroundMode(): CanvasBackgroundMode {
  if (typeof window === 'undefined') {
    return DEFAULT_CANVAS_BACKGROUND_MODE;
  }

  return parseCanvasBackgroundMode(
    window.localStorage.getItem(CANVAS_BACKGROUND_STORAGE_KEY),
  );
}

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForExportLayout(): Promise<void> {
  if ('fonts' in document) {
    await document.fonts.ready;
  }

  await waitForNextFrame();
  await waitForNextFrame();
}

function copyComputedStyle(source: Element, target: Element): void {
  const computedStyle = window.getComputedStyle(source);
  const styleText = Array.from(computedStyle)
    .map((property) => `${property}:${computedStyle.getPropertyValue(property)};`)
    .join('');

  if (target instanceof HTMLElement) {
    target.style.cssText = styleText;
    return;
  }

  target.setAttribute('style', styleText);
}

function cloneNodeWithComputedStyles(node: Node): Node {
  if (node instanceof Text) {
    return document.createTextNode(node.textContent ?? '');
  }

  if (!(node instanceof Element)) {
    return node.cloneNode(false);
  }

  const clone = node.cloneNode(false) as Element;
  copyComputedStyle(node, clone);

  if (clone instanceof HTMLElement) {
    clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  }

  for (const child of Array.from(node.childNodes)) {
    clone.appendChild(cloneNodeWithComputedStyles(child));
  }

  return clone;
}

async function renderSvgToPngBlob(
  content: Element,
  width: number,
  height: number,
): Promise<Blob> {
  const serializedContent = new XMLSerializer().serializeToString(content);
  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">${serializedContent}</foreignObject>
    </svg>
  `;
  const svgBlob = new Blob([svgMarkup], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error('PNG 匯出失敗，無法建立畫面快照。'));
      nextImage.src = svgUrl;
    });

    const scale = Math.min(
      MAX_EXPORT_SCALE,
      Math.max(1, window.devicePixelRatio || 1),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);

    const context = canvas.getContext('2d');
    if (context === null) {
      throw new Error('PNG 匯出失敗，無法建立畫布。');
    }

    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    if (blob === null) {
      throw new Error('PNG 匯出失敗，無法產生檔案。');
    }

    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function createExportHost(width: number, height: number): HTMLDivElement {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${width}px`;
  host.style.height = `${height}px`;
  host.style.pointerEvents = 'none';
  host.style.opacity = '0';
  host.style.overflow = 'hidden';
  document.body.appendChild(host);
  return host;
}

function ExportSurface({
  boardData,
  bounds,
  backgroundMode,
}: {
  boardData: PageBoardData;
  bounds: Rect;
  backgroundMode: CanvasBackgroundMode;
}) {
  const visibleItems = getVisibleItems(boardData.board_items);
  const connectorByItemId = new Map(
    boardData.connector_links.map((connector) => [connector.connector_item_id, connector]),
  );
  const surfaceStyle: CSSProperties = {
    position: 'relative',
    width: bounds.width,
    height: bounds.height,
    overflow: 'hidden',
    background: '#f6f4ef',
  };
  const worldStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    transform: `translate(${-bounds.x}px, ${-bounds.y}px)`,
    transformOrigin: '0 0',
  };

  return (
    <div style={surfaceStyle}>
      <div
        className={`canvas-background canvas-background-${backgroundMode}`}
        style={{
          position: 'absolute',
          inset: 0,
          backgroundSize: `${CANVAS_GRID_SIZE}px ${CANVAS_GRID_SIZE}px`,
          backgroundPosition: `${-bounds.x}px ${-bounds.y}px`,
        }}
      />
      <div
        className="canvas-zero-axis canvas-zero-axis-y"
        style={{ left: `${-bounds.x}px` }}
      >
        <span className="canvas-zero-axis-label">Y=0</span>
      </div>
      <div
        className="canvas-zero-axis canvas-zero-axis-x"
        style={{ top: `${-bounds.y}px` }}
      >
        <span className="canvas-zero-axis-label">X=0</span>
      </div>
      <div className="canvas-world" style={worldStyle}>
        {visibleItems.map((item) => {
          if (isLegacyConnectorArrow(item)) {
            const connector = connectorByItemId.get(item.id);
            const connectorPoints =
              connector !== undefined
                ? getConnectorPoints(connector, boardData.board_items)
                : null;

            if (!connector || !connectorPoints) {
              return null;
            }

            return (
              <ArrowConnector
                key={item.id}
                item={item}
                connector={connector}
                fromPoint={connectorPoints.fromPoint}
                toPoint={connectorPoints.toPoint}
                isSelected={false}
                onMouseDown={() => {}}
              />
            );
          }

          const childItems = isFrame(item)
            ? getFrameChildren(boardData.board_items, item.id)
            : [];

          return (
            <BoardItemRenderer
              key={item.id}
              item={item}
              childCount={childItems.length}
              childSummaries={childItems.map(summarizeFrameChild)}
              isSelected={false}
              isEditing={false}
              renderMode="static"
              onMouseDown={() => {}}
              onEndpointMouseDown={() => {}}
              onWaypointMouseDown={() => {}}
              onMidpointMouseDown={() => {}}
              onDoubleClick={() => {}}
              onResizeMouseDown={() => {}}
              onToggleCollapse={() => {}}
              onUpdate={() => {}}
              onEditEnd={() => {}}
            />
          );
        })}
      </div>
    </div>
  );
}

async function renderExportSurfaceToBlob(
  surface: ReactNode,
  bounds: Rect,
): Promise<Blob> {
  const host = createExportHost(bounds.width, bounds.height);
  const root = ReactDOM.createRoot(host);

  try {
    root.render(surface);
    await waitForExportLayout();

    const content = host.firstElementChild;
    if (content === null) {
      throw new Error('PNG 匯出失敗，無法建立畫面內容。');
    }

    const clonedContent = cloneNodeWithComputedStyles(content);
    if (!(clonedContent instanceof Element)) {
      throw new Error('PNG 匯出失敗，無法複製畫面內容。');
    }

    return await renderSvgToPngBlob(
      clonedContent,
      bounds.width,
      bounds.height,
    );
  } finally {
    root.unmount();
    host.remove();
  }
}

export async function exportPageAsPng(
  boardData: PageBoardData,
): Promise<Blob> {
  const bounds = getPagePngExportBounds(boardData.board_items);
  if (bounds === null) {
    throw new Error('目前 Page 沒有可匯出的物件。');
  }

  return renderExportSurfaceToBlob(
    <ExportSurface
      boardData={boardData}
      bounds={bounds}
      backgroundMode={getCanvasBackgroundMode()}
    />,
    bounds,
  );
}
