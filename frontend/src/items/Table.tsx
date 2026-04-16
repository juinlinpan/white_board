import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type BoardItem } from '../api';
import { resolveBoardItemStyle } from '../itemStyles';
import {
  addCol,
  addRow,
  type CellPosition,
  mergeCells,
  parseTableData,
  resizeColumn,
  resizeRow,
  serializeTableData,
  splitCellHorizontal,
  splitCellVertical,
  type TableCellData,
  type TableData,
  updateTableCell,
  getRootCellAt,
} from '../tableData';

// ── Types ─────────────────────────────────────────────────────────────────

type DividerDrag = {
  type: 'col' | 'row';
  index: number;
  startPos: number;
  startFractions: number[];
  containerSize: number;
};

type Props = {
  item: BoardItem;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
  dropTargetCellId?: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────

function getCumulativePositions(fractions: number[]): number[] {
  const result: number[] = [0];
  for (const f of fractions) {
    result.push((result[result.length - 1] ?? 0) + f);
  }
  return result;
}

// ── Component ─────────────────────────────────────────────────────────────

export function Table({
  item,
  isSelected,
  isEditing,
  onUpdate,
  onEditEnd,
  dropTargetCellId,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tableData = useMemo(() => parseTableData(item.data_json), [item.data_json]);
  const resolvedStyle = resolveBoardItemStyle(item);
  const showsStructureControls = isEditing || isSelected;

  // Selected cell IDs (for merge operation)
  const [selectedCells, setSelectedCells] = useState<string[]>([]);
  // Cell currently being text-edited
  const [editingCellId, setEditingCellId] = useState<string | null>(null);
  // Drag-select state
  const dragSelectStartRef = useRef<CellPosition | null>(null);
  // Divider resize dragging
  const dividerDragRef = useRef<DividerDrag | null>(null);
  // Track whether we have an active drag to suppress click
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);

  // Stop editing when the board item leaves editing mode
  useEffect(() => {
    if (!isEditing) {
      setEditingCellId(null);
      setSelectedCells([]);
      dragSelectStartRef.current = null;
    }
  }, [isEditing]);

  function handleUpdate(nextData: TableData) {
    onUpdate({ ...item, data_json: serializeTableData(nextData) });
  }

  // ── Cell selection ──────────────────────────────────────────────────────

  function getRangeSelection(
    data: TableData,
    startPos: CellPosition,
    endPos: CellPosition,
  ): string[] {
    const minRow = Math.min(startPos[0], endPos[0]);
    const maxRow = Math.max(startPos[0], endPos[0]);
    const minCol = Math.min(startPos[1], endPos[1]);
    const maxCol = Math.max(startPos[1], endPos[1]);
    const ids: string[] = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const cell = data.cells[r]?.[c];
        if (cell) ids.push(cell.id);
        else {
          // include root cell of span
          const root = findRoot(data, r, c);
          if (root && !ids.includes(root.id)) ids.push(root.id);
        }
      }
    }
    return [...new Set(ids)];
  }

  function findRoot(data: TableData, row: number, col: number): TableCellData | null {
    for (let r = 0; r <= row; r++) {
      for (let c = 0; c <= col; c++) {
        const candidate = data.cells[r]?.[c];
        if (!candidate) continue;
        if (r + candidate.rowSpan > row && c + candidate.colSpan > col) {
          return candidate;
        }
      }
    }
    return null;
  }

  function getCellPosition(data: TableData, cellId: string): CellPosition | null {
    for (let r = 0; r < data.rows; r++) {
      for (let c = 0; c < data.cols; c++) {
        if (data.cells[r]?.[c]?.id === cellId) return [r, c];
      }
    }
    return null;
  }

  // ── Selection bounds (for merge button placement) ───────────────────────

  const selectionBounds = useMemo(() => {
    if (selectedCells.length < 2) return null;
    let minRow = Infinity, maxRow = -Infinity, minCol = Infinity, maxCol = -Infinity;
    for (const cellId of selectedCells) {
      for (let r = 0; r < tableData.rows; r++) {
        for (let c = 0; c < tableData.cols; c++) {
          const cell = tableData.cells[r]?.[c];
          if (!cell || cell.id !== cellId) continue;
          minRow = Math.min(minRow, r);
          maxRow = Math.max(maxRow, r + cell.rowSpan - 1);
          minCol = Math.min(minCol, c);
          maxCol = Math.max(maxCol, c + cell.colSpan - 1);
        }
      }
    }
    if (!isFinite(minRow)) return null;
    const colCum = getCumulativePositions(tableData.colWidths);
    const rowCum = getCumulativePositions(tableData.rowHeights);
    return {
      left: (colCum[minCol] ?? 0) * 100,
      top: (rowCum[minRow] ?? 0) * 100,
      right: (colCum[maxCol + 1] ?? 1) * 100,
      bottom: (rowCum[maxRow + 1] ?? 1) * 100,
    };
  }, [selectedCells, tableData]);

  // ── Merge ───────────────────────────────────────────────────────────────

  function handleMerge() {
    const positions: CellPosition[] = selectedCells
      .map((id) => getCellPosition(tableData, id))
      .filter((p): p is CellPosition => p !== null);
    const nextData = mergeCells(tableData, positions);
    handleUpdate(nextData);
    setSelectedCells([]);
  }

  // ── Split ───────────────────────────────────────────────────────────────

  function handleSplitH(cellId: string) {
    handleUpdate(splitCellHorizontal(tableData, cellId));
  }

  function handleSplitV(cellId: string) {
    handleUpdate(splitCellVertical(tableData, cellId));
  }

  // ── Cell text edit ───────────────────────────────────────────────────────

  function handleCellContentChange(cellId: string, value: string) {
    handleUpdate(updateTableCell(tableData, cellId, { content: value }));
  }

  // ── Divider resize ───────────────────────────────────────────────────────

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent, type: 'col' | 'row', index: number) => {
      if (!showsStructureControls) return;
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const containerSize = type === 'col' ? rect.width : rect.height;
      dividerDragRef.current = {
        type,
        index,
        startPos: type === 'col' ? e.clientX : e.clientY,
        startFractions:
          type === 'col' ? [...tableData.colWidths] : [...tableData.rowHeights],
        containerSize,
      };
      setIsDraggingDivider(true);
    },
    [showsStructureControls, tableData.colWidths, tableData.rowHeights],
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dividerDragRef.current;
      if (!drag) return;
      const curPos = drag.type === 'col' ? e.clientX : e.clientY;
      const delta = (curPos - drag.startPos) / drag.containerSize;
      const nextData =
        drag.type === 'col'
          ? resizeColumn(
              { ...tableData, colWidths: [...drag.startFractions] },
              drag.index,
              delta,
            )
          : resizeRow(
              { ...tableData, rowHeights: [...drag.startFractions] },
              drag.index,
              delta,
            );
      onUpdate({ ...item, data_json: serializeTableData(nextData) });
    }

    function onMouseUp() {
      if (dividerDragRef.current) {
        dividerDragRef.current = null;
        setTimeout(() => setIsDraggingDivider(false), 0);
      }
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [item, onUpdate, tableData]);

  // ── Add row / col ────────────────────────────────────────────────────────

  function handleAddRow(afterIndex: number) {
    handleUpdate(addRow(tableData, afterIndex));
  }

  function handleAddCol(afterIndex: number) {
    handleUpdate(addCol(tableData, afterIndex));
  }

  // ── onEditEnd propagation ────────────────────────────────────────────────

  function handleBlurContainer(e: React.FocusEvent) {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    setEditingCellId(null);
    setSelectedCells([]);
    onEditEnd();
  }

  // ── Cumulative positions for divider placement ───────────────────────────

  const colCum = getCumulativePositions(tableData.colWidths);
  const rowCum = getCumulativePositions(tableData.rowHeights);

  // ── CSS grid template ────────────────────────────────────────────────────

  const gridTemplateColumns = tableData.colWidths.map((w) => `${w}fr`).join(' ');
  const gridTemplateRows = tableData.rowHeights.map((h) => `${h}fr`).join(' ');

  const containerStyle: React.CSSProperties = {
    background: resolvedStyle.backgroundColor,
    color: resolvedStyle.textColor,
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`table-v2 ${isEditing ? 'is-editing' : ''}`}
      style={containerStyle}
      tabIndex={isEditing ? 0 : undefined}
      onBlur={isEditing ? handleBlurContainer : undefined}
    >
      {/* Grid */}
      <div
        className="table-v2-grid"
        style={{ gridTemplateColumns, gridTemplateRows }}
        onMouseDown={(e) => {
          if (!isEditing || isDraggingDivider) return;
          // Start drag-select
          const target = e.target as HTMLElement;
          const cellEl = target.closest('[data-cell-id]') as HTMLElement | null;
          if (!cellEl) return;
          const cellId = cellEl.dataset['cellId'];
          const pos = cellId ? getCellPosition(tableData, cellId) : null;
          if (!pos) return;
          dragSelectStartRef.current = pos;
        }}
        onMouseEnter={(e) => {
          if (!isEditing || !dragSelectStartRef.current || !(e.buttons & 1)) return;
          const target = e.target as HTMLElement;
          const cellEl = target.closest('[data-cell-id]') as HTMLElement | null;
          if (!cellEl) return;
          const cellId = cellEl.dataset['cellId'];
          const pos = cellId ? getCellPosition(tableData, cellId) : null;
          if (!pos || !dragSelectStartRef.current) return;
          const ids = getRangeSelection(tableData, dragSelectStartRef.current, pos);
          setSelectedCells(ids);
        }}
        onMouseUp={() => {
          dragSelectStartRef.current = null;
        }}
      >
        {tableData.cells.flatMap((rowArr, ri) =>
          rowArr.map((cell, ci) => {
            if (cell === null) return null;
            const isSelected = selectedCells.includes(cell.id);
            const isDropTarget = dropTargetCellId === cell.id;
            const isCellEditing = editingCellId === cell.id;
            const isOccupied = cell.childItemIds.length > 0;

            return (
              <div
                key={cell.id}
                data-cell-id={cell.id}
                className={[
                  'table-v2-cell',
                  isSelected ? 'is-selected' : '',
                  isDropTarget ? 'is-drop-target' : '',
                  isOccupied ? 'is-occupied' : '',
                ].join(' ')}
                style={{
                  gridColumn: `${ci + 1} / span ${cell.colSpan}`,
                  gridRow: `${ri + 1} / span ${cell.rowSpan}`,
                }}
                onMouseDown={(e) => {
                  if (!isEditing) return;
                  e.stopPropagation();
                  if (!dragSelectStartRef.current) {
                    dragSelectStartRef.current = [ri, ci];
                    if (e.shiftKey && selectedCells.length > 0) {
                      const firstId = selectedCells[0];
                      const startPos = firstId
                        ? getCellPosition(tableData, firstId)
                        : null;
                      if (startPos) {
                        setSelectedCells(
                          getRangeSelection(tableData, startPos, [ri, ci]),
                        );
                        return;
                      }
                    }
                    setSelectedCells([cell.id]);
                  }
                }}
                onDoubleClick={(e) => {
                  if (!isEditing) return;
                  e.stopPropagation();
                  if (!isOccupied) {
                    setEditingCellId(cell.id);
                  }
                }}
              >
                {/* Cell content */}
                {isCellEditing && !isOccupied ? (
                  <textarea
                    className="table-v2-cell-editor"
                    value={cell.content}
                    autoFocus
                    onMouseDown={(e) => e.stopPropagation()}
                    onChange={(e) => handleCellContentChange(cell.id, e.target.value)}
                    onBlur={() => setEditingCellId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setEditingCellId(null);
                    }}
                  />
                ) : (
                  <div className="table-v2-cell-text">
                    {!isOccupied && cell.content}
                  </div>
                )}

                {/* Per-cell split/action buttons (visible when selected and editing) */}
                {isEditing && isSelected && selectedCells.length === 1 && (
                  <div
                    className="table-v2-cell-actions"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {cell.rowSpan > 1 && (
                      <button
                        type="button"
                        title="水平分割"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSplitH(cell.id);
                          setSelectedCells([]);
                        }}
                      >
                        ⇐⇒
                      </button>
                    )}
                    {cell.colSpan > 1 && (
                      <button
                        type="button"
                        title="垂直分割"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSplitV(cell.id);
                          setSelectedCells([]);
                        }}
                      >
                        ⇑⇓
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }),
        )}
      </div>

      {/* Column dividers */}
      {showsStructureControls &&
        tableData.colWidths.slice(0, -1).map((_, i) => {
          const pct = (colCum[i + 1] ?? 0) * 100;
          return tableData.rowHeights.map((_, r) => {
            const rootLeft = getRootCellAt(tableData, r, i);
            const rootRight = getRootCellAt(tableData, r, i + 1);
            if (rootLeft && rootRight && rootLeft.cell.id === rootRight.cell.id) {
              return null; // Merged cell across this column border segment
            }
            const topPct = (rowCum[r] ?? 0) * 100;
            const heightPct = (tableData.rowHeights[r] ?? 0) * 100;
            return (
              <div
                key={`cdiv-${i}-${r}`}
                className="table-v2-col-divider"
                style={{ left: `${pct}%`, top: `${topPct}%`, height: `${heightPct}%`, bottom: 'auto' }}
                onMouseDown={(e) => handleDividerMouseDown(e, 'col', i)}
              >
                <div className="table-v2-divider-add">
                  <button
                    type="button"
                    className="table-v2-add-btn"
                    title="在此插入欄"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddCol(i);
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          });
        })}

      {/* Row dividers */}
      {showsStructureControls &&
        tableData.rowHeights.slice(0, -1).map((_, i) => {
          const pct = (rowCum[i + 1] ?? 0) * 100;
          return tableData.colWidths.map((_, c) => {
            const rootTop = getRootCellAt(tableData, i, c);
            const rootBottom = getRootCellAt(tableData, i + 1, c);
            if (rootTop && rootBottom && rootTop.cell.id === rootBottom.cell.id) {
              return null; // Merged cell across this row border segment
            }
            const leftPct = (colCum[c] ?? 0) * 100;
            const widthPct = (tableData.colWidths[c] ?? 0) * 100;
            return (
              <div
                key={`rdiv-${i}-${c}`}
                className="table-v2-row-divider"
                style={{ top: `${pct}%`, left: `${leftPct}%`, width: `${widthPct}%`, right: 'auto' }}
                onMouseDown={(e) => handleDividerMouseDown(e, 'row', i)}
              >
                <div className="table-v2-divider-add">
                  <button
                    type="button"
                    className="table-v2-add-btn"
                    title="在此插入列"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddRow(i);
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          });
        })}

      {/* Add row at end */}
      {showsStructureControls && (
        <div className="table-v2-add-row-end">
          <button
            type="button"
            className="table-v2-add-edge-btn"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleAddRow(tableData.rows - 1);
            }}
          >
            + 列
          </button>
        </div>
      )}

      {/* Add col at end */}
      {showsStructureControls && (
        <div className="table-v2-add-col-end">
          <button
            type="button"
            className="table-v2-add-edge-btn table-v2-add-edge-btn--col"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              handleAddCol(tableData.cols - 1);
            }}
          >
            + 欄
          </button>
        </div>
      )}

      {/* Merge button (shown when multiple cells selected) */}
      {isEditing && selectedCells.length >= 2 && selectionBounds && (
        <div
          className="table-v2-merge-overlay"
          style={{
            left: `${selectionBounds.left}%`,
            top: `${selectionBounds.top}%`,
            width: `${selectionBounds.right - selectionBounds.left}%`,
            height: `${selectionBounds.bottom - selectionBounds.top}%`,
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="table-v2-merge-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleMerge();
            }}
          >
            合併
          </button>
        </div>
      )}

      {/* Not-editing label */}
      {!isEditing && (
        <div className="table-v2-label">
          {tableData.rows} × {tableData.cols}
        </div>
      )}
    </div>
  );
}
