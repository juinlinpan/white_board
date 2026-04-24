import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { BoardItem } from './api';
import { Inspector } from './Inspector';
import { BACKGROUND_COLOR_OPTIONS, TEXT_COLOR_OPTIONS } from './itemStyles';
import { createTableData, serializeTableData } from './tableData';
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

type TestElement = ReactElement<{
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
}>;

function collectElements(
  node: ReactNode,
  predicate: (element: TestElement) => boolean,
): TestElement[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => collectElements(child, predicate));
  }

  if (!isValidElement(node)) {
    return [];
  }

  if (typeof node.type === 'function') {
    return collectElements(
      (node.type as (props: object) => ReactNode)(node.props as object),
      predicate,
    );
  }

  const element = node as TestElement;
  const matches = predicate(element) ? [element] : [];
  return [...matches, ...collectElements(element.props.children, predicate)];
}

describe('Inspector style palette', () => {
  it('renders a compact restore rail when the inspector is collapsed', () => {
    const markup = renderToStaticMarkup(
      <Inspector
        item={createBoardItem()}
        connector={null}
        selectionCount={1}
        childCount={0}
        selectedTableCellIds={[]}
        isCollapsed
        onUpdate={() => {}}
        onUpdateTableCells={() => {}}
        onDelete={() => {}}
        onToggleInspector={() => {}}
        onToggleCollapse={() => {}}
      />,
    );

    expect(markup).toContain('inspector-collapsed');
    expect(markup).toContain('Expand inspector');
    expect(markup).not.toContain('Line Style');
  });

  it('renders fixed swatch buttons instead of freeform color inputs for text items', () => {
    const markup = renderToStaticMarkup(
      <Inspector
        item={createBoardItem()}
        connector={null}
        selectionCount={1}
        childCount={0}
        selectedTableCellIds={[]}
        isCollapsed={false}
        onUpdate={() => {}}
        onUpdateTableCells={() => {}}
        onDelete={() => {}}
        onToggleInspector={() => {}}
        onToggleCollapse={() => {}}
      />,
    );

    const swatchCount = (markup.match(/inspector-swatch-button/g) ?? []).length;

    expect(markup).not.toContain('type="color"');
    expect(swatchCount).toBe(
      BACKGROUND_COLOR_OPTIONS.length + TEXT_COLOR_OPTIONS.length,
    );
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
        selectedTableCellIds={[]}
        isCollapsed={false}
        onUpdate={() => {}}
        onUpdateTableCells={() => {}}
        onDelete={() => {}}
        onToggleInspector={() => {}}
        onToggleCollapse={() => {}}
      />,
    );

    expect(markup).toContain('Line Style');
    expect(markup).not.toContain('ID');
  });

  it('routes background color changes to selected table cells instead of the whole table', () => {
    const tableData = createTableData(2, 2);
    const firstCellId = tableData.cells[0]?.[0]?.id;
    if (!firstCellId) {
      throw new Error('Missing fixture table cell');
    }

    const onUpdate = vi.fn();
    const onUpdateTableCells = vi.fn();
    const tree = Inspector({
      item: createBoardItem({
        category: ITEM_CATEGORY.shape,
        type: ITEM_TYPE.table,
        width: 320,
        height: 160,
        content: null,
        content_format: null,
        data_json: serializeTableData(tableData),
      }),
      connector: null,
      selectionCount: 1,
      childCount: 0,
      selectedTableCellIds: [firstCellId],
      isCollapsed: false,
      onUpdate,
      onUpdateTableCells,
      onDelete: () => {},
      onToggleInspector: () => {},
      onToggleCollapse: () => {},
    });

    const swatches = collectElements(
      tree,
      (element) =>
        element.type === 'button' &&
        typeof element.props.className === 'string' &&
        element.props.className.includes('inspector-swatch-button'),
    );
    const firstBackgroundSwatch = swatches[0];
    if (!firstBackgroundSwatch || !firstBackgroundSwatch.props.onClick) {
      throw new Error('Missing background swatch');
    }

    firstBackgroundSwatch.props.onClick();

    expect(onUpdate).not.toHaveBeenCalled();
    expect(onUpdateTableCells).toHaveBeenCalledWith(
      'item-1',
      [firstCellId],
      { backgroundColor: BACKGROUND_COLOR_OPTIONS[0]?.value },
    );
  });
});
