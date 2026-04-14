import type { BoardItem, ConnectorLink } from './api';
import type { FrameSummaryEntry } from './items/Frame';
import { parseTableData, getRootCellAt } from './tableData';
import { ITEM_CATEGORY, ITEM_TYPE } from './types';

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

    // Find column index
    let col = -1;
    let cumX = 0;
    for (let c = 0; c < tableData.cols; c++) {
      const colW = (tableData.colWidths[c] ?? 1 / tableData.cols) * table.width;
      if (localX >= cumX && localX < cumX + colW) {
        col = c;
        break;
      }
      cumX += colW;
    }

    // Find row index
    let row = -1;
    let cumY = 0;
    for (let r = 0; r < tableData.rows; r++) {
      const rowH = (tableData.rowHeights[r] ?? 1 / tableData.rows) * table.height;
      if (localY >= cumY && localY < cumY + rowH) {
        row = r;
        break;
      }
      cumY += rowH;
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
  let cumX = 0;
  for (let c = 0; c < col; c++) {
    cumX += (parsed.colWidths[c] ?? 1 / parsed.cols) * table.width;
  }
  let cumY = 0;
  for (let r = 0; r < row; r++) {
    cumY += (parsed.rowHeights[r] ?? 1 / parsed.rows) * table.height;
  }
  let cellWidth = 0;
  for (let c = col; c < col + colSpan; c++) {
    cellWidth += (parsed.colWidths[c] ?? 1 / parsed.cols) * table.width;
  }
  let cellHeight = 0;
  for (let r = row; r < row + rowSpan; r++) {
    cellHeight += (parsed.rowHeights[r] ?? 1 / parsed.rows) * table.height;
  }
  return {
    x: table.x + cumX,
    y: table.y + cumY,
    width: cellWidth,
    height: cellHeight,
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
