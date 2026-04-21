import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BoardItem } from '../api';
import { ITEM_CATEGORY, ITEM_TYPE } from '../types';
import { NotePaper } from './NotePaper';

const FIXTURE_TIMESTAMP = '2026-04-12T00:00:00+00:00';

function createNotePaperItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'note-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.note_paper,
    title: null,
    content: '# Sprint Plan',
    content_format: 'markdown',
    x: 0,
    y: 0,
    width: 260,
    height: 220,
    rotation: 0,
    z_index: 0,
    is_collapsed: false,
    style_json: null,
    data_json: null,
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

describe('NotePaper', () => {
  it('renders rich markdown preview blocks in read mode', () => {
    const markup = renderToStaticMarkup(
      <NotePaper
        item={createNotePaperItem({
          content: `# Sprint Plan

這週先完成 **MVP**，補上 \`healthz\` 與驗收。

- API 串接
- Frame 驗收

> 保持 local-first

\`\`\`ts
const done = true;
\`\`\``,
        })}
        isEditing={false}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).toContain('Sprint Plan');
    expect(markup).toContain('<strong>MVP</strong>');
    expect(markup).toContain('<code class="markdown-inline-code">healthz</code>');
    expect(markup).toContain('<ul class="markdown-list">');
    expect(markup).toContain('<blockquote class="markdown-quote">');
    expect(markup).toContain('<pre class="markdown-code-block">');
    expect(markup).toContain('const done = true;');
    expect(markup).not.toContain('Markdown</span>');
  });

  it('prioritizes the title when the note paper is too small for the body preview', () => {
    const markup = renderToStaticMarkup(
      <NotePaper
        item={createNotePaperItem({
          width: 180,
          height: 120,
          content: `# Sprint Plan

- API sync
- Frame polish`,
        })}
        isEditing={false}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).toContain('Sprint Plan');
    expect(markup).not.toContain('markdown-list');
  });

  it('renders the editor in edit mode', () => {
    const markup = renderToStaticMarkup(
      <NotePaper
        item={createNotePaperItem()}
        isEditing={true}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).toContain('textarea');
    expect(markup).toContain('# Sprint Plan');
  });
});
