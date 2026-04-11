import { type BoardItem, type ConnectorLink } from './api';
import {
  parseBoardItemStyle,
  resolveBoardItemStyle,
  serializeBoardItemStyle,
  type BoardItemStyle,
} from './itemStyles';
import { ITEM_MIN_SIZE, ITEM_TYPE, ITEM_TYPE_LABEL } from './types';

type Props = {
  item: BoardItem | null;
  connector: ConnectorLink | null;
  childCount: number;
  onUpdate: (item: BoardItem) => void;
  onDelete: () => void;
  onToggleCollapse: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
};

function clampDimension(
  item: BoardItem,
  field: 'width' | 'height',
  value: number,
): number {
  const minSize = ITEM_MIN_SIZE[item.type];
  if (field === 'width') {
    return Math.max(minSize?.width ?? 60, value);
  }

  return Math.max(minSize?.height ?? 40, value);
}

function summarizeContent(item: BoardItem): string {
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

export function Inspector({
  item,
  connector,
  childCount,
  onUpdate,
  onDelete,
  onToggleCollapse,
  onBringToFront,
  onSendToBack,
}: Props) {
  if (item === null) {
    return (
      <aside className="canvas-inspector">
        <div className="inspector-empty">
          <p className="eyebrow">Inspector</p>
          <p>選取物件以檢視屬性</p>
        </div>
      </aside>
    );
  }

  const selectedItem = item;
  const isArrow = selectedItem.type === ITEM_TYPE.arrow;
  const supportsContent = isTextContentItem(selectedItem);
  const supportsTitle = selectedItem.type === ITEM_TYPE.frame;
  const supportsStyling = !isArrow;
  const resolvedStyle = resolveBoardItemStyle(selectedItem);
  const hasCustomStyle =
    selectedItem.style_json !== null && selectedItem.style_json.trim().length > 0;

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

  return (
    <aside className="canvas-inspector">
      <div className="inspector-panel">
        <p className="eyebrow">Inspector</p>
        <div className="inspector-title-row">
          <div>
            <h3>
              {ITEM_TYPE_LABEL[
                selectedItem.type as keyof typeof ITEM_TYPE_LABEL
              ] ?? selectedItem.type}
            </h3>
            <p className="inspector-meta">
              {isArrow
                ? '位置與尺寸會隨連線目標自動計算'
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
                disabled={isArrow}
                onChange={(e) => handleNumberChange('x', e.target.value)}
              />
            </label>
            <label>
              Y
              <input
                type="number"
                value={Math.round(selectedItem.y)}
                disabled={isArrow}
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
                disabled={isArrow}
                onChange={(e) => handleNumberChange('width', e.target.value)}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                value={Math.round(selectedItem.height)}
                disabled={isArrow}
                onChange={(e) => handleNumberChange('height', e.target.value)}
              />
            </label>
          </div>
        </section>

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
                  placeholder="Frame title"
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
                  placeholder={
                    selectedItem.type === ITEM_TYPE.note_paper
                      ? '# 標題'
                      : '輸入內容'
                  }
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
              <p className="inspector-meta">以 Markdown 純文字儲存，右側可直接修改。</p>
            ) : null}
          </section>
        ) : null}

        {supportsStyling ? (
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
              <label className="inspector-color-field">
                背景色
                <input
                  type="color"
                  value={resolvedStyle.backgroundColor}
                  onChange={(e) =>
                    handleStyleChange({ backgroundColor: e.target.value })
                  }
                />
              </label>
              <label className="inspector-color-field">
                文字色
                <input
                  type="color"
                  value={resolvedStyle.textColor}
                  onChange={(e) =>
                    handleStyleChange({ textColor: e.target.value })
                  }
                />
              </label>
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
            <p className="inspector-meta">變更會即時套用到畫布並自動儲存。</p>
          </section>
        ) : null}

        {isArrow ? (
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
