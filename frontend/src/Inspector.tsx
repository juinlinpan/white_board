import { type BoardItem, type ConnectorLink } from './api';
import {
  BACKGROUND_COLOR_OPTIONS,
  TEXT_COLOR_OPTIONS,
  parseBoardItemStyle,
  resolveBoardItemStyle,
  serializeBoardItemStyle,
  type BoardItemStyle,
  type ColorOption,
} from './itemStyles';
import { hasStoredSegmentData } from './segmentData';
import {
  countFilledTableCells,
  getTableMinSizeFromDataJson,
  parseTableData,
  type TableCellData,
} from './tableData';
import { ITEM_MIN_SIZE, ITEM_TYPE, ITEM_TYPE_LABEL } from './types';

type Props = {
  item: BoardItem | null;
  connector: ConnectorLink | null;
  selectionCount: number;
  childCount: number;
  selectedTableCellIds: string[];
  isCollapsed: boolean;
  onUpdate: (item: BoardItem) => void;
  onUpdateTableCells: (
    tableId: string,
    cellIds: string[],
    patch: Partial<TableCellData>,
  ) => void;
  onDelete: () => void;
  onToggleInspector: () => void;
  onToggleCollapse: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
};

function clampDimension(
  item: BoardItem,
  field: 'width' | 'height',
  value: number,
): number {
  const minSize =
    item.type === ITEM_TYPE.table
      ? getTableMinSizeFromDataJson(item.data_json)
      : ITEM_MIN_SIZE[item.type];
  if (field === 'width') {
    return Math.max(minSize?.width ?? 60, value);
  }

  return Math.max(minSize?.height ?? 40, value);
}

function summarizeContent(item: BoardItem): string {
  if (item.type === ITEM_TYPE.table) {
    const tableData = parseTableData(item.data_json);
    const filledCells = countFilledTableCells(tableData);
    return `${tableData.rows} x ${tableData.cols} 表格，${filledCells} 格有內容`;
  }

  if (item.content === null || item.content.trim().length === 0) {
    return '尚未填寫內容';
  }

  return `${item.content.trim().length} 字`;
}

function isTextContentItem(item: BoardItem): boolean {
  return (
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.sticky_note ||
    item.type === ITEM_TYPE.note_paper
  );
}

function normalizeRotation(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  const normalized = ((Math.round(value) % 360) + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function ColorPaletteField({
  label,
  options,
  selectedValue,
  tone,
  onSelect,
}: {
  label: string;
  options: readonly ColorOption[];
  selectedValue: string;
  tone: 'background' | 'text';
  onSelect: (value: string) => void;
}) {
  return (
    <div className="inspector-color-field">
      <span>{label}</span>
      <div className="inspector-palette-grid" aria-label={label}>
        {options.map((option) => {
          const isActive = option.value === selectedValue;

          return (
            <button
              key={option.value}
              type="button"
              className={`inspector-swatch-button ${isActive ? 'is-active' : ''}`}
              aria-label={`${label} ${option.name}`}
              aria-pressed={isActive}
              title={`${option.name} ${option.value}`}
              onClick={() => onSelect(option.value)}
            >
              {tone === 'background' ? (
                <span
                  className="inspector-swatch-chip"
                  style={{ backgroundColor: option.value }}
                />
              ) : (
                <span
                  className="inspector-swatch-letter"
                  style={{ color: option.value }}
                >
                  A
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Inspector({
  item,
  connector,
  selectionCount,
  childCount,
  selectedTableCellIds,
  isCollapsed,
  onUpdate,
  onUpdateTableCells,
  onDelete,
  onToggleInspector,
  onToggleCollapse,
  onBringToFront,
  onSendToBack,
}: Props) {
  if (isCollapsed) {
    return (
      <aside className="canvas-inspector is-collapsed">
        <div className="inspector-collapsed">
          <button
            type="button"
            className="ghost-button inspector-toggle-button"
            aria-label="Expand inspector"
            onClick={onToggleInspector}
            title="Expand inspector"
          >
            &lt;
          </button>
          <span className="inspector-collapsed-label">Inspector</span>
        </div>
      </aside>
    );
  }

  if (item === null) {
    return (
      <aside className="canvas-inspector">
        <div className="inspector-empty">
          <div className="inspector-header-row">
            <p className="eyebrow">Inspector</p>
            <button
              type="button"
              className="ghost-button inspector-toggle-button"
              aria-label="Collapse inspector"
              onClick={onToggleInspector}
              title="Collapse inspector"
            >
              &gt;
            </button>
          </div>
          <p>選取物件以檢視屬性</p>
        </div>
      </aside>
    );
  }

  if (selectionCount > 1) {
    return (
      <aside className="canvas-inspector">
        <div className="inspector-panel">
          <div className="inspector-header-row">
            <p className="eyebrow">Inspector</p>
            <button
              type="button"
              className="ghost-button inspector-toggle-button"
              aria-label="Collapse inspector"
              onClick={onToggleInspector}
              title="Collapse inspector"
            >
              &gt;
            </button>
          </div>
          <div className="inspector-title-row">
            <div>
              <h3>已選取 {selectionCount} 個物件</h3>
              <p className="inspector-meta">
                多選模式支援群組拖曳、複製、貼上與刪除。若要編輯屬性，請改成單選。
              </p>
            </div>
            <button className="ghost-button danger-button" onClick={onDelete}>
              刪除
            </button>
          </div>

          <section className="inspector-section">
            <p className="meta-label">Primary Selection</p>
            <p className="inspector-meta">
              目前主選取物件：
              {ITEM_TYPE_LABEL[item.type as keyof typeof ITEM_TYPE_LABEL] ??
                item.type}
            </p>
          </section>
        </div>
      </aside>
    );
  }

  const selectedItem = item;
  const isArrow = selectedItem.type === ITEM_TYPE.arrow;
  const isLine = selectedItem.type === ITEM_TYPE.line;
  const isSegmentItem =
    (isArrow || isLine) && hasStoredSegmentData(selectedItem);
  const isLegacyConnectorArrow = isArrow && !isSegmentItem;
  const isTable = selectedItem.type === ITEM_TYPE.table;
  const supportsContent = isTextContentItem(selectedItem);
  const supportsTitle = selectedItem.type === ITEM_TYPE.frame;
  const supportsTextStyling = !isArrow && !isLine;
  const supportsLineStyling = isLine || isArrow;
  const tableData = isTable ? parseTableData(selectedItem.data_json) : null;
  const resolvedStyle = resolveBoardItemStyle(selectedItem);
  const selectedTableCells =
    isTable && tableData !== null && selectedTableCellIds.length > 0
      ? tableData.cells
          .flat()
          .filter(
            (cell): cell is TableCellData =>
              cell !== null && selectedTableCellIds.includes(cell.id),
          )
      : [];
  const selectedTableCellBackgroundColor =
    selectedTableCells.length > 0
      ? selectedTableCells.every(
          (cell) =>
            (cell.backgroundColor ?? resolvedStyle.backgroundColor) ===
            (selectedTableCells[0]?.backgroundColor ?? resolvedStyle.backgroundColor),
        )
        ? (selectedTableCells[0]?.backgroundColor ?? resolvedStyle.backgroundColor)
        : resolvedStyle.backgroundColor
      : resolvedStyle.backgroundColor;
  const hasCustomStyle =
    selectedItem.style_json !== null &&
    selectedItem.style_json.trim().length > 0;

  function handleNumberChange(
    field: 'x' | 'y' | 'width' | 'height',
    rawValue: string,
  ) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }

    const nextValue =
      field === 'width' || field === 'height'
        ? clampDimension(selectedItem, field, value)
        : value;

    onUpdate({ ...selectedItem, [field]: nextValue });
  }

  function handleTitleChange(rawValue: string) {
    onUpdate({ ...selectedItem, title: rawValue });
  }

  function handleContentChange(rawValue: string) {
    onUpdate({
      ...selectedItem,
      content: rawValue,
      content_format:
        selectedItem.type === ITEM_TYPE.note_paper
          ? 'markdown'
          : selectedItem.content_format,
    });
  }

  function handleStyleChange(patch: BoardItemStyle) {
    const currentStyle = parseBoardItemStyle(selectedItem.style_json);
    onUpdate({
      ...selectedItem,
      style_json: serializeBoardItemStyle({ ...currentStyle, ...patch }),
    });
  }

  function handleFontSizeChange(rawValue: string) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }

    handleStyleChange({ fontSize: value });
  }

  function handleRotationChange(rawValue: string) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }

    onUpdate({ ...selectedItem, rotation: normalizeRotation(value) });
  }

  function handleStrokeWidthChange(rawValue: string) {
    const value = Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }

    handleStyleChange({ strokeWidth: value });
  }

  return (
    <aside className="canvas-inspector">
      <div className="inspector-panel">
        <div className="inspector-header-row">
          <p className="eyebrow">Inspector</p>
          <button
            type="button"
            className="ghost-button inspector-toggle-button"
            aria-label="Collapse inspector"
            onClick={onToggleInspector}
            title="Collapse inspector"
          >
            &gt;
          </button>
        </div>
        <div className="inspector-title-row">
          <div>
            <h3>
              {ITEM_TYPE_LABEL[
                selectedItem.type as keyof typeof ITEM_TYPE_LABEL
              ] ?? selectedItem.type}
            </h3>
            <p className="inspector-meta">
              {isLegacyConnectorArrow
                ? '位置與尺寸會隨連線目標自動計算'
                : isSegmentItem
                  ? '直接拖曳畫布上的起點與終點控制點，調整長度與方向。'
                : summarizeContent(selectedItem)}
            </p>
          </div>
          <button className="ghost-button danger-button" onClick={onDelete}>
            刪除
          </button>
        </div>

        <section className="inspector-section">
          <p className="meta-label">Position</p>
          <div className="inspector-grid">
            <label>
              X
              <input
                type="number"
                value={Math.round(selectedItem.x)}
                disabled={isLegacyConnectorArrow}
                onChange={(e) => handleNumberChange('x', e.target.value)}
              />
            </label>
            <label>
              Y
              <input
                type="number"
                value={Math.round(selectedItem.y)}
                disabled={isLegacyConnectorArrow}
                onChange={(e) => handleNumberChange('y', e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="inspector-section">
          <p className="meta-label">Size</p>
          <div className="inspector-grid">
            <label>
              Width
              <input
                type="number"
                value={Math.round(selectedItem.width)}
                disabled={isLegacyConnectorArrow || isSegmentItem}
                onChange={(e) => handleNumberChange('width', e.target.value)}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                value={Math.round(selectedItem.height)}
                disabled={isLegacyConnectorArrow || isSegmentItem}
                onChange={(e) => handleNumberChange('height', e.target.value)}
              />
            </label>
          </div>
          {isLine && !isSegmentItem ? (
            <label className="inspector-field">
              角度
              <input
                type="number"
                min={-180}
                max={180}
                value={selectedItem.rotation}
                onChange={(e) => handleRotationChange(e.target.value)}
              />
            </label>
          ) : null}
          {isSegmentItem ? (
            <p className="inspector-meta">
              線條與箭頭會以包圍盒儲存，尺寸請直接用畫布上的端點控制。
            </p>
          ) : null}
        </section>

        {isTable && tableData !== null ? (
          <section className="inspector-section">
            <p className="meta-label">Table</p>
            <div className="inspector-grid">
              <label>
                列數
                <input type="number" readOnly value={tableData.rows} />
              </label>
              <label>
                欄數
                <input type="number" readOnly value={tableData.cols} />
              </label>
            </div>
            <p className="inspector-meta">
              已填入 {countFilledTableCells(tableData)}/{tableData.rows * tableData.cols} 格。
            </p>
            <p className="inspector-meta">
              在表格內反白一格或多格後，底下 Style 的背景色會只套用到反白儲存格。
            </p>
          </section>
        ) : null}

        <section className="inspector-section">
          <p className="meta-label">Layer</p>
          <div className="inspector-action-grid">
            <button
              type="button"
              className="ghost-button"
              onClick={onBringToFront}
            >
              置頂
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={onSendToBack}
            >
              置底
            </button>
          </div>
        </section>

        {supportsContent || supportsTitle ? (
          <section className="inspector-section">
            <p className="meta-label">Content</p>
            {supportsTitle ? (
              <label className="inspector-field">
                標題
                <input
                  type="text"
                  value={selectedItem.title ?? ''}
                  onChange={(e) => handleTitleChange(e.target.value)}
                />
              </label>
            ) : null}
            {supportsContent ? (
              <label className="inspector-field">
                {selectedItem.type === ITEM_TYPE.note_paper
                  ? 'Markdown'
                  : '文字內容'}
                <textarea
                  className="inspector-textarea"
                  value={selectedItem.content ?? ''}
                  onChange={(e) => handleContentChange(e.target.value)}
                />
              </label>
            ) : null}
            {selectedItem.type === ITEM_TYPE.frame ? (
              <div className="inspector-row">
                <span>{childCount} 個內含物件</span>
                <button className="ghost-button" onClick={onToggleCollapse}>
                  {selectedItem.is_collapsed ? '展開內容' : '縮回摘要'}
                </button>
              </div>
            ) : null}
            {selectedItem.type === ITEM_TYPE.note_paper ? (
              <p className="inspector-meta">
                以 Markdown 純文字儲存，右側可直接修改。
              </p>
            ) : null}
          </section>
        ) : null}

        {supportsTextStyling ? (
          <section className="inspector-section">
            <div className="inspector-title-row">
              <p className="meta-label">Style</p>
              <button
                type="button"
                className="ghost-button"
                disabled={!hasCustomStyle}
                onClick={() => onUpdate({ ...selectedItem, style_json: null })}
              >
                重設
              </button>
            </div>
            <div className="inspector-color-grid">
              <ColorPaletteField
                label="背景色"
                options={BACKGROUND_COLOR_OPTIONS}
                selectedValue={
                  isTable && selectedTableCells.length > 0
                    ? selectedTableCellBackgroundColor
                    : resolvedStyle.backgroundColor
                }
                tone="background"
                onSelect={(value) =>
                  isTable && selectedTableCells.length > 0
                    ? onUpdateTableCells(selectedItem.id, selectedTableCellIds, {
                        backgroundColor: value,
                      })
                    : handleStyleChange({ backgroundColor: value })
                }
              />
              <ColorPaletteField
                label="文字色"
                options={TEXT_COLOR_OPTIONS}
                selectedValue={resolvedStyle.textColor}
                tone="text"
                onSelect={(value) => handleStyleChange({ textColor: value })}
              />
            </div>
            <div className="inspector-grid">
              <label>
                字級
                <input
                  type="number"
                  min={12}
                  max={32}
                  value={resolvedStyle.fontSize}
                  onChange={(e) => handleFontSizeChange(e.target.value)}
                />
              </label>
            </div>
            <div className="inspector-toggle-group">
              <button
                type="button"
                className={`ghost-button ${
                  resolvedStyle.fontWeight === 'bold' ? 'is-active' : ''
                }`}
                onClick={() =>
                  handleStyleChange({
                    fontWeight:
                      resolvedStyle.fontWeight === 'bold' ? 'normal' : 'bold',
                  })
                }
              >
                粗體
              </button>
              <button
                type="button"
                className={`ghost-button ${
                  resolvedStyle.fontStyle === 'italic' ? 'is-active' : ''
                }`}
                onClick={() =>
                  handleStyleChange({
                    fontStyle:
                      resolvedStyle.fontStyle === 'italic'
                        ? 'normal'
                        : 'italic',
                  })
                }
              >
                斜體
              </button>
            </div>
            <p className="inspector-meta">
              背景固定 7
              色，文字固定高飽和色票；變更會即時套用到畫布並自動儲存。
            </p>
          </section>
        ) : null}

        {supportsLineStyling ? (
          <section className="inspector-section">
            <div className="inspector-title-row">
              <p className="meta-label">Line Style</p>
              <button
                type="button"
                className="ghost-button"
                disabled={!hasCustomStyle}
                onClick={() => onUpdate({ ...selectedItem, style_json: null })}
              >
                重設
              </button>
            </div>
            <div className="inspector-color-grid">
              <label className="inspector-color-field">
                線條顏色
                <input
                  type="color"
                  value={resolvedStyle.strokeColor}
                  onChange={(e) =>
                    handleStyleChange({ strokeColor: e.target.value })
                  }
                />
              </label>
              <label className="inspector-field">
                粗細
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={resolvedStyle.strokeWidth}
                  onChange={(e) => handleStrokeWidthChange(e.target.value)}
                />
              </label>
            </div>
            <label className="inspector-field">
              線條樣式
              <select
                value={resolvedStyle.strokeStyle}
                onChange={(e) =>
                  handleStyleChange({
                    strokeStyle: e.target
                      .value as BoardItemStyle['strokeStyle'],
                  })
                }
              >
                <option value="solid">實線</option>
                <option value="dashed">虛線</option>
                <option value="dotted">點線</option>
              </select>
            </label>
            {isArrow ? (
              <label className="inspector-field">
                箭頭大小
                <input
                  type="number"
                  min={8}
                  max={40}
                  value={resolvedStyle.arrowHeadSize}
                  onChange={(e) =>
                    handleStyleChange({
                      arrowHeadSize: Number(e.target.value),
                    })
                  }
                />
              </label>
            ) : null}
            <p className="inspector-meta">
              {isSegmentItem
                ? '直接拖曳畫布上的端點控制長度與方向，這裡只調整樣式。'
                : '寬度控制線段長度，高度保留互動命中區，角度用來調整方向。'}
            </p>
          </section>
        ) : null}

        {isLegacyConnectorArrow ? (
          <section className="inspector-section">
            <p className="meta-label">Connector</p>
            <div className="inspector-list">
              <p>起點 ID：{connector?.from_item_id ?? '未設定'}</p>
              <p>終點 ID：{connector?.to_item_id ?? '未設定'}</p>
              <p>起點錨點：{connector?.from_anchor ?? 'auto'}</p>
              <p>終點錨點：{connector?.to_anchor ?? 'auto'}</p>
            </div>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
