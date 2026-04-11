import { type BoardItem, type ConnectorLink } from './api';
import { ITEM_MIN_SIZE, ITEM_TYPE_LABEL } from './types';

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
  const isArrow = selectedItem.type === 'arrow';

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
