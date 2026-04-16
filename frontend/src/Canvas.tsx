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
  VIEWPORT_SAVE_DELAY,
  SNAP_TOLERANCE,
  CONNECTOR_SNAP_THRESHOLD,
} from './canvasConstants';
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
import type { SnapGuide } from './snap';
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

type Props = {
  page: Page;
};

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
  const [anchorIndicatorItems, setAnchorIndicatorItems] = useState<BoardItem[]>([]);
  const [activeAnchorHit, setActiveAnchorHit] = useState<AnchorHit | null>(null);
  const [deletingWaypointInfo, setDeletingWaypointInfo] = useState<{ itemId: string; waypointIndex: number } | null>(null);
  const [activeFrameDropTargetId, setActiveFrameDropTargetId] = useState<string | null>(null);
  const [activeTableDropTarget, setActiveTableDropTarget] = useState<TableCellHit | null>(null);

  const viewportRef = useRef<Viewport>(viewport);
  const itemsRef = useRef<BoardItem[]>(items);
  const connectorsRef = useRef<ConnectorLink[]>(connectors);
  const selectedIdsRef = useRef<string[]>(selectedIds);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const segmentEndpointDragRef = useRef<SegmentEndpointDragState | null>(null);
  const waypointDragRef = useRef<WaypointDragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const isSpaceRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const vpSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editSessionRef = useRef<EditSessionState | null>(null);

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
    setSnapGuides,
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
    setActiveTool,
    setAnchorIndicatorItems,
    setActiveAnchorHit,
  });

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
    snapEnabled,
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
    setViewportAndSync,
    scheduleViewportSave,
    setItemsAndSync,
    setConnectorsAndSync,
    setSnapGuides,
    setAnchorIndicatorItems,
    setActiveAnchorHit,
    setActiveFrameDropTargetId,
    setActiveTableDropTarget,
    setDeletingWaypointInfo,
    setSelection,
    setEditingId,
    setSegmentDraft,
    setActiveTool,
    captureBoardSnapshot,
    pushUndoSnapshot,
    recordHistoryCheckpoint,
    handleCreateItem,
    handleCreateSegmentItem,
    triggerFrameItemAnimation,
    clearSelection,
    screenToWorld,
    startSegmentDraft,
    getSnapTargetRects,
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
