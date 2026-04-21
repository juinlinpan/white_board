export type CanvasBackgroundMode = 'dots' | 'grid';

export const CANVAS_BACKGROUND_STORAGE_KEY =
  'whiteboard.canvasBackgroundMode';

export const DEFAULT_CANVAS_BACKGROUND_MODE: CanvasBackgroundMode = 'dots';

export function parseCanvasBackgroundMode(
  value: string | null | undefined,
): CanvasBackgroundMode {
  return value === 'grid' ? 'grid' : DEFAULT_CANVAS_BACKGROUND_MODE;
}
