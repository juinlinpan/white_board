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
  computeColSegmentGroups,
  computeRowSegmentGroups,
  deleteCol,
  deleteRow,
  getCellBounds,
  getEffectiveColEdge,
  getEffectiveRowEdge,
  mergeCells,
  parseTableData,
  preserveOuterAddColLayout,
  preserveOuterAddRowLayout,
  resizeColGroup,
  resizeRowGroup,
  TABLE_CELL_MIN_HEIGHT,
  TABLE_CELL_MIN_WIDTH,
  type SegmentGroup,
  serializeTableData,
  splitCellHorizontal,
  splitCellVertical,
  type TableCellData,
  type TableData,
  updateTableCell,
  getRootCellAt,
} from '../tableData';

// ── Types ─────────────────────────────────────────────────────────────────

type GroupDividerDrag = {
  group: SegmentGroup;
  startPos: number;       // mouse position at drag start (clientX or clientY)
  startPosition: number;  // group's divider position fraction at drag start
  containerSize: number;  // container width or height in pixels
};

type Props = {
  item: BoardItem;
  isSelected: boolean;
  isEditing: boolean;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
  onCellInteractionStart?: () => void;
  onSelectedCellChange?: (cellId: string | null) => void;
  dropTargetCellId?: string | null;
};

// ── Component ─────────────────────────────────────────────────────────────

export function Table({
  item,
  isSelected,
  isEditing,
  onUpdate,
  onEditEnd,
  onCellInteractionStart,
  onSelectedCellChange,
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
  // Group divider resize dragging
  const groupDragRef = useRef<GroupDividerDrag | null>(null);
  // Track whether we have an active drag to suppress click
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  // Hovered segment group key
  const [hoveredGroupKey, setHoveredGroupKey] = useState<string | null>(null);

  // Stop editing when the board item leaves editing mode
  useEffect(() => {
    if (!isEditing) {
      setEditingCellId(null);
      setSelectedCells([]);
      dragSelectStartRef.current = null;
    }
  }, [isEditing]);

  useEffect(() => {
    if (!isSelected) {
      onSelectedCellChange?.(null);
      return;
    }
    onSelectedCellChange?.(selectedCells.length === 1 ? selectedCells[0] ?? null : null);
  }, [isSelected, onSelectedCellChange, selectedCells]);

  useEffect(() => {
    function handleWindowMouseUp() {
      dragSelectStartRef.current = null;
    }

    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => window.removeEventListener('mouseup', handleWindowMouseUp);
  }, []);

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
    const bounds = getCellBounds(tableData, minRow, minCol, maxCol - minCol + 1, maxRow - minRow + 1);
    return {
      left: bounds.left * 100,
      top: bounds.top * 100,
      right: (bounds.left + bounds.width) * 100,
      bottom: (bounds.top + bounds.height) * 100,
    };
  }, [selectedCells, tableData]);

  // ── Whole-row / whole-col selection detection ────────────────────────────

  const selectedWholeRow = useMemo<number | null>(() => {
    if (selectedCells.length === 0) return null;
    for (let r = 0; r < tableData.rows; r++) {
      const rowIds = (tableData.cells[r] ?? [])
        .filter((cell): cell is TableCellData => cell !== null)
        .map((cell) => cell.id);
      if (
        rowIds.length > 0 &&
        rowIds.length === selectedCells.length &&
        rowIds.every((id) => selectedCells.includes(id))
      ) {
        return r;
      }
    }
    return null;
  }, [selectedCells, tableData]);

  const selectedWholeCol = useMemo<number | null>(() => {
    if (selectedCells.length === 0) return null;
    for (let c = 0; c < tableData.cols; c++) {
      const colIds = tableData.cells
        .map((row) => row[c])
        .filter((cell): cell is TableCellData => cell !== null)
        .map((cell) => cell.id);
      if (
        colIds.length > 0 &&
        colIds.length === selectedCells.length &&
        colIds.every((id) => selectedCells.includes(id))
      ) {
        return c;
      }
    }
    return null;
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

  // ── Delete row / col ─────────────────────────────────────────────────────

  function handleDeleteRow(rowIndex: number) {
    const removedFraction = tableData.rowHeights[rowIndex] ?? 0;
    const nextData = deleteRow(tableData, rowIndex);
    const nextHeight =
      nextData.rows === tableData.rows
        ? item.height
        : Math.max(1, item.height * (1 - removedFraction));
    onUpdate({
      ...item,
      height: nextHeight,
      data_json: serializeTableData(nextData),
    });
    setSelectedCells([]);
  }

  function handleDeleteCol(colIndex: number) {
    const removedFraction = tableData.colWidths[colIndex] ?? 0;
    const nextData = deleteCol(tableData, colIndex);
    const nextWidth =
      nextData.cols === tableData.cols
        ? item.width
        : Math.max(1, item.width * (1 - removedFraction));
    onUpdate({
      ...item,
      width: nextWidth,
      data_json: serializeTableData(nextData),
    });
    setSelectedCells([]);
  }

  // ── Keyboard handler ──────────────────────────────────────────────────────

  function handleContainerKeyDown(e: React.KeyboardEvent) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    if (editingCellId !== null) return; // let textarea handle it
    if (selectedWholeRow !== null) {
      e.preventDefault();
      e.stopPropagation();
      handleDeleteRow(selectedWholeRow);
      return;
    }
    if (selectedWholeCol !== null) {
      e.preventDefault();
      e.stopPropagation();
      handleDeleteCol(selectedWholeCol);
    }
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

  function handleCellSelectionStart(
    cellId: string,
    row: number,
    col: number,
    extendSelection: boolean,
  ) {
    if (!isSelected || !isEditing) {
      onCellInteractionStart?.();
    }

    dragSelectStartRef.current = [row, col];

    if (extendSelection && selectedCells.length > 0) {
      const firstId = selectedCells[0];
      const startPos = firstId ? getCellPosition(tableData, firstId) : null;
      if (startPos) {
        setSelectedCells(getRangeSelection(tableData, startPos, [row, col]));
        return;
      }
    }

    setSelectedCells([cellId]);
  }

  // ── Group divider drag ─────────────────────────────────────────────────

  const handleGroupDividerMouseDown = useCallback(
    (e: React.MouseEvent, group: SegmentGroup) => {
      if (!showsStructureControls) return;
      e.preventDefault();
      e.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const containerSize = group.type === 'col' ? rect.width : rect.height;
      groupDragRef.current = {
        group,
        startPos: group.type === 'col' ? e.clientX : e.clientY,
        startPosition: group.position,
        containerSize,
      };
      setIsDraggingDivider(true);
    },
    [showsStructureControls],
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = groupDragRef.current;
      if (!drag) return;
      const curPos = drag.group.type === 'col' ? e.clientX : e.clientY;
      const delta = (curPos - drag.startPos) / drag.containerSize;
      const newPosition = drag.startPosition + delta;
      const minFraction =
        drag.group.type === 'col'
          ? Math.min(0.5, TABLE_CELL_MIN_WIDTH / Math.max(item.width, 1))
          : Math.min(0.5, TABLE_CELL_MIN_HEIGHT / Math.max(item.height, 1));
      const nextData =
        drag.group.type === 'col'
          ? resizeColGroup(tableData, drag.group, newPosition, minFraction)
          : resizeRowGroup(tableData, drag.group, newPosition, minFraction);
      onUpdate({ ...item, data_json: serializeTableData(nextData) });
    }

    function onMouseUp() {
      if (groupDragRef.current) {
        groupDragRef.current = null;
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

  // ── Segment groups (memoised) ──────────────────────────────────────────

  const colGroups = useMemo(() => computeColSegmentGroups(tableData), [tableData]);
  const rowGroups = useMemo(() => computeRowSegmentGroups(tableData), [tableData]);

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
      onKeyDown={isEditing ? handleContainerKeyDown : undefined}
    >
      {/* Cells (absolute positioning for per-row column independence) */}
      <div
        className="table-v2-grid"
        onMouseMove={(e) => {
          if (!dragSelectStartRef.current || !(e.buttons & 1) || isDraggingDivider) return;
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
            const bounds = getCellBounds(tableData, ri, ci, cell.colSpan, cell.rowSpan);

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
                  position: 'absolute',
                  left: `${bounds.left * 100}%`,
                  top: `${bounds.top * 100}%`,
                  width: `${bounds.width * 100}%`,
                  height: `${bounds.height * 100}%`,
                  backgroundColor: cell.backgroundColor ?? resolvedStyle.backgroundColor,
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  if (isDraggingDivider) return;
                  handleCellSelectionStart(cell.id, ri, ci, e.shiftKey);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (!isEditing) {
                    onCellInteractionStart?.();
                  }
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

                {/* Per-cell split/action buttons */}
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

      {/* Column divider groups */}
      {showsStructureControls &&
        colGroups.map((group) => {
          const pct = group.position * 100;
          const isGroupHovered = hoveredGroupKey === group.key;
          // Compute vertical extent using effective row positions (follows moved row dividers)
          const firstRow = group.segments[0]!;
          const lastRow = group.segments[group.segments.length - 1]!;
          const topPct = getEffectiveRowEdge(tableData, firstRow, group.boundaryIndex) * 100;
          const bottomPct = getEffectiveRowEdge(tableData, lastRow + 1, group.boundaryIndex) * 100;
          const heightPct = bottomPct - topPct;

          return (
            <div
              key={group.key}
              className={`table-v2-col-divider ${isGroupHovered ? 'is-group-hovered' : ''}`}
              style={{ left: `${pct}%`, top: `${topPct}%`, height: `${heightPct}%`, bottom: 'auto' }}
              onMouseDown={(e) => handleGroupDividerMouseDown(e, group)}
              onMouseEnter={() => setHoveredGroupKey(group.key)}
              onMouseLeave={() => setHoveredGroupKey((prev) => prev === group.key ? null : prev)}
            />
          );
        })}

      {/* Row divider groups */}
      {showsStructureControls &&
        rowGroups.map((group) => {
          const pct = group.position * 100;
          const isGroupHovered = hoveredGroupKey === group.key;
          const firstCol = group.segments[0]!;
          const lastCol = group.segments[group.segments.length - 1]!;
          const leftPct = getEffectiveColEdge(tableData, firstCol, group.boundaryIndex) * 100;
          const rightPct = getEffectiveColEdge(tableData, lastCol + 1, group.boundaryIndex) * 100;
          const widthPct = rightPct - leftPct;

          return (
            <div
              key={group.key}
              className={`table-v2-row-divider ${isGroupHovered ? 'is-group-hovered' : ''}`}
              style={{ top: `${pct}%`, left: `${leftPct}%`, width: `${widthPct}%`, right: 'auto' }}
              onMouseDown={(e) => handleGroupDividerMouseDown(e, group)}
              onMouseEnter={() => setHoveredGroupKey(group.key)}
              onMouseLeave={() => setHoveredGroupKey((prev) => prev === group.key ? null : prev)}
            />
          );
        })}

      {/* Add row at end — expands table height so existing rows keep pixel size */}
      {showsStructureControls && (
        <div className="table-v2-add-row-end">
          <button
            type="button"
            className="table-v2-add-edge-btn"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const nextHeight = Math.round(
                item.height * (tableData.rows + 1) / tableData.rows,
              );
              const nextData = preserveOuterAddRowLayout(
                tableData,
                addRow(tableData, tableData.rows - 1),
                item.height,
                nextHeight,
              );
              onUpdate({
                ...item,
                data_json: serializeTableData(nextData),
                height: nextHeight,
              });
            }}
          >
            + 列
          </button>
        </div>
      )}

      {/* Add col at end — expands table width so existing cols keep pixel size */}
      {showsStructureControls && (
        <div className="table-v2-add-col-end">
          <button
            type="button"
            className="table-v2-add-edge-btn table-v2-add-edge-btn--col"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const nextWidth = Math.round(
                item.width * (tableData.cols + 1) / tableData.cols,
              );
              const nextData = preserveOuterAddColLayout(
                tableData,
                addCol(tableData, tableData.cols - 1),
                item.width,
                nextWidth,
              );
              onUpdate({
                ...item,
                data_json: serializeTableData(nextData),
                width: nextWidth,
              });
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
