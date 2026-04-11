import { type BoardItem } from '../api';
import {
  getBoardItemTypographyStyle,
  resolveBoardItemStyle,
} from '../itemStyles';
import { ITEM_TYPE_LABEL } from '../types';

export type FrameSummaryEntry = {
  id: string;
  type: string;
  title: string;
  body: string;
};

type Props = {
  item: BoardItem;
  childCount: number;
  childSummaries: FrameSummaryEntry[];
  onToggleCollapse: () => void;
};

export function Frame({
  item,
  childCount,
  childSummaries,
  onToggleCollapse,
}: Props) {
  const title = item.title?.trim() || 'Untitled Frame';
  const resolvedStyle = resolveBoardItemStyle(item);
  const frameStyle = {
    background: resolvedStyle.backgroundColor,
    color: resolvedStyle.textColor,
  };
  const typographyStyle = getBoardItemTypographyStyle(item);

  function handleToggleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    onToggleCollapse();
  }

  function handleToggleMouseDown(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
  }

  return (
    <div
      className={`frame-display ${item.is_collapsed ? 'is-collapsed' : ''}`}
      style={frameStyle}
    >
      <div className="frame-header">
        <div className="frame-heading">
          <span className="frame-chip">Frame</span>
          <strong className="frame-title" style={typographyStyle}>
            {title}
          </strong>
        </div>
        <div className="frame-header-actions">
          <span className="frame-count">{childCount} items</span>
          <button
            className="frame-toggle"
            onClick={handleToggleClick}
            onMouseDown={handleToggleMouseDown}
          >
            {item.is_collapsed ? '展開' : '縮回'}
          </button>
        </div>
      </div>

      {item.is_collapsed ? (
        <div className="frame-summary-list">
          {childSummaries.length === 0 ? (
            <div className="frame-summary-empty" style={typographyStyle}>
              這個 frame 目前沒有可摘要的內容。
            </div>
          ) : (
            childSummaries.map((entry) => (
              <article
                key={entry.id}
                className={`frame-summary-card tone-${entry.type}`}
              >
                <p className="frame-summary-label">
                  {ITEM_TYPE_LABEL[
                    entry.type as keyof typeof ITEM_TYPE_LABEL
                  ] ?? entry.type}
                </p>
                <strong style={typographyStyle}>{entry.title}</strong>
                <p style={typographyStyle}>{entry.body}</p>
              </article>
            ))
          )}
        </div>
      ) : (
        <div className="frame-body" style={typographyStyle}>
          <p>拖曳文字框、便利貼或筆記紙進入這個 frame。</p>
          <p>目前已收納 {childCount} 個物件。</p>
        </div>
      )}
    </div>
  );
}
