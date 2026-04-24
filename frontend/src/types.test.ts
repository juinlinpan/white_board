import { describe, expect, it } from 'vitest';

import { CANVAS_GRID_SIZE } from './canvasConstants';
import { ITEM_DEFAULT_SIZE, ITEM_MIN_SIZE, ITEM_TYPE } from './types';

const GRID_ALIGNED_ITEM_TYPES = [
  ITEM_TYPE.line,
  ITEM_TYPE.text_box,
  ITEM_TYPE.sticky_note,
  ITEM_TYPE.note_paper,
  ITEM_TYPE.frame,
  ITEM_TYPE.table,
  ITEM_TYPE.arrow,
] as const;

describe('grid-aligned item sizes', () => {
  it('keeps default sizes on the canvas grid', () => {
    for (const itemType of GRID_ALIGNED_ITEM_TYPES) {
      expect(ITEM_DEFAULT_SIZE[itemType]?.width % CANVAS_GRID_SIZE).toBe(0);
      expect(ITEM_DEFAULT_SIZE[itemType]?.height % CANVAS_GRID_SIZE).toBe(0);
    }
  });

  it('keeps minimum sizes on the canvas grid', () => {
    for (const itemType of GRID_ALIGNED_ITEM_TYPES) {
      expect(ITEM_MIN_SIZE[itemType]?.width % CANVAS_GRID_SIZE).toBe(0);
      expect(ITEM_MIN_SIZE[itemType]?.height % CANVAS_GRID_SIZE).toBe(0);
    }
  });
});
