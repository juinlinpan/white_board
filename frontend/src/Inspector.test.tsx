import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BoardItem } from './api';
import { Inspector } from './Inspector';
import { BACKGROUND_COLOR_OPTIONS, TEXT_COLOR_OPTIONS } from './itemStyles';
import { ITEM_CATEGORY, ITEM_TYPE } from './types';

const FIXTURE_TIMESTAMP = '2026-04-12T00:00:00+00:00';

function createBoardItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'item-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.text_box,
    title: null,
    content: 'Palette test',
    content_format: 'plain_text',
    x: 0,
    y: 0,
    width: 200,
    height: 100,
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

describe('Inspector style palette', () => {
  it('renders fixed swatch buttons instead of freeform color inputs for text items', () => {
    const markup = renderToStaticMarkup(
      <Inspector
        item={createBoardItem()}
        connector={null}
        selectionCount={1}
        childCount={0}
        onUpdate={() => {}}
        onDelete={() => {}}
        onToggleCollapse={() => {}}
        onBringToFront={() => {}}
        onSendToBack={() => {}}
      />,
    );

    const swatchCount = (markup.match(/inspector-swatch-button/g) ?? []).length;

    expect(markup).not.toContain('type="color"');
    expect(swatchCount).toBe(
      BACKGROUND_COLOR_OPTIONS.length + TEXT_COLOR_OPTIONS.length,
    );
    expect(markup).toContain('背景固定 7 色');
  });

  it('treats freeform arrows as segment items instead of legacy connectors', () => {
    const markup = renderToStaticMarkup(
      <Inspector
        item={createBoardItem({
          category: ITEM_CATEGORY.connector,
          type: ITEM_TYPE.arrow,
          width: 220,
          height: 100,
          data_json: JSON.stringify({
            kind: 'segment',
            start: { x: 20, y: 20 },
            end: { x: 180, y: 80 },
          }),
        })}
        connector={null}
        selectionCount={1}
        childCount={0}
        onUpdate={() => {}}
        onDelete={() => {}}
        onToggleCollapse={() => {}}
        onBringToFront={() => {}}
        onSendToBack={() => {}}
      />,
    );

    expect(markup).toContain('Line Style');
    expect(markup).toContain('直接拖曳畫布上的起點與終點控制點');
    expect(markup).not.toContain('起點 ID');
  });
});
