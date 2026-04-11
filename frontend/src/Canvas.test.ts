import { describe, expect, it } from 'vitest';

import type { BoardItem, ConnectorLink } from './api';
import {
  getAutoAnchors,
  getConnectorPoints,
  summarizeFrameChild,
} from './canvasHelpers';
import { ITEM_CATEGORY, ITEM_TYPE } from './types';

const FIXTURE_TIMESTAMP = '2026-04-11T00:00:00+00:00';

function createBoardItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'item-1',
    page_id: 'page-1',
    parent_item_id: null,
    category: ITEM_CATEGORY.small_item,
    type: ITEM_TYPE.text_box,
    title: null,
    content: null,
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
    from_item_id: 'from-item',
    to_item_id: 'to-item',
    from_anchor: null,
    to_anchor: null,
    ...overrides,
  };
}

describe('summarizeFrameChild', () => {
  it('keeps full text for text boxes', () => {
    const summary = summarizeFrameChild(
      createBoardItem({
        id: 'text-1',
        type: ITEM_TYPE.text_box,
        content: '完整顯示的文字框內容',
      }),
    );

    expect(summary).toEqual({
      id: 'text-1',
      type: ITEM_TYPE.text_box,
      title: '文字框',
      body: '完整顯示的文字框內容',
    });
  });

  it('ellipsizes sticky note content', () => {
    const summary = summarizeFrameChild(
      createBoardItem({
        id: 'sticky-1',
        type: ITEM_TYPE.sticky_note,
        content: 'A'.repeat(90),
      }),
    );

    expect(summary.title).toBe('便利貼');
    expect(summary.body).toBe(`${'A'.repeat(80)}…`);
  });

  it('uses the first markdown H1 for note paper summaries', () => {
    const summary = summarizeFrameChild(
      createBoardItem({
        id: 'note-1',
        type: ITEM_TYPE.note_paper,
        content: '前言\n# Sprint Plan\n- backlog',
        content_format: 'markdown',
      }),
    );

    expect(summary).toEqual({
      id: 'note-1',
      type: ITEM_TYPE.note_paper,
      title: 'Sprint Plan',
      body: 'Markdown H1 摘要',
    });
  });

  it('falls back to the first non-empty line when note paper has no H1', () => {
    const summary = summarizeFrameChild(
      createBoardItem({
        id: 'note-2',
        type: ITEM_TYPE.note_paper,
        content: '\n\n整理待辦\n## Next',
        content_format: 'markdown',
      }),
    );

    expect(summary).toEqual({
      id: 'note-2',
      type: ITEM_TYPE.note_paper,
      title: '整理待辦',
      body: '未找到 H1，改用第一行內容',
    });
  });
});

describe('connector geometry helpers', () => {
  it('prefers horizontal anchors when horizontal distance dominates', () => {
    const anchors = getAutoAnchors(
      createBoardItem({ x: 0, y: 0, width: 100, height: 80 }),
      createBoardItem({ x: 320, y: 40, width: 120, height: 80 }),
    );

    expect(anchors).toEqual({
      from_anchor: 'right',
      to_anchor: 'left',
    });
  });

  it('prefers vertical anchors when vertical distance dominates', () => {
    const anchors = getAutoAnchors(
      createBoardItem({ x: 0, y: 0, width: 120, height: 80 }),
      createBoardItem({ x: 20, y: 260, width: 120, height: 80 }),
    );

    expect(anchors).toEqual({
      from_anchor: 'bottom',
      to_anchor: 'top',
    });
  });

  it('computes connector points from inferred anchors', () => {
    const fromItem = createBoardItem({
      id: 'from-item',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const toItem = createBoardItem({
      id: 'to-item',
      x: 300,
      y: 20,
      width: 120,
      height: 100,
    });

    expect(getConnectorPoints(createConnector(), [fromItem, toItem])).toEqual({
      fromPoint: { x: 100, y: 40 },
      toPoint: { x: 300, y: 70 },
    });
  });

  it('updates connector geometry when a connected item moves', () => {
    const fromItem = createBoardItem({
      id: 'from-item',
      x: 0,
      y: 0,
      width: 100,
      height: 80,
    });
    const toItem = createBoardItem({
      id: 'to-item',
      x: 300,
      y: 20,
      width: 120,
      height: 100,
    });

    const beforeMove = getConnectorPoints(createConnector(), [fromItem, toItem]);
    const afterMove = getConnectorPoints(createConnector(), [
      fromItem,
      {
        ...toItem,
        x: 40,
        y: 260,
      },
    ]);

    expect(beforeMove).toEqual({
      fromPoint: { x: 100, y: 40 },
      toPoint: { x: 300, y: 70 },
    });
    expect(afterMove).toEqual({
      fromPoint: { x: 50, y: 80 },
      toPoint: { x: 100, y: 260 },
    });
  });

  it('hides connector points for items inside collapsed frames', () => {
    const frame = createBoardItem({
      id: 'frame-1',
      category: ITEM_CATEGORY.large_item,
      type: ITEM_TYPE.frame,
      width: 320,
      height: 220,
      is_collapsed: true,
    });
    const child = createBoardItem({
      id: 'from-item',
      parent_item_id: frame.id,
      x: 40,
      y: 60,
      width: 160,
      height: 80,
    });
    const target = createBoardItem({
      id: 'to-item',
      x: 420,
      y: 80,
      width: 180,
      height: 100,
    });

    expect(getConnectorPoints(createConnector(), [frame, child, target])).toBeNull();
  });
});
