import { useEffect, useRef } from 'react';
import { type BoardItem } from '../api';
import {
  getBoardItemTypographyStyle,
  resolveBoardItemStyle,
} from '../itemStyles';

type Props = {
  item: BoardItem;
  isEditing: boolean;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
};

export function StickyNote({ item, isEditing, onUpdate, onEditEnd }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedStyle = resolveBoardItemStyle(item);
  const typographyStyle = getBoardItemTypographyStyle(item);
  const cardStyle = {
    background: resolvedStyle.backgroundColor,
    ...typographyStyle,
  };

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onUpdate({ ...item, content: e.target.value });
  }

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        className="sticky-note-editor"
        style={cardStyle}
        value={item.content ?? ''}
        onChange={handleChange}
        onBlur={onEditEnd}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div className="sticky-note-display" style={cardStyle}>
      {item.content ? (
        <span className="sticky-note-content">{item.content}</span>
      ) : (
        <span className="item-placeholder">雙擊新增筆記</span>
      )}
    </div>
  );
}
