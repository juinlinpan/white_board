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

function getMarkdownTitle(content: string | null): string | null {
  if (content === null) {
    return null;
  }

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+)$/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function getPreviewBody(content: string | null): string {
  if (content === null) {
    return '';
  }

  const body = content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 6)
    .join('\n')
    .trim();

  return body;
}

export function NotePaper({ item, isEditing, onUpdate, onEditEnd }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const title = getMarkdownTitle(item.content);
  const previewBody = getPreviewBody(item.content);
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
    onUpdate({
      ...item,
      content: e.target.value,
      content_format: 'markdown',
    });
  }

  if (isEditing) {
    return (
      <textarea
        ref={textareaRef}
        className="note-paper-editor"
        style={cardStyle}
        value={item.content ?? ''}
        onChange={handleChange}
        onBlur={onEditEnd}
        onMouseDown={(e) => e.stopPropagation()}
        placeholder={`# 標題

開始寫你的 markdown 筆記`}
      />
    );
  }

  return (
    <div className="note-paper-display" style={cardStyle}>
      <div className="note-paper-header">
        <span className="markdown-badge">Markdown</span>
        <strong>{title ?? 'Untitled note'}</strong>
      </div>
      {previewBody.length > 0 ? (
        <pre className="note-paper-body" style={typographyStyle}>
          {previewBody}
        </pre>
      ) : (
        <span className="item-placeholder">雙擊開始撰寫 Markdown 筆記</span>
      )}
    </div>
  );
}
