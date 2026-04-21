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
  getPageBoardData,
  updatePageViewport,
  type Page,
} from './api';
import {
  findFrameDropTarget,
  findNearestConnectorAnchor,
  findTableCellDropTarget,
  getConnectorPoints,
  getFrameChildren,
  getFrameOverlapScore,
  getItemConnectorAnchors,
  getPrimarySelectionId,
  getUniqueItemIds,
  isFrame,
  isHiddenByCollapsedFrame,
  isInlineEditable,
  isLegacyConnectorArrow,
  isSmallItem,
  summarizeFrameChild,
  type AnchorHit,
  type TableCellHit,
} from './canvasHelpers';
import {
  CANVAS_GRID_SIZE,
  VIEWPORT_SAVE_DELAY,
  CONNECTOR_SNAP_THRESHOLD,
} from './canvasConstants';
import { snapPointToGrid } from './magnet';
import type {
  ConnectorsUpdater,
  DragState,
  EditSessionState,
  ItemsUpdater,
  PanState,
  ResizeState,
  SegmentDraftState,
  SegmentDraftTool,
  SegmentEndpointDragState,
  TableInsertDraftState,
  TableInsertPreviewState,
  MarqueeSelectionState,
  WaypointDragState,
} from './canvasTypes';

import { useCanvasFrameAnimation } from './useCanvasFrameAnimation';
import { useCanvasHistory } from './useCanvasHistory';
import { useCanvasItemActions } from './useCanvasItemActions';
import { useCanvasMouseHandlers } from './useCanvasMouseHandlers';
import { Inspector } from './Inspector';
import {
  buildSegmentGeometry,
  canTranslateSegmentItem,
  type Point,
  type SegmentConnection,
  type SegmentEndpoint,
} from './segmentData';
import {
  createTableData,
  serializeTableData,
  TABLE_MAX_DIMENSION,
} from './tableData';
import {
  TABLE_INSERT_PREVIEW_CELL_HEIGHT,
  TABLE_INSERT_PREVIEW_CELL_WIDTH,
  TABLE_INSERT_PREVIEW_OFFSET_X,
  TABLE_INSERT_PREVIEW_OFFSET_Y,
  getTableInsertDimensions,
  getTableInsertItemSize,
} from './tableInsertPreview';
import { Toolbar } from './Toolbar';
import { ArrowConnector } from './items/ArrowConnector';
import { BoardItemRenderer } from './items/BoardItemRenderer';
import { SegmentShape } from './items/SegmentShape';

import {
  ITEM_CATEGORY,
  ITEM_CATEGORY_FOR_TYPE,
  ITEM_TYPE,
  type ActiveTool,
  type Viewport,
} from './types';
import {
  CANVAS_BACKGROUND_STORAGE_KEY,
  DEFAULT_CANVAS_BACKGROUND_MODE,
  parseCanvasBackgroundMode,
  type CanvasBackgroundMode,
} from './canvasBackground';
import {
  adjustZoomByStep,
  getDisplayZoom,
  getResetZoom,
  zoomViewportAroundPoint,
} from './viewport';

type Props = {
  page: Page;
  onViewportChange?: (viewport: Viewport) => void;
};

const INSPECTOR_COLLAPSED_STORAGE_KEY =
  'whiteboard.canvasInspectorCollapsed';

function readStoredBoolean(key: string, fallbackValue: boolean): boolean {
  if (typeof window === 'undefined') {
    return fallbackValue;
  }

  const storedValue = window.localStorage.getItem(key);
  if (storedValue === 'true') {
    return true;
  }

  if (storedValue === 'false') {
    return false;
  }

  return fallbackValue;
}

export function Canvas({ page, onViewportChange }: Props) {
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
  const [backgroundMode, setBackgroundMode] = useState<CanvasBackgroundMode>(
    () => {
      if (typeof window === 'undefined') {
        return DEFAULT_CANVAS_BACKGROUND_MODE;
      }

      return parseCanvasBackgroundMode(
        window.localStorage.getItem(CANVAS_BACKGROUND_STORAGE_KEY),
      );
    },
  );
  const [magnetEnabled, setMagnetEnabled] = useState(true);
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [segmentDraft, setSegmentDraft] = useState<SegmentDraftState | null>(
    null,
  );
  const [anchorIndicatorItems, setAnchorIndicatorItems] = useState<BoardItem[]>([]);
  const [activeAnchorHit, setActiveAnchorHit] = useState<AnchorHit | null>(null);
  const [deletingWaypointInfo, setDeletingWaypointInfo] = useState<{ itemId: string; waypointIndex: number } | null>(null);
  const [activeFrameDropTargetId, setActiveFrameDropTargetId] = useState<string | null>(null);
  const [activeTableDropTarget, setActiveTableDropTarget] = useState<TableCellHit | null>(null);
  const [tableInsertPreview, setTableInsertPreview] = useState<TableInsertPreviewState | null>(null);
  const [toolbarTableInsertPreview, setToolbarTableInsertPreview] = useState<TableInsertPreviewState | null>(null);
  const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelectionState | null>(null);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(() =>
    readStoredBoolean(INSPECTOR_COLLAPSED_STORAGE_KEY, false),
  );

  const viewportRef = useRef<Viewport>(viewport);
  const itemsRef = useRef<BoardItem[]>(items);
  const connectorsRef = useRef<ConnectorLink[]>(connectors);
  const selectedIdsRef = useRef<string[]>(selectedIds);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const segmentEndpointDragRef = useRef<SegmentEndpointDragState | null>(null);
  const waypointDragRef = useRef<WaypointDragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const tableInsertDraftRef = useRef<TableInsertDraftState | null>(null);
  const marqueeSelectionRef = useRef<{
    startClientX: number;
    startClientY: number;
    appendToSelection: boolean;
    baseSelectionIds: string[];
  } | null>(null);
  const isSpaceRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const vpSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editSessionRef = useRef<EditSessionState | null>(null);
  const toolbarTableInsertOriginRef = useRef<{ clientX: number; clientY: number } | null>(null);

  useLayoutEffect(() => {
    viewportRef.current = viewport;
    itemsRef.current = items;
    connectorsRef.current = connectors;
    selectedIdsRef.current = selectedIds;
  }, [connectors, items, selectedIds, viewport]);

  const { frameItemAnimations, triggerFrameItemAnimation } =
    useCanvasFrameAnimation();

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

  const handleToolChange = useCallback((tool: ActiveTool) => {
    if (tool !== ITEM_TYPE.table) {
      tableInsertDraftRef.current = null;
      setTableInsertPreview(null);
      toolbarTableInsertOriginRef.current = null;
      setToolbarTableInsertPreview(null);
    }
    setActiveTool(tool);
  }, []);

  const getViewportCenterWorldPoint = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = viewportRef.current;
    if (!rect) {
      return {
        x: -vp.x / vp.zoom,
        y: -vp.y / vp.zoom,
      };
    }

    return {
      x: (rect.width / 2 - vp.x) / vp.zoom,
      y: (rect.height / 2 - vp.y) / vp.zoom,
    };
  }, []);

  const handleToolbarTableClick = useCallback(
    (clientX: number, clientY: number) => {
      tableInsertDraftRef.current = null;
      setTableInsertPreview(null);
      toolbarTableInsertOriginRef.current = { clientX, clientY };
      setToolbarTableInsertPreview({
        cursorX: clientX,
        cursorY: clientY,
        cols: 1,
        rows: 1,
        isActive: true,
      });
      setActiveTool(ITEM_TYPE.table);
    },
    [],
  );

  const primarySelectedId = useMemo(
    () => getPrimarySelectionId(selectedIds),
    [selectedIds],
  );
  const selectedItem = useMemo(
    () => items.find((item) => item.id === primarySelectedId) ?? null,
    [items, primarySelectedId],
  );

  const {
    canUndo,
    canRedo,
    isHistorySyncing,
    captureBoardSnapshot,
    pushUndoSnapshot,
    recordHistoryCheckpoint,
    resetHistory,
    clearPendingItemSave,
    restoreBoardSnapshot,
    handleUndo,
    handleRedo,
  } = useCanvasHistory({
    pageId: page.id,
    itemsRef,
    connectorsRef,
    selectedIdsRef,
    itemSaveTimerRef: itemSaveTimer,
    editSessionRef,
    dragRef,
    resizeRef,
    panRef,
    setItemsAndSync,
    setConnectorsAndSync,
    setSelection,
    setEditingId,
    setSegmentDraft,
  });

  const {
    handleCreateItem,
    handleCreateSegmentItem,
    handleDeleteItems,
    handleDeleteSelection,
    handleCopySelection,
    handlePasteSelection,
    handleLayerChange,
    handleItemUpdate,
    handleEditEnd,
  } = useCanvasItemActions({
    pageId: page.id,
    itemsRef,
    connectorsRef,
    selectedIdsRef,
    itemSaveTimerRef: itemSaveTimer,
    editSessionRef,
    editingId,
    primarySelectedId,
    captureBoardSnapshot,
    pushUndoSnapshot,
    recordHistoryCheckpoint,
    setItemsAndSync,
    setConnectorsAndSync,
    setSelection,
    setEditingId,
    setActiveTool: handleToolChange,
    setAnchorIndicatorItems,
    setActiveAnchorHit,
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      CANVAS_BACKGROUND_STORAGE_KEY,
      backgroundMode,
    );
  }, [backgroundMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      INSPECTOR_COLLAPSED_STORAGE_KEY,
      String(isInspectorCollapsed),
    );
  }, [isInspectorCollapsed]);

  useEffect(() => {
    const currentOrigin = toolbarTableInsertOriginRef.current;
    if (currentOrigin === null || toolbarTableInsertPreview === null) {
      return;
    }
    const origin = currentOrigin;

    function handleWindowMouseMove(event: MouseEvent) {
      const dims = getTableInsertDimensions(
        event.clientX - origin.clientX,
        event.clientY - origin.clientY,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      );
      setToolbarTableInsertPreview({
        cursorX: origin.clientX,
        cursorY: origin.clientY,
        cols: dims.cols,
        rows: dims.rows,
        isActive: true,
      });
    }

    function handleWindowMouseDown(event: MouseEvent) {
      if (event.button !== 0) {
        return;
      }
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest('[data-tool-id="table"]') !== null
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();

      const dims = getTableInsertDimensions(
        event.clientX - origin.clientX,
        event.clientY - origin.clientY,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      );
      const size = getTableInsertItemSize(dims.cols, dims.rows);
      const center = getViewportCenterWorldPoint();

      toolbarTableInsertOriginRef.current = null;
      setToolbarTableInsertPreview(null);
      handleToolChange('select');
      void handleCreateItem({
        type: ITEM_TYPE.table,
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
        width: size.width,
        height: size.height,
        dataJson: serializeTableData(createTableData(dims.rows, dims.cols)),
      });
    }

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mousedown', handleWindowMouseDown, true);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mousedown', handleWindowMouseDown, true);
    };
  }, [
    getViewportCenterWorldPoint,
    handleCreateItem,
    handleToolChange,
    toolbarTableInsertPreview,
  ]);

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
        handleToolChange('select');
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
        handleToolChange('select');
      }
      if (key === 'l') {
        handleToolChange('line');
      }
      if (key === 't') {
        handleToolChange('table');
      }
      if (key === 'x') {
        handleToolChange('text_box');
      }
      if (key === 's') {
        handleToolChange('sticky_note');
      }
      if (key === 'n') {
        handleToolChange('note_paper');
      }
      if (key === 'f') {
        handleToolChange('frame');
      }
      if (key === 'a') {
        handleToolChange('arrow');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleToolChange]);

  useEffect(() => {
    if (segmentDraft !== null && activeTool !== segmentDraft.type) {
      setSegmentDraft(null);
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
    onViewportChange?.(nextViewport);

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

  function handleViewportZoom(targetZoom: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    const nextViewport = zoomViewportAroundPoint(
      viewportRef.current,
      targetZoom,
      {
        x: rect?.width ? rect.width / 2 : 0,
        y: rect?.height ? rect.height / 2 : 0,
      },
    );
    if (nextViewport.zoom === viewportRef.current.zoom) {
      return;
    }

    setViewportAndSync(nextViewport);
    scheduleViewportSave(nextViewport);
  }

  function handleZoomIn() {
    handleViewportZoom(adjustZoomByStep(viewportRef.current.zoom, 1));
  }

  function handleZoomOut() {
    handleViewportZoom(adjustZoomByStep(viewportRef.current.zoom, -1));
  }

  function handleResetZoom() {
    handleViewportZoom(getResetZoom());
  }

  function startSegmentDraft(
    type: SegmentDraftTool,
    clientX: number,
    clientY: number,
  ) {
    const worldPos = screenToWorld(clientX, clientY);
    const snappedWorldPos = magnetEnabled
      ? snapPointToGrid(worldPos, CANVAS_GRID_SIZE)
      : worldPos;
    const snapshot = captureBoardSnapshot();

    // Check if starting near an anchor point
    const anchorHit = findNearestConnectorAnchor(
      worldPos,
      itemsRef.current,
      new Set(),
      CONNECTOR_SNAP_THRESHOLD,
    );

    const startPoint = anchorHit ? anchorHit.point : snappedWorldPos;
    const startConn: SegmentConnection | null = anchorHit
      ? { itemId: anchorHit.itemId, anchor: anchorHit.anchor }
      : null;

    clearSelection();
    setEditingId(null);
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

  const {
    handleWheel,
    handleToggleFrameCollapse,
    handleCanvasMouseDown,
    handleItemMouseDown,
    handleArrowMouseDown,
    handleSegmentEndpointMouseDown,
    handleSegmentWaypointMouseDown,
    handleSegmentMidpointMouseDown,
    handleResizeMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleItemDoubleClick,
  } = useCanvasMouseHandlers({
    magnetEnabled,
    activeTool,
    segmentDraft,
    editingId,
    selectedItem,
    itemsRef,
    connectorsRef,
    selectedIdsRef,
    viewportRef,
    containerRef,
    isSpaceRef,
    dragRef,
    resizeRef,
    panRef,
    waypointDragRef,
    segmentEndpointDragRef,
    tableInsertDraftRef,
    marqueeSelectionRef,
    setViewportAndSync,
    scheduleViewportSave,
    setItemsAndSync,
    setConnectorsAndSync,
    setAnchorIndicatorItems,
    setActiveAnchorHit,
    setActiveFrameDropTargetId,
    setActiveTableDropTarget,
    setDeletingWaypointInfo,
    setTableInsertPreview,
    setMarqueeSelection,
    toolbarTableInsertPreviewActive: toolbarTableInsertPreview !== null,
    setSelection,
    setEditingId,
    setSegmentDraft,
    setActiveTool: handleToolChange,
    captureBoardSnapshot,
    pushUndoSnapshot,
    recordHistoryCheckpoint,
    handleCreateItem,
    handleCreateSegmentItem,
    triggerFrameItemAnimation,
    clearSelection,
    screenToWorld,
    startSegmentDraft,
  });

  const cursorClass =
    activeTool !== 'select'
      ? 'cursor-crosshair'
      : isSpaceDown
        ? 'cursor-grab'
        : '';

  const worldTransform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;

  return (
    <div className="canvas-root">
      {toolbarTableInsertPreview !== null ? (
        <div
          className={`table-insert-preview table-insert-preview-fixed ${
            toolbarTableInsertPreview.isActive ? 'is-dragging' : ''
          }`}
          style={{
            left: toolbarTableInsertPreview.cursorX + TABLE_INSERT_PREVIEW_OFFSET_X,
            top: toolbarTableInsertPreview.cursorY + TABLE_INSERT_PREVIEW_OFFSET_Y,
          }}
        >
          <div
            className="table-insert-preview-grid"
            style={{
              gridTemplateColumns: `repeat(${toolbarTableInsertPreview.cols}, ${TABLE_INSERT_PREVIEW_CELL_WIDTH}px)`,
              gridTemplateRows: `repeat(${toolbarTableInsertPreview.rows}, ${TABLE_INSERT_PREVIEW_CELL_HEIGHT}px)`,
            }}
          >
            {Array.from({
              length:
                toolbarTableInsertPreview.rows *
                toolbarTableInsertPreview.cols,
            }).map((_, index) => (
              <span key={index} className="table-insert-preview-cell" />
            ))}
          </div>
          <div className="table-insert-preview-label">
            {toolbarTableInsertPreview.rows} × {toolbarTableInsertPreview.cols}
          </div>
        </div>
      ) : null}

      <Toolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onTableToolClick={handleToolbarTableClick}
        zoom={getDisplayZoom(viewport.zoom)}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        magnetEnabled={magnetEnabled}
        onToggleMagnet={() => setMagnetEnabled((current) => !current)}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={() => void handleUndo()}
        onRedo={() => void handleRedo()}
        historyBusy={isHistorySyncing}
      />
      <div
        className={`canvas-content ${isInspectorCollapsed ? 'is-inspector-collapsed' : ''}`}
      >
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
            <div
              className={`canvas-background canvas-background-${backgroundMode}`}
              style={{
                backgroundSize: `${CANVAS_GRID_SIZE * viewport.zoom}px ${CANVAS_GRID_SIZE * viewport.zoom}px`,
                backgroundPosition: `${viewport.x}px ${viewport.y}px`,
              }}
            />

            {activeTool === ITEM_TYPE.table && tableInsertPreview !== null ? (
              <div
                className={`table-insert-preview ${
                  tableInsertPreview.isActive ? 'is-dragging' : ''
                }`}
                style={{
                  left: tableInsertPreview.cursorX + TABLE_INSERT_PREVIEW_OFFSET_X,
                  top: tableInsertPreview.cursorY + TABLE_INSERT_PREVIEW_OFFSET_Y,
                }}
              >
                <div
                  className="table-insert-preview-grid"
                  style={{
                    gridTemplateColumns: `repeat(${tableInsertPreview.cols}, ${TABLE_INSERT_PREVIEW_CELL_WIDTH}px)`,
                    gridTemplateRows: `repeat(${tableInsertPreview.rows}, ${TABLE_INSERT_PREVIEW_CELL_HEIGHT}px)`,
                  }}
                >
                  {Array.from({
                    length: tableInsertPreview.rows * tableInsertPreview.cols,
                  }).map((_, index) => (
                    <span key={index} className="table-insert-preview-cell" />
                  ))}
                </div>
                <div className="table-insert-preview-label">
                  {tableInsertPreview.rows} × {tableInsertPreview.cols}
                </div>
              </div>
            ) : null}
            {activeTool === ITEM_TYPE.table &&
            tableInsertPreview !== null &&
            tableInsertPreview.worldX !== undefined &&
            tableInsertPreview.worldY !== undefined &&
            tableInsertPreview.width !== undefined &&
            tableInsertPreview.height !== undefined ? (
              <div
                className="table-insert-canvas-preview"
                style={{
                  left:
                    viewport.x + tableInsertPreview.worldX * viewport.zoom,
                  top:
                    viewport.y + tableInsertPreview.worldY * viewport.zoom,
                  width: tableInsertPreview.width * viewport.zoom,
                  height: tableInsertPreview.height * viewport.zoom,
                }}
              >
                <div
                  className="table-insert-canvas-preview-grid"
                  style={{
                    gridTemplateColumns: `repeat(${tableInsertPreview.cols}, minmax(0, 1fr))`,
                    gridTemplateRows: `repeat(${tableInsertPreview.rows}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({
                    length: tableInsertPreview.rows * tableInsertPreview.cols,
                  }).map((_, index) => (
                    <span
                      key={`table-insert-preview-${index}`}
                      className="table-insert-canvas-preview-cell"
                    />
                  ))}
                </div>
              </div>
            ) : null}
            {activeTool === 'select' && marqueeSelection !== null ? (
              <div
                className="canvas-marquee-selection"
                style={{
                  left: marqueeSelection.left,
                  top: marqueeSelection.top,
                  width: marqueeSelection.width,
                  height: marqueeSelection.height,
                }}
              />
            ) : null}

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
                      onTableCellInteractionStart={() => handleItemDoubleClick(item)}
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

            <div className="canvas-top-right-stack">
              <div
                className="canvas-background-picker"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <span className="canvas-background-picker-label">背景</span>
                <div className="canvas-background-picker-options">
                  {(
                    [
                      ['dots', '點狀'],
                      ['grid', '格線'],
                    ] as const satisfies readonly [
                      CanvasBackgroundMode,
                      string,
                    ][]
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={`canvas-background-option ${
                        backgroundMode === mode
                          ? 'canvas-background-option-active'
                          : ''
                      }`}
                      aria-pressed={backgroundMode === mode}
                      onClick={() => setBackgroundMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>

        <Inspector
          item={selectedItem}
          connector={selectedConnector}
          selectionCount={selectedIds.length}
          childCount={selectedChildCount}
          isCollapsed={isInspectorCollapsed}
          onUpdate={handleItemUpdate}
          onDelete={() => void handleDeleteSelection()}
          onToggleInspector={() =>
            setIsInspectorCollapsed((current) => !current)
          }
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
