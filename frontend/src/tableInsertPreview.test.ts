import { describe, expect, it } from 'vitest';
import {
  TABLE_INSERT_PREVIEW_CELL_HEIGHT,
  TABLE_INSERT_PREVIEW_CELL_WIDTH,
  getTableInsertDimensions,
  getTableInsertItemSize,
} from './tableInsertPreview';

describe('tableInsertPreview', () => {
  it('keeps the preview at 1x1 until the drag crosses a full cell', () => {
    expect(
      getTableInsertDimensions(
        TABLE_INSERT_PREVIEW_CELL_WIDTH - 1,
        TABLE_INSERT_PREVIEW_CELL_HEIGHT - 1,
        12,
        12,
      ),
    ).toEqual({ cols: 1, rows: 1 });
  });

  it('expands rows and cols as the drag grows', () => {
    expect(
      getTableInsertDimensions(
        TABLE_INSERT_PREVIEW_CELL_WIDTH * 3,
        TABLE_INSERT_PREVIEW_CELL_HEIGHT * 2,
        12,
        12,
      ),
    ).toEqual({ cols: 4, rows: 3 });
  });

  it('clamps the created table size to the table minimum', () => {
    expect(getTableInsertItemSize(1, 1)).toEqual({ width: 240, height: 140 });
  });

  it('scales the created table size with the chosen grid', () => {
    expect(getTableInsertItemSize(6, 4)).toEqual({
      width: 640,
      height: 266.6666666666667,
    });
  });
});
