type MarkdownPreviewProps = {
  content: string | null;
  className?: string;
  maxBlocks?: number | null;
  omitFirstHeading?: boolean;
};

type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; language: string | null; code: string };

function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

function isFenceLine(line: string): boolean {
  return /^```/.test(line.trim());
}

function isHeadingLine(line: string): boolean {
  return /^(#{1,6})\s+/.test(line.trim());
}

function isQuoteLine(line: string): boolean {
  return /^>\s?/.test(line.trim());
}

function isOrderedListLine(line: string): boolean {
  return /^\d+\.\s+/.test(line.trim());
}

function isUnorderedListLine(line: string): boolean {
  return /^[-*]\s+/.test(line.trim());
}

function isSpecialBlockStart(line: string): boolean {
  return (
    isFenceLine(line) ||
    isHeadingLine(line) ||
    isQuoteLine(line) ||
    isOrderedListLine(line) ||
    isUnorderedListLine(line)
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const segments: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null = pattern.exec(text);

  while (match !== null) {
    if (match.index > cursor) {
      segments.push(text.slice(cursor, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith('**')) {
      segments.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      segments.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      segments.push(
        <code key={key} className="markdown-inline-code">
          {token.slice(1, -1)}
        </code>,
      );
    }

    cursor = match.index + token.length;
    match = pattern.exec(text);
  }

  if (cursor < text.length) {
    segments.push(text.slice(cursor));
  }

  return segments;
}

function parseMarkdownBlocks(content: string | null): MarkdownBlock[] {
  if (content === null || content.trim().length === 0) {
    return [];
  }

  const lines = content.replace(/\r/g, '').split('\n');
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const currentLine = lines[index] ?? '';
    const trimmedLine = currentLine.trim();

    if (isBlankLine(currentLine)) {
      index += 1;
      continue;
    }

    const fenceMatch = trimmedLine.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      index += 1;
      const codeLines: string[] = [];
      while (index < lines.length && !isFenceLine(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }

      blocks.push({
        type: 'code',
        language: fenceMatch[1] ?? null,
        code: codeLines.join('\n').trimEnd(),
      });
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    if (isQuoteLine(currentLine)) {
      const quoteLines: string[] = [];
      while (index < lines.length && isQuoteLine(lines[index] ?? '')) {
        quoteLines.push((lines[index] ?? '').trim().replace(/^>\s?/, ''));
        index += 1;
      }

      blocks.push({
        type: 'quote',
        text: quoteLines.join(' ').trim(),
      });
      continue;
    }

    if (isOrderedListLine(currentLine) || isUnorderedListLine(currentLine)) {
      const ordered = isOrderedListLine(currentLine);
      const items: string[] = [];

      while (index < lines.length) {
        const line = lines[index] ?? '';
        if (ordered && !isOrderedListLine(line)) {
          break;
        }
        if (!ordered && !isUnorderedListLine(line)) {
          break;
        }

        items.push(
          line
            .trim()
            .replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, '')
            .trim(),
        );
        index += 1;
      }

      blocks.push({
        type: 'list',
        ordered,
        items,
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length) {
      const line = lines[index] ?? '';
      if (isBlankLine(line) || isSpecialBlockStart(line)) {
        break;
      }

      paragraphLines.push(line.trim());
      index += 1;
    }

    blocks.push({
      type: 'paragraph',
      text: paragraphLines.join(' ').trim(),
    });
  }

  return blocks;
}

export function MarkdownPreview({
  content,
  className,
  maxBlocks = 6,
  omitFirstHeading = false,
}: MarkdownPreviewProps) {
  let blocks = parseMarkdownBlocks(content);
  if (
    omitFirstHeading &&
    blocks[0]?.type === 'heading' &&
    blocks[0].level === 1
  ) {
    blocks = blocks.slice(1);
  }

  const visibleBlocks =
    maxBlocks === null ? blocks : blocks.slice(0, maxBlocks);
  if (visibleBlocks.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {visibleBlocks.map((block, index) => {
        const key = `${block.type}-${index}`;
        if (block.type === 'heading') {
          const HeadingTag: 'h2' | 'h3' | 'h4' =
            block.level === 1 ? 'h2' : block.level === 2 ? 'h3' : 'h4';
          return (
            <HeadingTag
              key={key}
              className={`markdown-heading markdown-heading-${block.level}`}
            >
              {renderInlineMarkdown(block.text)}
            </HeadingTag>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={key} className="markdown-paragraph">
              {renderInlineMarkdown(block.text)}
            </p>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={key} className="markdown-quote">
              <p>{renderInlineMarkdown(block.text)}</p>
            </blockquote>
          );
        }

        if (block.type === 'code') {
          return (
            <pre key={key} className="markdown-code-block">
              <code data-language={block.language ?? undefined}>{block.code}</code>
            </pre>
          );
        }

        const ListTag = block.ordered ? 'ol' : 'ul';
        return (
          <ListTag key={key} className="markdown-list">
            {block.items.map((item, itemIndex) => (
              <li key={`${key}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
            ))}
          </ListTag>
        );
      })}
    </div>
  );
}
import type { ReactNode } from 'react';
