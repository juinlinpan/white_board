import { type BoardItem } from '../api';
import { Frame, type FrameSummaryEntry } from './Frame';
import { Line } from './Line';
import { NotePaper } from './NotePaper';
import { StickyNote } from './StickyNote';
import { Table } from './Table';
import { TextBox } from './TextBox';

type Props = {
  item: BoardItem;
  childSummaries: FrameSummaryEntry[];
  childCount: number;
  isSelected: boolean;
  isEditing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onResizeMouseDown: (e: React.MouseEvent) => void;
  onToggleCollapse: () => void;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
};

export function BoardItemRenderer({
  item,
  childSummaries,
  childCount,
  isSelected,
  isEditing,
  onMouseDown,
  onDoubleClick,
  onResizeMouseDown,
  onToggleCollapse,
  onUpdate,
  onEditEnd,
}: Props) {
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left: item.x,
    top: item.y,
    width: item.width,
    height: item.height,
    zIndex: item.z_index,
    userSelect: 'none',
  };

  const wrapperClass = `board-item ${isSelected ? 'is-selected' : ''}`;
  const resizeHandle =
    isSelected && !isEditing ? (
      <button
        type="button"
        className="board-item-resize-handle"
        onMouseDown={onResizeMouseDown}
        aria-label="Resize item"
      />
    ) : null;

  switch (item.type) {
    case 'line':
      return (
        <div style={baseStyle} className={wrapperClass} onMouseDown={onMouseDown}>
          <Line item={item} />
          {resizeHandle}
        </div>
      );

    case 'text_box':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDown={onMouseDown}
          onDoubleClick={onDoubleClick}
        >
          <TextBox
            item={item}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
          />
          {resizeHandle}
        </div>
      );

    case 'table':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDown={onMouseDown}
          onDoubleClick={onDoubleClick}
        >
          <Table
            item={item}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
          />
          {resizeHandle}
        </div>
      );

    case 'sticky_note':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDown={onMouseDown}
          onDoubleClick={onDoubleClick}
        >
          <StickyNote
            item={item}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
          />
          {resizeHandle}
        </div>
      );

    case 'note_paper':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDown={onMouseDown}
          onDoubleClick={onDoubleClick}
        >
          <NotePaper
            item={item}
            isEditing={isEditing}
            onUpdate={onUpdate}
            onEditEnd={onEditEnd}
          />
          {resizeHandle}
        </div>
      );

    case 'frame':
      return (
        <div
          style={baseStyle}
          className={wrapperClass}
          onMouseDown={onMouseDown}
          onDoubleClick={onDoubleClick}
        >
          <Frame
            item={item}
            childCount={childCount}
            childSummaries={childSummaries}
            onToggleCollapse={onToggleCollapse}
          />
          {resizeHandle}
        </div>
      );

    default:
      return (
        <div
          style={{
            ...baseStyle,
            background: 'rgba(200,200,210,0.7)',
            border: '1px solid rgba(130,130,150,0.4)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            color: '#555',
          }}
          className={wrapperClass}
          onMouseDown={onMouseDown}
        >
          {item.type}
          {resizeHandle}
        </div>
      );
  }
}
