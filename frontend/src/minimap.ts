import type { BoardItem } from './api';
import type { Viewport } from './types';

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Size = {
  width: number;
  height: number;
};

export type MinimapLayout = {
  worldBounds: Rect;
  viewportBounds: Rect;
  scale: number;
  offsetX: number;
  offsetY: number;
};

const MIN_WORLD_SPAN = 200;
const WORLD_PADDING = 120;

export function getViewportWorldBounds(
  viewport: Viewport,
  size: Size,
): Rect {
  const width = Math.max(size.width, 1) / viewport.zoom;
  const height = Math.max(size.height, 1) / viewport.zoom;
  return {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width,
    height,
  };
}

export function getMinimapLayout(
  items: BoardItem[],
  viewport: Viewport,
  viewportSize: Size,
  minimapSize: Size,
): MinimapLayout {
  const viewportBounds = getViewportWorldBounds(viewport, viewportSize);
  const itemBounds = items.map((item) => ({
    minX: item.x,
    minY: item.y,
    maxX: item.x + Math.max(item.width, 8),
    maxY: item.y + Math.max(item.height, 8),
  }));

  const minX = Math.min(
    viewportBounds.x,
    ...itemBounds.map((bound) => bound.minX),
  );
  const minY = Math.min(
    viewportBounds.y,
    ...itemBounds.map((bound) => bound.minY),
  );
  const maxX = Math.max(
    viewportBounds.x + viewportBounds.width,
    ...itemBounds.map((bound) => bound.maxX),
  );
  const maxY = Math.max(
    viewportBounds.y + viewportBounds.height,
    ...itemBounds.map((bound) => bound.maxY),
  );

  const worldWidth = Math.max(maxX - minX + WORLD_PADDING * 2, MIN_WORLD_SPAN);
  const worldHeight = Math.max(maxY - minY + WORLD_PADDING * 2, MIN_WORLD_SPAN);
  const worldBounds: Rect = {
    x: minX - WORLD_PADDING,
    y: minY - WORLD_PADDING,
    width: worldWidth,
    height: worldHeight,
  };
  const scale = Math.min(
    minimapSize.width / worldBounds.width,
    minimapSize.height / worldBounds.height,
  );
  const offsetX = (minimapSize.width - worldBounds.width * scale) / 2;
  const offsetY = (minimapSize.height - worldBounds.height * scale) / 2;

  return {
    worldBounds,
    viewportBounds,
    scale,
    offsetX,
    offsetY,
  };
}

export function worldToMinimap(
  x: number,
  y: number,
  layout: MinimapLayout,
): { x: number; y: number } {
  return {
    x: layout.offsetX + (x - layout.worldBounds.x) * layout.scale,
    y: layout.offsetY + (y - layout.worldBounds.y) * layout.scale,
  };
}
