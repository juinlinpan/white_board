import { ITEM_MIN_SIZE, ITEM_TYPE } from './types';

const DEFAULT_TABLE_ROWS = 3;
const DEFAULT_TABLE_COLS = 3;

export const TABLE_MIN_DIMENSION = 1;
export const TABLE_MAX_DIMENSION = 20;
export const TABLE_CELL_MIN_WIDTH = ITEM_MIN_SIZE[ITEM_TYPE.text_box].width;
export const TABLE_CELL_MIN_HEIGHT = ITEM_MIN_SIZE[ITEM_TYPE.text_box].height;

// null = position is covered by a spanning cell from another grid location
export type TableCellData = {
  id: string;
  content: string;       // plain text label for the cell
  rowSpan: number;       // >= 1
  colSpan: number;       // >= 1
  isCollapsed: boolean;
  /** IDs of board items attached to this cell (max 2) */
  childItemIds: string[];
};

export type TableData = {
  rows: number;
  cols: number;
  colWidths: number[];   // fractions summing to ~1.0 (one entry per column)
  rowHeights: number[];  // fractions summing to ~1.0 (one entry per row)
  cells: (TableCellData | null)[][];
  /** Per-segment column divider position overrides.
   *  Key: "c{boundaryIdx}r{row}", Value: absolute position fraction (0-1) */
  colDividerPositions?: Record<string, number>;
  /** Per-segment row divider position overrides.
   *  Key: "r{boundaryIdx}c{col}", Value: absolute position fraction (0-1) */
  rowDividerPositions?: Record<string, number>;
  /** Explicit continuity breaks between vertically adjacent column-divider segments.
   *  Key: "c{boundaryIdx}r{row}" means the segments at rows r and r+1 must not auto-join. */
  colDividerBreaks?: Record<string, true>;
  /** Explicit continuity breaks between horizontally adjacent row-divider segments.
   *  Key: "r{boundaryIdx}c{col}" means the segments at cols c and c+1 must not auto-join. */
  rowDividerBreaks?: Record<string, true>;
};

/** A group of contiguous divider segments that move together. */
export type SegmentGroup = {
  type: 'col' | 'row';
  boundaryIndex: number;
  /** Row indices (for col groups) or col indices (for row groups). */
  segments: number[];
  /** Effective position (fraction 0-1). */
  position: number;
  /** Unique key for React / hover tracking. */
  key: string;
};

// [row, col] index pair used by select / merge operations
export type CellPosition = [number, number];

// ── Internal helpers ─────────────────────────────────────────────────────

let _idCounter = 0;

function makeCellId(): string {
  return `tc${Date.now().toString(36)}${(++_idCounter).toString(36)}`;
}

function makeCell(): TableCellData {
  return {
    id: makeCellId(),
    content: '',
    rowSpan: 1,
    colSpan: 1,
    isCollapsed: true,
    childItemIds: [],
  };
}

function clampDim(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(TABLE_MAX_DIMENSION, Math.max(TABLE_MIN_DIMENSION, Math.round(value)));
}

export function getTableMinSize(
  rows: number,
  cols: number,
): { width: number; height: number } {
  const safeRows = clampDim(rows, TABLE_MIN_DIMENSION);
  const safeCols = clampDim(cols, TABLE_MIN_DIMENSION);

  return {
    width: safeCols * TABLE_CELL_MIN_WIDTH,
    height: safeRows * TABLE_CELL_MIN_HEIGHT,
  };
}

export function getTableMinSizeFromDataJson(
  dataJson: string | null,
): { width: number; height: number } {
  const tableData = parseTableData(dataJson);
  return getTableMinSize(tableData.rows, tableData.cols);
}

function normalizeFractions(fracs: number[]): number[] {
  const sum = fracs.reduce((a, b) => a + b, 0);
  if (sum <= 0) return fracs.map(() => 1 / fracs.length);
  return fracs.map((f) => f / sum);
}

// ── Find root cell ────────────────────────────────────────────────────────

/** Returns the non-null cell whose span covers position [row, col]. */
export function getRootCellAt(
  data: TableData,
  row: number,
  col: number,
): { cell: TableCellData; row: number; col: number } | null {
  const direct = data.cells[row]?.[col];
  if (direct !== null && direct !== undefined) {
    return { cell: direct, row, col };
  }
  for (let r = 0; r <= row; r++) {
    for (let c = 0; c <= col; c++) {
      const candidate = data.cells[r]?.[c];
      if (!candidate) continue;
      if (r + candidate.rowSpan > row && c + candidate.colSpan > col) {
        return { cell: candidate, row: r, col: c };
      }
    }
  }
  return null;
}

// ── Create ────────────────────────────────────────────────────────────────

export function createTableData(
  rows = DEFAULT_TABLE_ROWS,
  cols = DEFAULT_TABLE_COLS,
): TableData {
  const r = clampDim(rows, DEFAULT_TABLE_ROWS);
  const c = clampDim(cols, DEFAULT_TABLE_COLS);
  return {
    rows: r,
    cols: c,
    colWidths: Array(c).fill(1 / c) as number[],
    rowHeights: Array(r).fill(1 / r) as number[],
    cells: Array.from({ length: r }, () =>
      Array.from({ length: c }, () => makeCell()),
    ),
  };
}

// ── Serialize ─────────────────────────────────────────────────────────────

export function serializeTableData(data: TableData): string {
  return JSON.stringify(data);
}

// ── Parse (handles both old string[][] and new format) ─────────────────────

function hasNewFormat(parsed: Record<string, unknown>): boolean {
  return Array.isArray(parsed['colWidths']) || Array.isArray(parsed['rowHeights']);
}

function parseNewFormat(parsed: Record<string, unknown>): TableData {
  const rows = clampDim(
    typeof parsed['rows'] === 'number' ? parsed['rows'] : DEFAULT_TABLE_ROWS,
    DEFAULT_TABLE_ROWS,
  );
  const cols = clampDim(
    typeof parsed['cols'] === 'number' ? parsed['cols'] : DEFAULT_TABLE_COLS,
    DEFAULT_TABLE_COLS,
  );
  const rawCW = Array.isArray(parsed['colWidths']) ? (parsed['colWidths'] as unknown[]) : [];
  const rawRH = Array.isArray(parsed['rowHeights']) ? (parsed['rowHeights'] as unknown[]) : [];
  const colWidths = normalizeFractions(
    Array.from({ length: cols }, (_, i) => {
      const v = rawCW[i];
      return typeof v === 'number' && v > 0 ? v : 1 / cols;
    }),
  );
  const rowHeights = normalizeFractions(
    Array.from({ length: rows }, (_, i) => {
      const v = rawRH[i];
      return typeof v === 'number' && v > 0 ? v : 1 / rows;
    }),
  );
  const rawCells = Array.isArray(parsed['cells']) ? (parsed['cells'] as unknown[][]) : [];
  const cells: (TableCellData | null)[][] = Array.from({ length: rows }, (_, ri) => {
    const rawRow = rawCells[ri];
    return Array.from({ length: cols }, (_, ci): TableCellData | null => {
      if (!Array.isArray(rawRow)) return makeCell();
      const raw = rawRow[ci];
      if (raw === null) return null;
      if (typeof raw !== 'object' || raw === null) return makeCell();
      const obj = raw as Record<string, unknown>;
      return {
        id: typeof obj['id'] === 'string' ? obj['id'] : makeCellId(),
        content: typeof obj['content'] === 'string' ? obj['content'] : '',
        rowSpan: typeof obj['rowSpan'] === 'number' && obj['rowSpan'] >= 1 ? obj['rowSpan'] : 1,
        colSpan: typeof obj['colSpan'] === 'number' && obj['colSpan'] >= 1 ? obj['colSpan'] : 1,
        isCollapsed: typeof obj['isCollapsed'] === 'boolean' ? obj['isCollapsed'] : true,
        childItemIds: Array.isArray(obj['childItemIds'])
          ? (obj['childItemIds'] as unknown[]).filter((v): v is string => typeof v === 'string')
          : typeof obj['childItemId'] === 'string'
            ? [obj['childItemId']]
            : [],
      };
    });
  });
  return {
    rows,
    cols,
    colWidths,
    rowHeights,
    cells,
    ...parseDividerPositions(parsed),
    ...parseDividerBreaks(parsed),
  };
}

function parseDividerPositions(parsed: Record<string, unknown>): Pick<TableData, 'colDividerPositions' | 'rowDividerPositions'> {
  const result: Pick<TableData, 'colDividerPositions' | 'rowDividerPositions'> = {};
  if (parsed['colDividerPositions'] && typeof parsed['colDividerPositions'] === 'object') {
    const raw = parsed['colDividerPositions'] as Record<string, unknown>;
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'number' && isFinite(v)) cleaned[k] = v;
    }
    if (Object.keys(cleaned).length > 0) result.colDividerPositions = cleaned;
  }
  if (parsed['rowDividerPositions'] && typeof parsed['rowDividerPositions'] === 'object') {
    const raw = parsed['rowDividerPositions'] as Record<string, unknown>;
    const cleaned: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'number' && isFinite(v)) cleaned[k] = v;
    }
    if (Object.keys(cleaned).length > 0) result.rowDividerPositions = cleaned;
  }
  return result;
}

function parseDividerBreaks(parsed: Record<string, unknown>): Pick<TableData, 'colDividerBreaks' | 'rowDividerBreaks'> {
  const result: Pick<TableData, 'colDividerBreaks' | 'rowDividerBreaks'> = {};
  if (parsed['colDividerBreaks'] && typeof parsed['colDividerBreaks'] === 'object') {
    const raw = parsed['colDividerBreaks'] as Record<string, unknown>;
    const cleaned: Record<string, true> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === true) cleaned[k] = true;
    }
    if (Object.keys(cleaned).length > 0) result.colDividerBreaks = cleaned;
  }
  if (parsed['rowDividerBreaks'] && typeof parsed['rowDividerBreaks'] === 'object') {
    const raw = parsed['rowDividerBreaks'] as Record<string, unknown>;
    const cleaned: Record<string, true> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v === true) cleaned[k] = true;
    }
    if (Object.keys(cleaned).length > 0) result.rowDividerBreaks = cleaned;
  }
  return result;
}

function parseOldFormat(parsed: Record<string, unknown>): TableData {
  const rows = clampDim(
    typeof parsed['rows'] === 'number' ? parsed['rows'] : DEFAULT_TABLE_ROWS,
    DEFAULT_TABLE_ROWS,
  );
  const cols = clampDim(
    typeof parsed['cols'] === 'number' ? parsed['cols'] : DEFAULT_TABLE_COLS,
    DEFAULT_TABLE_COLS,
  );
  const base = createTableData(rows, cols);
  const rawCells = Array.isArray(parsed['cells']) ? (parsed['cells'] as unknown[][]) : [];
  base.cells = base.cells.map((row, ri) =>
    row.map((cell, ci): TableCellData | null => {
      if (cell === null) {
        return null;
      }

      const rawRow = rawCells[ri];
      const rawVal = Array.isArray(rawRow) ? rawRow[ci] : '';
      return {
        id: cell.id,
        content: typeof rawVal === 'string' ? rawVal : '',
        rowSpan: cell.rowSpan,
        colSpan: cell.colSpan,
        isCollapsed: cell.isCollapsed,
        childItemIds: cell.childItemIds,
      };
    }),
  );
  return base;
}

export function parseTableData(dataJson: string | null): TableData {
  if (!dataJson || dataJson.trim().length === 0) return createTableData();
  try {
    const parsed = JSON.parse(dataJson) as Record<string, unknown>;
    if (hasNewFormat(parsed)) return parseNewFormat(parsed);
    return parseOldFormat(parsed);
  } catch {
    return createTableData();
  }
}

// ── Cell helpers ─────────────────────────────────────────────────────────

export function updateTableCell(
  data: TableData,
  cellId: string,
  patch: Partial<TableCellData>,
): TableData {
  return {
    ...data,
    cells: data.cells.map((row) =>
      row.map((cell) => (cell && cell.id === cellId ? { ...cell, ...patch } : cell)),
    ),
  };
}

export function getTableCellSummary(cell: TableCellData): string {
  return cell.content;
}

export function countFilledTableCells(data: TableData): number {
  return data.cells
    .flat()
    .filter((c) => {
      if (!c) return false;
      if (c.childItemIds.length > 0) return true;
      return c.content.trim().length > 0;
    }).length;
}

// ── Merge cells ──────────────────────────────────────────────────────────

function getBoundingRect(
  data: TableData,
  positions: CellPosition[],
): { minRow: number; maxRow: number; minCol: number; maxCol: number } | null {
  if (positions.length === 0) return null;
  const allPos = new Set<string>();
  for (const [r, c] of positions) {
    const root = getRootCellAt(data, r, c);
    if (!root) continue;
    for (let dr = 0; dr < root.cell.rowSpan; dr++) {
      for (let dc = 0; dc < root.cell.colSpan; dc++) {
        allPos.add(`${root.row + dr},${root.col + dc}`);
      }
    }
  }
  const rows = [...allPos].map((k) => Number(k.split(',')[0]));
  const cols = [...allPos].map((k) => Number(k.split(',')[1]));
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      if (!allPos.has(`${r},${c}`)) return null;
    }
  }
  return { minRow, maxRow, minCol, maxCol };
}

export function mergeCells(data: TableData, positions: CellPosition[]): TableData {
  const rect = getBoundingRect(data, positions);
  if (!rect) return data;
  const { minRow, maxRow, minCol, maxCol } = rect;
  if (minRow === maxRow && minCol === maxCol) return data;

  const contents: string[] = [];
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      const cell = data.cells[r]?.[c];
      if (cell?.content.trim()) contents.push(cell.content.trim());
    }
  }

  const mergedCell: TableCellData = {
    id: makeCellId(),
    content: contents.join('\n'),
    rowSpan: maxRow - minRow + 1,
    colSpan: maxCol - minCol + 1,
    isCollapsed: true,
    childItemIds: [],
  };

  const nextCells = data.cells.map((row, ri) =>
    row.map((cell, ci) => {
      if (ri === minRow && ci === minCol) return mergedCell;
      if (ri >= minRow && ri <= maxRow && ci >= minCol && ci <= maxCol) return null;
      return cell;
    }),
  );

  // Clean up divider position overrides for boundaries now internal to the merged cell
  let nextColPos = data.colDividerPositions ? { ...data.colDividerPositions } : undefined;
  let nextRowPos = data.rowDividerPositions ? { ...data.rowDividerPositions } : undefined;
  if (nextColPos) {
    for (let b = minCol; b < maxCol; b++) {
      for (let r = minRow; r <= maxRow; r++) {
        delete nextColPos[`c${b}r${r}`];
      }
    }
    if (Object.keys(nextColPos).length === 0) nextColPos = undefined;
  }
  if (nextRowPos) {
    for (let b = minRow; b < maxRow; b++) {
      for (let c = minCol; c <= maxCol; c++) {
        delete nextRowPos[`r${b}c${c}`];
      }
    }
    if (Object.keys(nextRowPos).length === 0) nextRowPos = undefined;
  }

  return { ...data, cells: nextCells, colDividerPositions: nextColPos, rowDividerPositions: nextRowPos };
}

// ── Find cell by child item ID ───────────────────────────────────────────

export function findCellByChildItemId(
  data: TableData,
  childItemId: string,
): { cell: TableCellData; row: number; col: number } | null {
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) {
      const cell = data.cells[r]?.[c];
      if (cell?.childItemIds.includes(childItemId)) return { cell, row: r, col: c };
    }
  }
  return null;
}

// ── Split cell ───────────────────────────────────────────────────────────

function findCellById(
  data: TableData,
  cellId: string,
): { cell: TableCellData; row: number; col: number } | null {
  for (let r = 0; r < data.rows; r++) {
    for (let c = 0; c < data.cols; c++) {
      const cell = data.cells[r]?.[c];
      if (cell?.id === cellId) return { cell, row: r, col: c };
    }
  }
  return null;
}

function withDividerBreak(
  breaks: Record<string, true> | undefined,
  key: string,
): Record<string, true> {
  return { ...(breaks ?? {}), [key]: true };
}

function getColumnSplitPosition(
  data: TableData,
  row: number,
  col: number,
  colSpan: number,
  splitLeftSpan: number,
): number {
  const left = getEffectiveColEdge(data, col, row);
  const right = getEffectiveColEdge(data, col + colSpan, row);
  return left + (right - left) * (splitLeftSpan / colSpan);
}

function getRowSplitPosition(
  data: TableData,
  row: number,
  col: number,
  rowSpan: number,
  splitTopSpan: number,
): number {
  const top = getEffectiveRowEdge(data, row, col);
  const bottom = getEffectiveRowEdge(data, row + rowSpan, col);
  return top + (bottom - top) * (splitTopSpan / rowSpan);
}

export function splitCellHorizontal(data: TableData, cellId: string): TableData {
  const found = findCellById(data, cellId);
  if (!found || found.cell.rowSpan <= 1) return data;
  const { cell: target, row, col } = found;
  const half = Math.floor(target.rowSpan / 2);
  const splitBoundaryIndex = row + half - 1;
  const splitPosition = getRowSplitPosition(data, row, col, target.rowSpan, half);
  const topCell: TableCellData = { ...target, id: makeCellId(), rowSpan: half };
  const bottomCell: TableCellData = {
    ...target,
    id: makeCellId(),
    content: '',
    childItemIds: [],
    rowSpan: target.rowSpan - half,
  };
  const nextCells = data.cells.map((rowArr, ri) =>
    rowArr.map((cell, ci) => {
      if (ri === row && ci === col) return topCell;
      if (ri === row + half && ci === col) return bottomCell;
      return cell;
    }),
  );
  const nextRowPositions = { ...(data.rowDividerPositions ?? {}) };
  for (let c = col; c < col + target.colSpan; c += 1) {
    nextRowPositions[`r${splitBoundaryIndex}c${c}`] = splitPosition;
  }
  let nextRowBreaks = data.rowDividerBreaks;
  if (col > 0) {
    nextRowBreaks = withDividerBreak(
      nextRowBreaks,
      `r${splitBoundaryIndex}c${col - 1}`,
    );
  }
  if (col + target.colSpan < data.cols) {
    nextRowBreaks = withDividerBreak(
      nextRowBreaks,
      `r${splitBoundaryIndex}c${col + target.colSpan - 1}`,
    );
  }
  return {
    ...data,
    cells: nextCells,
    rowDividerPositions: nextRowPositions,
    rowDividerBreaks: nextRowBreaks,
  };
}

export function splitCellVertical(data: TableData, cellId: string): TableData {
  const found = findCellById(data, cellId);
  if (!found || found.cell.colSpan <= 1) return data;
  const { cell: target, row, col } = found;
  const half = Math.floor(target.colSpan / 2);
  const splitBoundaryIndex = col + half - 1;
  const splitPosition = getColumnSplitPosition(data, row, col, target.colSpan, half);
  const leftCell: TableCellData = { ...target, id: makeCellId(), colSpan: half };
  const rightCell: TableCellData = {
    ...target,
    id: makeCellId(),
    content: '',
    childItemIds: [],
    colSpan: target.colSpan - half,
  };
  const nextCells = data.cells.map((rowArr, ri) =>
    rowArr.map((cell, ci) => {
      if (ri === row && ci === col) return leftCell;
      if (ri === row && ci === col + half) return rightCell;
      return cell;
    }),
  );
  const nextColPositions = { ...(data.colDividerPositions ?? {}) };
  for (let r = row; r < row + target.rowSpan; r += 1) {
    nextColPositions[`c${splitBoundaryIndex}r${r}`] = splitPosition;
  }
  let nextColBreaks = data.colDividerBreaks;
  if (row > 0) {
    nextColBreaks = withDividerBreak(
      nextColBreaks,
      `c${splitBoundaryIndex}r${row - 1}`,
    );
  }
  if (row + target.rowSpan < data.rows) {
    nextColBreaks = withDividerBreak(
      nextColBreaks,
      `c${splitBoundaryIndex}r${row + target.rowSpan - 1}`,
    );
  }
  return {
    ...data,
    cells: nextCells,
    colDividerPositions: nextColPositions,
    colDividerBreaks: nextColBreaks,
  };
}

// ── Position remapping for structural changes ────────────────────────────

function remapPositionsForAddRow(
  data: TableData,
  insertAt: number,
): Pick<TableData, 'colDividerPositions' | 'rowDividerPositions'> {
  const result: Pick<TableData, 'colDividerPositions' | 'rowDividerPositions'> = {};
  if (data.colDividerPositions) {
    const next: Record<string, number> = {};
    for (const [key, val] of Object.entries(data.colDividerPositions)) {
      const m = key.match(/^c(\d+)r(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const r = parseInt(m[2]!, 10);
      if (r < insertAt) {
        next[key] = val;
      } else {
        next[`c${b}r${r + 1}`] = val;
      }
    }
    // New row inherits from row above
    for (const [key, val] of Object.entries(data.colDividerPositions)) {
      const m = key.match(/^c(\d+)r(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const r = parseInt(m[2]!, 10);
      if (r === insertAt - 1 || (r === insertAt && insertAt === 0)) {
        next[`c${b}r${insertAt}`] = val;
      }
    }
    if (Object.keys(next).length > 0) result.colDividerPositions = next;
  }
  if (data.rowDividerPositions) {
    const next: Record<string, number> = {};
    for (const [key, val] of Object.entries(data.rowDividerPositions)) {
      const m = key.match(/^r(\d+)c(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const c = parseInt(m[2]!, 10);
      if (b < insertAt) {
        next[key] = val;
      } else {
        next[`r${b + 1}c${c}`] = val;
      }
    }
    if (Object.keys(next).length > 0) result.rowDividerPositions = next;
  }
  return result;
}

function remapPositionsForAddCol(
  data: TableData,
  insertAt: number,
): Pick<TableData, 'colDividerPositions' | 'rowDividerPositions'> {
  const result: Pick<TableData, 'colDividerPositions' | 'rowDividerPositions'> = {};
  if (data.colDividerPositions) {
    const next: Record<string, number> = {};
    for (const [key, val] of Object.entries(data.colDividerPositions)) {
      const m = key.match(/^c(\d+)r(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const r = parseInt(m[2]!, 10);
      if (b < insertAt) {
        next[key] = val;
      } else {
        next[`c${b + 1}r${r}`] = val;
      }
    }
    if (Object.keys(next).length > 0) result.colDividerPositions = next;
  }
  if (data.rowDividerPositions) {
    const next: Record<string, number> = {};
    for (const [key, val] of Object.entries(data.rowDividerPositions)) {
      const m = key.match(/^r(\d+)c(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const c = parseInt(m[2]!, 10);
      if (c < insertAt) {
        next[key] = val;
      } else {
        next[`r${b}c${c + 1}`] = val;
      }
    }
    // New col inherits from col to the left
    for (const [key, val] of Object.entries(data.rowDividerPositions)) {
      const m = key.match(/^r(\d+)c(\d+)$/);
      if (!m) continue;
      const b = parseInt(m[1]!, 10);
      const c = parseInt(m[2]!, 10);
      if (c === insertAt - 1 || (c === insertAt && insertAt === 0)) {
        next[`r${b}c${insertAt}`] = val;
      }
    }
    if (Object.keys(next).length > 0) result.rowDividerPositions = next;
  }
  return result;
}

// ── Add row / col ────────────────────────────────────────────────────────

export function addRow(data: TableData, afterRowIndex: number): TableData {
  if (data.rows >= TABLE_MAX_DIMENSION) return data;
  const insertAt = Math.max(0, Math.min(data.rows, afterRowIndex + 1));
  const newRow = Array.from({ length: data.cols }, () => makeCell());
  const nextCells = [
    ...data.cells.slice(0, insertAt),
    newRow,
    ...data.cells.slice(insertAt),
  ];
  const newFrac = 1 / (data.rows + 1);
  const scaleFactor = 1 - newFrac;
  const nextRowHeights = normalizeFractions([
    ...data.rowHeights.slice(0, insertAt).map((h) => h * scaleFactor),
    newFrac,
    ...data.rowHeights.slice(insertAt).map((h) => h * scaleFactor),
  ]);
  // Extend rowSpan of cells that cross the insertion point
  const finalCells = nextCells.map((row, ri) =>
    row.map((cell) => {
      if (!cell) return cell;
      if (ri < insertAt && ri + cell.rowSpan > insertAt) {
        return { ...cell, rowSpan: cell.rowSpan + 1 };
      }
      return cell;
    }),
  );
  return { ...data, rows: data.rows + 1, rowHeights: nextRowHeights, cells: finalCells, ...remapPositionsForAddRow(data, insertAt) };
}

export function addCol(data: TableData, afterColIndex: number): TableData {
  if (data.cols >= TABLE_MAX_DIMENSION) return data;
  const insertAt = Math.max(0, Math.min(data.cols, afterColIndex + 1));
  const nextCells = data.cells.map((row) => [
    ...row.slice(0, insertAt),
    makeCell(),
    ...row.slice(insertAt),
  ]);
  const newFrac = 1 / (data.cols + 1);
  const scaleFactor = 1 - newFrac;
  const nextColWidths = normalizeFractions([
    ...data.colWidths.slice(0, insertAt).map((w) => w * scaleFactor),
    newFrac,
    ...data.colWidths.slice(insertAt).map((w) => w * scaleFactor),
  ]);
  const finalCells = nextCells.map((row) =>
    row.map((cell, ci) => {
      if (!cell) return cell;
      if (ci < insertAt && ci + cell.colSpan > insertAt) {
        return { ...cell, colSpan: cell.colSpan + 1 };
      }
      return cell;
    }),
  );
  return { ...data, cols: data.cols + 1, colWidths: nextColWidths, cells: finalCells, ...remapPositionsForAddCol(data, insertAt) };
}

// ── Resize col / row (drag divider) ─────────────────────────────────────

const MIN_FRAC = 0.04;

export function resizeColumn(
  data: TableData,
  colIndex: number,
  deltaFraction: number,
): TableData {
  if (colIndex + 1 >= data.colWidths.length) return data;
  const widths = [...data.colWidths];
  const total = (widths[colIndex] ?? 0) + (widths[colIndex + 1] ?? 0);
  const newA = Math.min(total - MIN_FRAC, Math.max(MIN_FRAC, (widths[colIndex] ?? 0) + deltaFraction));
  widths[colIndex] = newA;
  widths[colIndex + 1] = total - newA;
  return { ...data, colWidths: widths };
}

export function resizeRow(
  data: TableData,
  rowIndex: number,
  deltaFraction: number,
): TableData {
  if (rowIndex + 1 >= data.rowHeights.length) return data;
  const heights = [...data.rowHeights];
  const total = (heights[rowIndex] ?? 0) + (heights[rowIndex + 1] ?? 0);
  const newA = Math.min(total - MIN_FRAC, Math.max(MIN_FRAC, (heights[rowIndex] ?? 0) + deltaFraction));
  heights[rowIndex] = newA;
  heights[rowIndex + 1] = total - newA;
  return { ...data, rowHeights: heights };
}

// ── Legacy compat (Inspector resize UI) ─────────────────────────────────

export function resizeTableData(data: TableData, rows: number, cols: number): TableData {
  return createTableData(rows, cols);
}

export function scaleTableDividerPositions(
  data: TableData,
  colScale: number,
  rowScale: number,
): TableData {
  const nextColPositions = data.colDividerPositions
    ? Object.fromEntries(
        Object.entries(data.colDividerPositions).map(([key, value]) => [
          key,
          value * colScale,
        ]),
      )
    : undefined;
  const nextRowPositions = data.rowDividerPositions
    ? Object.fromEntries(
        Object.entries(data.rowDividerPositions).map(([key, value]) => [
          key,
          value * rowScale,
        ]),
      )
    : undefined;

  return {
    ...data,
    colDividerPositions: nextColPositions,
    rowDividerPositions: nextRowPositions,
  };
}

export function preserveOuterAddColLayout(
  previousData: TableData,
  expandedData: TableData,
  oldWidth: number,
  newWidth: number,
): TableData {
  if (oldWidth <= 0 || newWidth <= 0 || newWidth <= oldWidth) {
    return expandedData;
  }
  const oldAreaFraction = oldWidth / newWidth;
  const nextColPositions: Record<string, number> = {
    ...(expandedData.colDividerPositions ?? {}),
  };
  const nextRowPositions: Record<string, number> = {
    ...(expandedData.rowDividerPositions ?? {}),
  };

  for (let boundary = 0; boundary < previousData.cols - 1; boundary += 1) {
    for (let row = 0; row < previousData.rows; row += 1) {
      nextColPositions[`c${boundary}r${row}`] =
        getEffectiveColEdge(previousData, boundary + 1, row) * oldAreaFraction;
    }
  }

  for (let boundary = 0; boundary < previousData.rows - 1; boundary += 1) {
    const inheritedY = getEffectiveRowEdge(
      previousData,
      boundary + 1,
      Math.max(0, previousData.cols - 1),
    );
    for (let col = 0; col < expandedData.cols; col += 1) {
      const sourceCol = Math.min(col, Math.max(0, previousData.cols - 1));
      nextRowPositions[`r${boundary}c${col}`] =
        col < previousData.cols
          ? getEffectiveRowEdge(previousData, boundary + 1, sourceCol)
          : inheritedY;
    }
  }

  return {
    ...expandedData,
    colDividerPositions: nextColPositions,
    rowDividerPositions: nextRowPositions,
    colWidths: [
      ...previousData.colWidths.map((width) => width * oldAreaFraction),
      1 - oldAreaFraction,
    ],
  };
}

export function preserveOuterAddRowLayout(
  previousData: TableData,
  expandedData: TableData,
  oldHeight: number,
  newHeight: number,
): TableData {
  if (oldHeight <= 0 || newHeight <= 0 || newHeight <= oldHeight) {
    return expandedData;
  }
  const oldAreaFraction = oldHeight / newHeight;
  const nextColPositions: Record<string, number> = {
    ...(expandedData.colDividerPositions ?? {}),
  };
  const nextRowPositions: Record<string, number> = {
    ...(expandedData.rowDividerPositions ?? {}),
  };

  for (let boundary = 0; boundary < previousData.cols - 1; boundary += 1) {
    const inheritedX = getEffectiveColEdge(
      previousData,
      boundary + 1,
      Math.max(0, previousData.rows - 1),
    );
    for (let row = 0; row < expandedData.rows; row += 1) {
      const sourceRow = Math.min(row, Math.max(0, previousData.rows - 1));
      nextColPositions[`c${boundary}r${row}`] =
        row < previousData.rows
          ? getEffectiveColEdge(previousData, boundary + 1, sourceRow)
          : inheritedX;
    }
  }

  for (let boundary = 0; boundary < previousData.rows - 1; boundary += 1) {
    for (let col = 0; col < previousData.cols; col += 1) {
      nextRowPositions[`r${boundary}c${col}`] =
        getEffectiveRowEdge(previousData, boundary + 1, col) * oldAreaFraction;
    }
  }

  return {
    ...expandedData,
    colDividerPositions: nextColPositions,
    rowDividerPositions: nextRowPositions,
    rowHeights: [
      ...previousData.rowHeights.map((height) => height * oldAreaFraction),
      1 - oldAreaFraction,
    ],
  };
}

// ── Cumulative position helpers ─────────────────────────────────────────

export function getCumulativeColPositions(colWidths: number[]): number[] {
  const result: number[] = [0];
  for (const w of colWidths) result.push((result[result.length - 1] ?? 0) + w);
  return result;
}

export function getCumulativeRowPositions(rowHeights: number[]): number[] {
  const result: number[] = [0];
  for (const h of rowHeights) result.push((result[result.length - 1] ?? 0) + h);
  return result;
}

// ── Effective edge positions (supports per-segment overrides) ───────────

/**
 * Get the effective x-position of column edge `edgeIndex` at a given row.
 * edgeIndex 0 = left table edge (always 0), edgeIndex cols = right table edge (always 1).
 * Internal edges 1..cols-1 correspond to boundary (edgeIndex-1).
 */
export function getEffectiveColEdge(
  data: TableData,
  edgeIndex: number,
  row: number,
): number {
  if (edgeIndex <= 0) return 0;
  if (edgeIndex >= data.cols) return 1;
  const bIdx = edgeIndex - 1; // boundary index
  const key = `c${bIdx}r${row}`;
  const override = data.colDividerPositions?.[key];
  if (override !== undefined) return override;
  const cum = getCumulativeColPositions(data.colWidths);
  return cum[edgeIndex] ?? 0;
}

/**
 * Get the effective y-position of row edge `edgeIndex` at a given column.
 */
export function getEffectiveRowEdge(
  data: TableData,
  edgeIndex: number,
  col: number,
): number {
  if (edgeIndex <= 0) return 0;
  if (edgeIndex >= data.rows) return 1;
  const bIdx = edgeIndex - 1;
  const key = `r${bIdx}c${col}`;
  const override = data.rowDividerPositions?.[key];
  if (override !== undefined) return override;
  const cum = getCumulativeRowPositions(data.rowHeights);
  return cum[edgeIndex] ?? 0;
}

// ── Cell bounds ─────────────────────────────────────────────────────────

export function getCellBounds(
  data: TableData,
  row: number,
  col: number,
  colSpan: number,
  rowSpan: number,
): { left: number; top: number; width: number; height: number } {
  const left = getEffectiveColEdge(data, col, row);
  const right = getEffectiveColEdge(data, col + colSpan, row);
  const top = getEffectiveRowEdge(data, row, col);
  const bottom = getEffectiveRowEdge(data, row + rowSpan, col);
  return { left, top, width: right - left, height: bottom - top };
}

// ── Segment group computation ───────────────────────────────────────────

const POS_EPSILON = 0.0001;

export function computeColSegmentGroups(data: TableData): SegmentGroup[] {
  const groups: SegmentGroup[] = [];
  const defaultCum = getCumulativeColPositions(data.colWidths);

  for (let b = 0; b < data.cols - 1; b++) {
    // Find visible segments at this column boundary
    const segs: { row: number; pos: number }[] = [];
    for (let r = 0; r < data.rows; r++) {
      const rootLeft = getRootCellAt(data, r, b);
      const rootRight = getRootCellAt(data, r, b + 1);
      if (rootLeft && rootRight && rootLeft.cell.id === rootRight.cell.id) continue;
      const key = `c${b}r${r}`;
      const pos = data.colDividerPositions?.[key] ?? defaultCum[b + 1] ?? 0;
      segs.push({ row: r, pos });
    }
    if (segs.length === 0) continue;

    let group: number[] = [segs[0]!.row];
    let groupPos = segs[0]!.pos;

    for (let i = 1; i < segs.length; i++) {
      const { row: r, pos } = segs[i]!;
      const prevR = segs[i - 1]!.row;
      const isAdjacent = r === prevR + 1;

      if (isAdjacent) {
        // Structurally connected: a cell on either side spans across the row boundary
        const leftAbove = getRootCellAt(data, prevR, b);
        const leftBelow = getRootCellAt(data, r, b);
        const rightAbove = getRootCellAt(data, prevR, b + 1);
        const rightBelow = getRootCellAt(data, r, b + 1);
        const structurallyConnected =
          (leftAbove && leftBelow && leftAbove.cell.id === leftBelow.cell.id) ||
          (rightAbove && rightBelow && rightAbove.cell.id === rightBelow.cell.id);
        const hasExplicitBreak = data.colDividerBreaks?.[`c${b}r${prevR}`] === true;

        if (
          structurallyConnected ||
          (!hasExplicitBreak && Math.abs(pos - groupPos) < POS_EPSILON)
        ) {
          group.push(r);
          continue;
        }
      }

      // Flush current group
      groups.push({ type: 'col', boundaryIndex: b, segments: [...group], position: groupPos, key: `c${b}g${group[0]}` });
      group = [r];
      groupPos = pos;
    }

    groups.push({ type: 'col', boundaryIndex: b, segments: [...group], position: groupPos, key: `c${b}g${group[0]}` });
  }

  return groups;
}

export function computeRowSegmentGroups(data: TableData): SegmentGroup[] {
  const groups: SegmentGroup[] = [];
  const defaultCum = getCumulativeRowPositions(data.rowHeights);

  for (let b = 0; b < data.rows - 1; b++) {
    const segs: { col: number; pos: number }[] = [];
    for (let c = 0; c < data.cols; c++) {
      const rootTop = getRootCellAt(data, b, c);
      const rootBottom = getRootCellAt(data, b + 1, c);
      if (rootTop && rootBottom && rootTop.cell.id === rootBottom.cell.id) continue;
      const key = `r${b}c${c}`;
      const pos = data.rowDividerPositions?.[key] ?? defaultCum[b + 1] ?? 0;
      segs.push({ col: c, pos });
    }
    if (segs.length === 0) continue;

    let group: number[] = [segs[0]!.col];
    let groupPos = segs[0]!.pos;

    for (let i = 1; i < segs.length; i++) {
      const { col: c, pos } = segs[i]!;
      const prevC = segs[i - 1]!.col;
      const isAdjacent = c === prevC + 1;

      if (isAdjacent) {
        const topLeft = getRootCellAt(data, b, prevC);
        const topRight = getRootCellAt(data, b, c);
        const bottomLeft = getRootCellAt(data, b + 1, prevC);
        const bottomRight = getRootCellAt(data, b + 1, c);
        const structurallyConnected =
          (topLeft && topRight && topLeft.cell.id === topRight.cell.id) ||
          (bottomLeft && bottomRight && bottomLeft.cell.id === bottomRight.cell.id);
        const hasExplicitBreak = data.rowDividerBreaks?.[`r${b}c${prevC}`] === true;

        if (
          structurallyConnected ||
          (!hasExplicitBreak && Math.abs(pos - groupPos) < POS_EPSILON)
        ) {
          group.push(c);
          continue;
        }
      }

      groups.push({ type: 'row', boundaryIndex: b, segments: [...group], position: groupPos, key: `r${b}g${group[0]}` });
      group = [c];
      groupPos = pos;
    }

    groups.push({ type: 'row', boundaryIndex: b, segments: [...group], position: groupPos, key: `r${b}g${group[0]}` });
  }

  return groups;
}

// ── Per-group resize ────────────────────────────────────────────────────

export function resizeColGroup(
  data: TableData,
  group: SegmentGroup,
  newPosition: number,
  minFraction = MIN_FRAC,
): TableData {
  const b = group.boundaryIndex;
  // Clamp: boundary b sits between cols b and b+1.
  // Left neighbor edge = edge index b, right neighbor edge = edge index b+2.
  let minPos = 0 + minFraction;
  let maxPos = 1 - minFraction;
  for (const r of group.segments) {
    const leftPos = getEffectiveColEdge(data, b, r);
    const rightPos = getEffectiveColEdge(data, b + 2, r);
    minPos = Math.max(minPos, leftPos + minFraction);
    maxPos = Math.min(maxPos, rightPos - minFraction);
  }
  const clamped = Math.max(minPos, Math.min(maxPos, newPosition));

  const nextPositions = { ...(data.colDividerPositions ?? {}) };
  for (const r of group.segments) {
    nextPositions[`c${b}r${r}`] = clamped;
  }
  return { ...data, colDividerPositions: nextPositions };
}

export function resizeRowGroup(
  data: TableData,
  group: SegmentGroup,
  newPosition: number,
  minFraction = MIN_FRAC,
): TableData {
  const b = group.boundaryIndex;
  let minPos = 0 + minFraction;
  let maxPos = 1 - minFraction;
  for (const c of group.segments) {
    const topPos = getEffectiveRowEdge(data, b, c);
    const bottomPos = getEffectiveRowEdge(data, b + 2, c);
    minPos = Math.max(minPos, topPos + minFraction);
    maxPos = Math.min(maxPos, bottomPos - minFraction);
  }
  const clamped = Math.max(minPos, Math.min(maxPos, newPosition));

  const nextPositions = { ...(data.rowDividerPositions ?? {}) };
  for (const c of group.segments) {
    nextPositions[`r${b}c${c}`] = clamped;
  }
  return { ...data, rowDividerPositions: nextPositions };
}
