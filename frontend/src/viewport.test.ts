import { describe, expect, it } from 'vitest';

import {
  adjustResetZoomByStep,
  adjustZoomByStep,
  getDisplayZoom,
  getResetZoom,
  normalizeResetZoom,
  zoomViewportAroundPoint,
} from './viewport';

describe('viewport helpers', () => {
  it('rounds display zoom to toolbar precision', () => {
    expect(getDisplayZoom(1.74)).toBe(1.7);
    expect(getDisplayZoom(1.75)).toBe(1.8);
  });

  it('adjusts zoom in tenth-step increments', () => {
    expect(adjustZoomByStep(1.73, 1)).toBe(1.8);
    expect(adjustZoomByStep(1.73, -1)).toBe(1.6);
  });

  it('keeps the target point fixed while zooming around it', () => {
    expect(
      zoomViewportAroundPoint(
        {
          x: 100,
          y: 50,
          zoom: 1,
        },
        2,
        {
          x: 300,
          y: 200,
        },
      ),
    ).toEqual({
      x: -100,
      y: -100,
      zoom: 2,
    });
  });

  it('returns the canonical reset zoom value', () => {
    expect(getResetZoom()).toBe(1);
  });

  it('normalizes custom reset zoom targets to tenth-step increments', () => {
    expect(normalizeResetZoom(1.54)).toBe(1.5);
    expect(normalizeResetZoom(1.55)).toBe(1.6);
  });

  it('adjusts custom reset zoom targets in tenth-step increments', () => {
    expect(adjustResetZoomByStep(1, 1)).toBe(1.1);
    expect(adjustResetZoomByStep(1, -1)).toBe(0.9);
  });
});
