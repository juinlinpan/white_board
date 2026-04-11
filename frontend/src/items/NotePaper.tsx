import { useEffect, useRef } from 'react';
import { type BoardItem } from '../api';
import { getMarkdownH1 } from '../canvasHelpers';
import {
  getBoardItemTypographyStyle,
  resolveBoardItemStyle,
} from '../itemStyles';
import { MarkdownPreview } from '../markdownPreview';

type Props = {
  item: BoardItem;
  isEditing: boolean;
  onUpdate: (item: BoardItem) => void;
  onEditEnd: () => void;
};

function hasPreviewBody(content: string | null): boolean {
  if (content === null) {
    return false;
  }

  return content.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !/^#\s+/.test(trimmed);
  });
}

export function NotePaper({ item, isEditing, onUpdate, onEditEnd }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const title = getMarkdownH1(item.content);
  const previewable = hasPreviewBody(item.content);
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
      {previewable ? (
        <MarkdownPreview
          content={item.content}
          omitFirstHeading={true}
          className="note-paper-body"
        />
      ) : (
        <span className="item-placeholder">雙擊開始撰寫 Markdown 筆記</span>
      )}
    </div>
  );
}
