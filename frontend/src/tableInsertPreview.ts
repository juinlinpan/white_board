import { ITEM_DEFAULT_SIZE, ITEM_TYPE } from './types';
import {
  TABLE_CELL_MIN_HEIGHT,
  TABLE_CELL_MIN_WIDTH,
  getTableMinSize,
} from './tableData';

export const TABLE_INSERT_PREVIEW_CELL_WIDTH = 18;
export const TABLE_INSERT_PREVIEW_CELL_HEIGHT = 18;
export const TABLE_INSERT_PREVIEW_OFFSET_X = 14;
export const TABLE_INSERT_PREVIEW_OFFSET_Y = 14;

const DEFAULT_TABLE_COLS = 3;
const DEFAULT_TABLE_ROWS = 3;
const TABLE_INSERT_TARGET_COL_WIDTH = TABLE_CELL_MIN_WIDTH;
const TABLE_INSERT_TARGET_ROW_HEIGHT = TABLE_CELL_MIN_HEIGHT;

export function getTableInsertDimensions(
  deltaX: number,
  deltaY: number,
  maxCols: number,
  maxRows: number,
): { cols: number; rows: number } {
  const cols = Math.min(
    maxCols,
    Math.max(1, Math.floor(Math.max(0, deltaX) / TABLE_INSERT_PREVIEW_CELL_WIDTH) + 1),
  );
  const rows = Math.min(
    maxRows,
    Math.max(1, Math.floor(Math.max(0, deltaY) / TABLE_INSERT_PREVIEW_CELL_HEIGHT) + 1),
  );
  return { cols, rows };
}

export function getTableInsertCanvasDimensions(
  deltaWorldX: number,
  deltaWorldY: number,
  maxCols: number,
  maxRows: number,
): { cols: number; rows: number } {
  const cols = Math.min(
    maxCols,
    Math.max(
      1,
      Math.floor(Math.max(0, deltaWorldX) / TABLE_INSERT_TARGET_COL_WIDTH) + 1,
    ),
  );
  const rows = Math.min(
    maxRows,
    Math.max(
      1,
      Math.floor(Math.max(0, deltaWorldY) / TABLE_INSERT_TARGET_ROW_HEIGHT) + 1,
    ),
  );
  return { cols, rows };
}

export function getTableInsertItemSize(
  cols: number,
  rows: number,
): { width: number; height: number } {
  const baseSize = ITEM_DEFAULT_SIZE[ITEM_TYPE.table];
  const widthPerCol = baseSize.width / DEFAULT_TABLE_COLS;
  const heightPerRow = baseSize.height / DEFAULT_TABLE_ROWS;
  const minSize = getTableMinSize(rows, cols);

  return {
    width: Math.max(minSize.width, widthPerCol * cols),
    height: Math.max(minSize.height, heightPerRow * rows),
  };
}

export function getTableInsertCanvasSize(
  deltaWorldX: number,
  deltaWorldY: number,
  rows = 1,
  cols = 1,
): { width: number; height: number } {
  const minSize = getTableMinSize(rows, cols);

  return {
    width: Math.max(minSize.width, Math.max(0, deltaWorldX)),
    height: Math.max(minSize.height, Math.max(0, deltaWorldY)),
  };
}
