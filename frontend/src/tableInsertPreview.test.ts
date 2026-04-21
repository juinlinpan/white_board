import { describe, expect, it } from 'vitest';
import { TABLE_MAX_DIMENSION } from './tableData';
import {
  getTableInsertCanvasDimensions,
  getTableInsertCanvasSize,
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
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      ),
    ).toEqual({ cols: 1, rows: 1 });
  });

  it('expands rows and cols as the drag grows', () => {
    expect(
      getTableInsertDimensions(
        TABLE_INSERT_PREVIEW_CELL_WIDTH * 3,
        TABLE_INSERT_PREVIEW_CELL_HEIGHT * 2,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      ),
    ).toEqual({ cols: 4, rows: 3 });
  });

  it('clamps the created table size to the table minimum', () => {
    expect(getTableInsertItemSize(1, 1)).toEqual({ width: 120, height: 72 });
  });

  it('scales the created table size with the chosen grid', () => {
    expect(getTableInsertItemSize(6, 4)).toEqual({
      width: 720,
      height: 288,
    });
  });

  it('uses world-sized thresholds for canvas dragging', () => {
    expect(
      getTableInsertCanvasDimensions(
        119,
        71,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      ),
    ).toEqual({
      cols: 1,
      rows: 1,
    });
    expect(
      getTableInsertCanvasDimensions(
        120,
        72,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      ),
    ).toEqual({
      cols: 2,
      rows: 2,
    });
  });

  it('keeps the canvas preview size aligned to the dragged world distance', () => {
    expect(getTableInsertCanvasSize(320, 210, 2, 2)).toEqual({
      width: 320,
      height: 210,
    });
    expect(getTableInsertCanvasSize(40, 40, 1, 1)).toEqual({
      width: 120,
      height: 72,
    });
  });
});
