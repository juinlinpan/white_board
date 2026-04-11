import { type BoardItem } from './api';
import { ITEM_MIN_SIZE, ITEM_TYPE_LABEL } from './types';

type Props = {
  item: BoardItem | null;
  childCount: number;
  onUpdate: (item: BoardItem) => void;
  onDelete: () => void;
  onToggleCollapse: () => void;
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

export function Inspector({
  item,
  childCount,
  onUpdate,
  onDelete,
  onToggleCollapse,
}: Props) {
  if (item === null) {
    return (
      <aside className="canvas-inspector">
        <div className="inspector-empty">
          <p className="eyebrow">Inspector</p>
          <h3>尚未選取物件</h3>
          <p>選取畫布上的物件後，這裡會顯示位置、尺寸與型別資訊。</p>
        </div>
      </aside>
    );
  }

  const selectedItem = item;

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
            <p className="inspector-meta">{summarizeContent(selectedItem)}</p>
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
                onChange={(e) => handleNumberChange('x', e.target.value)}
              />
            </label>
            <label>
              Y
              <input
                type="number"
                value={Math.round(selectedItem.y)}
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
                onChange={(e) => handleNumberChange('width', e.target.value)}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                value={Math.round(selectedItem.height)}
                onChange={(e) => handleNumberChange('height', e.target.value)}
              />
            </label>
          </div>
        </section>

        {selectedItem.type === 'frame' ? (
          <section className="inspector-section">
            <p className="meta-label">Frame</p>
            <label className="inspector-field">
              Title
              <input
                type="text"
                value={selectedItem.title ?? ''}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Frame title"
              />
            </label>
            <div className="inspector-row">
              <span>{childCount} 個內含物件</span>
              <button className="ghost-button" onClick={onToggleCollapse}>
                {selectedItem.is_collapsed ? '展開內容' : '縮回摘要'}
              </button>
            </div>
          </section>
        ) : null}

        {selectedItem.type === 'note_paper' ? (
          <section className="inspector-section">
            <p className="meta-label">Content Format</p>
            <p className="inspector-meta">
              {selectedItem.content_format?.toUpperCase() ?? 'MARKDOWN'}
            </p>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
