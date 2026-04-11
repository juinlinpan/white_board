const DEFAULT_TABLE_ROWS = 3;
const DEFAULT_TABLE_COLS = 3;

export const TABLE_MIN_DIMENSION = 1;
export const TABLE_MAX_DIMENSION = 12;

export type TableData = {
  rows: number;
  cols: number;
  cells: string[][];
};

function clampDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(
    TABLE_MAX_DIMENSION,
    Math.max(TABLE_MIN_DIMENSION, Math.round(value)),
  );
}

function normalizeCellValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function createTableData(
  rows = DEFAULT_TABLE_ROWS,
  cols = DEFAULT_TABLE_COLS,
): TableData {
  const nextRows = clampDimension(rows, DEFAULT_TABLE_ROWS);
  const nextCols = clampDimension(cols, DEFAULT_TABLE_COLS);

  return {
    rows: nextRows,
    cols: nextCols,
    cells: Array.from({ length: nextRows }, () =>
      Array.from({ length: nextCols }, () => ''),
    ),
  };
}

export function resizeTableData(
  data: TableData,
  rows: number,
  cols: number,
): TableData {
  const nextRows = clampDimension(rows, data.rows);
  const nextCols = clampDimension(cols, data.cols);

  return {
    rows: nextRows,
    cols: nextCols,
    cells: Array.from({ length: nextRows }, (_, rowIndex) =>
      Array.from(
        { length: nextCols },
        (_, colIndex) => data.cells[rowIndex]?.[colIndex] ?? '',
      ),
    ),
  };
}

export function parseTableData(dataJson: string | null): TableData {
  if (dataJson === null || dataJson.trim().length === 0) {
    return createTableData();
  }

  try {
    const parsed = JSON.parse(dataJson) as Record<string, unknown>;
    const baseData = createTableData(
      typeof parsed.rows === 'number' ? parsed.rows : DEFAULT_TABLE_ROWS,
      typeof parsed.cols === 'number' ? parsed.cols : DEFAULT_TABLE_COLS,
    );
    const rawCells: unknown[] = Array.isArray(parsed.cells) ? parsed.cells : [];

    return {
      ...baseData,
      cells: Array.from({ length: baseData.rows }, (_, rowIndex) => {
        const rawRow = rawCells[rowIndex];
        if (!Array.isArray(rawRow)) {
          return Array.from({ length: baseData.cols }, () => '');
        }

        return Array.from(
          { length: baseData.cols },
          (_, colIndex) => normalizeCellValue(rawRow[colIndex]),
        );
      }),
    };
  } catch {
    return createTableData();
  }
}

export function serializeTableData(data: TableData): string {
  return JSON.stringify(resizeTableData(data, data.rows, data.cols));
}

export function setTableCell(
  data: TableData,
  rowIndex: number,
  colIndex: number,
  value: string,
): TableData {
  return {
    ...data,
    cells: data.cells.map((row, currentRowIndex) =>
      currentRowIndex === rowIndex
        ? row.map((cell, currentColIndex) =>
            currentColIndex === colIndex ? value : cell,
          )
        : row,
    ),
  };
}

export function countFilledTableCells(data: TableData): number {
  return data.cells.flat().filter((cell) => cell.trim().length > 0).length;
}
