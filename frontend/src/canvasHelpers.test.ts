import { describe, expect, it } from 'vitest';

import type { BoardItem } from './api';
import { getSelectionMagnetBounds } from './canvasHelpers';
import { buildSegmentGeometry } from './segmentData';
import { ITEM_CATEGORY, ITEM_TYPE } from './types';

function createBoardItem(
  overrides: Partial<BoardItem>,
): BoardItem {
  return {
    id: 'item-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.text_box,
    title: null,
    content: null,
    content_format: null,
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    rotation: 0,
    z_index: 1,
    is_collapsed: false,
    style_json: null,
    data_json: null,
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    ...overrides,
  };
}

describe('getSelectionMagnetBounds', () => {
  it('uses actual segment geometry instead of the padded item box', () => {
    const geometry = buildSegmentGeometry(
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    );
    const line = createBoardItem({
      id: 'line-1',
      category: ITEM_CATEGORY.shape,
      type: ITEM_TYPE.line,
      ...geometry,
    });

    const bounds = getSelectionMagnetBounds([line], [line.id]);

    expect(bounds).toEqual({
      x: 100,
      y: 100,
      width: 100,
      height: 0,
    });
  });

  it('keeps regular items on their normal bounding boxes', () => {
    const note = createBoardItem({
      id: 'note-1',
      category: ITEM_CATEGORY.small_item,
      type: ITEM_TYPE.sticky_note,
      x: 48,
      y: 72,
      width: 168,
      height: 144,
    });

    const bounds = getSelectionMagnetBounds([note], [note.id]);

    expect(bounds).toEqual({
      x: 48,
      y: 72,
      width: 168,
      height: 144,
    });
  });
});
