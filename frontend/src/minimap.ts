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

export const MAX_CANVAS_EDGE = 12_000;
const FIXED_WORLD_BOUNDS: Rect = {
  x: -MAX_CANVAS_EDGE,
  y: -MAX_CANVAS_EDGE,
  width: MAX_CANVAS_EDGE * 2,
  height: MAX_CANVAS_EDGE * 2,
};

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
  _items: BoardItem[],
  viewport: Viewport,
  viewportSize: Size,
  minimapSize: Size,
): MinimapLayout {
  const viewportBounds = getViewportWorldBounds(viewport, viewportSize);
  const scale = Math.min(
    minimapSize.width / FIXED_WORLD_BOUNDS.width,
    minimapSize.height / FIXED_WORLD_BOUNDS.height,
  );
  const offsetX = (minimapSize.width - FIXED_WORLD_BOUNDS.width * scale) / 2;
  const offsetY = (minimapSize.height - FIXED_WORLD_BOUNDS.height * scale) / 2;

  return {
    worldBounds: FIXED_WORLD_BOUNDS,
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
