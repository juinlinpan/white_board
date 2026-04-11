import { useEffect, useRef } from 'react';
import { type BoardItem } from '../api';

type Props = {
  item: BoardItem;
  isEditing: boolean;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
};

// Sticky note background colours（輪流使用）
const STICKY_COLORS = [
  '#fef08a', // yellow
  '#bbf7d0', // green
  '#bfdbfe', // blue
  '#fecaca', // red
  '#e9d5ff', // purple
  '#fed7aa', // orange
];

function getStickyColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return STICKY_COLORS[hash % STICKY_COLORS.length] ?? '#fef08a';
}

export function StickyNote({ item, isEditing, onUpdate, onEditEnd }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bgColor = getStickyColor(item.id);

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
        style={{ background: bgColor }}
        value={item.content ?? ''}
        onChange={handleChange}
        onBlur={onEditEnd}
        onMouseDown={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <div className="sticky-note-display" style={{ background: bgColor }}>
      {item.content ? (
        <span className="sticky-note-content">{item.content}</span>
      ) : (
        <span className="item-placeholder">雙擊新增筆記</span>
      )}
    </div>
  );
}
