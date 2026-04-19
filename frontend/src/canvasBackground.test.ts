import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CANVAS_BACKGROUND_MODE,
  parseCanvasBackgroundMode,
} from './canvasBackground';

describe('parseCanvasBackgroundMode', () => {
  it('keeps the supported grid mode', () => {
    expect(parseCanvasBackgroundMode('grid')).toBe('grid');
  });

  it('falls back to the default mode for unsupported values', () => {
    expect(parseCanvasBackgroundMode('dots')).toBe('dots');
    expect(parseCanvasBackgroundMode('unknown')).toBe(
      DEFAULT_CANVAS_BACKGROUND_MODE,
    );
    expect(parseCanvasBackgroundMode(null)).toBe(
      DEFAULT_CANVAS_BACKGROUND_MODE,
    );
  });
});
