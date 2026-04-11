import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type BoardItem,
  type ConnectorLink,
  type ConnectorLinkPayload,
  createBoardItem,
  createConnector,
  deleteBoardItem,
  getPageBoardData,
  replacePageBoardState,
  updateBoardItem,
  updateConnector,
  updatePageViewport,
  type BoardItemPayload,
  type Page,
} from './api';
import { Inspector } from './Inspector';
import { snapMoveRect, snapResizeRect, type SnapGuide } from './snap';
import { Toolbar } from './Toolbar';
import { ArrowConnector } from './items/ArrowConnector';
import { BoardItemRenderer } from './items/BoardItemRenderer';
import { type FrameSummaryEntry } from './items/Frame';
import { createTableData, serializeTableData } from './tableData';
import {
  ITEM_CATEGORY,
  ITEM_CATEGORY_FOR_TYPE,
  ITEM_DEFAULT_SIZE,
  ITEM_MIN_SIZE,
  ITEM_TYPE,
  type ActiveTool,
  type Viewport,
} from './types';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const VIEWPORT_SAVE_DELAY = 600;
const ITEM_SAVE_DELAY = 500;
const CONNECTOR_ITEM_PADDING = 20;
const SNAP_TOLERANCE = 10;
const PASTE_OFFSET_STEP = 32;
const MAX_HISTORY_ENTRIES = 50;
const FRAME_LAYOUT_PADDING_X = 20;
const FRAME_LAYOUT_PADDING_TOP = 72;
const FRAME_LAYOUT_GAP = 16;

type Anchor = 'top' | 'right' | 'bottom' | 'left';
type Point = {
  x: number;
  y: number;
};

type DragState = {
  itemId: string;
  selectedItemIds: string[];
  startMouseX: number;
  startMouseY: number;
  startBoundsX: number;
  startBoundsY: number;
  itemPositions: Array<{ id: string; x: number; y: number }>;
  snapshot: BoardSnapshot;
};

type ResizeState = {
  itemId: string;
  startMouseX: number;
  startMouseY: number;
  startWidth: number;
  startHeight: number;
  snapshot: BoardSnapshot;
};

type PanState = {
  startMouseX: number;
  startMouseY: number;
  startVpX: number;
  startVpY: number;
};

type ArrowDraftState = {
  fromItemId: string;
};

type ClipboardEntry = {
  sourceId: string;
  payload: BoardItemPayload;
};

type ClipboardSnapshot = {
  items: ClipboardEntry[];
};

type LayerAction = 'bringToFront' | 'sendToBack';
type BoardSnapshot = {
  items: BoardItem[];
  connectors: ConnectorLink[];
  selectedIds: string[];
};

type EditSessionState = {
  itemId: string;
};

type Props = {
  page: Page;
};

type ItemsUpdater = BoardItem[] | ((current: BoardItem[]) => BoardItem[]);
type ConnectorsUpdater =
  | ConnectorLink[]
  | ((current: ConnectorLink[]) => ConnectorLink[]);

function toPayload(item: BoardItem): BoardItemPayload {
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

function toConnectorPayload(connector: ConnectorLink): ConnectorLinkPayload {
  return {
    connector_item_id: connector.connector_item_id,
    from_item_id: connector.from_item_id,
    to_item_id: connector.to_item_id,
    from_anchor: connector.from_anchor,
    to_anchor: connector.to_anchor,
  };
}

function cloneBoardItem(item: BoardItem): BoardItem {
  return { ...item };
}

function cloneConnectorLink(connector: ConnectorLink): ConnectorLink {
  return { ...connector };
}

function cloneBoardSnapshot(snapshot: BoardSnapshot): BoardSnapshot {
  return {
    items: snapshot.items.map(cloneBoardItem),
    connectors: snapshot.connectors.map(cloneConnectorLink),
    selectedIds: [...snapshot.selectedIds],
  };
}

function normalizeBoardSnapshot(snapshot: BoardSnapshot): {
  items: BoardItem[];
  connectors: ConnectorLink[];
  selectedIds: string[];
} {
  return {
    items: [...snapshot.items].sort((a, b) => a.id.localeCompare(b.id)),
    connectors: [...snapshot.connectors].sort((a, b) => a.id.localeCompare(b.id)),
    selectedIds: [...snapshot.selectedIds].sort((a, b) => a.localeCompare(b)),
  };
}

function areBoardSnapshotsEqual(
  left: BoardSnapshot,
  right: BoardSnapshot,
): boolean {
  return (
    JSON.stringify(normalizeBoardSnapshot(left)) ===
    JSON.stringify(normalizeBoardSnapshot(right))
  );
}

function isFrame(item: BoardItem): boolean {
  return item.type === ITEM_TYPE.frame;
}

function isSmallItem(item: BoardItem): boolean {
  return item.category === ITEM_CATEGORY.small_item;
}

function isArrowConnectable(item: BoardItem): boolean {
  return isSmallItem(item) || item.type === ITEM_TYPE.frame;
}

function isInlineEditable(item: BoardItem): boolean {
  return (
    item.type === ITEM_TYPE.table ||
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.sticky_note ||
    item.type === ITEM_TYPE.note_paper
  );
}

function getFirstNonEmptyLine(content: string | null): string | null {
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

function getMarkdownH1(content: string | null): string | null {
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

function ellipsize(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}…`;
}

function summarizeFrameChild(item: BoardItem): FrameSummaryEntry {
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

function clampItemSize(
  type: string,
  width: number,
  height: number,
): { width: number; height: number } {
  const minSize = ITEM_MIN_SIZE[type];
  return {
    width: Math.max(minSize?.width ?? 60, width),
    height: Math.max(minSize?.height ?? 40, height),
  };
}

function getFrameChildren(items: BoardItem[], frameId: string): BoardItem[] {
  return items
    .filter((item) => item.parent_item_id === frameId)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.z_index - b.z_index);
}

function getDescendantItems(items: BoardItem[], rootId: string): BoardItem[] {
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

function getUniqueItemIds(itemIds: string[]): string[] {
  return [...new Set(itemIds)];
}

function getPrimarySelectionId(selectedIds: string[]): string | null {
  return selectedIds[selectedIds.length - 1] ?? null;
}

function expandSelectionItemIds(
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
    if (!includeFrameDescendants || !isFrame(item)) {
      continue;
    }

    for (const descendant of getDescendantItems(items, item.id)) {
      append(descendant.id);
    }
  }

  return expandedIds;
}

function getSelectionBounds(
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

function getItemDepth(
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

function sortItemsForClipboard(items: BoardItem[]): BoardItem[] {
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

function layoutFrameChildren(
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
  const contentRight = contentLeft + contentWidth;

  let cursorX = contentLeft;
  let cursorY = contentTop;
  let rowHeight = 0;

  for (const child of children) {
    const minWidth = ITEM_MIN_SIZE[child.type]?.width ?? 60;
    const nextWidth = Math.max(minWidth, Math.min(child.width, contentWidth));

    if (cursorX > contentLeft && cursorX + nextWidth > contentRight) {
      cursorX = contentLeft;
      cursorY += rowHeight + FRAME_LAYOUT_GAP;
      rowHeight = 0;
    }

    updates.set(
      child.id,
      child.x === cursorX && child.y === cursorY && child.width === nextWidth
        ? child
        : {
            ...child,
            x: cursorX,
            y: cursorY,
            width: nextWidth,
          },
    );

    cursorX += nextWidth + FRAME_LAYOUT_GAP;
    rowHeight = Math.max(rowHeight, child.height);
  }

  return updates;
}

function relayoutFrameItems(
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

function getLayerBlockIds(items: BoardItem[], itemId: string): string[] {
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

function sortItemsByLayer(items: BoardItem[]): BoardItem[] {
  return [...items].sort(
    (a, b) => a.z_index - b.z_index || a.created_at.localeCompare(b.created_at),
  );
}

function reorderItemsForLayer(
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

function isPointInsideFrame(x: number, y: number, frame: BoardItem): boolean {
  return (
    x >= frame.x &&
    x <= frame.x + frame.width &&
    y >= frame.y &&
    y <= frame.y + frame.height
  );
}

function isHiddenByCollapsedFrame(
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

function findContainingFrame(
  item: BoardItem,
  items: BoardItem[],
): BoardItem | null {
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;

  const candidates = items
    .filter(
      (candidate) =>
        candidate.type === ITEM_TYPE.frame &&
        candidate.id !== item.id &&
        isPointInsideFrame(centerX, centerY, candidate),
    )
    .sort((a, b) => {
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      if (areaA !== areaB) {
        return areaA - areaB;
      }

      return b.z_index - a.z_index;
    });

  return candidates[0] ?? null;
}

function getItemCenter(item: BoardItem): Point {
  return {
    x: item.x + item.width / 2,
    y: item.y + item.height / 2,
  };
}

function getAutoAnchors(
  fromItem: BoardItem,
  toItem: BoardItem,
): { from_anchor: Anchor; to_anchor: Anchor } {
  const fromCenter = getItemCenter(fromItem);
  const toCenter = getItemCenter(toItem);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { from_anchor: 'right', to_anchor: 'left' }
      : { from_anchor: 'left', to_anchor: 'right' };
  }

  return dy >= 0
    ? { from_anchor: 'bottom', to_anchor: 'top' }
    : { from_anchor: 'top', to_anchor: 'bottom' };
}

function getAnchorPoint(item: BoardItem, anchor: Anchor | null): Point {
  switch (anchor) {
    case 'top':
      return { x: item.x + item.width / 2, y: item.y };
    case 'right':
      return { x: item.x + item.width, y: item.y + item.height / 2 };
    case 'bottom':
      return { x: item.x + item.width / 2, y: item.y + item.height };
    case 'left':
      return { x: item.x, y: item.y + item.height / 2 };
    default:
      return getItemCenter(item);
  }
}

function getConnectorPoints(
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

export function Canvas({ page }: Props) {
  const [viewport, setViewport] = useState<Viewport>({
    x: page.viewport_x,
    y: page.viewport_y,
    zoom: page.zoom,
  });
  const [items, setItems] = useState<BoardItem[]>([]);
  const [connectors, setConnectors] = useState<ConnectorLink[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [arrowDraft, setArrowDraft] = useState<ArrowDraftState | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isHistorySyncing, setIsHistorySyncing] = useState(false);

  const viewportRef = useRef<Viewport>(viewport);
  const itemsRef = useRef<BoardItem[]>(items);
  const connectorsRef = useRef<ConnectorLink[]>(connectors);
  const selectedIdsRef = useRef<string[]>(selectedIds);
  const clipboardRef = useRef<ClipboardSnapshot | null>(null);
  const pasteCountRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const isSpaceRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const vpSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStackRef = useRef<BoardSnapshot[]>([]);
  const redoStackRef = useRef<BoardSnapshot[]>([]);
  const editSessionRef = useRef<EditSessionState | null>(null);

  useLayoutEffect(() => {
    viewportRef.current = viewport;
    itemsRef.current = items;
    connectorsRef.current = connectors;
    selectedIdsRef.current = selectedIds;
  }, [connectors, items, selectedIds, viewport]);

  const setItemsAndSync = useCallback((updater: ItemsUpdater) => {
    setItems((current) => {
      const nextItems =
        typeof updater === 'function' ? updater(current) : updater;
      itemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  const setViewportAndSync = useCallback((nextViewport: Viewport) => {
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
  }, []);

  const setConnectorsAndSync = useCallback((updater: ConnectorsUpdater) => {
    setConnectors((current) => {
      const nextConnectors =
        typeof updater === 'function' ? updater(current) : updater;
      connectorsRef.current = nextConnectors;
      return nextConnectors;
    });
  }, []);

  const setSelection = useCallback((nextSelectedIds: string[]) => {
    const availableIds = new Set(itemsRef.current.map((item) => item.id));
    const normalizedSelection = getUniqueItemIds(
      nextSelectedIds.filter((itemId) => availableIds.has(itemId)),
    );
    selectedIdsRef.current = normalizedSelection;
    setSelectedIds(normalizedSelection);
  }, []);

  const clearSelection = useCallback(() => {
    selectedIdsRef.current = [];
    setSelectedIds([]);
  }, []);

  const syncHistoryState = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(redoStackRef.current.length > 0);
  }, []);

  const captureBoardSnapshot = useCallback((): BoardSnapshot => {
    return {
      items: itemsRef.current.map(cloneBoardItem),
      connectors: connectorsRef.current.map(cloneConnectorLink),
      selectedIds: [...selectedIdsRef.current],
    };
  }, []);

  const resetHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    editSessionRef.current = null;
    syncHistoryState();
  }, [syncHistoryState]);

  const pushUndoSnapshot = useCallback(
    (snapshot: BoardSnapshot) => {
      const normalizedSnapshot = cloneBoardSnapshot(snapshot);
      const previousSnapshot =
        undoStackRef.current[undoStackRef.current.length - 1] ?? null;
      if (
        previousSnapshot !== null &&
        areBoardSnapshotsEqual(previousSnapshot, normalizedSnapshot)
      ) {
        return;
      }

      undoStackRef.current.push(normalizedSnapshot);
      if (undoStackRef.current.length > MAX_HISTORY_ENTRIES) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      syncHistoryState();
    },
    [syncHistoryState],
  );

  const recordHistoryCheckpoint = useCallback(
    (snapshot: BoardSnapshot) => {
      if (areBoardSnapshotsEqual(snapshot, captureBoardSnapshot())) {
        return;
      }

      pushUndoSnapshot(snapshot);
    },
    [captureBoardSnapshot, pushUndoSnapshot],
  );

  const clearPendingItemSave = useCallback(() => {
    if (itemSaveTimer.current !== null) {
      clearTimeout(itemSaveTimer.current);
      itemSaveTimer.current = null;
    }
    editSessionRef.current = null;
  }, []);

  const restoreBoardSnapshot = useCallback(
    async (snapshot: BoardSnapshot): Promise<boolean> => {
      clearPendingItemSave();
      setIsHistorySyncing(true);

      try {
        const restored = await replacePageBoardState(page.id, {
          board_items: snapshot.items,
          connector_links: snapshot.connectors,
        });
        setItemsAndSync(restored.board_items);
        setConnectorsAndSync(restored.connector_links);
        setSelection(
          snapshot.selectedIds.filter((itemId) =>
            restored.board_items.some((item) => item.id === itemId),
          ),
        );
        setEditingId(null);
        setArrowDraft(null);
        setSnapGuides([]);
        return true;
      } catch (err) {
        console.error('[Canvas] Failed to restore board snapshot', err);
        return false;
      } finally {
        setIsHistorySyncing(false);
        syncHistoryState();
      }
    },
    [
      clearPendingItemSave,
      page.id,
      setConnectorsAndSync,
      setItemsAndSync,
      setSelection,
      syncHistoryState,
    ],
  );

  const handleUndo = useCallback(async () => {
    if (
      isHistorySyncing ||
      undoStackRef.current.length === 0 ||
      dragRef.current !== null ||
      resizeRef.current !== null ||
      panRef.current !== null
    ) {
      return;
    }

    const previousSnapshot = undoStackRef.current.pop();
    if (previousSnapshot === undefined) {
      syncHistoryState();
      return;
    }

    const currentSnapshot = captureBoardSnapshot();
    redoStackRef.current.push(currentSnapshot);
    syncHistoryState();

    const restored = await restoreBoardSnapshot(previousSnapshot);
    if (!restored) {
      redoStackRef.current.pop();
      undoStackRef.current.push(previousSnapshot);
      syncHistoryState();
    }
  }, [
    captureBoardSnapshot,
    isHistorySyncing,
    restoreBoardSnapshot,
    syncHistoryState,
  ]);

  const handleRedo = useCallback(async () => {
    if (
      isHistorySyncing ||
      redoStackRef.current.length === 0 ||
      dragRef.current !== null ||
      resizeRef.current !== null ||
      panRef.current !== null
    ) {
      return;
    }

    const nextSnapshot = redoStackRef.current.pop();
    if (nextSnapshot === undefined) {
      syncHistoryState();
      return;
    }

    const currentSnapshot = captureBoardSnapshot();
    undoStackRef.current.push(currentSnapshot);
    syncHistoryState();

    const restored = await restoreBoardSnapshot(nextSnapshot);
    if (!restored) {
      undoStackRef.current.pop();
      redoStackRef.current.push(nextSnapshot);
      syncHistoryState();
    }
  }, [
    captureBoardSnapshot,
    isHistorySyncing,
    restoreBoardSnapshot,
    syncHistoryState,
  ]);

  const getSnapTargetRects = useCallback((ignoredIds: string[]) => {
    const ignoredIdSet = new Set(ignoredIds);
    return itemsRef.current
      .filter(
        (item) =>
          !ignoredIdSet.has(item.id) &&
          item.type !== ITEM_TYPE.arrow &&
          !isHiddenByCollapsedFrame(item, itemsRef.current),
      )
      .map((item) => ({
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      }));
  }, []);

  const primarySelectedId = useMemo(
    () => getPrimarySelectionId(selectedIds),
    [selectedIds],
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.id === primarySelectedId) ?? null,
    [items, primarySelectedId],
  );
  const selectedConnector = useMemo(
    () =>
      connectors.find(
        (connector) => connector.connector_item_id === primarySelectedId,
      ) ?? null,
    [connectors, primarySelectedId],
  );
  const connectorByItemId = useMemo(
    () =>
      new Map(
        connectors.map((connector) => [connector.connector_item_id, connector]),
      ),
    [connectors],
  );

  const selectedChildCount = useMemo(() => {
    if (selectedItem?.type !== ITEM_TYPE.frame) {
      return 0;
    }

    return getFrameChildren(items, selectedItem.id).length;
  }, [items, selectedItem]);

  const visibleItems = useMemo(
    () =>
      [...items]
        .filter((item) => !isHiddenByCollapsedFrame(item, items))
        .sort(
          (a, b) =>
            a.z_index - b.z_index || a.created_at.localeCompare(b.created_at),
        ),
    [items],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const data = await getPageBoardData(page.id, controller.signal);
        setItemsAndSync(data.board_items);
        setConnectorsAndSync(data.connector_links);
        setViewportAndSync({
          x: data.page.viewport_x,
          y: data.page.viewport_y,
          zoom: data.page.zoom,
        });
        clearSelection();
        setEditingId(null);
        setArrowDraft(null);
        resetHistory();
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }

        console.error('[Canvas] Failed to load board data', err);
      }
    }

    void load();
    return () => controller.abort();
  }, [
    page.id,
    resetHistory,
    clearSelection,
    setConnectorsAndSync,
    setItemsAndSync,
    setViewportAndSync,
  ]);

  useEffect(
    () => () => {
      if (vpSaveTimer.current !== null) {
        clearTimeout(vpSaveTimer.current);
      }
      if (itemSaveTimer.current !== null) {
        clearTimeout(itemSaveTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' && !isSpaceRef.current) {
        const tag =
          (document.activeElement as HTMLElement | null)?.tagName ?? '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          return;
        }

        e.preventDefault();
        isSpaceRef.current = true;
        setIsSpaceDown(true);
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === ' ') {
        isSpaceRef.current = false;
        setIsSpaceDown(false);
        panRef.current = null;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const handleDeleteItems = useCallback(
    async (itemIds: string[]) => {
      const deleteIds = getUniqueItemIds(itemIds).filter((itemId) =>
        itemsRef.current.some((item) => item.id === itemId),
      );
      if (deleteIds.length === 0) {
        return;
      }

      const deleteIdSet = new Set(deleteIds);
      const snapshotBeforeDelete = captureBoardSnapshot();

      const relatedConnectors = connectorsRef.current.filter(
        (connector) =>
          deleteIdSet.has(connector.connector_item_id) ||
          (connector.from_item_id !== null &&
            deleteIdSet.has(connector.from_item_id)) ||
          (connector.to_item_id !== null && deleteIdSet.has(connector.to_item_id)),
      );
      const relatedItemIds = new Set<string>([
        ...deleteIds,
        ...relatedConnectors.map((connector) => connector.connector_item_id),
      ]);
      const relatedConnectorIds = new Set(
        relatedConnectors.map((connector) => connector.id),
      );

      setItemsAndSync((current) =>
        current
          .filter((item) => !relatedItemIds.has(item.id))
          .map((item) =>
            item.parent_item_id !== null &&
            deleteIdSet.has(item.parent_item_id) &&
            !deleteIdSet.has(item.id)
              ? { ...item, parent_item_id: null }
              : item,
          ),
      );
      setConnectorsAndSync((current) =>
        current.filter((connector) => !relatedConnectorIds.has(connector.id)),
      );
      setSelection(
        selectedIdsRef.current.filter((itemId) => !relatedItemIds.has(itemId)),
      );

      if (editingId !== null && relatedItemIds.has(editingId)) {
        setEditingId(null);
      }
      if (arrowDraft !== null && deleteIdSet.has(arrowDraft.fromItemId)) {
        setArrowDraft(null);
      }
      pushUndoSnapshot(snapshotBeforeDelete);

      const deleteResults = await Promise.allSettled(
        deleteIds.map((itemId) => deleteBoardItem(itemId)),
      );
      for (const result of deleteResults) {
        if (result.status === 'fulfilled') {
          continue;
        }

        const message =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        if (/not found/i.test(message)) {
          continue;
        }

        console.error('[Canvas] Failed to delete item', result.reason);
      }
    },
    [
      arrowDraft,
      captureBoardSnapshot,
      editingId,
      pushUndoSnapshot,
      setConnectorsAndSync,
      setItemsAndSync,
      setSelection,
    ],
  );

  const handleDeleteSelection = useCallback(async () => {
    await handleDeleteItems(selectedIdsRef.current);
  }, [handleDeleteItems]);

  const persistItems = useCallback((nextItems: BoardItem[]) => {
    if (nextItems.length === 0) {
      return;
    }

    void Promise.all(
      nextItems.map((item) => updateBoardItem(item.id, toPayload(item))),
    ).catch((err) => {
      console.error('[Canvas] Failed to persist items', err);
    });
  }, []);

  const handleLayerChange = useCallback(
    (action: LayerAction) => {
      const targetId = primarySelectedId;
      if (targetId === null) {
        return;
      }

      const currentItems = itemsRef.current;
      const snapshotBeforeLayerChange = captureBoardSnapshot();
      const nextItems = reorderItemsForLayer(currentItems, targetId, action);
      const currentById = new Map(currentItems.map((item) => [item.id, item]));
      const changedItems = nextItems.filter((item) => {
        const currentItem = currentById.get(item.id);
        return currentItem?.z_index !== item.z_index;
      });

      if (changedItems.length === 0) {
        return;
      }

      pushUndoSnapshot(snapshotBeforeLayerChange);
      setItemsAndSync(nextItems);
      persistItems(changedItems);
    },
    [
      captureBoardSnapshot,
      persistItems,
      primarySelectedId,
      pushUndoSnapshot,
      setItemsAndSync,
    ],
  );

  const handleCopySelection = useCallback(() => {
    const selectedItems = sortItemsForClipboard(
      expandSelectionItemIds(itemsRef.current, selectedIdsRef.current, {
        excludeArrows: true,
      })
        .map((itemId) => itemsRef.current.find((item) => item.id === itemId))
        .filter((item): item is BoardItem => item !== undefined),
    );
    if (selectedItems.length === 0) {
      return;
    }

    clipboardRef.current = {
      items: selectedItems.map((item) => ({
        sourceId: item.id,
        payload: toPayload(item),
      })),
    };
    pasteCountRef.current = 0;
  }, []);

  const handlePasteSelection = useCallback(async () => {
    const clipboard = clipboardRef.current;
    if (clipboard === null || clipboard.items.length === 0) {
      return;
    }
    const snapshotBeforePaste = captureBoardSnapshot();

    const nextPasteCount = pasteCountRef.current + 1;
    const offset = PASTE_OFFSET_STEP * nextPasteCount;
    const existingItemIds = new Set(itemsRef.current.map((item) => item.id));
    const createdItems: BoardItem[] = [];
    const createdIdBySourceId = new Map<string, string>();
    const rootSourceId = clipboard.items[0]?.sourceId ?? null;
    const zBase =
      itemsRef.current.length === 0
        ? 0
        : Math.max(...itemsRef.current.map((item) => item.z_index)) + 1;

    try {
      for (const [index, entry] of clipboard.items.entries()) {
        const sourceParentId = entry.payload.parent_item_id;
        const nextParentId =
          sourceParentId !== null && createdIdBySourceId.has(sourceParentId)
            ? (createdIdBySourceId.get(sourceParentId) ?? null)
            : sourceParentId !== null && existingItemIds.has(sourceParentId)
              ? sourceParentId
              : null;

        const createdItem = await createBoardItem({
          ...entry.payload,
          page_id: page.id,
          parent_item_id: nextParentId,
          x: entry.payload.x + offset,
          y: entry.payload.y + offset,
          z_index: zBase + index,
        });
        createdItems.push(createdItem);
        createdIdBySourceId.set(entry.sourceId, createdItem.id);
      }
    } catch (err) {
      console.error('[Canvas] Failed to paste item', err);
    }

    if (createdItems.length === 0) {
      return;
    }

    pushUndoSnapshot(snapshotBeforePaste);
    setItemsAndSync((current) => [...current, ...createdItems]);
    pasteCountRef.current = nextPasteCount;

    const pastedRootId =
      rootSourceId !== null
        ? (createdIdBySourceId.get(rootSourceId) ?? createdItems[0]?.id ?? null)
        : (createdItems[0]?.id ?? null);
    const pastedSelectionIds = createdItems.map((item) => item.id);
    setSelection(
      pastedRootId === null
        ? pastedSelectionIds
        : [
            ...pastedSelectionIds.filter((itemId) => itemId !== pastedRootId),
            pastedRootId,
          ],
    );
    const pastedRoot =
      createdItems.find((item) => item.id === pastedRootId) ?? null;
    setEditingId(
      createdItems.length === 1 &&
        pastedRoot !== null &&
        isInlineEditable(pastedRoot)
        ? pastedRoot.id
        : null,
    );
  }, [
    captureBoardSnapshot,
    page.id,
    pushUndoSnapshot,
    setItemsAndSync,
    setSelection,
  ]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        return;
      }

      const isModifierDown = e.ctrlKey || e.metaKey;
      const normalizedKey = e.key.toLowerCase();

      if (isModifierDown && !e.shiftKey && normalizedKey === 'c') {
        e.preventDefault();
        handleCopySelection();
        return;
      }

      if (isModifierDown && !e.shiftKey && normalizedKey === 'v') {
        e.preventDefault();
        void handlePasteSelection();
        return;
      }

      if (isModifierDown && normalizedKey === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          void handleRedo();
          return;
        }

        void handleUndo();
        return;
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedIdsRef.current.length > 0
      ) {
        e.preventDefault();
        void handleDeleteSelection();
      }

      if (e.key === 'Escape') {
        clearSelection();
        setEditingId(null);
        setArrowDraft(null);
        setActiveTool('select');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    clearSelection,
    handleCopySelection,
    handleDeleteSelection,
    handlePasteSelection,
    handleRedo,
    handleUndo,
  ]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'v') {
        setActiveTool('select');
      }
      if (key === 'l') {
        setActiveTool('line');
      }
      if (key === 't') {
        setActiveTool('table');
      }
      if (key === 'x') {
        setActiveTool('text_box');
      }
      if (key === 's') {
        setActiveTool('sticky_note');
      }
      if (key === 'n') {
        setActiveTool('note_paper');
      }
      if (key === 'f') {
        setActiveTool('frame');
      }
      if (key === 'a') {
        setActiveTool('arrow');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (activeTool !== 'arrow' && arrowDraft !== null) {
      setArrowDraft(null);
    }

    if (activeTool !== 'select') {
      setSnapGuides([]);
    }
  }, [activeTool, arrowDraft]);

  function screenToWorld(screenX: number, screenY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }

    const vp = viewportRef.current;
    return {
      x: (screenX - rect.left - vp.x) / vp.zoom,
      y: (screenY - rect.top - vp.y) / vp.zoom,
    };
  }

  function scheduleViewportSave(nextViewport: Viewport) {
    if (vpSaveTimer.current !== null) {
      clearTimeout(vpSaveTimer.current);
    }

    vpSaveTimer.current = setTimeout(() => {
      void updatePageViewport(page.id, {
        viewport_x: nextViewport.x,
        viewport_y: nextViewport.y,
        zoom: nextViewport.zoom,
      });
    }, VIEWPORT_SAVE_DELAY);
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = -e.deltaY * 0.001;
    const vp = viewportRef.current;
    const newZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, vp.zoom * (1 + delta)),
    );
    const scale = newZoom / vp.zoom;
    const nextViewport: Viewport = {
      x: mouseX - scale * (mouseX - vp.x),
      y: mouseY - scale * (mouseY - vp.y),
      zoom: newZoom,
    };

    setViewportAndSync(nextViewport);
    scheduleViewportSave(nextViewport);
  }

  function handleToggleFrameCollapse(frameId: string) {
    const frame = itemsRef.current.find((item) => item.id === frameId);
    if (!frame || frame.type !== ITEM_TYPE.frame) {
      return;
    }
    const snapshotBeforeToggle = captureBoardSnapshot();

    const updatedFrame = { ...frame, is_collapsed: !frame.is_collapsed };
    pushUndoSnapshot(snapshotBeforeToggle);
    setItemsAndSync((current) =>
      current.map((item) => (item.id === frameId ? updatedFrame : item)),
    );

    if (updatedFrame.is_collapsed && selectedItem?.parent_item_id === frameId) {
      setSelection([frameId]);
      setEditingId(null);
    }

    void updateBoardItem(frameId, toPayload(updatedFrame)).catch((err) => {
      console.error('[Canvas] Failed to toggle frame collapse', err);
    });
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
    setSnapGuides([]);

    if (e.button === 1) {
      e.preventDefault();
      panRef.current = {
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startVpX: viewportRef.current.x,
        startVpY: viewportRef.current.y,
      };
      return;
    }

    if (e.button !== 0) {
      return;
    }

    if (isSpaceRef.current) {
      panRef.current = {
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startVpX: viewportRef.current.x,
        startVpY: viewportRef.current.y,
      };
      return;
    }

    if (activeTool === 'arrow') {
      if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        clearSelection();
      }
      setEditingId(null);
      setArrowDraft(null);
      return;
    }

    if (activeTool !== 'select') {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const size = ITEM_DEFAULT_SIZE[activeTool] ?? { width: 200, height: 100 };
      void handleCreateItem({
        type: activeTool,
        x: worldPos.x - size.width / 2,
        y: worldPos.y - size.height / 2,
        ...size,
      });
      setActiveTool('select');
      return;
    }

    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      return;
    }

    clearSelection();
    setEditingId(null);
  }

  async function handleCreateItem(params: {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const snapshotBeforeCreate = captureBoardSnapshot();
    const category =
      ITEM_CATEGORY_FOR_TYPE[params.type] ?? ITEM_CATEGORY.small_item;
    const zIndexes = itemsRef.current.map((item) => item.z_index);
    const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;
    const minZ = zIndexes.length > 0 ? Math.min(...zIndexes) : 0;
    const size = clampItemSize(params.type, params.width, params.height);

    const payload: BoardItemPayload = {
      page_id: page.id,
      parent_item_id: null,
      category,
      type: params.type,
      title: params.type === ITEM_TYPE.frame ? 'New Frame' : null,
      content:
        params.type === ITEM_TYPE.note_paper
          ? '# Untitled note\n'
          : params.type === ITEM_TYPE.line
            ? null
            : '',
      content_format: params.type === ITEM_TYPE.note_paper ? 'markdown' : null,
      x: params.x,
      y: params.y,
      width: size.width,
      height: size.height,
      rotation: 0,
      z_index: params.type === ITEM_TYPE.frame ? minZ - 1 : maxZ + 1,
      is_collapsed: false,
      style_json: null,
      data_json:
        params.type === ITEM_TYPE.table
          ? serializeTableData(createTableData())
          : null,
    };

    try {
      const created = await createBoardItem(payload);
      pushUndoSnapshot(snapshotBeforeCreate);
      setItemsAndSync((current) => [...current, created]);
      setSelection([created.id]);
      setEditingId(isInlineEditable(created) ? created.id : null);
    } catch (err) {
      console.error('[Canvas] Failed to create item', err);
    }
  }

  function syncConnectorAnchorsForItems(changedItemIds: string[]) {
    if (changedItemIds.length === 0) {
      return;
    }

    const changedIdSet = new Set(changedItemIds);
    const connectorUpdates: ConnectorLink[] = [];

    setConnectorsAndSync((current) =>
      current.map((connector) => {
        const touchesChangedItem =
          (connector.from_item_id !== null &&
            changedIdSet.has(connector.from_item_id)) ||
          (connector.to_item_id !== null &&
            changedIdSet.has(connector.to_item_id));

        if (!touchesChangedItem) {
          return connector;
        }

        if (connector.from_item_id === null || connector.to_item_id === null) {
          return connector;
        }

        const fromItem = itemsRef.current.find(
          (item) => item.id === connector.from_item_id,
        );
        const toItem = itemsRef.current.find(
          (item) => item.id === connector.to_item_id,
        );
        if (!fromItem || !toItem) {
          return connector;
        }

        const nextAnchors = getAutoAnchors(fromItem, toItem);
        if (
          connector.from_anchor === nextAnchors.from_anchor &&
          connector.to_anchor === nextAnchors.to_anchor
        ) {
          return connector;
        }

        const updatedConnector = { ...connector, ...nextAnchors };
        connectorUpdates.push(updatedConnector);
        return updatedConnector;
      }),
    );

    if (connectorUpdates.length === 0) {
      return;
    }

    void Promise.all(
      connectorUpdates.map((connector) =>
        updateConnector(connector.id, toConnectorPayload(connector)),
      ),
    ).catch((err) => {
      console.error('[Canvas] Failed to sync connector anchors', err);
    });
  }

  async function handleCreateArrow(fromItemId: string, toItemId: string) {
    if (fromItemId === toItemId) {
      setArrowDraft(null);
      return;
    }
    const snapshotBeforeArrow = captureBoardSnapshot();

    const fromItem = itemsRef.current.find((item) => item.id === fromItemId);
    const toItem = itemsRef.current.find((item) => item.id === toItemId);
    if (
      !fromItem ||
      !toItem ||
      !isArrowConnectable(fromItem) ||
      !isArrowConnectable(toItem)
    ) {
      setArrowDraft(null);
      return;
    }

    const anchors = getAutoAnchors(fromItem, toItem);
    const fromPoint = getAnchorPoint(fromItem, anchors.from_anchor);
    const toPoint = getAnchorPoint(toItem, anchors.to_anchor);
    const zIndexes = itemsRef.current.map((item) => item.z_index);
    const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;
    let createdArrow: BoardItem | null = null;

    try {
      createdArrow = await createBoardItem({
        page_id: page.id,
        parent_item_id: null,
        category: ITEM_CATEGORY.connector,
        type: ITEM_TYPE.arrow,
        title: null,
        content: null,
        content_format: null,
        x: Math.min(fromPoint.x, toPoint.x) - CONNECTOR_ITEM_PADDING,
        y: Math.min(fromPoint.y, toPoint.y) - CONNECTOR_ITEM_PADDING,
        width: Math.max(
          Math.abs(toPoint.x - fromPoint.x) + CONNECTOR_ITEM_PADDING * 2,
          40,
        ),
        height: Math.max(
          Math.abs(toPoint.y - fromPoint.y) + CONNECTOR_ITEM_PADDING * 2,
          40,
        ),
        rotation: 0,
        z_index: maxZ + 1,
        is_collapsed: false,
        style_json: null,
        data_json: '{"kind":"straight"}',
      });

      const connector = await createConnector({
        connector_item_id: createdArrow.id,
        from_item_id: fromItem.id,
        to_item_id: toItem.id,
        from_anchor: anchors.from_anchor,
        to_anchor: anchors.to_anchor,
      });

      pushUndoSnapshot(snapshotBeforeArrow);
      setItemsAndSync((current) => [...current, createdArrow as BoardItem]);
      setConnectorsAndSync((current) => [...current, connector]);
      setSelection([createdArrow.id]);
      setEditingId(null);
      setActiveTool('select');
    } catch (err) {
      if (createdArrow !== null) {
        void deleteBoardItem(createdArrow.id).catch((cleanupError) => {
          console.error(
            '[Canvas] Failed to cleanup incomplete arrow',
            cleanupError,
          );
        });
      }
      console.error('[Canvas] Failed to create arrow', err);
    } finally {
      setArrowDraft(null);
    }
  }

  function handleItemMouseDown(e: React.MouseEvent, itemId: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    e.stopPropagation();
    setSnapGuides([]);

    if (activeTool === 'arrow') {
      if (!isArrowConnectable(item)) {
        return;
      }

      setEditingId(null);
      if (arrowDraft === null) {
        setArrowDraft({ fromItemId: itemId });
        setSelection([itemId]);
        return;
      }

      void handleCreateArrow(arrowDraft.fromItemId, itemId);
      return;
    }

    if (activeTool !== 'select') {
      return;
    }

    const isModifierSelection = e.shiftKey || e.ctrlKey || e.metaKey;
    const currentSelection = selectedIdsRef.current;
    if (isModifierSelection) {
      if (currentSelection.includes(itemId)) {
        setSelection(currentSelection.filter((currentId) => currentId !== itemId));
        if (editingId === itemId) {
          setEditingId(null);
        }
      } else {
        setSelection([...currentSelection, itemId]);
      }
      return;
    }

    const nextSelectedIds = currentSelection.includes(itemId)
      ? currentSelection
      : [itemId];
    const draggedSelectionIds = expandSelectionItemIds(itemsRef.current, nextSelectedIds, {
      excludeArrows: true,
    });
    const selectionBounds = getSelectionBounds(itemsRef.current, draggedSelectionIds);
    if (selectionBounds === null) {
      return;
    }

    setSelection(nextSelectedIds);
    setEditingId(null);
    dragRef.current = {
      itemId,
      selectedItemIds: draggedSelectionIds,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBoundsX: selectionBounds.x,
      startBoundsY: selectionBounds.y,
      itemPositions: draggedSelectionIds
        .map((selectedItemId) => {
          const selectedItem = itemsRef.current.find(
            (candidate) => candidate.id === selectedItemId,
          );
          return selectedItem === undefined
            ? null
            : {
                id: selectedItem.id,
                x: selectedItem.x,
                y: selectedItem.y,
              };
        })
        .filter((entry): entry is { id: string; x: number; y: number } => entry !== null),
      snapshot: captureBoardSnapshot(),
    };
  }

  function handleArrowMouseDown(
    e: React.MouseEvent<SVGLineElement>,
    itemId: string,
  ) {
    e.stopPropagation();

    if (activeTool !== 'select') {
      return;
    }

    const isModifierSelection = e.shiftKey || e.ctrlKey || e.metaKey;
    const currentSelection = selectedIdsRef.current;
    if (isModifierSelection) {
      if (currentSelection.includes(itemId)) {
        setSelection(currentSelection.filter((currentId) => currentId !== itemId));
      } else {
        setSelection([...currentSelection, itemId]);
      }
      setEditingId(null);
      return;
    }

    setSelection([itemId]);
    setEditingId(null);
  }

  function handleResizeMouseDown(e: React.MouseEvent, itemId: string) {
    e.stopPropagation();
    setSnapGuides([]);
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    setSelection([itemId]);
    setEditingId(null);
    resizeRef.current = {
      itemId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startWidth: item.width,
      startHeight: item.height,
      snapshot: captureBoardSnapshot(),
    };
  }

  function handleMouseMove(e: React.MouseEvent) {
    const shouldUseSnap = snapEnabled && !e.altKey;
    const resize = resizeRef.current;
    if (resize) {
      const vp = viewportRef.current;
      const dx = (e.clientX - resize.startMouseX) / vp.zoom;
      const dy = (e.clientY - resize.startMouseY) / vp.zoom;
      const item = itemsRef.current.find(
        (candidate) => candidate.id === resize.itemId,
      );
      if (!item) {
        setSnapGuides([]);
        return;
      }

      const rawRect = {
        x: item.x,
        y: item.y,
        width: resize.startWidth + dx,
        height: resize.startHeight + dy,
      };
      const snapResult = shouldUseSnap
        ? snapResizeRect(
            rawRect,
            getSnapTargetRects([resize.itemId]),
            SNAP_TOLERANCE,
          )
        : { width: rawRect.width, height: rawRect.height, guides: [] };
      const nextSize = clampItemSize(
        item.type,
        snapResult.width,
        snapResult.height,
      );
      setSnapGuides(snapResult.guides);

      setItemsAndSync((current) =>
        current.map((item) => {
          if (item.id !== resize.itemId) {
            return item;
          }

          return {
            ...item,
            width: nextSize.width,
            height: nextSize.height,
          };
        }),
      );
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      const vp = viewportRef.current;
      const dx = (e.clientX - drag.startMouseX) / vp.zoom;
      const dy = (e.clientY - drag.startMouseY) / vp.zoom;
      if (drag.itemPositions.length === 0) {
        setSnapGuides([]);
        return;
      }

      const selectionBounds = getSelectionBounds(
        itemsRef.current,
        drag.selectedItemIds,
      );
      if (selectionBounds === null) {
        setSnapGuides([]);
        return;
      }

      const rawX = drag.startBoundsX + dx;
      const rawY = drag.startBoundsY + dy;
      const snapResult = shouldUseSnap
        ? snapMoveRect(
            {
              x: rawX,
              y: rawY,
              width: selectionBounds.width,
              height: selectionBounds.height,
            },
            getSnapTargetRects(drag.selectedItemIds),
            SNAP_TOLERANCE,
          )
        : { x: rawX, y: rawY, guides: [] };
      const offsetX = snapResult.x - drag.startBoundsX;
      const offsetY = snapResult.y - drag.startBoundsY;
      const itemStartMap = new Map(
        drag.itemPositions.map((entry) => [entry.id, entry] as const),
      );
      setSnapGuides(snapResult.guides);

      setItemsAndSync((current) =>
        current.map((item) => {
          const itemStart = itemStartMap.get(item.id);
          if (itemStart) {
            return {
              ...item,
              x: itemStart.x + offsetX,
              y: itemStart.y + offsetY,
            };
          }

          return item;
        }),
      );
      return;
    }

    const pan = panRef.current;
    if (pan) {
      setSnapGuides([]);
      const nextViewport: Viewport = {
        ...viewportRef.current,
        x: pan.startVpX + (e.clientX - pan.startMouseX),
        y: pan.startVpY + (e.clientY - pan.startMouseY),
      };
      setViewportAndSync(nextViewport);
      return;
    }

    setSnapGuides([]);
  }

  function handleMouseUp() {
    setSnapGuides([]);

    const resize = resizeRef.current;
    if (resize) {
      resizeRef.current = null;
      const item = itemsRef.current.find(
        (candidate) => candidate.id === resize.itemId,
      );
      if (item) {
        let nextItems = itemsRef.current;
        const changedIds = new Set<string>([item.id]);

        if (isFrame(item)) {
          const relayoutResult = relayoutFrameItems(nextItems, [item.id]);
          nextItems = relayoutResult.items;
          for (const changedId of relayoutResult.changedIds) {
            changedIds.add(changedId);
          }

          if (relayoutResult.changedIds.length > 0) {
            setItemsAndSync(nextItems);
          }
        }

        persistItems(
          nextItems.filter((candidate) => changedIds.has(candidate.id)),
        );
        syncConnectorAnchorsForItems([...changedIds]);
      }
      recordHistoryCheckpoint(resize.snapshot);
    }

    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      let nextItems = itemsRef.current;
      const movedItemIds = getUniqueItemIds(drag.selectedItemIds);
      const changedIds = new Set<string>(movedItemIds);
      const frameIdsToRelayout = new Set<string>();
      const movedFrameIds = new Set(
        movedItemIds.filter((itemId) => {
          const item = nextItems.find((candidate) => candidate.id === itemId);
          return item !== undefined && isFrame(item);
        }),
      );

      for (const movedItemId of movedItemIds) {
        const movedItem = nextItems.find((item) => item.id === movedItemId);
        if (!movedItem || !isSmallItem(movedItem)) {
          continue;
        }

        if (
          movedItem.parent_item_id !== null &&
          movedFrameIds.has(movedItem.parent_item_id)
        ) {
          continue;
        }

        const nextParent = findContainingFrame(movedItem, nextItems);
        const nextParentId = nextParent?.id ?? null;
        if (nextParentId === movedItem.parent_item_id) {
          continue;
        }

        if (movedItem.parent_item_id !== null) {
          frameIdsToRelayout.add(movedItem.parent_item_id);
        }
        if (nextParentId !== null) {
          frameIdsToRelayout.add(nextParentId);
        }

        nextItems = nextItems.map((item) =>
          item.id === movedItem.id
            ? { ...item, parent_item_id: nextParentId }
            : item,
        );
      }

      const relayoutResult = relayoutFrameItems(nextItems, [...frameIdsToRelayout]);
      nextItems = relayoutResult.items;
      for (const changedId of relayoutResult.changedIds) {
        changedIds.add(changedId);
      }

      if (nextItems !== itemsRef.current) {
        setItemsAndSync(nextItems);
      }

      persistItems(nextItems.filter((item) => changedIds.has(item.id)));
      syncConnectorAnchorsForItems([...changedIds]);
      recordHistoryCheckpoint(drag.snapshot);
    }

    if (panRef.current) {
      panRef.current = null;
      scheduleViewportSave(viewportRef.current);
    }
  }

  const handleItemUpdate = useCallback(
    (updated: BoardItem) => {
      if (editSessionRef.current?.itemId !== updated.id) {
        pushUndoSnapshot(captureBoardSnapshot());
        editSessionRef.current = { itemId: updated.id };
      }

      setItemsAndSync((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );

      if (itemSaveTimer.current !== null) {
        clearTimeout(itemSaveTimer.current);
      }

      itemSaveTimer.current = setTimeout(() => {
        void updateBoardItem(updated.id, toPayload(updated)).catch((err) => {
          console.error('[Canvas] Failed to update item', err);
        });
        if (editSessionRef.current?.itemId === updated.id) {
          editSessionRef.current = null;
        }
      }, ITEM_SAVE_DELAY);
    },
    [captureBoardSnapshot, pushUndoSnapshot, setItemsAndSync],
  );

  const handleEditEnd = useCallback(() => {
    editSessionRef.current = null;
    setEditingId(null);
  }, []);

  function handleItemDoubleClick(item: BoardItem) {
    setSelection([item.id]);
    if (isFrame(item)) {
      handleToggleFrameCollapse(item.id);
      return;
    }

    if (isInlineEditable(item)) {
      setEditingId(item.id);
    }
  }

  const cursorClass =
    activeTool !== 'select'
      ? 'cursor-crosshair'
      : isSpaceDown
        ? 'cursor-grab'
        : '';

  const worldTransform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;

  return (
    <div className="canvas-root">
      <Toolbar
        activeTool={activeTool}
        onToolChange={setActiveTool}
        snapEnabled={snapEnabled}
        onToggleSnap={() => setSnapEnabled((current) => !current)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => void handleUndo()}
        onRedo={() => void handleRedo()}
        historyBusy={isHistorySyncing}
      />
      <div className="canvas-content">
        <div className="canvas-stage">
          <div
            ref={containerRef}
            className={`canvas-container ${cursorClass}`}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <div className="canvas-dot-grid" />

            {snapGuides.map((guide, index) => (
              <div
                key={`${guide.axis}-${guide.position}-${index}`}
                className={`canvas-snap-guide canvas-snap-guide-${guide.axis}`}
                style={
                  guide.axis === 'x'
                    ? { left: viewport.x + guide.position * viewport.zoom }
                    : { top: viewport.y + guide.position * viewport.zoom }
                }
              />
            ))}

            <div
              className="canvas-world"
              style={{ transform: worldTransform, transformOrigin: '0 0' }}
            >
              {visibleItems.map((item) => {
                if (item.type === ITEM_TYPE.arrow) {
                  const connector = connectorByItemId.get(item.id);
                  const connectorPoints =
                    connector !== undefined
                      ? getConnectorPoints(connector, items)
                      : null;

                  if (!connector || !connectorPoints) {
                    return null;
                  }

                  return (
                    <ArrowConnector
                      key={item.id}
                      item={item}
                      connector={connector}
                      fromPoint={connectorPoints.fromPoint}
                      toPoint={connectorPoints.toPoint}
                      isSelected={selectedIds.includes(item.id)}
                      onMouseDown={(e) => handleArrowMouseDown(e, item.id)}
                    />
                  );
                }

                const childItems = isFrame(item)
                  ? getFrameChildren(items, item.id)
                  : [];
                return (
                    <BoardItemRenderer
                      key={item.id}
                      item={item}
                      childCount={childItems.length}
                      childSummaries={childItems.map(summarizeFrameChild)}
                      isSelected={selectedIds.includes(item.id)}
                      isEditing={item.id === editingId}
                      onMouseDown={(e) => handleItemMouseDown(e, item.id)}
                      onDoubleClick={() => handleItemDoubleClick(item)}
                    onResizeMouseDown={(e) => handleResizeMouseDown(e, item.id)}
                    onToggleCollapse={() => handleToggleFrameCollapse(item.id)}
                    onUpdate={handleItemUpdate}
                    onEditEnd={handleEditEnd}
                  />
                );
              })}
            </div>

            {items.length === 0 ? (
              <div className="canvas-empty-hint">
                <p>
                  用工具列新增線條、表格、文字框、便利貼、筆記紙、
                  frame 或箭頭，滑鼠滾輪縮放，按住空白鍵拖曳平移。
                </p>
              </div>
            ) : null}

            <div className="canvas-corner-stack">
              {activeTool === 'arrow' ? (
                <div className="canvas-guide-badge">
                  {arrowDraft === null
                    ? '箭頭工具：先點選起點物件'
                    : '箭頭工具：再點選終點物件完成連線'}
                </div>
              ) : null}
              <div
                className={`canvas-guide-badge ${
                  snapEnabled ? '' : 'canvas-guide-badge-muted'
                }`}
              >
                {snapEnabled
                  ? `Snap 開啟 · ${SNAP_TOLERANCE}px · Alt 暫停`
                  : 'Snap 關閉'}
              </div>
            </div>

            <div className="canvas-status-badge">
              {Math.round(viewport.zoom * 100)}%
            </div>
          </div>
        </div>

        <Inspector
          item={selectedItem}
          connector={selectedConnector}
          selectionCount={selectedIds.length}
          childCount={selectedChildCount}
          onUpdate={handleItemUpdate}
          onDelete={() => void handleDeleteSelection()}
          onToggleCollapse={() => {
            if (selectedItem?.type === ITEM_TYPE.frame) {
              handleToggleFrameCollapse(selectedItem.id);
            }
          }}
          onBringToFront={() => handleLayerChange('bringToFront')}
          onSendToBack={() => handleLayerChange('sendToBack')}
        />
      </div>
    </div>
  );
}
