import { describe, expect, it } from 'vitest';

import type { BoardItem } from './api';
import {
  findFrameDropTarget,
  getFrameEjectPosition,
  getFrameChildFitSize,
  findNearestConnectorAnchor,
  getFrameOverlapScore,
  getItemConnectorAnchors,
  getItemsNearPoint,
} from './canvasHelpers';
import { ITEM_CATEGORY, ITEM_TYPE } from './types';

const TS = '2026-01-01T00:00:00+00:00';

function makeItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'item-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.text_box,
    title: null,
    content: null,
    content_format: null,
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    rotation: 0,
    z_index: 0,
    is_collapsed: false,
    style_json: null,
    data_json: null,
    created_at: TS,
    updated_at: TS,
    ...overrides,
  };
}

describe('connector anchor helpers', () => {
  it('returns four cardinal anchor points for an item', () => {
    const item = makeItem({ x: 100, y: 100, width: 200, height: 100 });
    const anchors = getItemConnectorAnchors(item);

    expect(anchors).toHaveLength(4);

    const map = Object.fromEntries(anchors.map((a) => [a.anchor, a.point]));
    expect(map.top).toEqual({ x: 200, y: 100 });
    expect(map.right).toEqual({ x: 300, y: 150 });
    expect(map.bottom).toEqual({ x: 200, y: 200 });
    expect(map.left).toEqual({ x: 100, y: 150 });
  });

  it('finds the nearest anchor within threshold', () => {
    const item = makeItem({ id: 'box-a', x: 100, y: 100, width: 200, height: 100 });

    // Point near the right anchor (300, 150)
    const hit = findNearestConnectorAnchor(
      { x: 310, y: 150 },
      [item],
      new Set(),
      24,
    );

    expect(hit).not.toBeNull();
    expect(hit!.itemId).toBe('box-a');
    expect(hit!.anchor).toBe('right');
    expect(hit!.point).toEqual({ x: 300, y: 150 });
  });

  it('returns null when no anchor is within threshold', () => {
    const item = makeItem({ id: 'box-a', x: 100, y: 100, width: 200, height: 100 });

    const hit = findNearestConnectorAnchor(
      { x: 500, y: 500 },
      [item],
      new Set(),
      24,
    );

    expect(hit).toBeNull();
  });

  it('excludes specified item ids from anchor search', () => {
    const item = makeItem({ id: 'box-a', x: 100, y: 100, width: 200, height: 100 });

    const hit = findNearestConnectorAnchor(
      { x: 300, y: 150 },
      [item],
      new Set(['box-a']),
      24,
    );

    expect(hit).toBeNull();
  });

  it('ignores non-connectable items like lines', () => {
    const lineItem = makeItem({
      id: 'line-1',
      category: ITEM_CATEGORY.shape,
      type: ITEM_TYPE.line,
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });

    const hit = findNearestConnectorAnchor(
      { x: 200, y: 100 },
      [lineItem],
      new Set(),
      24,
    );

    expect(hit).toBeNull();
  });

  it('returns nearby connectable items', () => {
    const box = makeItem({ id: 'box-a', x: 100, y: 100, width: 200, height: 100 });
    const farBox = makeItem({ id: 'box-b', x: 1000, y: 1000, width: 200, height: 100 });

    const near = getItemsNearPoint(
      { x: 310, y: 150 },
      [box, farBox],
      new Set(),
      24,
    );

    expect(near).toHaveLength(1);
    expect(near[0].id).toBe('box-a');
  });
});

describe('frame drop helpers', () => {
  it('prefers frames whose overlap exceeds 25% of the dragged item', () => {
    const frame = makeItem({
      id: 'frame-1',
      category: ITEM_CATEGORY.large_item,
      type: ITEM_TYPE.frame,
      x: 200,
      y: 120,
      width: 320,
      height: 240,
    });
    const dragged = makeItem({
      id: 'card-1',
      x: 140,
      y: 160,
      width: 220,
      height: 120,
    });

    expect(getFrameOverlapScore(dragged, frame)).toBeGreaterThan(0.25);
    expect(findFrameDropTarget(dragged, [dragged, frame])?.id).toBe('frame-1');
  });

  it('does not target frames when overlap stays below the threshold', () => {
    const frame = makeItem({
      id: 'frame-1',
      category: ITEM_CATEGORY.large_item,
      type: ITEM_TYPE.frame,
      x: 300,
      y: 120,
      width: 320,
      height: 240,
    });
    const dragged = makeItem({
      id: 'card-1',
      x: 120,
      y: 160,
      width: 140,
      height: 100,
    });

    expect(getFrameOverlapScore(dragged, frame)).toBeLessThan(0.25);
    expect(findFrameDropTarget(dragged, [dragged, frame])).toBeNull();
  });

  it('ignores collapsed frames during drop targeting', () => {
    const frame = makeItem({
      id: 'frame-1',
      category: ITEM_CATEGORY.large_item,
      type: ITEM_TYPE.frame,
      x: 200,
      y: 120,
      width: 320,
      height: 240,
      is_collapsed: true,
    });
    const dragged = makeItem({
      id: 'card-1',
      x: 220,
      y: 160,
      width: 140,
      height: 100,
    });

    expect(findFrameDropTarget(dragged, [dragged, frame])).toBeNull();
  });

  it('scales oversized items down to 60% of the frame while preserving aspect ratio', () => {
    const frame = makeItem({
      id: 'frame-1',
      category: ITEM_CATEGORY.large_item,
      type: ITEM_TYPE.frame,
      width: 300,
      height: 200,
    });
    const dragged = makeItem({
      id: 'card-1',
      width: 260,
      height: 180,
    });

    expect(getFrameChildFitSize(dragged, frame)).toEqual({
      width: 173,
      height: 120,
    });
  });

  it('pushes ejected items fully outside the nearest horizontal frame edge', () => {
    const frame = makeItem({
      id: 'frame-1',
      category: ITEM_CATEGORY.large_item,
      type: ITEM_TYPE.frame,
      x: 200,
      y: 100,
      width: 320,
      height: 240,
    });
    const dragged = makeItem({
      id: 'card-1',
      x: 430,
      y: 160,
      width: 120,
      height: 100,
    });

    expect(getFrameEjectPosition(dragged, frame)).toEqual({
      x: 544,
      y: 160,
    });
  });

  it('pushes ejected items fully outside the nearest vertical frame edge', () => {
    const frame = makeItem({
      id: 'frame-1',
      category: ITEM_CATEGORY.large_item,
      type: ITEM_TYPE.frame,
      x: 200,
      y: 100,
      width: 320,
      height: 240,
    });
    const dragged = makeItem({
      id: 'card-1',
      x: 280,
      y: 80,
      width: 120,
      height: 100,
    });

    expect(getFrameEjectPosition(dragged, frame)).toEqual({
      x: 280,
      y: -24,
    });
  });
});
