import { describe, expect, it } from 'vitest';

import {
  buildPageExportSnapshot,
  mergeImportedPageBoardState,
  parsePageImportText,
} from './pageTransfer';

describe('pageTransfer', () => {
  it('builds and parses a page snapshot payload', () => {
    const snapshotText = buildPageExportSnapshot({
      page: {
        id: 'page-1',
        project_id: 'project-1',
        name: 'Sprint board',
        sort_order: 0,
        viewport_x: 120,
        viewport_y: 80,
        zoom: 1.25,
        created_at: '2026-04-24T10:00:00.000Z',
        updated_at: '2026-04-24T10:00:00.000Z',
      },
      board_items: [
        {
          id: 'note-1',
          page_id: 'page-1',
          parent_item_id: null,
          category: 'small_item',
          type: 'sticky_note',
          title: null,
          content: 'Todo',
          content_format: null,
          x: 10,
          y: 20,
          width: 100,
          height: 80,
          rotation: 0,
          z_index: 1,
          is_collapsed: false,
          style_json: null,
          data_json: null,
          created_at: '2026-04-24T10:00:00.000Z',
          updated_at: '2026-04-24T10:00:00.000Z',
        },
      ],
      connector_links: [],
    });

    const imported = parsePageImportText(snapshotText);
    expect(imported.name).toBe('Sprint board');
    expect(imported.viewport).toEqual({ x: 120, y: 80, zoom: 1.25 });
    expect(imported.board_items[0]?.id).toBe('note-1');
  });

  it('merges imported items on top of existing page state with id remapping', () => {
    const imported = parsePageImportText(
      JSON.stringify({
        version: 1,
        kind: 'whiteboard-page',
        page: {
          name: 'Imported',
          viewport: { x: 0, y: 0, zoom: 1 },
          board_items: [
            {
              id: 'frame-old',
              parent_item_id: null,
              category: 'large_item',
              type: 'frame',
              title: null,
              content: null,
              content_format: null,
              x: 0,
              y: 0,
              width: 300,
              height: 200,
              rotation: 0,
              z_index: 0,
              is_collapsed: false,
              style_json: null,
              data_json: null,
            },
            {
              id: 'note-old',
              parent_item_id: 'frame-old',
              category: 'small_item',
              type: 'text_box',
              title: null,
              content: 'hello',
              content_format: null,
              x: 20,
              y: 20,
              width: 120,
              height: 60,
              rotation: 0,
              z_index: 1,
              is_collapsed: false,
              style_json: null,
              data_json: JSON.stringify({
                kind: 'segment',
                startConnection: { itemId: 'note-old', anchor: 'right' },
                endConnection: { itemId: 'frame-old', anchor: 'left' },
              }),
            },
          ],
          connector_links: [
            {
              connector_item_id: 'note-old',
              from_item_id: 'note-old',
              to_item_id: 'frame-old',
              from_anchor: 'right',
              to_anchor: 'left',
            },
          ],
        },
      }),
    );

    const ids = ['frame-new', 'note-new', 'connector-new'];
    const createId = () => {
      const id = ids.shift();
      if (id === undefined) {
        throw new Error('ran out');
      }

      return id;
    };

    const merged = mergeImportedPageBoardState(
      'page-target',
      {
        board_items: [
          {
            id: 'existing-1',
            page_id: 'page-target',
            parent_item_id: null,
            category: 'small_item',
            type: 'sticky_note',
            title: null,
            content: 'existing',
            content_format: null,
            x: 5,
            y: 5,
            width: 80,
            height: 60,
            rotation: 0,
            z_index: 0,
            is_collapsed: false,
            style_json: null,
            data_json: null,
            created_at: '2026-04-24T10:00:00.000Z',
            updated_at: '2026-04-24T10:00:00.000Z',
          },
        ],
        connector_links: [],
      },
      imported,
      {
        now: '2026-04-24T12:00:00.000Z',
        createId,
      },
    );

    expect(merged.board_items).toHaveLength(3);
    expect(merged.connector_links).toHaveLength(1);
    expect(merged.board_items[1]?.id).toBe('frame-new');
    expect(merged.board_items[2]).toMatchObject({
      id: 'note-new',
      parent_item_id: 'frame-new',
      page_id: 'page-target',
      created_at: '2026-04-24T12:00:00.000Z',
      updated_at: '2026-04-24T12:00:00.000Z',
    });
    expect(merged.connector_links[0]).toMatchObject({
      id: 'connector-new',
      connector_item_id: 'note-new',
      from_item_id: 'note-new',
      to_item_id: 'frame-new',
    });
  });
});
