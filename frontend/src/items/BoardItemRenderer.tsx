import { type BoardItem } from '../api';
import { StickyNote } from './StickyNote';
import { TextBox } from './TextBox';

type Props = {
  item: BoardItem;
  isSelected: boolean;
  isEditing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
};

export function BoardItemRenderer({
  item,
  isSelected,
  isEditing,
  onMouseDown,
  onDoubleClick,
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

  switch (item.type) {
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
        </div>
      );
  }
}
