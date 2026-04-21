import { useEffect, useRef } from 'react';
import { type BoardItem } from '../api';
import { getFirstNonEmptyLine, getMarkdownH1 } from '../canvasHelpers';
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

function shouldPrioritizeTitle(item: Pick<BoardItem, 'width' | 'height'>): boolean {
  return item.width < 210 || item.height < 150;
}

export function NotePaper({ item, isEditing, onUpdate, onEditEnd }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const title = getMarkdownH1(item.content) ?? getFirstNonEmptyLine(item.content);
  const previewable = hasPreviewBody(item.content);
  const prioritizeTitle = shouldPrioritizeTitle(item);
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
      />
    );
  }

  return (
    <div
      className={`note-paper-display ${prioritizeTitle ? 'is-title-priority' : ''}`}
      style={cardStyle}
    >
      <div className="note-paper-header">
        <strong className="note-paper-title">{title ?? 'Untitled note'}</strong>
      </div>
      {previewable && !prioritizeTitle ? (
        <MarkdownPreview
          content={item.content}
          omitFirstHeading={true}
          className="note-paper-body"
          maxBlocks={null}
        />
      ) : null}
    </div>
  );
}
