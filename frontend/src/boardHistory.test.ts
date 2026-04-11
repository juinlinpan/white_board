import { describe, expect, it } from 'vitest';

import type { BoardItem, ConnectorLink } from './api';
import {
  areBoardSnapshotsEqual,
  createBoardHistoryEntry,
  type BoardHistoryEntry,
  type BoardSnapshot,
  prepareRedoHistory,
  prepareUndoHistory,
  pushUndoHistory,
} from './boardHistory';
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
    content: 'Base item',
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

function createConnector(
  overrides: Partial<ConnectorLink> = {},
): ConnectorLink {
  return {
    id: 'connector-1',
    connector_item_id: 'arrow-1',
    from_item_id: 'item-1',
    to_item_id: 'item-2',
    from_anchor: 'right',
    to_anchor: 'left',
    ...overrides,
  };
}

function createSnapshot(overrides: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    items: [createBoardItem()],
    connectors: [],
    selectedIds: ['item-1'],
    ...overrides,
  };
}

describe('pushUndoHistory', () => {
  it('deduplicates identical snapshots', () => {
    const base = createSnapshot();
    const firstPush = pushUndoHistory([], base, 10);
    const secondPush = pushUndoHistory(firstPush.undoStack, base, 10);

    expect(firstPush.added).toBe(true);
    expect(secondPush.added).toBe(false);
    expect(secondPush.undoStack).toHaveLength(1);
  });

  it('keeps only the newest snapshots within the max size', () => {
    let undoStack: BoardHistoryEntry[] = [];

    for (let index = 0; index < 4; index += 1) {
      undoStack = pushUndoHistory(
        undoStack,
        createSnapshot({
          items: [createBoardItem({ id: `item-${index}`, x: index * 20 })],
          selectedIds: [`item-${index}`],
        }),
        3,
      ).undoStack;
    }

    expect(undoStack).toHaveLength(3);
    expect(undoStack.map((entry) => entry.snapshot.items[0]?.id)).toEqual([
      'item-1',
      'item-2',
      'item-3',
    ]);
  });
});

describe('history transitions', () => {
  it('moves the current snapshot to redo when undoing', () => {
    const olderSnapshot = createSnapshot({
      items: [createBoardItem({ id: 'older', x: 24 })],
      selectedIds: ['older'],
    });
    const currentSnapshot = createSnapshot({
      items: [createBoardItem({ id: 'current', x: 180 })],
      selectedIds: ['current'],
    });

    const transition = prepareUndoHistory(
      [createBoardHistoryEntry(olderSnapshot)],
      [],
      currentSnapshot,
      5,
    );

    expect(transition.targetSnapshot).toEqual(olderSnapshot);
    expect(transition.undoStack).toHaveLength(0);
    expect(transition.redoStack).toHaveLength(1);
    expect(transition.redoStack[0]?.snapshot).toEqual(currentSnapshot);
  });

  it('moves the current snapshot back to undo when redoing', () => {
    const currentSnapshot = createSnapshot({
      items: [createBoardItem({ id: 'current', x: 24 })],
      selectedIds: ['current'],
    });
    const redoSnapshot = createSnapshot({
      items: [
        createBoardItem({ id: 'after-redo', x: 360 }),
        createBoardItem({
          id: 'frame-1',
          category: ITEM_CATEGORY.large_item,
          type: ITEM_TYPE.frame,
          width: 320,
          height: 220,
        }),
      ],
      connectors: [
        createConnector({
          connector_item_id: 'arrow-1',
          from_item_id: 'after-redo',
          to_item_id: 'frame-1',
        }),
      ],
      selectedIds: ['after-redo'],
    });

    const transition = prepareRedoHistory(
      [],
      [createBoardHistoryEntry(redoSnapshot)],
      currentSnapshot,
      5,
    );

    expect(transition.targetSnapshot).toEqual(redoSnapshot);
    expect(transition.redoStack).toHaveLength(0);
    expect(transition.undoStack).toHaveLength(1);
    expect(transition.undoStack[0]?.snapshot).toEqual(currentSnapshot);
  });

  it('compares snapshots by normalized content instead of array order', () => {
    const left = createSnapshot({
      items: [
        createBoardItem({ id: 'b', x: 40 }),
        createBoardItem({ id: 'a', x: 20 }),
      ],
      connectors: [
        createConnector({ id: 'z', connector_item_id: 'arrow-z' }),
        createConnector({ id: 'a', connector_item_id: 'arrow-a' }),
      ],
      selectedIds: ['b', 'a'],
    });
    const right = createSnapshot({
      items: [
        createBoardItem({ id: 'a', x: 20 }),
        createBoardItem({ id: 'b', x: 40 }),
      ],
      connectors: [
        createConnector({ id: 'a', connector_item_id: 'arrow-a' }),
        createConnector({ id: 'z', connector_item_id: 'arrow-z' }),
      ],
      selectedIds: ['a', 'b'],
    });

    expect(areBoardSnapshotsEqual(left, right)).toBe(true);
  });
});
