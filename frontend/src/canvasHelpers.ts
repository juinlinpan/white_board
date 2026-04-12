import type { BoardItem, ConnectorLink } from './api';
import type { FrameSummaryEntry } from './items/Frame';
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

/** The four cardinal anchors used for connector snapping (draw.io style). */
const CONNECTOR_ANCHORS: Anchor[] = ['top', 'right', 'bottom', 'left'];

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
