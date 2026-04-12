import { describe, expect, it } from 'vitest';

import type { BoardItem } from './api';
import {
  buildSegmentGeometry,
  getSegmentConnections,
  getSegmentWorldPoints,
  normalizeSegmentDraft,
  updateSegmentEndpoint,
} from './segmentData';
import { ITEM_CATEGORY, ITEM_TYPE } from './types';

const FIXTURE_TIMESTAMP = '2026-04-12T00:00:00+00:00';

function createBoardItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'item-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.shape,
    type: ITEM_TYPE.line,
    title: null,
    content: null,
    content_format: null,
    x: 0,
    y: 0,
    width: 200,
    height: 80,
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

describe('segmentData', () => {
  it('expands click-only drafts into a short horizontal segment', () => {
    expect(
      normalizeSegmentDraft({ x: 120, y: 80 }, { x: 120, y: 80 }),
    ).toEqual({
      start: { x: 120, y: 80 },
      end: { x: 240, y: 80 },
    });
  });

  it('stores freeform segment endpoints in data_json and bounding box', () => {
    const geometry = buildSegmentGeometry(
      { x: 100, y: 80 },
      { x: 260, y: 190 },
    );

    const item = createBoardItem({
      type: ITEM_TYPE.arrow,
      category: ITEM_CATEGORY.connector,
      ...geometry,
    });

    expect(geometry).toMatchObject({
      x: 80,
      y: 60,
      width: 200,
      height: 150,
      rotation: 0,
    });
    expect(getSegmentWorldPoints(item)).toEqual({
      start: { x: 100, y: 80 },
      end: { x: 260, y: 190 },
    });
  });

  it('updates a single endpoint and rebuilds the stored bounds', () => {
    const item = createBoardItem({
      ...buildSegmentGeometry({ x: 100, y: 80 }, { x: 260, y: 190 }),
    });

    const updated = updateSegmentEndpoint(item, 'end', { x: 320, y: 140 });
    expect(updated).not.toBeNull();

    expect(
      getSegmentWorldPoints(
        createBoardItem({
          ...(updated as NonNullable<typeof updated>),
        }),
      ),
    ).toEqual({
      start: { x: 100, y: 80 },
      end: { x: 320, y: 140 },
    });
  });

  it('keeps legacy rotated lines readable even without segment data', () => {
    const legacyLine = createBoardItem({
      width: 200,
      height: 80,
      rotation: 90,
    });

    expect(getSegmentWorldPoints(legacyLine)).toEqual({
      start: { x: 100, y: -56 },
      end: { x: 100, y: 136 },
    });
  });

  it('stores and retrieves segment connections from data_json', () => {
    const startConn = { itemId: 'box-a', anchor: 'right' };
    const endConn = { itemId: 'box-b', anchor: 'left' };

    const geometry = buildSegmentGeometry(
      { x: 100, y: 80 },
      { x: 260, y: 190 },
      startConn,
      endConn,
    );

    const item = createBoardItem({
      type: ITEM_TYPE.arrow,
      category: ITEM_CATEGORY.connector,
      ...geometry,
    });

    const connections = getSegmentConnections(item);
    expect(connections.startConnection).toEqual(startConn);
    expect(connections.endConnection).toEqual(endConn);
  });

  it('preserves connections on the untouched endpoint when updating', () => {
    const startConn = { itemId: 'box-a', anchor: 'right' };
    const endConn = { itemId: 'box-b', anchor: 'left' };

    const item = createBoardItem({
      ...buildSegmentGeometry(
        { x: 100, y: 80 },
        { x: 260, y: 190 },
        startConn,
        endConn,
      ),
    });

    const updated = updateSegmentEndpoint(item, 'end', { x: 320, y: 140 }, {
      itemId: 'box-c',
      anchor: 'top',
    });

    expect(updated).not.toBeNull();
    const updatedItem = createBoardItem({ ...updated! });
    const conns = getSegmentConnections(updatedItem);
    expect(conns.startConnection).toEqual(startConn);
    expect(conns.endConnection).toEqual({ itemId: 'box-c', anchor: 'top' });
  });
});
