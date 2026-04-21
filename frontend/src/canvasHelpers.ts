import type { BoardItem, BoardItemPayload, ConnectorLink, ConnectorLinkPayload } from './api';
import type { FrameSummaryEntry } from './items/Frame';
import {
  buildSegmentGeometry,
  canTranslateSegmentItem,
  getSegmentConnections,
  getSegmentAllWorldPoints,
  getSegmentWaypoints,
  getSegmentWorldPoints,
  hasStoredSegmentData,
} from './segmentData';
import {
  parseTableData,
  getRootCellAt,
  getEffectiveColEdge,
  getEffectiveRowEdge,
  getCellBounds as getTableCellBoundsFrac,
  getTableMinSizeFromDataJson,
} from './tableData';
import { ITEM_CATEGORY, ITEM_MIN_SIZE, ITEM_TYPE } from './types';

type Anchor =
  | 'top_left'
  | 'top'
  | 'top_right'
  | 'right'
  | 'bottom_right'
  | 'bottom'
  | 'bottom_left'
  | 'left';

export type { Anchor };

type Point = {
  x: number;
  y: number;
};

export type AnchorHit = {
  itemId: string;
  anchor: Anchor;
  point: Point;
  distance: number;
};

type RectLike = Pick<BoardItem, 'x' | 'y' | 'width' | 'height'>;

/** The four cardinal anchors used for connector snapping (draw.io style). */
const CONNECTOR_ANCHORS: Anchor[] = ['top', 'right', 'bottom', 'left'];
export const FRAME_DROP_OVERLAP_THRESHOLD = 0.25;
export const FRAME_CHILD_MAX_RATIO = 0.6;

const DIRECTIONAL_ANCHORS: Anchor[] = [
  'right',
  'bottom_right',
  'bottom',
  'bottom_left',
  'left',
  'top_left',
  'top',
  'top_right',
];

const ALL_ANCHORS = new Set<Anchor>([
  'top_left',
  'top',
  'top_right',
  'right',
  'bottom_right',
  'bottom',
  'bottom_left',
  'left',
]);

export function isAnchor(value: string | null | undefined): value is Anchor {
  return value !== null && value !== undefined && ALL_ANCHORS.has(value as Anchor);
}

export function isHiddenByCollapsedFrame(
  item: BoardItem,
  items: BoardItem[],
): boolean {
  if (item.parent_item_id === null) {
    return false;
  }

  const parent = items.find(
    (candidate) => candidate.id === item.parent_item_id,
  );
  return parent?.type === ITEM_TYPE.frame && parent.is_collapsed;
}

function getItemCenter(item: BoardItem): Point {
  return {
    x: item.x + item.width / 2,
    y: item.y + item.height / 2,
  };
}

export function getFirstNonEmptyLine(content: string | null): string | null {
  if (content === null) {
    return null;
  }

  for (const line of content.split(/\r?\n/)) {
    const normalized = line.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return null;
}

export function getMarkdownH1(content: string | null): string | null {
  if (content === null) {
    return null;
  }

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+)$/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

export function ellipsize(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}…`;
}

export function summarizeFrameChild(item: BoardItem): FrameSummaryEntry {
  const text = item.content?.trim() ?? '';

  if (item.type === ITEM_TYPE.text_box) {
    return {
      id: item.id,
      type: item.type,
      title: '文字框',
      body: text.length > 0 ? text : '尚未輸入文字',
    };
  }

  if (item.type === ITEM_TYPE.sticky_note) {
    return {
      id: item.id,
      type: item.type,
      title: '便利貼',
      body: text.length > 0 ? ellipsize(text, 80) : '尚未輸入內容',
    };
  }

  const h1 = getMarkdownH1(text);
  const fallback = getFirstNonEmptyLine(text);

  return {
    id: item.id,
    type: item.type,
    title: h1 ?? fallback ?? 'Untitled note',
    body: h1 !== null ? 'Markdown H1 摘要' : '未找到 H1，改用第一行內容',
  };
}

export function getFrameChildren(items: BoardItem[], frameId: string): BoardItem[] {
  return items
    .filter((item) => item.parent_item_id === frameId)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.z_index - b.z_index);
}

function getIntersectionArea(left: RectLike, right: RectLike): number {
  const overlapWidth =
    Math.min(left.x + left.width, right.x + right.width) -
    Math.max(left.x, right.x);
  const overlapHeight =
    Math.min(left.y + left.height, right.y + right.height) -
    Math.max(left.y, right.y);

  if (overlapWidth <= 0 || overlapHeight <= 0) {
    return 0;
  }

  return overlapWidth * overlapHeight;
}

export function getFrameOverlapScore(item: BoardItem, frame: BoardItem): number {
  const intersectionArea = getIntersectionArea(item, frame);
  if (intersectionArea === 0) {
    return 0;
  }

  const itemArea = item.width * item.height;
  const frameArea = frame.width * frame.height;
  if (itemArea <= 0 || frameArea <= 0) {
    return 0;
  }

  return Math.max(intersectionArea / itemArea, intersectionArea / frameArea);
}

export function findFrameDropTarget(
  item: BoardItem,
  items: BoardItem[],
  threshold = FRAME_DROP_OVERLAP_THRESHOLD,
): BoardItem | null {
  if (!isSmallItem(item)) {
    return null;
  }

  const candidates = items
    .filter(
      (candidate) =>
        candidate.type === ITEM_TYPE.frame &&
        candidate.id !== item.id &&
        !candidate.is_collapsed,
    )
    .map((frame) => ({
      frame,
      score: getFrameOverlapScore(item, frame),
    }))
    .filter(({ score }) => score >= threshold)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      const leftArea = left.frame.width * left.frame.height;
      const rightArea = right.frame.width * right.frame.height;
      if (leftArea !== rightArea) {
        return leftArea - rightArea;
      }

      return right.frame.z_index - left.frame.z_index;
    });

  return candidates[0]?.frame ?? null;
}

// ── Table cell drop target ─────────────────────────────────────────────────

export type TableCellHit = {
  tableId: string;
  cellId: string;
  row: number;
  col: number;
};

/**
 * When dragging a small item, find the table (and cell) it is hovering over,
 * if the cell is empty (no embed). Returns null if no valid target found.
 */
export function findTableCellDropTarget(
  item: BoardItem,
  items: BoardItem[],
): TableCellHit | null {
  if (!isSmallItem(item)) return null;

  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;

  // Check all table items sorted by z-index descending (topmost first)
  const tables = items
    .filter(
      (candidate) =>
        candidate.type === ITEM_TYPE.table && candidate.id !== item.id,
    )
    .sort((a, b) => b.z_index - a.z_index);

  for (const table of tables) {
    if (
      centerX < table.x ||
      centerX > table.x + table.width ||
      centerY < table.y ||
      centerY > table.y + table.height
    ) {
      continue;
    }

    const tableData = parseTableData(table.data_json);
    const localX = centerX - table.x;
    const localY = centerY - table.y;
    const fracX = localX / table.width;
    const fracY = localY / table.height;

    // Find column index using effective edge positions
    // Two-pass: first find approximate row, then use it for accurate column lookup,
    // then refine row using the found column (handles per-segment divider overrides).
    let col = -1;
    let row = -1;

    // Pass 1: approximate row using col=0
    for (let r = 0; r < tableData.rows; r++) {
      const top = getEffectiveRowEdge(tableData, r, 0);
      const bottom = getEffectiveRowEdge(tableData, r + 1, 0);
      if (fracY >= top && fracY < bottom) {
        row = r;
        break;
      }
    }
    if (row === -1) row = tableData.rows - 1; // fallback to last row

    // Pass 2: find column using the found row
    for (let c = 0; c < tableData.cols; c++) {
      const left = getEffectiveColEdge(tableData, c, row);
      const right = getEffectiveColEdge(tableData, c + 1, row);
      if (fracX >= left && fracX < right) {
        col = c;
        break;
      }
    }

    // Pass 3: refine row using the found column
    if (col >= 0) {
      for (let r = 0; r < tableData.rows; r++) {
        const top = getEffectiveRowEdge(tableData, r, col);
        const bottom = getEffectiveRowEdge(tableData, r + 1, col);
        if (fracY >= top && fracY < bottom) {
          row = r;
          break;
        }
      }
    }

    if (col === -1 || row === -1) continue;

    // Resolve to root cell (handles null spans)
    const rootHit = getRootCellAt(tableData, row, col);
    if (!rootHit) continue;

    // Skip if the cell is a null span
    if (!rootHit.cell) continue;

    return {
      tableId: table.id,
      cellId: rootHit.cell.id,
      row: rootHit.row,
      col: rootHit.col,
    };
  }

  return null;
}

/**
 * Compute the world-space bounding box of a table cell (accounting for rowSpan/colSpan).
 */
export function getTableCellBounds(
  table: BoardItem,
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
): { x: number; y: number; width: number; height: number } {
  const parsed = parseTableData(table.data_json);
  const frac = getTableCellBoundsFrac(parsed, row, col, colSpan, rowSpan);
  return {
    x: table.x + frac.left * table.width,
    y: table.y + frac.top * table.height,
    width: frac.width * table.width,
    height: frac.height * table.height,
  };
}

/**
 * Compute the position and size of one child item within a table cell,
 * given how many items share the cell (1–3) and which index this item is.
 * When multiple items share a cell, the cell is split along its longer axis.
 */
export function computeCellChildLayout(
  cellBounds: { x: number; y: number; width: number; height: number },
  childIndex: number,
  childCount: number,
  inset: number,
): { x: number; y: number; width: number; height: number } {
  if (childCount <= 1) {
    return {
      x: cellBounds.x + inset,
      y: cellBounds.y + inset,
      width: Math.max(1, cellBounds.width - inset * 2),
      height: Math.max(1, cellBounds.height - inset * 2),
    };
  }
  // N items (2 or 3): split evenly along the longer axis
  const n = childCount;
  const splitHorizontally = cellBounds.width >= cellBounds.height;
  if (splitHorizontally) {
    const sliceW = cellBounds.width / n;
    return {
      x: cellBounds.x + sliceW * childIndex + inset,
      y: cellBounds.y + inset,
      width: Math.max(1, sliceW - inset * 2),
      height: Math.max(1, cellBounds.height - inset * 2),
    };
  } else {
    const sliceH = cellBounds.height / n;
    return {
      x: cellBounds.x + inset,
      y: cellBounds.y + sliceH * childIndex + inset,
      width: Math.max(1, cellBounds.width - inset * 2),
      height: Math.max(1, sliceH - inset * 2),
    };
  }
}

const TABLE_CELL_INSET = 8;

export function relayoutTableItems(
  items: BoardItem[],
  tableIds: string[],
): { items: BoardItem[]; changedIds: string[] } {
  let nextItems = items;
  const changedIds = new Set<string>();

  for (const tableId of new Set(tableIds)) {
    const table = nextItems.find(
      (item) => item.id === tableId && item.type === ITEM_TYPE.table,
    );
    if (!table) {
      continue;
    }

    const tableData = parseTableData(table.data_json);
    const itemById = new Map(nextItems.map((item) => [item.id, item] as const));
    const updates = new Map<string, BoardItem>();

    for (let row = 0; row < tableData.rows; row += 1) {
      for (let col = 0; col < tableData.cols; col += 1) {
        const cell = tableData.cells[row]?.[col];
        if (!cell || cell.childItemIds.length === 0) {
          continue;
        }

        const cellBounds = getTableCellBounds(
          table,
          row,
          col,
          cell.rowSpan,
          cell.colSpan,
        );

        cell.childItemIds.forEach((childId, childIndex) => {
          const child = itemById.get(childId);
          if (!child || child.parent_item_id !== table.id) {
            return;
          }

          const layout = computeCellChildLayout(
            cellBounds,
            childIndex,
            cell.childItemIds.length,
            TABLE_CELL_INSET,
          );

          if (
            child.x === layout.x &&
            child.y === layout.y &&
            child.width === layout.width &&
            child.height === layout.height
          ) {
            return;
          }

          updates.set(child.id, {
            ...child,
            x: layout.x,
            y: layout.y,
            width: layout.width,
            height: layout.height,
          });
        });
      }
    }

    if (updates.size === 0) {
      continue;
    }

    nextItems = nextItems.map((item) => updates.get(item.id) ?? item);
    for (const childId of updates.keys()) {
      changedIds.add(childId);
    }
  }

  return {
    items: nextItems,
    changedIds: [...changedIds],
  };
}

export function getFrameChildFitSize(
  item: BoardItem,
  frame: BoardItem,
  maxRatio = FRAME_CHILD_MAX_RATIO,
): { width: number; height: number } {
  const maxWidth = frame.width * maxRatio;
  const maxHeight = frame.height * maxRatio;
  if (item.width <= maxWidth && item.height <= maxHeight) {
    return {
      width: item.width,
      height: item.height,
    };
  }

  const scale = Math.min(maxWidth / item.width, maxHeight / item.height);

  return {
    width: Math.max(1, Math.round(item.width * scale)),
    height: Math.max(1, Math.round(item.height * scale)),
  };
}

export function getFrameEjectPosition(
  item: BoardItem,
  frame: BoardItem,
  gap = 24,
): { x: number; y: number } {
  const itemCenterX = item.x + item.width / 2;
  const itemCenterY = item.y + item.height / 2;
  const frameCenterX = frame.x + frame.width / 2;
  const frameCenterY = frame.y + frame.height / 2;
  const dx = itemCenterX - frameCenterX;
  const dy = itemCenterY - frameCenterY;
  const horizontalWeight = Math.abs(dx) / Math.max(frame.width, 1);
  const verticalWeight = Math.abs(dy) / Math.max(frame.height, 1);

  if (horizontalWeight >= verticalWeight) {
    return {
      x:
        dx >= 0
          ? frame.x + frame.width + gap
          : frame.x - item.width - gap,
      y: item.y,
    };
  }

  return {
    x: item.x,
    y:
      dy >= 0
        ? frame.y + frame.height + gap
        : frame.y - item.height - gap,
  };
}

export function getAutoAnchors(
  fromItem: BoardItem,
  toItem: BoardItem,
): { from_anchor: Anchor; to_anchor: Anchor } {
  const fromCenter = getItemCenter(fromItem);
  const toCenter = getItemCenter(toItem);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (dx === 0 && dy === 0) {
    return { from_anchor: 'right', to_anchor: 'left' };
  }

  const angle = Math.atan2(dy, dx);
  const oppositeAngle = Math.atan2(-dy, -dx);
  const anchorStep = Math.PI / 4;

  return {
    from_anchor:
      DIRECTIONAL_ANCHORS[
        ((Math.round(angle / anchorStep) % DIRECTIONAL_ANCHORS.length) +
          DIRECTIONAL_ANCHORS.length) %
          DIRECTIONAL_ANCHORS.length
      ],
    to_anchor:
      DIRECTIONAL_ANCHORS[
        ((Math.round(oppositeAngle / anchorStep) % DIRECTIONAL_ANCHORS.length) +
          DIRECTIONAL_ANCHORS.length) %
          DIRECTIONAL_ANCHORS.length
      ],
  };
}

export function getAnchorPoint(item: BoardItem, anchor: Anchor | null): Point {
  switch (anchor) {
    case 'top_left':
      return { x: item.x, y: item.y };
    case 'top':
      return { x: item.x + item.width / 2, y: item.y };
    case 'top_right':
      return { x: item.x + item.width, y: item.y };
    case 'right':
      return { x: item.x + item.width, y: item.y + item.height / 2 };
    case 'bottom_right':
      return { x: item.x + item.width, y: item.y + item.height };
    case 'bottom':
      return { x: item.x + item.width / 2, y: item.y + item.height };
    case 'bottom_left':
      return { x: item.x, y: item.y + item.height };
    case 'left':
      return { x: item.x, y: item.y + item.height / 2 };
    default:
      return getItemCenter(item);
  }
}

export function getConnectorPoints(
  connector: ConnectorLink,
  items: BoardItem[],
): { fromPoint: Point; toPoint: Point } | null {
  if (connector.from_item_id === null || connector.to_item_id === null) {
    return null;
  }

  const fromItem = items.find((item) => item.id === connector.from_item_id);
  const toItem = items.find((item) => item.id === connector.to_item_id);
  if (!fromItem || !toItem) {
    return null;
  }

  if (
    isHiddenByCollapsedFrame(fromItem, items) ||
    isHiddenByCollapsedFrame(toItem, items)
  ) {
    return null;
  }

  const autoAnchors = getAutoAnchors(fromItem, toItem);
  return {
    fromPoint: getAnchorPoint(
      fromItem,
      (connector.from_anchor as Anchor | null) ?? autoAnchors.from_anchor,
    ),
    toPoint: getAnchorPoint(
      toItem,
      (connector.to_anchor as Anchor | null) ?? autoAnchors.to_anchor,
    ),
  };
}

export function isSmallItem(item: BoardItem): boolean {
  return item.category === ITEM_CATEGORY.small_item;
}

// ──────────────────────────────────────────────
// Connector anchor helpers (draw.io style)
// ──────────────────────────────────────────────

/** Types eligible to act as connector anchor targets. */
function isConnectable(item: BoardItem): boolean {
  return (
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.sticky_note ||
    item.type === ITEM_TYPE.note_paper ||
    item.type === ITEM_TYPE.frame ||
    item.type === ITEM_TYPE.table
  );
}

/** Get the four cardinal anchor points for an item. */
export function getItemConnectorAnchors(
  item: BoardItem,
): Array<{ anchor: Anchor; point: Point }> {
  return CONNECTOR_ANCHORS.map((anchor) => ({
    anchor,
    point: getAnchorPoint(item, anchor),
  }));
}

/** Check if a world point is within a threshold distance of any item boundary (expanded). */
function isPointNearItem(
  point: Point,
  item: BoardItem,
  threshold: number,
): boolean {
  return (
    point.x >= item.x - threshold &&
    point.x <= item.x + item.width + threshold &&
    point.y >= item.y - threshold &&
    point.y <= item.y + item.height + threshold
  );
}

/**
 * Find the nearest connectable anchor point within a distance threshold.
 * Returns null if nothing is close enough.
 */
export function findNearestConnectorAnchor(
  worldPoint: Point,
  items: BoardItem[],
  excludeItemIds: Set<string>,
  threshold: number,
): AnchorHit | null {
  let best: AnchorHit | null = null;

  for (const item of items) {
    if (excludeItemIds.has(item.id)) {
      continue;
    }
    if (!isConnectable(item)) {
      continue;
    }
    if (isHiddenByCollapsedFrame(item, items)) {
      continue;
    }
    if (!isPointNearItem(worldPoint, item, threshold)) {
      continue;
    }

    for (const { anchor, point } of getItemConnectorAnchors(item)) {
      const dx = worldPoint.x - point.x;
      const dy = worldPoint.y - point.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > threshold) {
        continue;
      }

      if (best === null || distance < best.distance) {
        best = { itemId: item.id, anchor, point, distance };
      }
    }
  }

  return best;
}

/**
 * Get all nearby connectable items that should show anchor indicators.
 * Returns items whose bounding box is within the threshold of the point.
 */
export function getItemsNearPoint(
  worldPoint: Point,
  items: BoardItem[],
  excludeItemIds: Set<string>,
  threshold: number,
): BoardItem[] {
  return items.filter((item) => {
    if (excludeItemIds.has(item.id)) {
      return false;
    }
    if (!isConnectable(item)) {
      return false;
    }
    if (isHiddenByCollapsedFrame(item, items)) {
      return false;
    }
    return isPointNearItem(worldPoint, item, threshold);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers moved from Canvas.tsx
// ─────────────────────────────────────────────────────────────────────────────

const FRAME_LAYOUT_PADDING_X = 20;
const FRAME_LAYOUT_PADDING_TOP = 72;

export type LayerAction = 'bringToFront' | 'sendToBack';

export function toPayload(item: BoardItem): BoardItemPayload {
  return {
    page_id: item.page_id,
    parent_item_id: item.parent_item_id,
    category: item.category,
    type: item.type,
    title: item.title,
    content: item.content,
    content_format: item.content_format,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    z_index: item.z_index,
    is_collapsed: item.is_collapsed,
    style_json: item.style_json,
    data_json: item.data_json,
  };
}

export function toConnectorPayload(connector: ConnectorLink): ConnectorLinkPayload {
  return {
    connector_item_id: connector.connector_item_id,
    from_item_id: connector.from_item_id,
    to_item_id: connector.to_item_id,
    from_anchor: connector.from_anchor,
    to_anchor: connector.to_anchor,
  };
}

export function isFrame(item: BoardItem): boolean {
  return item.type === ITEM_TYPE.frame;
}

export function isLegacyConnectorArrow(item: BoardItem): boolean {
  return item.type === ITEM_TYPE.arrow && !hasStoredSegmentData(item);
}

export function isInlineEditable(item: BoardItem): boolean {
  return (
    item.type === ITEM_TYPE.table ||
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.sticky_note ||
    item.type === ITEM_TYPE.note_paper
  );
}

export function clampItemSize(
  type: string,
  width: number,
  height: number,
  dataJson?: string | null,
): { width: number; height: number } {
  const minSize =
    type === ITEM_TYPE.table
      ? getTableMinSizeFromDataJson(dataJson ?? null)
      : ITEM_MIN_SIZE[type];
  return {
    width: Math.max(minSize?.width ?? 60, width),
    height: Math.max(minSize?.height ?? 40, height),
  };
}

export function getDescendantItems(items: BoardItem[], rootId: string): BoardItem[] {
  const descendants: BoardItem[] = [];
  const pendingParentIds = [rootId];

  while (pendingParentIds.length > 0) {
    const parentId = pendingParentIds.shift();
    if (parentId === undefined) {
      continue;
    }

    const children = getFrameChildren(items, parentId);
    descendants.push(...children);
    pendingParentIds.push(...children.map((child) => child.id));
  }

  return descendants;
}

export function getUniqueItemIds(itemIds: string[]): string[] {
  return [...new Set(itemIds)];
}

export function getPrimarySelectionId(selectedIds: string[]): string | null {
  return selectedIds[selectedIds.length - 1] ?? null;
}

export function expandSelectionItemIds(
  items: BoardItem[],
  selectedIds: string[],
  options: {
    includeFrameDescendants?: boolean;
    excludeArrows?: boolean;
  } = {},
): string[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const expandedIds: string[] = [];
  const seen = new Set<string>();
  const includeFrameDescendants = options.includeFrameDescendants ?? true;

  function append(itemId: string) {
    if (seen.has(itemId)) {
      return;
    }

    const item = byId.get(itemId);
    if (!item) {
      return;
    }

    if (options.excludeArrows && item.type === ITEM_TYPE.arrow) {
      return;
    }

    seen.add(itemId);
    expandedIds.push(itemId);
  }

  for (const itemId of selectedIds) {
    const item = byId.get(itemId);
    if (!item) {
      continue;
    }

    append(item.id);
    if (!includeFrameDescendants) {
      continue;
    }
    // Include descendants for frames; include direct children for tables
    if (isFrame(item)) {
      for (const descendant of getDescendantItems(items, item.id)) {
        append(descendant.id);
      }
    } else if (item.type === ITEM_TYPE.table) {
      for (const child of getFrameChildren(items, item.id)) {
        append(child.id);
      }
    }
  }

  return expandedIds;
}

export function getDraggableSelectionItemIds(
  items: BoardItem[],
  selectedIds: string[],
): string[] {
  return expandSelectionItemIds(items, selectedIds).filter((itemId) => {
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) {
      return false;
    }

    return item.type !== ITEM_TYPE.line && item.type !== ITEM_TYPE.arrow
      ? true
      : canTranslateSegmentItem(item);
  });
}

export function detachDraggedSegments(
  items: BoardItem[],
  connectors: ConnectorLink[],
  selectedItemIds: string[],
): {
  items: BoardItem[];
  connectors: ConnectorLink[];
  detachedItemIds: string[];
  detachedConnectorIds: string[];
} {
  const selectedIdSet = new Set(selectedItemIds);
  const connectorByItemId = new Map(
    connectors.map((connector) => [connector.connector_item_id, connector] as const),
  );
  const detachedItemIds: string[] = [];
  const detachedConnectorIds: string[] = [];

  const nextItems = items.map((item) => {
    if (!selectedIdSet.has(item.id)) {
      return item;
    }

    if (item.type !== ITEM_TYPE.line && item.type !== ITEM_TYPE.arrow) {
      return item;
    }

    if (hasStoredSegmentData(item)) {
      const worldPoints = getSegmentWorldPoints(item);
      if (worldPoints === null) {
        return item;
      }

      const { startConnection, endConnection } = getSegmentConnections(item);
      if (startConnection === null && endConnection === null) {
        return item;
      }

      detachedItemIds.push(item.id);
      return {
        ...item,
        ...buildSegmentGeometry(
          worldPoints.start,
          worldPoints.end,
          getSegmentWaypoints(item).map((point) => ({
            x: item.x + point.x,
            y: item.y + point.y,
          })),
          null,
          null,
        ),
      };
    }

    if (item.type !== ITEM_TYPE.arrow) {
      return item;
    }

    const connector = connectorByItemId.get(item.id);
    if (!connector) {
      return item;
    }

    const connectorPoints = getConnectorPoints(connector, items);
    if (connectorPoints === null) {
      return item;
    }

    detachedItemIds.push(item.id);
    detachedConnectorIds.push(connector.id);
    return {
      ...item,
      ...buildSegmentGeometry(connectorPoints.fromPoint, connectorPoints.toPoint, null),
    };
  });

  const detachedConnectorIdSet = new Set(detachedConnectorIds);
  return {
    items: nextItems,
    connectors: connectors.filter((connector) => !detachedConnectorIdSet.has(connector.id)),
    detachedItemIds,
    detachedConnectorIds,
  };
}

export function getSelectionBounds(
  items: BoardItem[],
  selectedIds: string[],
): { x: number; y: number; width: number; height: number } | null {
  const selectedItems = selectedIds
    .map((itemId) => items.find((item) => item.id === itemId))
    .filter((item): item is BoardItem => item !== undefined);
  if (selectedItems.length === 0) {
    return null;
  }

  const left = Math.min(...selectedItems.map((item) => item.x));
  const top = Math.min(...selectedItems.map((item) => item.y));
  const right = Math.max(...selectedItems.map((item) => item.x + item.width));
  const bottom = Math.max(...selectedItems.map((item) => item.y + item.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function getItemMagnetBounds(
  item: BoardItem,
): { x: number; y: number; width: number; height: number } {
  if (item.type === ITEM_TYPE.line || item.type === ITEM_TYPE.arrow) {
    const worldPoints = getSegmentAllWorldPoints(item);
    if (worldPoints !== null && worldPoints.length > 0) {
      const left = Math.min(...worldPoints.map((point) => point.x));
      const top = Math.min(...worldPoints.map((point) => point.y));
      const right = Math.max(...worldPoints.map((point) => point.x));
      const bottom = Math.max(...worldPoints.map((point) => point.y));

      return {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
    }
  }

  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  };
}

export function getSelectionMagnetBounds(
  items: BoardItem[],
  selectedIds: string[],
): { x: number; y: number; width: number; height: number } | null {
  const selectedItems = selectedIds
    .map((itemId) => items.find((item) => item.id === itemId))
    .filter((item): item is BoardItem => item !== undefined);
  if (selectedItems.length === 0) {
    return null;
  }

  const bounds = selectedItems.map(getItemMagnetBounds);
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function getItemDepth(
  item: BoardItem,
  itemById: Map<string, BoardItem>,
): number {
  let depth = 0;
  let currentParentId = item.parent_item_id;

  while (currentParentId !== null) {
    const parent = itemById.get(currentParentId);
    if (!parent) {
      break;
    }

    depth += 1;
    currentParentId = parent.parent_item_id;
  }

  return depth;
}

export function sortItemsForClipboard(items: BoardItem[]): BoardItem[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return [...items].sort((left, right) => {
    const depthDiff =
      getItemDepth(left, itemById) - getItemDepth(right, itemById);
    if (depthDiff !== 0) {
      return depthDiff;
    }

    if (left.z_index !== right.z_index) {
      return left.z_index - right.z_index;
    }

    return left.created_at.localeCompare(right.created_at);
  });
}

export function getFrameContentBounds(frame: BoardItem): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} {
  const left = frame.x + FRAME_LAYOUT_PADDING_X;
  const top = frame.y + FRAME_LAYOUT_PADDING_TOP;
  const width = Math.max(frame.width - FRAME_LAYOUT_PADDING_X * 2, 80);
  const height = Math.max(
    frame.height - FRAME_LAYOUT_PADDING_TOP - FRAME_LAYOUT_PADDING_X,
    80,
  );

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

export function layoutFrameChildren(
  frame: BoardItem,
  items: BoardItem[],
): Map<string, BoardItem> {
  const updates = new Map<string, BoardItem>();
  const children = getFrameChildren(items, frame.id).filter(isSmallItem);
  if (children.length === 0) {
    return updates;
  }

  const contentLeft = frame.x + FRAME_LAYOUT_PADDING_X;
  const contentTop = frame.y + FRAME_LAYOUT_PADDING_TOP;
  const contentWidth = Math.max(frame.width - FRAME_LAYOUT_PADDING_X * 2, 80);
  const contentHeight = Math.max(
    frame.height - FRAME_LAYOUT_PADDING_TOP - FRAME_LAYOUT_PADDING_X,
    80,
  );
  const contentRight = contentLeft + contentWidth;
  const contentBottom = contentTop + contentHeight;

  for (const child of children) {
    const scale = Math.min(
      1,
      contentWidth / Math.max(child.width, 1),
      contentHeight / Math.max(child.height, 1),
    );
    const nextWidth = Math.max(1, Math.round(child.width * scale));
    const nextHeight = Math.max(1, Math.round(child.height * scale));
    const nextX = Math.min(
      Math.max(child.x, contentLeft),
      Math.max(contentLeft, contentRight - nextWidth),
    );
    const nextY = Math.min(
      Math.max(child.y, contentTop),
      Math.max(contentTop, contentBottom - nextHeight),
    );

    updates.set(
      child.id,
      child.x === nextX &&
        child.y === nextY &&
        child.width === nextWidth &&
        child.height === nextHeight
        ? child
        : {
            ...child,
            x: nextX,
            y: nextY,
            width: nextWidth,
            height: nextHeight,
          },
    );
  }

  return updates;
}

export function fitItemWithinBounds(
  item: BoardItem,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(
    1,
    maxWidth / Math.max(item.width, 1),
    maxHeight / Math.max(item.height, 1),
  );

  return {
    width: Math.max(1, Math.round(item.width * scale)),
    height: Math.max(1, Math.round(item.height * scale)),
  };
}

export function clampItemToFrame(
  item: BoardItem,
  frame: BoardItem,
  nextSize: { width: number; height: number },
): { x: number; y: number } {
  const bounds = getFrameContentBounds(frame);

  return {
    x: Math.min(
      Math.max(item.x, bounds.left),
      Math.max(bounds.left, bounds.right - nextSize.width),
    ),
    y: Math.min(
      Math.max(item.y, bounds.top),
      Math.max(bounds.top, bounds.bottom - nextSize.height),
    ),
  };
}

export function isItemFullyOutsideFrame(item: BoardItem, frame: BoardItem): boolean {
  const bounds = getFrameContentBounds(frame);

  return (
    item.x + item.width <= bounds.left ||
    item.x >= bounds.right ||
    item.y + item.height <= bounds.top ||
    item.y >= bounds.bottom
  );
}

export function relayoutFrameItems(
  items: BoardItem[],
  frameIds: string[],
): { items: BoardItem[]; changedIds: string[] } {
  let nextItems = items;
  const changedIds = new Set<string>();

  for (const frameId of getUniqueItemIds(frameIds)) {
    const frame = nextItems.find((item) => item.id === frameId);
    if (!frame || !isFrame(frame)) {
      continue;
    }

    const updates = layoutFrameChildren(frame, nextItems);
    if (updates.size === 0) {
      continue;
    }

    nextItems = nextItems.map((item) => {
      const updated = updates.get(item.id);
      if (!updated) {
        return item;
      }

      if (
        updated.x === item.x &&
        updated.y === item.y &&
        updated.width === item.width &&
        updated.height === item.height
      ) {
        return item;
      }

      changedIds.add(item.id);
      return updated;
    });
  }

  return {
    items: nextItems,
    changedIds: [...changedIds],
  };
}

export function getLayerBlockIds(items: BoardItem[], itemId: string): string[] {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) {
    return [];
  }

  if (!isFrame(item)) {
    return [item.id];
  }

  return [
    item.id,
    ...getDescendantItems(items, item.id).map((child) => child.id),
  ];
}

export function sortItemsByLayer(items: BoardItem[]): BoardItem[] {
  return [...items].sort(
    (a, b) => a.z_index - b.z_index || a.created_at.localeCompare(b.created_at),
  );
}

export function reorderItemsForLayer(
  items: BoardItem[],
  selectedId: string,
  action: LayerAction,
): BoardItem[] {
  const ordered = sortItemsByLayer(items);
  const movingIds = new Set(getLayerBlockIds(ordered, selectedId));
  if (movingIds.size === 0) {
    return ordered;
  }

  const movingItems = ordered.filter((item) => movingIds.has(item.id));
  const stationaryItems = ordered.filter((item) => !movingIds.has(item.id));
  const nextOrder =
    action === 'bringToFront'
      ? [...stationaryItems, ...movingItems]
      : [...movingItems, ...stationaryItems];

  return nextOrder.map((item, index) =>
    item.z_index === index ? item : { ...item, z_index: index },
  );
}
