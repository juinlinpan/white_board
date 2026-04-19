import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  TOOLBAR_ZOOM_STEP,
} from './canvasConstants';
import type { Viewport } from './types';

type ScreenPoint = {
  x: number;
  y: number;
};

function roundToStep(value: number, step: number): number {
  return Number((Math.round(value / step) * step).toFixed(4));
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function getDisplayZoom(zoom: number): number {
  return roundToStep(zoom, TOOLBAR_ZOOM_STEP);
}

export function adjustZoomByStep(
  currentZoom: number,
  direction: -1 | 1,
): number {
  const roundedCurrentZoom = getDisplayZoom(currentZoom);
  return clampZoom(
    roundToStep(
      roundedCurrentZoom + direction * TOOLBAR_ZOOM_STEP,
      TOOLBAR_ZOOM_STEP,
    ),
  );
}

export function getResetZoom(): number {
  return DEFAULT_ZOOM;
}

export function zoomViewportAroundPoint(
  viewport: Viewport,
  targetZoom: number,
  point: ScreenPoint,
): Viewport {
  const nextZoom = clampZoom(targetZoom);
  if (nextZoom === viewport.zoom) {
    return viewport;
  }

  const scale = nextZoom / viewport.zoom;
  return {
    x: point.x - scale * (point.x - viewport.x),
    y: point.y - scale * (point.y - viewport.y),
    zoom: nextZoom,
  };
}
