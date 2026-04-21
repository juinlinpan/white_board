import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BoardItem } from '../api';
import { createTableData, serializeTableData } from '../tableData';
import { ITEM_CATEGORY, ITEM_TYPE } from '../types';
import { BoardItemRenderer } from './BoardItemRenderer';

const FIXTURE_TIMESTAMP = '2026-04-20T00:00:00+00:00';

function createTableItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'table-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.shape,
    type: ITEM_TYPE.table,
    title: null,
    content: null,
    content_format: null,
    x: 0,
    y: 0,
    width: 360,
    height: 240,
    rotation: 0,
    z_index: 0,
    is_collapsed: false,
    style_json: null,
    data_json: serializeTableData(createTableData()),
    created_at: FIXTURE_TIMESTAMP,
    updated_at: FIXTURE_TIMESTAMP,
    ...overrides,
  };
}

describe('BoardItemRenderer', () => {
  it('renders dedicated table border hit areas for dragging', () => {
    const markup = renderToStaticMarkup(
      <BoardItemRenderer
        item={createTableItem()}
        childSummaries={[]}
        childCount={0}
        isSelected={false}
        isEditing={false}
        onMouseDown={() => {}}
        onEndpointMouseDown={() => {}}
        onWaypointMouseDown={() => {}}
        onMidpointMouseDown={() => {}}
        onDoubleClick={() => {}}
        onResizeMouseDown={() => {}}
        onToggleCollapse={() => {}}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).toContain('board-item-table-edge-top');
    expect(markup).toContain('board-item-table-edge-right');
    expect(markup).toContain('board-item-table-edge-bottom');
    expect(markup).toContain('board-item-table-edge-left');
  });
});
