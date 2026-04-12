import { describe, expect, it } from 'vitest';

import {
  parseProjectImportText,
  prepareImportedPageBoardState,
} from './projectImport';

describe('parseProjectImportText', () => {
  it('parses a wrapped v1 project import payload', () => {
    const snapshot = parseProjectImportText(
      JSON.stringify({
        version: 1,
        project: {
          name: 'Roadmap',
          pages: [
            {
              name: 'Q3 Plan',
              viewport: { x: 120, y: 80, zoom: 1.25 },
              board_items: [
                {
                  id: 'note-1',
                  category: 'small_item',
                  type: 'sticky_note',
                  x: 100,
                  y: 120,
                  width: 180,
                  height: 140,
                  content: 'Launch checklist',
                },
              ],
            },
          ],
        },
      }),
    );

    expect(snapshot).toEqual({
      version: 1,
      name: 'Roadmap',
      pages: [
        {
          name: 'Q3 Plan',
          viewport_x: 120,
          viewport_y: 80,
          zoom: 1.25,
          board_items: [
            {
              id: 'note-1',
              parent_item_id: null,
              category: 'small_item',
              type: 'sticky_note',
              title: null,
              content: 'Launch checklist',
              content_format: null,
              x: 100,
              y: 120,
              width: 180,
              height: 140,
              rotation: 0,
              z_index: 0,
              is_collapsed: false,
              style_json: null,
              data_json: null,
            },
          ],
          connector_links: [],
        },
      ],
    });
  });

  it('rejects connector references to missing board items', () => {
    expect(() =>
      parseProjectImportText(
        JSON.stringify({
          name: 'Broken',
          pages: [
            {
              name: 'Page 1',
              board_items: [
                {
                  id: 'note-1',
                  category: 'small_item',
                  type: 'text_box',
                  x: 0,
                  y: 0,
                  width: 200,
                  height: 100,
                },
              ],
              connector_links: [
                {
                  connector_item_id: 'missing-arrow',
                  from_item_id: 'note-1',
                },
              ],
            },
          ],
        }),
      ),
    ).toThrow(/connector_item_id references missing item "missing-arrow"/);
  });
});

describe('prepareImportedPageBoardState', () => {
  it('remaps item ids, parent ids, connector ids, and segment data connections', () => {
    const nextIds = [
      'note-new',
      'frame-new',
      'arrow-new',
      'connector-new',
    ];
    const createId = () => {
      const nextId = nextIds.shift();
      if (nextId === undefined) {
        throw new Error('Ran out of ids');
      }

      return nextId;
    };

    const boardState = prepareImportedPageBoardState(
      'page-new',
      {
        name: 'Import Page',
        viewport_x: 0,
        viewport_y: 0,
        zoom: 1,
        board_items: [
          {
            id: 'note-old',
            parent_item_id: 'frame-old',
            category: 'small_item',
            type: 'sticky_note',
            title: null,
            content: 'Ship it',
            content_format: null,
            x: 40,
            y: 80,
            width: 160,
            height: 120,
            rotation: 0,
            z_index: 1,
            is_collapsed: false,
            style_json: null,
            data_json: null,
          },
          {
            id: 'frame-old',
            parent_item_id: null,
            category: 'large_item',
            type: 'frame',
            title: 'Sprint',
            content: null,
            content_format: null,
            x: 0,
            y: 0,
            width: 320,
            height: 240,
            rotation: 0,
            z_index: 0,
            is_collapsed: false,
            style_json: null,
            data_json: null,
          },
          {
            id: 'arrow-old',
            parent_item_id: null,
            category: 'connector',
            type: 'arrow',
            title: null,
            content: null,
            content_format: null,
            x: 0,
            y: 0,
            width: 260,
            height: 80,
            rotation: 0,
            z_index: 2,
            is_collapsed: false,
            style_json: null,
            data_json: JSON.stringify({
              kind: 'segment',
              start: { x: 20, y: 40 },
              end: { x: 240, y: 40 },
              startConnection: { itemId: 'note-old', anchor: 'right' },
              endConnection: { itemId: 'frame-old', anchor: 'left' },
            }),
          },
        ],
        connector_links: [
          {
            connector_item_id: 'arrow-old',
            from_item_id: 'note-old',
            to_item_id: 'frame-old',
            from_anchor: 'right',
            to_anchor: 'left',
          },
        ],
      },
      {
        now: '2026-04-12T12:00:00.000Z',
        createId,
      },
    );

    expect(boardState.board_items).toHaveLength(3);
    expect(boardState.connector_links).toHaveLength(1);

    const importedNote = boardState.board_items.find(
      (item) => item.type === 'sticky_note',
    );
    const importedArrow = boardState.board_items.find(
      (item) => item.type === 'arrow',
    );

    expect(importedNote).toMatchObject({
      id: 'note-new',
      page_id: 'page-new',
      parent_item_id: 'frame-new',
      created_at: '2026-04-12T12:00:00.000Z',
      updated_at: '2026-04-12T12:00:00.000Z',
    });

    expect(importedArrow?.data_json).toBe(
      JSON.stringify({
        kind: 'segment',
        start: { x: 20, y: 40 },
        end: { x: 240, y: 40 },
        startConnection: { itemId: 'note-new', anchor: 'right' },
        endConnection: { itemId: 'frame-new', anchor: 'left' },
      }),
    );

    expect(boardState.connector_links[0]).toEqual({
      id: 'connector-new',
      connector_item_id: 'arrow-new',
      from_item_id: 'note-new',
      to_item_id: 'frame-new',
      from_anchor: 'right',
      to_anchor: 'left',
    });
  });
});
