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
  deleteConnector,
  deleteBoardItem,
  getPageBoardData,
  replacePageBoardState,
  updateBoardItem,
  updateConnector,
  updatePageViewport,
  type BoardItemPayload,
  type Page,
} from './api';
import {
  areBoardSnapshotsEqual,
  cloneBoardSnapshot,
  type BoardHistoryEntry,
  type BoardSnapshot,
  prepareRedoHistory,
  prepareUndoHistory,
  pushUndoHistory,
} from './boardHistory';
import {
  findFrameDropTarget,
  findTableCellDropTarget,
  getAnchorPoint,
  getAutoAnchors,
  getConnectorPoints,
  getFrameChildFitSize,
  getFrameEjectPosition,
  getFrameOverlapScore,
  getFrameChildren,
  getItemConnectorAnchors,
  getTableCellBounds,
  computeCellChildLayout,
  findNearestConnectorAnchor,
  getItemsNearPoint,
  isAnchor,
  isHiddenByCollapsedFrame,
  isSmallItem,
  summarizeFrameChild,
  type AnchorHit,
  type TableCellHit,
} from './canvasHelpers';
import { Inspector } from './Inspector';
import {
  buildSegmentGeometry,
  canTranslateSegmentItem,
  getSegmentConnections,
  getSegmentWaypoints,
  getSegmentWorldPoints,
  hasStoredSegmentData,
  insertWaypointAt,
  moveWaypointAt,
  updateSegmentEndpoint,
  type Point,
  type SegmentConnection,
  type SegmentEndpoint,
} from './segmentData';
import { snapMoveRect, snapResizeRect, type SnapGuide } from './snap';
import { Toolbar } from './Toolbar';
import { ArrowConnector } from './items/ArrowConnector';
import { BoardItemRenderer } from './items/BoardItemRenderer';
import { SegmentShape } from './items/SegmentShape';
import { createTableData, findCellByChildItemId, parseTableData, serializeTableData, updateTableCell, getRootCellAt } from './tableData';
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
const SNAP_TOLERANCE = 10;
const CONNECTOR_SNAP_THRESHOLD = 24;
const PASTE_OFFSET_STEP = 32;
const MAX_HISTORY_ENTRIES = 50;
const FRAME_LAYOUT_PADDING_X = 20;
const FRAME_LAYOUT_PADDING_TOP = 72;

type DragState = {
  itemId: string;
  selectedItemIds: string[];
  startMouseX: number;
  startMouseY: number;
  startBoundsX: number;
  startBoundsY: number;
  itemPositions: Array<{ id: string; x: number; y: number }>;
  snapshot: BoardSnapshot;
  detachedConnectorIds: string[];
  hasDetachedSegments: boolean;
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

type SegmentDraftTool = Extract<ActiveTool, 'line' | 'arrow'>;

type SegmentDraftState = {
  type: SegmentDraftTool;
  start: Point;
  end: Point;
  startConnection: SegmentConnection | null;
  endConnection: SegmentConnection | null;
  snapshot: BoardSnapshot;
};

type SegmentEndpointDragState = {
  itemId: string;
  endpoint: SegmentEndpoint;
  connection: SegmentConnection | null;
  snapshot: BoardSnapshot;
};

type WaypointDragState = {
  itemId: string;
  waypointIndex: number;
  snapshot: BoardSnapshot;
};

type ClipboardEntry = {
  sourceId: string;
  payload: BoardItemPayload;
};

type ClipboardSnapshot = {
  items: ClipboardEntry[];
};

type LayerAction = 'bringToFront' | 'sendToBack';

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

function isFrame(item: BoardItem): boolean {
  return item.type === ITEM_TYPE.frame;
}

function isLegacyConnectorArrow(item: BoardItem): boolean {
  return item.type === ITEM_TYPE.arrow && !hasStoredSegmentData(item);
}

function isInlineEditable(item: BoardItem): boolean {
  return (
    item.type === ITEM_TYPE.table ||
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.sticky_note ||
    item.type === ITEM_TYPE.note_paper
  );
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

function getDraggableSelectionItemIds(
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

function detachDraggedSegments(
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

function getFrameContentBounds(frame: BoardItem): {
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

function fitItemWithinBounds(
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

function clampItemToFrame(
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

function isItemFullyOutsideFrame(item: BoardItem, frame: BoardItem): boolean {
  const bounds = getFrameContentBounds(frame);

  return (
    item.x + item.width <= bounds.left ||
    item.x >= bounds.right ||
    item.y + item.height <= bounds.top ||
    item.y >= bounds.bottom
  );
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
  const [segmentDraft, setSegmentDraft] = useState<SegmentDraftState | null>(
    null,
  );
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isHistorySyncing, setIsHistorySyncing] = useState(false);
  const [anchorIndicatorItems, setAnchorIndicatorItems] = useState<BoardItem[]>([]);
  const [activeAnchorHit, setActiveAnchorHit] = useState<AnchorHit | null>(null);
  const [deletingWaypointInfo, setDeletingWaypointInfo] = useState<{ itemId: string; waypointIndex: number } | null>(null);
  const [activeFrameDropTargetId, setActiveFrameDropTargetId] = useState<string | null>(null);
  const [activeTableDropTarget, setActiveTableDropTarget] = useState<TableCellHit | null>(null);
  const [frameItemAnimations, setFrameItemAnimations] = useState<
    Record<string, 'ingest' | 'eject'>
  >({});

  const viewportRef = useRef<Viewport>(viewport);
  const itemsRef = useRef<BoardItem[]>(items);
  const connectorsRef = useRef<ConnectorLink[]>(connectors);
  const frameAnimationTimersRef = useRef(new Map<string, number>());
  const selectedIdsRef = useRef<string[]>(selectedIds);
  const clipboardRef = useRef<ClipboardSnapshot | null>(null);
  const pasteCountRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const segmentEndpointDragRef = useRef<SegmentEndpointDragState | null>(null);
  const waypointDragRef = useRef<WaypointDragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const isSpaceRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const vpSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStackRef = useRef<BoardHistoryEntry[]>([]);
  const redoStackRef = useRef<BoardHistoryEntry[]>([]);
  const editSessionRef = useRef<EditSessionState | null>(null);

  useLayoutEffect(() => {
    viewportRef.current = viewport;
    itemsRef.current = items;
    connectorsRef.current = connectors;
    selectedIdsRef.current = selectedIds;
  }, [connectors, items, selectedIds, viewport]);

  const triggerFrameItemAnimation = useCallback(
    (itemIds: string[], animation: 'ingest' | 'eject') => {
      const normalizedIds = getUniqueItemIds(itemIds);
      if (normalizedIds.length === 0) {
        return;
      }

      setFrameItemAnimations((current) => {
        const next = { ...current };
        for (const itemId of normalizedIds) {
          next[itemId] = animation;
        }
        return next;
      });

      for (const itemId of normalizedIds) {
        const currentTimer = frameAnimationTimersRef.current.get(itemId);
        if (currentTimer !== undefined) {
          window.clearTimeout(currentTimer);
        }

        const nextTimer = window.setTimeout(() => {
          frameAnimationTimersRef.current.delete(itemId);
          setFrameItemAnimations((current) => {
            if (current[itemId] === undefined) {
              return current;
            }

            const next = { ...current };
            delete next[itemId];
            return next;
          });
        }, 280);

        frameAnimationTimersRef.current.set(itemId, nextTimer);
      }
    },
    [],
  );

  useEffect(() => {
    const animationTimers = frameAnimationTimersRef.current;
    return () => {
      for (const timerId of animationTimers.values()) {
        window.clearTimeout(timerId);
      }
      animationTimers.clear();
    };
  }, []);

  useEffect(() => {
    const drag = dragRef.current;
    if (drag === null) {
      if (activeFrameDropTargetId !== null) {
        setActiveFrameDropTargetId(null);
      }
      if (activeTableDropTarget !== null) {
        setActiveTableDropTarget(null);
      }
      return;
    }

    let nextTargetId: string | null = null;
    let bestScore = 0;
    let nextTableHit: TableCellHit | null = null;

    for (const draggedItemId of drag.selectedItemIds) {
      const draggedItem = items.find((candidate) => candidate.id === draggedItemId);
      if (!draggedItem || !isSmallItem(draggedItem)) {
        continue;
      }

      const frame = findFrameDropTarget(draggedItem, items);
      if (frame) {
        const score = getFrameOverlapScore(draggedItem, frame);
        if (score > bestScore) {
          bestScore = score;
          nextTargetId = frame.id;
        }
      }

      // Table cell drop detection (only when no frame target)
      if (!nextTargetId) {
        const tableHit = findTableCellDropTarget(draggedItem, items);
        if (tableHit) {
          nextTableHit = tableHit;
        }
      }
    }

    if (nextTargetId !== activeFrameDropTargetId) {
      setActiveFrameDropTargetId(nextTargetId);
    }
    const prevTableHit = activeTableDropTarget;
    const tableHitChanged =
      nextTableHit?.cellId !== prevTableHit?.cellId ||
      nextTableHit?.tableId !== prevTableHit?.tableId;
    if (tableHitChanged) {
      setActiveTableDropTarget(nextTableHit);
    }
  }, [activeFrameDropTargetId, activeTableDropTarget, items]);

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
    return cloneBoardSnapshot({
      items: itemsRef.current,
      connectors: connectorsRef.current,
      selectedIds: selectedIdsRef.current,
    });
  }, []);

  const resetHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    editSessionRef.current = null;
    syncHistoryState();
  }, [syncHistoryState]);

  const pushUndoSnapshot = useCallback(
    (snapshot: BoardSnapshot) => {
      const nextHistory = pushUndoHistory(
        undoStackRef.current,
        snapshot,
        MAX_HISTORY_ENTRIES,
      );
      if (!nextHistory.added) {
        return;
      }

      undoStackRef.current = nextHistory.undoStack;
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
        setSegmentDraft(null);
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

    const previousUndoStack = undoStackRef.current;
    const previousRedoStack = redoStackRef.current;
    const transition = prepareUndoHistory(
      previousUndoStack,
      previousRedoStack,
      captureBoardSnapshot(),
      MAX_HISTORY_ENTRIES,
    );
    if (transition.targetSnapshot === null) {
      syncHistoryState();
      return;
    }

    undoStackRef.current = transition.undoStack;
    redoStackRef.current = transition.redoStack;
    syncHistoryState();

    const restored = await restoreBoardSnapshot(transition.targetSnapshot);
    if (!restored) {
      undoStackRef.current = previousUndoStack;
      redoStackRef.current = previousRedoStack;
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

    const previousUndoStack = undoStackRef.current;
    const previousRedoStack = redoStackRef.current;
    const transition = prepareRedoHistory(
      previousUndoStack,
      previousRedoStack,
      captureBoardSnapshot(),
      MAX_HISTORY_ENTRIES,
    );
    if (transition.targetSnapshot === null) {
      syncHistoryState();
      return;
    }

    undoStackRef.current = transition.undoStack;
    redoStackRef.current = transition.redoStack;
    syncHistoryState();

    const restored = await restoreBoardSnapshot(transition.targetSnapshot);
    if (!restored) {
      undoStackRef.current = previousUndoStack;
      redoStackRef.current = previousRedoStack;
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

  const segmentDraftPreviewItem = useMemo(() => {
    if (segmentDraft === null) {
      return null;
    }

    const geometry = buildSegmentGeometry(segmentDraft.start, segmentDraft.end, null);
    return {
      id: '__segment-draft__',
      page_id: page.id,
      parent_item_id: null,
      category: ITEM_CATEGORY_FOR_TYPE[segmentDraft.type] ?? ITEM_CATEGORY.shape,
      type: segmentDraft.type,
      title: null,
      content: null,
      content_format: null,
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      rotation: geometry.rotation,
      z_index: Number.MAX_SAFE_INTEGER,
      is_collapsed: false,
      style_json: null,
      data_json: geometry.data_json,
      created_at: 'draft',
      updated_at: 'draft',
    } satisfies BoardItem;
  }, [page.id, segmentDraft]);

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
        setSegmentDraft(null);
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
        setSegmentDraft(null);
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
    if (segmentDraft !== null && activeTool !== segmentDraft.type) {
      setSegmentDraft(null);
    }

    if (activeTool !== 'select') {
      setSnapGuides([]);
    }

    // Clear anchor indicators when switching away from line/arrow tool
    if (activeTool !== 'line' && activeTool !== 'arrow') {
      setAnchorIndicatorItems([]);
      setActiveAnchorHit(null);
    }
  }, [activeTool, segmentDraft]);

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

  function startSegmentDraft(
    type: SegmentDraftTool,
    clientX: number,
    clientY: number,
  ) {
    const worldPos = screenToWorld(clientX, clientY);
    const snapshot = captureBoardSnapshot();

    // Check if starting near an anchor point
    const anchorHit = findNearestConnectorAnchor(
      worldPos,
      itemsRef.current,
      new Set(),
      CONNECTOR_SNAP_THRESHOLD,
    );

    const startPoint = anchorHit ? anchorHit.point : worldPos;
    const startConn: SegmentConnection | null = anchorHit
      ? { itemId: anchorHit.itemId, anchor: anchorHit.anchor }
      : null;

    clearSelection();
    setEditingId(null);
    setSnapGuides([]);
    setAnchorIndicatorItems([]);
    setActiveAnchorHit(anchorHit);
    setSegmentDraft({
      type,
      start: startPoint,
      end: startPoint,
      startConnection: startConn,
      endConnection: null,
      snapshot,
    });
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

    if (activeTool === 'line' || activeTool === 'arrow') {
      startSegmentDraft(activeTool, e.clientX, e.clientY);
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

  async function handleCreateSegmentItem(draft: SegmentDraftState) {
    const geometry = buildSegmentGeometry(
      draft.start,
      draft.end,
      null,
      draft.startConnection,
      draft.endConnection,
    );
    const zIndexes = itemsRef.current.map((item) => item.z_index);
    const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;

    try {
      const created = await createBoardItem({
        page_id: page.id,
        parent_item_id: null,
        category: ITEM_CATEGORY_FOR_TYPE[draft.type] ?? ITEM_CATEGORY.shape,
        type: draft.type,
        title: null,
        content: null,
        content_format: null,
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        rotation: geometry.rotation,
        z_index: maxZ + 1,
        is_collapsed: false,
        style_json: null,
        data_json: geometry.data_json,
      });

      pushUndoSnapshot(draft.snapshot);
      setItemsAndSync((current) => [...current, created]);
      setSelection([created.id]);
      setEditingId(null);
      setActiveTool('select');
      setAnchorIndicatorItems([]);
      setActiveAnchorHit(null);
    } catch (err) {
      console.error('[Canvas] Failed to create segment item', err);
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

  /**
   * When connectable items move, update any segment (line/arrow) that has a
   * connection pointing at one of those items so the endpoint follows.
   */
  function syncSegmentConnectionsForItems(changedItemIds: string[]) {
    if (changedItemIds.length === 0) {
      return;
    }

    const changedIdSet = new Set(changedItemIds);
    const itemById = new Map(itemsRef.current.map((item) => [item.id, item]));
    const segmentUpdates: BoardItem[] = [];

    setItemsAndSync((current) =>
      current.map((item) => {
        if (item.type !== ITEM_TYPE.line && item.type !== ITEM_TYPE.arrow) {
          return item;
        }
        if (!hasStoredSegmentData(item)) {
          return item;
        }

        const conns = getSegmentConnections(item);
        const startTouched =
          conns.startConnection !== null &&
          changedIdSet.has(conns.startConnection.itemId);
        const endTouched =
          conns.endConnection !== null &&
          changedIdSet.has(conns.endConnection.itemId);

        if (!startTouched && !endTouched) {
          return item;
        }

        const worldPoints = getSegmentWorldPoints(item);
        if (!worldPoints) {
          return item;
        }

        let newStart = worldPoints.start;
        let newEnd = worldPoints.end;

        if (startTouched && conns.startConnection) {
          const targetItem = itemById.get(conns.startConnection.itemId);
          if (targetItem) {
            newStart = getAnchorPoint(
              targetItem,
              isAnchor(conns.startConnection.anchor)
                ? conns.startConnection.anchor
                : null,
            );
          }
        }

        if (endTouched && conns.endConnection) {
          const targetItem = itemById.get(conns.endConnection.itemId);
          if (targetItem) {
            newEnd = getAnchorPoint(
              targetItem,
              isAnchor(conns.endConnection.anchor)
                ? conns.endConnection.anchor
                : null,
            );
          }
        }

        const waypoints = getSegmentWaypoints(item);
        const geometry = buildSegmentGeometry(
          newStart,
          newEnd,
          waypoints,
          conns.startConnection,
          conns.endConnection,
        );
        const updated = { ...item, ...geometry };
        segmentUpdates.push(updated);
        return updated;
      }),
    );

    if (segmentUpdates.length > 0) {
      void Promise.all(
        segmentUpdates.map((item) => updateBoardItem(item.id, toPayload(item))),
      ).catch((err) => {
        console.error('[Canvas] Failed to sync segment connections', err);
      });
    }
  }

  function handleItemMouseDown(e: React.MouseEvent, itemId: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    e.stopPropagation();
    setSnapGuides([]);

    if (activeTool === 'line' || activeTool === 'arrow') {
      startSegmentDraft(activeTool, e.clientX, e.clientY);
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
    const draggedSelectionIds = getDraggableSelectionItemIds(
      itemsRef.current,
      nextSelectedIds,
    );
    setSelection(nextSelectedIds);
    setEditingId(null);

    if (draggedSelectionIds.length === 0) {
      return;
    }

    const selectionBounds = getSelectionBounds(itemsRef.current, draggedSelectionIds);
    if (selectionBounds === null) {
      return;
    }

    // Segment items (line/arrow) cannot be moved by dragging the body —
    // only endpoints and waypoints are draggable.
    const isSegmentItem = item.type === ITEM_TYPE.line || item.type === ITEM_TYPE.arrow;
    if (isSegmentItem && !canTranslateSegmentItem(item)) {
      return;
    }

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
      detachedConnectorIds: [],
      hasDetachedSegments: false,
    };
  }

  function handleArrowMouseDown(
    e: React.MouseEvent<SVGLineElement>,
    itemId: string,
  ) {
    e.stopPropagation();

    if (activeTool === 'line' || activeTool === 'arrow') {
      startSegmentDraft(activeTool, e.clientX, e.clientY);
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
      } else {
        setSelection([...currentSelection, itemId]);
      }
      setEditingId(null);
      return;
    }

    setSelection([itemId]);
    setEditingId(null);
  }

  function handleSegmentEndpointMouseDown(
    e: React.MouseEvent<HTMLButtonElement>,
    itemId: string,
    endpoint: SegmentEndpoint,
  ) {
    e.preventDefault();
    e.stopPropagation();
    setSnapGuides([]);
    setSelection([itemId]);
    setEditingId(null);
    segmentEndpointDragRef.current = {
      itemId,
      endpoint,
      connection: null,
      snapshot: captureBoardSnapshot(),
    };
  }

  function handleSegmentWaypointMouseDown(
    e: React.MouseEvent<HTMLButtonElement>,
    itemId: string,
    waypointIndex: number,
  ) {
    e.preventDefault();
    e.stopPropagation();
    setSnapGuides([]);
    setSelection([itemId]);
    setEditingId(null);
    waypointDragRef.current = {
      itemId,
      waypointIndex,
      snapshot: captureBoardSnapshot(),
    };
  }

  function handleSegmentMidpointMouseDown(
    e: React.MouseEvent<HTMLButtonElement>,
    itemId: string,
    segmentIndex: number,
  ) {
    e.preventDefault();
    e.stopPropagation();

    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    const worldPoint = screenToWorld(e.clientX, e.clientY);
    const result = insertWaypointAt(item, segmentIndex, worldPoint);
    if (result === null) {
      return;
    }

    const snapshot = captureBoardSnapshot();
    const { waypointIndex: newIndex, ...geometry } = result;

    setItemsAndSync((current) =>
      current.map((candidate) =>
        candidate.id === itemId ? { ...candidate, ...geometry } : candidate,
      ),
    );
    setSelection([itemId]);
    setEditingId(null);

    waypointDragRef.current = {
      itemId,
      waypointIndex: newIndex,
      snapshot,
    };
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

    const waypointDrag = waypointDragRef.current;
    if (waypointDrag) {
      const item = itemsRef.current.find(
        (candidate) => candidate.id === waypointDrag.itemId,
      );
      if (!item) {
        setSnapGuides([]);
        return;
      }

      const rawPoint = screenToWorld(e.clientX, e.clientY);
      const nextGeometry = moveWaypointAt(item, waypointDrag.waypointIndex, rawPoint);
      if (nextGeometry === null) {
        return;
      }

      // Check if dragged close enough to start/end to trigger delete
      const SNAP_DELETE_DIST = 10;
      const worldPts = getSegmentWorldPoints(item);
      if (worldPts !== null) {
        const dStart = Math.hypot(rawPoint.x - worldPts.start.x, rawPoint.y - worldPts.start.y);
        const dEnd = Math.hypot(rawPoint.x - worldPts.end.x, rawPoint.y - worldPts.end.y);
        if (dStart < SNAP_DELETE_DIST || dEnd < SNAP_DELETE_DIST) {
          setDeletingWaypointInfo({ itemId: waypointDrag.itemId, waypointIndex: waypointDrag.waypointIndex });
        } else {
          setDeletingWaypointInfo(null);
        }
      }

      setSnapGuides([]);
      setItemsAndSync((current) =>
        current.map((candidate) =>
          candidate.id === waypointDrag.itemId
            ? { ...candidate, ...nextGeometry }
            : candidate,
        ),
      );
      return;
    }

    const endpointDrag = segmentEndpointDragRef.current;
    if (endpointDrag) {
      const item = itemsRef.current.find(
        (candidate) => candidate.id === endpointDrag.itemId,
      );
      if (!item) {
        setSnapGuides([]);
        setAnchorIndicatorItems([]);
        setActiveAnchorHit(null);
        return;
      }

      const rawPoint = screenToWorld(e.clientX, e.clientY);

      // Check for connector anchor snap
      const anchorHit = findNearestConnectorAnchor(
        rawPoint,
        itemsRef.current,
        new Set([endpointDrag.itemId]),
        CONNECTOR_SNAP_THRESHOLD,
      );
      const nextPoint = anchorHit ? anchorHit.point : rawPoint;
      const nextConn: SegmentConnection | null = anchorHit
        ? { itemId: anchorHit.itemId, anchor: anchorHit.anchor }
        : null;

      endpointDrag.connection = nextConn;

      // Show anchor indicators on nearby items
      const nearbyItems = getItemsNearPoint(
        rawPoint,
        itemsRef.current,
        new Set([endpointDrag.itemId]),
        CONNECTOR_SNAP_THRESHOLD * 2,
      );
      setAnchorIndicatorItems(nearbyItems);
      setActiveAnchorHit(anchorHit);

      const nextGeometry = updateSegmentEndpoint(
        item,
        endpointDrag.endpoint,
        nextPoint,
        nextConn,
      );
      if (nextGeometry === null) {
        return;
      }

      setSnapGuides([]);
      setItemsAndSync((current) =>
        current.map((candidate) =>
          candidate.id === endpointDrag.itemId
            ? { ...candidate, ...nextGeometry }
            : candidate,
        ),
      );
      return;
    }

    if (segmentDraft !== null) {
      setSnapGuides([]);
      const rawPoint = screenToWorld(e.clientX, e.clientY);

      // Check for connector anchor snap on end point
      const excludeIds = new Set<string>();
      if (segmentDraft.startConnection) {
        excludeIds.add(segmentDraft.startConnection.itemId);
      }
      const anchorHit = findNearestConnectorAnchor(
        rawPoint,
        itemsRef.current,
        excludeIds,
        CONNECTOR_SNAP_THRESHOLD,
      );
      const nextPoint = anchorHit ? anchorHit.point : rawPoint;
      const nextConn: SegmentConnection | null = anchorHit
        ? { itemId: anchorHit.itemId, anchor: anchorHit.anchor }
        : null;

      // Show anchor indicators on nearby items
      const nearbyItems = getItemsNearPoint(
        rawPoint,
        itemsRef.current,
        excludeIds,
        CONNECTOR_SNAP_THRESHOLD * 2,
      );
      setAnchorIndicatorItems(nearbyItems);
      setActiveAnchorHit(anchorHit);

      setSegmentDraft((current) =>
        current === null ? null : { ...current, end: nextPoint, endConnection: nextConn },
      );
      return;
    }

    // When line/arrow tool is active but no draft, show anchor indicators on hover
    if (activeTool === 'line' || activeTool === 'arrow') {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const nearbyItems = getItemsNearPoint(
        worldPos,
        itemsRef.current,
        new Set(),
        CONNECTOR_SNAP_THRESHOLD * 2,
      );
      setAnchorIndicatorItems(nearbyItems);

      const anchorHit = findNearestConnectorAnchor(
        worldPos,
        itemsRef.current,
        new Set(),
        CONNECTOR_SNAP_THRESHOLD,
      );
      setActiveAnchorHit(anchorHit);
    }

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
      let baseItems = itemsRef.current;

      if (!drag.hasDetachedSegments) {
        const detached = detachDraggedSegments(
          baseItems,
          connectorsRef.current,
          drag.selectedItemIds,
        );

        if (detached.detachedItemIds.length > 0) {
          drag.hasDetachedSegments = true;
          drag.detachedConnectorIds.push(...detached.detachedConnectorIds);
          baseItems = detached.items;
          setItemsAndSync(baseItems);
          setConnectorsAndSync(detached.connectors);

          const detachedSelectionBounds = getSelectionBounds(
            baseItems,
            drag.selectedItemIds,
          );
          if (detachedSelectionBounds !== null) {
            drag.startBoundsX = detachedSelectionBounds.x;
            drag.startBoundsY = detachedSelectionBounds.y;
          }

          drag.itemPositions = drag.selectedItemIds
            .map((selectedItemId) => {
              const selectedItem = baseItems.find(
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
            .filter(
              (entry): entry is { id: string; x: number; y: number } => entry !== null,
            );
        }
      }

      if (drag.itemPositions.length === 0) {
        setSnapGuides([]);
        return;
      }

      const selectionBounds = getSelectionBounds(baseItems, drag.selectedItemIds);
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

      setItemsAndSync((current) => {
        const draggedIdSet = new Set(drag.selectedItemIds);
        // First apply the drag offsets
        let nextItems = current.map((item) => {
          const itemStart = itemStartMap.get(item.id);
          if (itemStart) {
            return {
              ...item,
              x: itemStart.x + offsetX,
              y: itemStart.y + offsetY,
            };
          }

          return item;
        });

        // Then update any segments connected to dragged items
        const itemById = new Map(nextItems.map((item) => [item.id, item]));
        nextItems = nextItems.map((item) => {
          if (
            (item.type !== ITEM_TYPE.line && item.type !== ITEM_TYPE.arrow) ||
            !hasStoredSegmentData(item) ||
            draggedIdSet.has(item.id)
          ) {
            return item;
          }

          const conns = getSegmentConnections(item);
          const startTouched =
            conns.startConnection !== null &&
            draggedIdSet.has(conns.startConnection.itemId);
          const endTouched =
            conns.endConnection !== null &&
            draggedIdSet.has(conns.endConnection.itemId);

          if (!startTouched && !endTouched) {
            return item;
          }

          const worldPts = getSegmentWorldPoints(item);
          if (!worldPts) {
            return item;
          }

          let newStart = worldPts.start;
          let newEnd = worldPts.end;

          if (startTouched && conns.startConnection) {
            const target = itemById.get(conns.startConnection.itemId);
            if (target) {
              newStart = getAnchorPoint(
                target,
                isAnchor(conns.startConnection.anchor)
                  ? conns.startConnection.anchor
                  : null,
              );
            }
          }
          if (endTouched && conns.endConnection) {
            const target = itemById.get(conns.endConnection.itemId);
            if (target) {
              newEnd = getAnchorPoint(
                target,
                isAnchor(conns.endConnection.anchor)
                  ? conns.endConnection.anchor
                  : null,
              );
            }
          }

          const waypoints = getSegmentWaypoints(item);
          const geometry = buildSegmentGeometry(
            newStart,
            newEnd,
            waypoints,
            conns.startConnection,
            conns.endConnection,
          );
          return { ...item, ...geometry };
        });

        return nextItems;
      });
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

  function handleMouseUp(e?: React.MouseEvent) {
    setSnapGuides([]);
    setAnchorIndicatorItems([]);
    setActiveAnchorHit(null);
    setActiveFrameDropTargetId(null);
    setActiveTableDropTarget(null);

    const waypointDrag = waypointDragRef.current;
    if (waypointDrag) {
      waypointDragRef.current = null;
      setDeletingWaypointInfo(null);
      const item = itemsRef.current.find(
        (candidate) => candidate.id === waypointDrag.itemId,
      );
      if (item) {
        // If the waypoint is too close to start or end, remove it
        const worldPts = getSegmentWorldPoints(item);
        const waypoints = getSegmentWaypoints(item);
        const wp = waypoints[waypointDrag.waypointIndex];
        const SNAP_DELETE_DIST = 10;
        let shouldDelete = false;
        if (wp !== undefined && worldPts !== null) {
          const wpWorld = { x: item.x + wp.x, y: item.y + wp.y };
          const dStart = Math.hypot(wpWorld.x - worldPts.start.x, wpWorld.y - worldPts.start.y);
          const dEnd = Math.hypot(wpWorld.x - worldPts.end.x, wpWorld.y - worldPts.end.y);
          shouldDelete = dStart < SNAP_DELETE_DIST || dEnd < SNAP_DELETE_DIST;
        }

        if (shouldDelete && worldPts !== null) {
          const { startConnection, endConnection } = getSegmentConnections(item);
          const newWaypoints = waypoints.filter((_, i) => i !== waypointDrag.waypointIndex);
          const newWorldWaypoints = newWaypoints.map((w) => ({
            x: item.x + w.x,
            y: item.y + w.y,
          }));
          const geometry = buildSegmentGeometry(
            worldPts.start,
            worldPts.end,
            newWorldWaypoints,
            startConnection,
            endConnection,
          );
          const nextItem = { ...item, ...geometry };
          setItemsAndSync((current) =>
            current.map((candidate) =>
              candidate.id === waypointDrag.itemId ? nextItem : candidate,
            ),
          );
          persistItems([nextItem]);
        } else {
          persistItems([item]);
        }
        recordHistoryCheckpoint(waypointDrag.snapshot);
      }
      return;
    }

    const endpointDrag = segmentEndpointDragRef.current;
    if (endpointDrag) {
      segmentEndpointDragRef.current = null;
      const item = itemsRef.current.find(
        (candidate) => candidate.id === endpointDrag.itemId,
      );
      if (item) {
        persistItems([item]);
        recordHistoryCheckpoint(endpointDrag.snapshot);
      }
      return;
    }

    const pendingSegmentDraft = segmentDraft;
    if (pendingSegmentDraft !== null) {
      // Snap end point to anchor if available
      let finalEnd = pendingSegmentDraft.end;
      let finalEndConn = pendingSegmentDraft.endConnection;
      if (e !== undefined) {
        const rawEnd = screenToWorld(e.clientX, e.clientY);
        const excludeIds = new Set<string>();
        if (pendingSegmentDraft.startConnection) {
          excludeIds.add(pendingSegmentDraft.startConnection.itemId);
        }
        const anchorHit = findNearestConnectorAnchor(
          rawEnd,
          itemsRef.current,
          excludeIds,
          CONNECTOR_SNAP_THRESHOLD,
        );
        finalEnd = anchorHit ? anchorHit.point : rawEnd;
        finalEndConn = anchorHit
          ? { itemId: anchorHit.itemId, anchor: anchorHit.anchor }
          : null;
      }

      setSegmentDraft(null);
      void handleCreateSegmentItem({
        ...pendingSegmentDraft,
        end: finalEnd,
        endConnection: finalEndConn,
      });
      return;
    }

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
        syncSegmentConnectionsForItems([...changedIds]);
      }
      recordHistoryCheckpoint(resize.snapshot);
    }

    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      setActiveFrameDropTargetId(null);
      let nextItems = itemsRef.current;
      const movedItemIds = getUniqueItemIds(drag.selectedItemIds);
      const changedIds = new Set<string>(movedItemIds);
      const frameIdsToRelayout = new Set<string>();
      const ingestedItemIds: string[] = [];
      const ejectedItemIds: string[] = [];
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

        const previousParent =
          movedItem.parent_item_id === null
            ? null
            : nextItems.find((item) => item.id === movedItem.parent_item_id) ??
              null;
        const targetFrame = findFrameDropTarget(movedItem, nextItems);

        let nextParentId = movedItem.parent_item_id;
        let nextWidth = movedItem.width;
        let nextHeight = movedItem.height;
        let nextX = movedItem.x;
        let nextY = movedItem.y;

        if (targetFrame !== null) {
          const fittedSize =
            previousParent?.id === targetFrame.id
              ? fitItemWithinBounds(
                  movedItem,
                  getFrameContentBounds(targetFrame).width,
                  getFrameContentBounds(targetFrame).height,
                )
              : getFrameChildFitSize(movedItem, targetFrame);
          const clampedPosition = clampItemToFrame(
            movedItem,
            targetFrame,
            fittedSize,
          );

          nextParentId = targetFrame.id;
          nextWidth = fittedSize.width;
          nextHeight = fittedSize.height;
          nextX = clampedPosition.x;
          nextY = clampedPosition.y;
        } else if (previousParent !== null) {
          if (isFrame(previousParent)) {
            // Frame parent: eject or clamp within frame
            if (isItemFullyOutsideFrame(movedItem, previousParent)) {
              nextParentId = null;
            } else {
              const fittedSize = fitItemWithinBounds(
                movedItem,
                getFrameContentBounds(previousParent).width,
                getFrameContentBounds(previousParent).height,
              );
              const clampedPosition = clampItemToFrame(
                movedItem,
                previousParent,
                fittedSize,
              );

              nextParentId = previousParent.id;
              nextWidth = fittedSize.width;
              nextHeight = fittedSize.height;
              nextX = clampedPosition.x;
              nextY = clampedPosition.y;
            }
          } else if (previousParent.type === ITEM_TYPE.table) {
            // Table parent: eject when center moves outside the table
            const itemCenterX = movedItem.x + movedItem.width / 2;
            const itemCenterY = movedItem.y + movedItem.height / 2;
            const isOutsideTable =
              itemCenterX < previousParent.x ||
              itemCenterX > previousParent.x + previousParent.width ||
              itemCenterY < previousParent.y ||
              itemCenterY > previousParent.y + previousParent.height;
            if (isOutsideTable) {
              nextParentId = null;
              // Remove this item from the cell's childItemIds
              const tData = parseTableData(previousParent.data_json);
              const cellHit = findCellByChildItemId(tData, movedItem.id);
              const newTData = {
                ...tData,
                cells: tData.cells.map((row) =>
                  row.map((c) =>
                    c?.childItemIds.includes(movedItem.id)
                      ? { ...c, childItemIds: c.childItemIds.filter((id) => id !== movedItem.id) }
                      : c,
                  ),
                ),
              };
              const updatedTableItem = {
                ...previousParent,
                data_json: serializeTableData(newTData),
              };
              nextItems = nextItems.map((it) =>
                it.id === previousParent.id ? updatedTableItem : it,
              );
              changedIds.add(previousParent.id);

              // If the cell still has remaining children, relayout them
              if (cellHit) {
                const remainingIds = cellHit.cell.childItemIds.filter((id) => id !== movedItem.id);
                if (remainingIds.length > 0) {
                  const CELL_INSET = 8;
                  const cellBounds = getTableCellBounds(
                    updatedTableItem,
                    cellHit.row,
                    cellHit.col,
                    cellHit.cell.rowSpan,
                    cellHit.cell.colSpan,
                  );
                  remainingIds.forEach((remainingId, idx) => {
                    const layout = computeCellChildLayout(cellBounds, idx, remainingIds.length, CELL_INSET);
                    nextItems = nextItems.map((it) =>
                      it.id === remainingId
                        ? { ...it, x: layout.x, y: layout.y, width: layout.width, height: layout.height }
                        : it,
                    );
                    changedIds.add(remainingId);
                  });
                }
              }
            } else {
              // Still within table — check if center moved to a different cell
              const tData = parseTableData(previousParent.data_json);
              const originalCellHit = findCellByChildItemId(tData, movedItem.id);

              // Determine which cell the center is hovering over now
              const localX = itemCenterX - previousParent.x;
              const localY = itemCenterY - previousParent.y;
              let hoverCol = -1;
              let cumX = 0;
              for (let c = 0; c < tData.cols; c++) {
                const colW = (tData.colWidths[c] ?? 1 / tData.cols) * previousParent.width;
                if (localX >= cumX && localX < cumX + colW) { hoverCol = c; break; }
                cumX += colW;
              }
              let hoverRow = -1;
              let cumY = 0;
              for (let r = 0; r < tData.rows; r++) {
                const rowH = (tData.rowHeights[r] ?? 1 / tData.rows) * previousParent.height;
                if (localY >= cumY && localY < cumY + rowH) { hoverRow = r; break; }
                cumY += rowH;
              }
              const hoverRoot = hoverRow >= 0 && hoverCol >= 0
                ? getRootCellAt(tData, hoverRow, hoverCol)
                : null;

              const isDifferentCell =
                hoverRoot !== null &&
                originalCellHit !== null &&
                hoverRoot.cell.id !== originalCellHit.cell.id;
              const canAccept = isDifferentCell;

              if (canAccept && originalCellHit) {
                // Move item from old cell to new cell within the same table
                const CELL_INSET = 8;
                // Remove from old cell
                const oldRemainingIds = originalCellHit.cell.childItemIds.filter((id) => id !== movedItem.id);
                const newTargetIds = [...hoverRoot!.cell.childItemIds, movedItem.id];

                const updatedTData = {
                  ...tData,
                  cells: tData.cells.map((row) =>
                    row.map((c) => {
                      if (!c) return c;
                      if (c.id === originalCellHit.cell.id) return { ...c, childItemIds: oldRemainingIds };
                      if (c.id === hoverRoot!.cell.id) return { ...c, childItemIds: newTargetIds };
                      return c;
                    }),
                  ),
                };
                const updatedTableItem = {
                  ...previousParent,
                  data_json: serializeTableData(updatedTData),
                };
                nextItems = nextItems.map((it) =>
                  it.id === previousParent.id ? updatedTableItem : it,
                );
                changedIds.add(previousParent.id);

                // Layout the moved item in its new cell
                const newCellBounds = getTableCellBounds(
                  updatedTableItem,
                  hoverRoot!.row,
                  hoverRoot!.col,
                  hoverRoot!.cell.rowSpan,
                  hoverRoot!.cell.colSpan,
                );
                const myIndex = newTargetIds.indexOf(movedItem.id);
                const myLayout = computeCellChildLayout(newCellBounds, myIndex, newTargetIds.length, CELL_INSET);
                nextParentId = previousParent.id;
                nextX = myLayout.x;
                nextY = myLayout.y;
                nextWidth = myLayout.width;
                nextHeight = myLayout.height;

                // Relayout other items in the new cell
                newTargetIds.forEach((otherId, idx) => {
                  if (otherId === movedItem.id) return;
                  const otherLayout = computeCellChildLayout(newCellBounds, idx, newTargetIds.length, CELL_INSET);
                  nextItems = nextItems.map((it) =>
                    it.id === otherId
                      ? { ...it, x: otherLayout.x, y: otherLayout.y, width: otherLayout.width, height: otherLayout.height }
                      : it,
                  );
                  changedIds.add(otherId);
                });

                // Relayout remaining items in the old cell
                if (oldRemainingIds.length > 0) {
                  const oldCellBounds = getTableCellBounds(
                    updatedTableItem,
                    originalCellHit.row,
                    originalCellHit.col,
                    originalCellHit.cell.rowSpan,
                    originalCellHit.cell.colSpan,
                  );
                  oldRemainingIds.forEach((remainId, idx) => {
                    const layout = computeCellChildLayout(oldCellBounds, idx, oldRemainingIds.length, CELL_INSET);
                    nextItems = nextItems.map((it) =>
                      it.id === remainId
                        ? { ...it, x: layout.x, y: layout.y, width: layout.width, height: layout.height }
                        : it,
                    );
                    changedIds.add(remainId);
                  });
                }
              } else if (originalCellHit) {
                // Same cell or target full → snap back to original cell position
                const CELL_INSET = 8;
                const cellBounds = getTableCellBounds(
                  previousParent,
                  originalCellHit.row,
                  originalCellHit.col,
                  originalCellHit.cell.rowSpan,
                  originalCellHit.cell.colSpan,
                );
                const myIndex = originalCellHit.cell.childItemIds.indexOf(movedItem.id);
                const myLayout = computeCellChildLayout(
                  cellBounds,
                  Math.max(0, myIndex),
                  originalCellHit.cell.childItemIds.length,
                  CELL_INSET,
                );
                nextParentId = previousParent.id;
                nextX = myLayout.x;
                nextY = myLayout.y;
                nextWidth = myLayout.width;
                nextHeight = myLayout.height;
              }
            }
          }
        }

        const parentChanged = nextParentId !== movedItem.parent_item_id;
        const positionChanged = nextX !== movedItem.x || nextY !== movedItem.y;
        const sizeChanged =
          nextWidth !== movedItem.width || nextHeight !== movedItem.height;

        if (!parentChanged && !positionChanged && !sizeChanged) {
          continue;
        }

        if (movedItem.parent_item_id !== null) {
          const prevParent = nextItems.find((it) => it.id === movedItem.parent_item_id);
          if (!prevParent || isFrame(prevParent)) {
            frameIdsToRelayout.add(movedItem.parent_item_id);
          }
        }
        if (nextParentId !== null) {
          const nxtParent = nextItems.find((it) => it.id === nextParentId);
          if (!nxtParent || isFrame(nxtParent)) {
            frameIdsToRelayout.add(nextParentId);
          }
        }

        if (parentChanged) {
          if (nextParentId !== null) {
            ingestedItemIds.push(movedItem.id);
          } else if (movedItem.parent_item_id !== null) {
            ejectedItemIds.push(movedItem.id);
          }
        } else if (previousParent !== null && positionChanged) {
          ingestedItemIds.push(movedItem.id);
        }

        const ejectedPosition =
          nextParentId === null && previousParent !== null && isFrame(previousParent)
            ? getFrameEjectPosition(
                {
                  ...movedItem,
                  width: nextWidth,
                  height: nextHeight,
                  x: nextX,
                  y: nextY,
                },
                previousParent,
              )
            : null;

        nextItems = nextItems.map((item) =>
          item.id === movedItem.id
            ? {
                ...item,
                parent_item_id: nextParentId,
                x: ejectedPosition?.x ?? nextX,
                y: ejectedPosition?.y ?? nextY,
                width: nextWidth,
                height: nextHeight,
              }
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
      if (drag.detachedConnectorIds.length > 0) {
        void Promise.all(
          drag.detachedConnectorIds.map((connectorId) => deleteConnector(connectorId)),
        ).catch((err) => {
          console.error('[Canvas] Failed to delete detached connectors', err);
        });
      }
      syncConnectorAnchorsForItems([...changedIds]);
      syncSegmentConnectionsForItems([...changedIds]);
      triggerFrameItemAnimation(ingestedItemIds, 'ingest');
      triggerFrameItemAnimation(ejectedItemIds, 'eject');
      // ── Table cell absorption ─────────────────────────────────────────
      // If exactly one small item is dragged and its center is over a table
      // cell with < 2 children, absorb it into the cell.
      const tableCellHit = (() => {
        if (drag.selectedItemIds.length !== 1) return null;
        const draggedItemId = drag.selectedItemIds[0];
        if (!draggedItemId) return null;
        const draggedItem = nextItems.find((candidate) => candidate.id === draggedItemId);
        if (!draggedItem || !isSmallItem(draggedItem)) return null;
        // Items already parented to a table/frame were handled by the
        // parent-handling for-loop above — skip re-absorption.
        if (draggedItem.parent_item_id !== null) return null;
        return findTableCellDropTarget(draggedItem, nextItems);
      })();

      if (tableCellHit) {
        const absorbedItemId = drag.selectedItemIds[0]!;
        const absorbedItem = nextItems.find((it) => it.id === absorbedItemId);
        const tableItem = nextItems.find((it) => it.id === tableCellHit.tableId);

        if (absorbedItem && tableItem) {
          const tableData = parseTableData(tableItem.data_json);
          const cell = tableData.cells.flat().find((c) => c?.id === tableCellHit.cellId);
          const rowSpan = cell?.rowSpan ?? 1;
          const colSpan = cell?.colSpan ?? 1;
          const existingChildIds = cell?.childItemIds ?? [];

          const CELL_INSET = 8;
          const cellBounds = getTableCellBounds(
            tableItem,
            tableCellHit.row,
            tableCellHit.col,
            rowSpan,
            colSpan,
          );

          const newChildIds = [...existingChildIds, absorbedItemId];
          const nextTableData = updateTableCell(tableData, tableCellHit.cellId, {
            childItemIds: newChildIds,
          });
          const updatedTableItem = {
            ...tableItem,
            data_json: serializeTableData(nextTableData),
          };

          const maxZ =
            nextItems.length > 0 ? Math.max(...nextItems.map((it) => it.z_index)) : 0;

          // Layout the absorbed item
          const myIndex = newChildIds.indexOf(absorbedItemId);
          const myLayout = computeCellChildLayout(cellBounds, myIndex, newChildIds.length, CELL_INSET);
          const updatedAbsorbedItem = {
            ...absorbedItem,
            x: myLayout.x,
            y: myLayout.y,
            width: myLayout.width,
            height: myLayout.height,
            parent_item_id: tableItem.id,
            z_index: maxZ + 1,
          };

          nextItems = nextItems.map((it) => {
            if (it.id === absorbedItemId) return updatedAbsorbedItem;
            if (it.id === tableCellHit.tableId) return updatedTableItem;
            return it;
          });

          // Relayout all existing children in the cell to accommodate the new item
          if (existingChildIds.length > 0) {
            existingChildIds.forEach((existingId, idx) => {
              const layout = computeCellChildLayout(cellBounds, idx, newChildIds.length, CELL_INSET);
              nextItems = nextItems.map((it) =>
                it.id === existingId
                  ? { ...it, x: layout.x, y: layout.y, width: layout.width, height: layout.height }
                  : it,
              );
              changedIds.add(existingId);
            });
          }

          setItemsAndSync(nextItems);

          // Persist all changed items
          const itemsToPersist = [tableCellHit.tableId, absorbedItemId, ...existingChildIds];
          for (const itemId of itemsToPersist) {
            const latestItem = nextItems.find((it) => it.id === itemId);
            if (latestItem) {
              void updateBoardItem(itemId, toPayload(latestItem)).catch(
                (err) => console.error('[Canvas] Failed to update item after absorb', err),
              );
            }
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────

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
                if (isLegacyConnectorArrow(item)) {
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
                const itemAnimation = frameItemAnimations[item.id];
                const isTableDropTarget =
                  item.type === 'table' &&
                  activeTableDropTarget?.tableId === item.id;
                const itemClassName = [
                  isFrame(item) && activeFrameDropTargetId === item.id
                    ? 'is-frame-drop-target'
                    : '',
                  isTableDropTarget ? 'is-table-drop-target' : '',
                  itemAnimation === 'ingest' ? 'is-frame-ingest' : '',
                  itemAnimation === 'eject' ? 'is-frame-eject' : '',
                ]
                  .filter((className) => className.length > 0)
                  .join(' ');
                return (
                    <BoardItemRenderer
                      key={item.id}
                      item={item}
                      childCount={childItems.length}
                      childSummaries={childItems.map(summarizeFrameChild)}
                      className={itemClassName}
                      isSelected={selectedIds.includes(item.id)}
                      isEditing={item.id === editingId}
                      canTranslateSegment={canTranslateSegmentItem(item)}
                      onMouseDown={(e) => handleItemMouseDown(e, item.id)}
                      onEndpointMouseDown={(e, endpoint) =>
                        handleSegmentEndpointMouseDown(e, item.id, endpoint)
                      }
                      onWaypointMouseDown={(e, waypointIndex) =>
                        handleSegmentWaypointMouseDown(e, item.id, waypointIndex)
                      }
                      onMidpointMouseDown={(e, segmentIndex) =>
                        handleSegmentMidpointMouseDown(e, item.id, segmentIndex)
                      }
                      deletingWaypointIndex={
                        deletingWaypointInfo?.itemId === item.id
                          ? deletingWaypointInfo.waypointIndex
                          : undefined
                      }
                      onDoubleClick={() => handleItemDoubleClick(item)}
                      onResizeMouseDown={(e) => handleResizeMouseDown(e, item.id)}
                      onToggleCollapse={() => handleToggleFrameCollapse(item.id)}
                      onUpdate={handleItemUpdate}
                      onEditEnd={handleEditEnd}
                      tableDropTargetCellId={
                        isTableDropTarget ? activeTableDropTarget?.cellId ?? null : null
                      }
                    />
                );
              })}
              {segmentDraftPreviewItem !== null ? (
                <div
                  className="board-item board-item-segment board-item-draft"
                  style={{
                    position: 'absolute',
                    left: segmentDraftPreviewItem.x,
                    top: segmentDraftPreviewItem.y,
                    width: segmentDraftPreviewItem.width,
                    height: segmentDraftPreviewItem.height,
                    zIndex: segmentDraftPreviewItem.z_index,
                    pointerEvents: 'none',
                  }}
                >
                  <SegmentShape
                    item={segmentDraftPreviewItem}
                    isSelected={false}
                    canTranslate={false}
                    onMouseDown={() => {}}
                    onEndpointMouseDown={() => {}}
                    onWaypointMouseDown={() => {}}
                    onMidpointMouseDown={() => {}}
                  />
                </div>
              ) : null}

              {/* Connector anchor indicators on nearby items */}
              {anchorIndicatorItems.map((item) =>
                getItemConnectorAnchors(item).map(({ anchor, point }) => {
                  const isActive =
                    activeAnchorHit !== null &&
                    activeAnchorHit.itemId === item.id &&
                    activeAnchorHit.anchor === anchor;
                  return (
                    <div
                      key={`anchor-${item.id}-${anchor}`}
                      className={`connector-anchor-indicator ${isActive ? 'is-active' : ''}`}
                      style={{
                        left: point.x,
                        top: point.y,
                      }}
                    />
                  );
                }),
              )}

              {/* Connector anchor indicators on nearby items */}
              {anchorIndicatorItems.map((item) =>
                getItemConnectorAnchors(item).map(({ anchor, point }) => {
                  const isActive =
                    activeAnchorHit !== null &&
                    activeAnchorHit.itemId === item.id &&
                    activeAnchorHit.anchor === anchor;
                  return (
                    <div
                      key={`anchor-${item.id}-${anchor}`}
                      className={`connector-anchor-indicator ${isActive ? 'is-active' : ''}`}
                      style={{
                        left: point.x,
                        top: point.y,
                      }}
                    />
                  );
                }),
              )}
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
              {activeTool === 'line' || activeTool === 'arrow' ? (
                <div className="canvas-guide-badge">
                  {segmentDraft === null
                    ? `${activeTool === 'line' ? '線條' : '箭頭'}工具：按住拖曳建立`
                    : `${activeTool === 'line' ? '線條' : '箭頭'}工具：放開滑鼠完成，選取後可拉端點`}
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
