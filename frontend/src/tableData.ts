const DEFAULT_TABLE_ROWS = 3;
const DEFAULT_TABLE_COLS = 3;

export const TABLE_MIN_DIMENSION = 1;
export const TABLE_MAX_DIMENSION = 12;

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
  return { rows, cols, colWidths, rowHeights, cells };
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
  return { ...data, cells: nextCells };
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

export function splitCellHorizontal(data: TableData, cellId: string): TableData {
  const found = findCellById(data, cellId);
  if (!found || found.cell.rowSpan <= 1) return data;
  const { cell: target, row, col } = found;
  const half = Math.floor(target.rowSpan / 2);
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
  return { ...data, cells: nextCells };
}

export function splitCellVertical(data: TableData, cellId: string): TableData {
  const found = findCellById(data, cellId);
  if (!found || found.cell.colSpan <= 1) return data;
  const { cell: target, row, col } = found;
  const half = Math.floor(target.colSpan / 2);
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
  return { ...data, cells: nextCells };
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
  return { ...data, rows: data.rows + 1, rowHeights: nextRowHeights, cells: finalCells };
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
  return { ...data, cols: data.cols + 1, colWidths: nextColWidths, cells: finalCells };
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
