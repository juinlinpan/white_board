import { useEffect, useMemo, useRef } from 'react';
import { type BoardItem } from '../api';
import {
  getBoardItemTypographyStyle,
  resolveBoardItemStyle,
} from '../itemStyles';
import {
  parseTableData,
  serializeTableData,
  setTableCell,
} from '../tableData';

type Props = {
  item: BoardItem;
  isEditing: boolean;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
};

export function Table({ item, isEditing, onUpdate, onEditEnd }: Props) {
  const firstCellRef = useRef<HTMLInputElement>(null);
  const tableData = useMemo(() => parseTableData(item.data_json), [item.data_json]);
  const resolvedStyle = resolveBoardItemStyle(item);
  const typographyStyle = getBoardItemTypographyStyle(item);
  const cardStyle = {
    background: resolvedStyle.backgroundColor,
    ...typographyStyle,
  };

  useEffect(() => {
    if (isEditing && firstCellRef.current !== null) {
      firstCellRef.current.focus();
      firstCellRef.current.select();
    }
  }, [isEditing]);

  function handleCellChange(
    rowIndex: number,
    colIndex: number,
    value: string,
  ): void {
    const nextData = setTableCell(tableData, rowIndex, colIndex, value);
    onUpdate({
      ...item,
      data_json: serializeTableData(nextData),
    });
  }

  return (
    <div className={`table-card ${isEditing ? 'is-editing' : ''}`} style={cardStyle}>
      <div className="table-card-header">
        <span className="table-card-label">Table</span>
        <span className="table-card-meta">
          {tableData.rows} x {tableData.cols}
        </span>
      </div>

      <div
        className="table-grid"
        style={{
          gridTemplateColumns: `repeat(${tableData.cols}, minmax(0, 1fr))`,
        }}
      >
        {tableData.cells.flatMap((row, rowIndex) =>
          row.map((cell, colIndex) => {
            if (isEditing) {
              return (
                <input
                  key={`${rowIndex}-${colIndex}`}
                  ref={
                    rowIndex === 0 && colIndex === 0 ? firstCellRef : undefined
                  }
                  className="table-cell-input"
                  value={cell}
                  onChange={(event) =>
                    handleCellChange(rowIndex, colIndex, event.target.value)
                  }
                  onBlur={(event) => {
                    const tableCard = event.currentTarget.closest('.table-card');
                    if (
                      event.relatedTarget instanceof HTMLElement &&
                      tableCard?.contains(event.relatedTarget)
                    ) {
                      return;
                    }

                    onEditEnd();
                  }}
                  onMouseDown={(event) => event.stopPropagation()}
                  aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}`}
                />
              );
            }

            return (
              <div key={`${rowIndex}-${colIndex}`} className="table-cell-display">
                {cell.trim().length > 0 ? (
                  <span>{cell}</span>
                ) : (
                  <span className="table-cell-empty">空白</span>
                )}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );
}
