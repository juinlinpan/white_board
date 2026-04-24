import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { BoardItem } from '../api';
import { createTableData, serializeTableData } from '../tableData';
import { ITEM_CATEGORY, ITEM_TYPE } from '../types';
import { getMagnetSnappedTableDividerPosition, Table } from './Table';

const FIXTURE_TIMESTAMP = '2026-04-15T00:00:00+00:00';

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

describe('Table', () => {
  it('shows divider controls when selected', () => {
    const markup = renderToStaticMarkup(
      <Table
        item={createTableItem()}
        isSelected={true}
        isEditing={false}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).toContain('table-v2-col-divider');
    expect(markup).toContain('table-v2-row-divider');
    expect(markup).not.toContain('table-v2-add-btn');
  });

  it('hides divider controls when not selected or editing', () => {
    const markup = renderToStaticMarkup(
      <Table
        item={createTableItem()}
        isSelected={false}
        isEditing={false}
        onUpdate={() => {}}
        onEditEnd={() => {}}
      />,
    );

    expect(markup).not.toContain('table-v2-col-divider');
    expect(markup).not.toContain('table-v2-row-divider');
    expect(markup).not.toContain('table-v2-add-btn');
  });

  it('snaps column divider positions to global grid coordinates', () => {
    const item = createTableItem({ x: 10, width: 360 });

    expect(getMagnetSnappedTableDividerPosition(item, 'col', 0.51)).toBeCloseTo(
      (192 - 10) / 360,
      5,
    );
  });

  it('snaps row divider positions to global grid coordinates', () => {
    const item = createTableItem({ y: 7, height: 240 });

    expect(getMagnetSnappedTableDividerPosition(item, 'row', 0.57)).toBeCloseTo(
      (144 - 7) / 240,
      5,
    );
  });
});
