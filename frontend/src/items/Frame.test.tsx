import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BoardItem } from '../api';
import { ITEM_CATEGORY, ITEM_TYPE } from '../types';
import { Frame, type FrameSummaryEntry } from './Frame';

const FIXTURE_TIMESTAMP = '2026-04-12T00:00:00+00:00';

function createFrameItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'frame-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.large_item,
    type: ITEM_TYPE.frame,
    title: 'Sprint Frame',
    content: null,
    content_format: null,
    x: 0,
    y: 0,
    width: 420,
    height: 300,
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

const childSummaries: FrameSummaryEntry[] = [
  {
    id: 'text-1',
    type: ITEM_TYPE.text_box,
    title: '文字框',
    body: '完整文字內容',
  },
  {
    id: 'note-1',
    type: ITEM_TYPE.note_paper,
    title: 'Roadmap',
    body: 'Markdown H1 摘要',
  },
];

describe('Frame', () => {
  it('renders expanded frame content and collapse control', () => {
    const markup = renderToStaticMarkup(
      <Frame
        item={createFrameItem()}
        childCount={childSummaries.length}
        childSummaries={childSummaries}
        onToggleCollapse={() => {}}
      />,
    );

    expect(markup).toContain('縮回');
    expect(markup).toContain('拖曳文字框、便利貼或筆記紙進入這個 frame。');
    expect(markup).toContain('目前已收納 2 個物件。');
  });

  it('renders collapsed summaries and expand control', () => {
    const markup = renderToStaticMarkup(
      <Frame
        item={createFrameItem({ is_collapsed: true })}
        childCount={childSummaries.length}
        childSummaries={childSummaries}
        onToggleCollapse={() => {}}
      />,
    );

    expect(markup).toContain('展開');
    expect(markup).toContain('完整文字內容');
    expect(markup).toContain('Roadmap');
    expect(markup).toContain('Markdown H1 摘要');
  });
});
