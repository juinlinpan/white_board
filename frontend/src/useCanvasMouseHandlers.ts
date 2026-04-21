import type React from 'react';
import type { MutableRefObject, RefObject } from 'react';
import type { BoardItem, ConnectorLink } from './api';
import {
  clampItemSize,
  clampItemToFrame,
  detachDraggedSegments,
  findFrameDropTarget,
  findNearestConnectorAnchor,
  findTableCellDropTarget,
  fitItemWithinBounds,
  getAnchorPoint,
  getDraggableSelectionItemIds,
  getFrameChildFitSize,
  getFrameChildren,
  getFrameContentBounds,
  getFrameEjectPosition,
  getItemsNearPoint,
  getItemMagnetBounds,
  getSelectionMagnetBounds,
  getTableCellBounds,
  computeCellChildLayout,
  getUniqueItemIds,
  isAnchor,
  isFrame,
  isHiddenByCollapsedFrame,
  isInlineEditable,
  isItemFullyOutsideFrame,
  isSmallItem,
  relayoutFrameItems,
  relayoutTableItems,
  toPayload,
  type AnchorHit,
  type TableCellHit,
} from './canvasHelpers';
import {
  CANVAS_GRID_SIZE,
  MIN_ZOOM,
  MAX_ZOOM,
  MAGNET_TOLERANCE,
  CONNECTOR_SNAP_THRESHOLD,
} from './canvasConstants';
import { deleteConnector, updateBoardItem } from './api';
import {
  persistItems,
  syncConnectorAnchorsForItems,
  syncSegmentConnectionsForItems,
} from './canvasSyncHelpers';
import type { BoardSnapshot } from './boardHistory';
import type {
  ConnectorsUpdater,
  DragState,
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
import {
  magnetMoveRect,
  magnetResizeRect,
  snapPointToGrid,
  snapValueToGrid,
} from './magnet';
import {
  findCellByChildItemId,
  createTableData,
  parseTableData,
  serializeTableData,
  updateTableCell,
  getRootCellAt,
  TABLE_MAX_DIMENSION,
} from './tableData';
import { ITEM_DEFAULT_SIZE, ITEM_TYPE, type ActiveTool, type Viewport } from './types';
import {
  getTableInsertCanvasDimensions,
  getTableInsertCanvasSize,
} from './tableInsertPreview';
import { zoomViewportAroundPoint } from './viewport';

export type UseCanvasMouseHandlersParams = {
  // Current state values (re-captured every render)
  magnetEnabled: boolean;
  activeTool: ActiveTool;
  segmentDraft: SegmentDraftState | null;
  editingId: string | null;
  selectedItem: BoardItem | null;

  // Refs
  itemsRef: RefObject<BoardItem[]>;
  connectorsRef: RefObject<ConnectorLink[]>;
  selectedIdsRef: RefObject<string[]>;
  viewportRef: RefObject<Viewport>;
  containerRef: RefObject<HTMLDivElement | null>;
  isSpaceRef: RefObject<boolean>;
  dragRef: MutableRefObject<DragState | null>;
  resizeRef: MutableRefObject<ResizeState | null>;
  panRef: MutableRefObject<PanState | null>;
  waypointDragRef: MutableRefObject<WaypointDragState | null>;
  segmentEndpointDragRef: MutableRefObject<SegmentEndpointDragState | null>;
  tableInsertDraftRef: MutableRefObject<TableInsertDraftState | null>;
  marqueeSelectionRef: MutableRefObject<{
    startClientX: number;
    startClientY: number;
    appendToSelection: boolean;
    baseSelectionIds: string[];
  } | null>;

  // Viewport
  setViewportAndSync: (vp: Viewport) => void;
  scheduleViewportSave: (vp: Viewport) => void;

  // Item state setters
  setItemsAndSync: (updater: ItemsUpdater) => void;
  setConnectorsAndSync: (updater: ConnectorsUpdater) => void;

  // UI state setters
  setAnchorIndicatorItems: (items: BoardItem[]) => void;
  setActiveAnchorHit: (hit: AnchorHit | null) => void;
  setActiveFrameDropTargetId: (id: string | null) => void;
  setActiveTableDropTarget: (target: TableCellHit | null) => void;
  setDeletingWaypointInfo: (
    info: { itemId: string; waypointIndex: number } | null,
  ) => void;
  setTableInsertPreview: (preview: TableInsertPreviewState | null) => void;
  setMarqueeSelection: (selection: MarqueeSelectionState | null) => void;
  toolbarTableInsertPreviewActive: boolean;

  // Selection / editing
  setSelection: (ids: string[]) => void;
  setEditingId: (id: string | null) => void;
  setSegmentDraft: React.Dispatch<React.SetStateAction<SegmentDraftState | null>>;
  setActiveTool: (tool: ActiveTool) => void;

  // History
  captureBoardSnapshot: () => BoardSnapshot;
  pushUndoSnapshot: (snapshot: BoardSnapshot) => void;
  recordHistoryCheckpoint: (snapshot: BoardSnapshot) => void;

  // Item actions
  handleCreateItem: (params: {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    dataJson?: string | null;
  }) => Promise<void>;
  handleCreateSegmentItem: (draft: SegmentDraftState) => Promise<void>;
  triggerFrameItemAnimation: (itemIds: string[], type: 'ingest' | 'eject') => void;

  // Helpers (stable callbacks from Canvas)
  clearSelection: () => void;
  screenToWorld: (x: number, y: number) => Point;
  startSegmentDraft: (type: SegmentDraftTool, x: number, y: number) => void;
};

export function useCanvasMouseHandlers(params: UseCanvasMouseHandlersParams) {
  const {
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
    toolbarTableInsertPreviewActive,
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
  } = params;

  function getSnappedPoint(point: Point, shouldSnap: boolean): Point {
    return shouldSnap ? snapPointToGrid(point, CANVAS_GRID_SIZE) : point;
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
    const nextViewport = zoomViewportAroundPoint(
      vp,
      Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * (1 + delta))),
      { x: mouseX, y: mouseY },
    );

    setViewportAndSync(nextViewport);
    scheduleViewportSave(nextViewport);
  }

  function startTableInsertDraft(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const worldPos = screenToWorld(clientX, clientY);
    const snappedWorldPos = getSnappedPoint(worldPos, magnetEnabled);
    tableInsertDraftRef.current = {
      startClientX: clientX,
      startClientY: clientY,
      startWorldX: snappedWorldPos.x,
      startWorldY: snappedWorldPos.y,
    };
    setTableInsertPreview({
      cursorX: clientX - rect.left,
      cursorY: clientY - rect.top,
      cols: 1,
      rows: 1,
      isActive: true,
      worldX: snappedWorldPos.x,
      worldY: snappedWorldPos.y,
      width: getTableInsertCanvasSize(0, 0).width,
      height: getTableInsertCanvasSize(0, 0).height,
    });
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

    if (activeTool === 'table') {
      if (toolbarTableInsertPreviewActive) {
        return;
      }
      startTableInsertDraft(e.clientX, e.clientY);
      return;
    }

    if (activeTool !== 'select') {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const size = ITEM_DEFAULT_SIZE[activeTool] ?? { width: 200, height: 100 };
      const rawX = worldPos.x - size.width / 2;
      const rawY = worldPos.y - size.height / 2;
      void handleCreateItem({
        type: activeTool,
        x: magnetEnabled ? snapValueToGrid(rawX, CANVAS_GRID_SIZE) : rawX,
        y: magnetEnabled ? snapValueToGrid(rawY, CANVAS_GRID_SIZE) : rawY,
        ...size,
      });
      setActiveTool('select');
      return;
    }

    setEditingId(null);
    marqueeSelectionRef.current = {
      startClientX: e.clientX,
      startClientY: e.clientY,
      appendToSelection: e.shiftKey || e.ctrlKey || e.metaKey,
      baseSelectionIds: selectedIdsRef.current,
    };
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
      clearSelection();
    }
  }

  function handleItemMouseDown(e: React.MouseEvent, itemId: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    e.stopPropagation();

    if (activeTool === 'line' || activeTool === 'arrow') {
      startSegmentDraft(activeTool, e.clientX, e.clientY);
      return;
    }

    if (activeTool === 'table') {
      if (toolbarTableInsertPreviewActive) {
        return;
      }
      startTableInsertDraft(e.clientX, e.clientY);
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

    const selectionBounds = getSelectionMagnetBounds(
      itemsRef.current,
      draggedSelectionIds,
    );
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
            : { id: selectedItem.id, x: selectedItem.x, y: selectedItem.y };
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

    if (activeTool === 'table') {
      if (toolbarTableInsertPreviewActive) {
        return;
      }
      startTableInsertDraft(e.clientX, e.clientY);
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
    const shouldUseMagnet = magnetEnabled && !e.altKey;
    const marqueeSelection = marqueeSelectionRef.current;
    if (marqueeSelection !== null) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const left = Math.min(marqueeSelection.startClientX, e.clientX) - rect.left;
      const top = Math.min(marqueeSelection.startClientY, e.clientY) - rect.top;
      const width = Math.abs(e.clientX - marqueeSelection.startClientX);
      const height = Math.abs(e.clientY - marqueeSelection.startClientY);
      setMarqueeSelection({ left, top, width, height });

      const startWorld = screenToWorld(
        marqueeSelection.startClientX,
        marqueeSelection.startClientY,
      );
      const endWorld = screenToWorld(e.clientX, e.clientY);
      const selectionRect = {
        left: Math.min(startWorld.x, endWorld.x),
        top: Math.min(startWorld.y, endWorld.y),
        right: Math.max(startWorld.x, endWorld.x),
        bottom: Math.max(startWorld.y, endWorld.y),
      };
      const enclosedIds = itemsRef.current
        .filter((item) => !isHiddenByCollapsedFrame(item, itemsRef.current))
        .filter((item) => {
          const bounds = getItemMagnetBounds(item);
          return (
            bounds.x >= selectionRect.left &&
            bounds.y >= selectionRect.top &&
            bounds.x + bounds.width <= selectionRect.right &&
            bounds.y + bounds.height <= selectionRect.bottom
          );
        })
        .map((item) => item.id);
      setSelection(
        marqueeSelection.appendToSelection
          ? getUniqueItemIds([...marqueeSelection.baseSelectionIds, ...enclosedIds])
          : enclosedIds,
      );
      return;
    }

    const waypointDrag = waypointDragRef.current;
    if (waypointDrag) {
      const item = itemsRef.current.find(
        (candidate) => candidate.id === waypointDrag.itemId,
      );
      if (!item) {
        return;
      }

      const rawPoint = screenToWorld(e.clientX, e.clientY);
      const nextPoint = getSnappedPoint(rawPoint, shouldUseMagnet);
      const nextGeometry = moveWaypointAt(
        item,
        waypointDrag.waypointIndex,
        nextPoint,
      );
      if (nextGeometry === null) {
        return;
      }

      // Check if dragged close enough to start/end to trigger delete
      const SNAP_DELETE_DIST = 10;
      const worldPts = getSegmentWorldPoints(item);
      if (worldPts !== null) {
        const dStart = Math.hypot(
          rawPoint.x - worldPts.start.x,
          rawPoint.y - worldPts.start.y,
        );
        const dEnd = Math.hypot(
          rawPoint.x - worldPts.end.x,
          rawPoint.y - worldPts.end.y,
        );
        if (dStart < SNAP_DELETE_DIST || dEnd < SNAP_DELETE_DIST) {
          setDeletingWaypointInfo({
            itemId: waypointDrag.itemId,
            waypointIndex: waypointDrag.waypointIndex,
          });
        } else {
          setDeletingWaypointInfo(null);
        }
      }

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
        setAnchorIndicatorItems([]);
        setActiveAnchorHit(null);
        return;
      }

      const rawPoint = screenToWorld(e.clientX, e.clientY);
      const snappedPoint = getSnappedPoint(rawPoint, shouldUseMagnet);

      // Check for connector anchor attachment
      const anchorHit = findNearestConnectorAnchor(
        rawPoint,
        itemsRef.current,
        new Set([endpointDrag.itemId]),
        CONNECTOR_SNAP_THRESHOLD,
      );
      const nextPoint = anchorHit ? anchorHit.point : snappedPoint;
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
      const rawPoint = screenToWorld(e.clientX, e.clientY);
      const snappedPoint = getSnappedPoint(rawPoint, shouldUseMagnet);

      // Check for connector anchor attachment on the end point
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
      const nextPoint = anchorHit ? anchorHit.point : snappedPoint;
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
        return;
      }

      const rawRect = {
        x: item.x,
        y: item.y,
        width: resize.startWidth + dx,
        height: resize.startHeight + dy,
      };
      const magnetRect = shouldUseMagnet
        ? magnetResizeRect(rawRect, CANVAS_GRID_SIZE, MAGNET_TOLERANCE)
        : { width: rawRect.width, height: rawRect.height };
      const nextSize = clampItemSize(
        item.type,
        magnetRect.width,
        magnetRect.height,
        item.data_json,
      );

      setItemsAndSync((current) => {
        const resizedItems = current.map((currentItem) => {
          if (currentItem.id !== resize.itemId) {
            return currentItem;
          }

          return {
            ...currentItem,
            width: nextSize.width,
            height: nextSize.height,
          };
        });

        return item.type === ITEM_TYPE.table
          ? relayoutTableItems(resizedItems, [resize.itemId]).items
          : resizedItems;
      });
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

          const detachedSelectionBounds = getSelectionMagnetBounds(
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
                : { id: selectedItem.id, x: selectedItem.x, y: selectedItem.y };
            })
            .filter(
              (entry): entry is { id: string; x: number; y: number } => entry !== null,
            );
        }
      }

      if (drag.itemPositions.length === 0) {
        return;
      }

      const selectionBounds = getSelectionMagnetBounds(
        baseItems,
        drag.selectedItemIds,
      );
      if (selectionBounds === null) {
        return;
      }

      const rawX = drag.startBoundsX + dx;
      const rawY = drag.startBoundsY + dy;
      const nextBounds = shouldUseMagnet
        ? magnetMoveRect(
            {
              x: rawX,
              y: rawY,
              width: selectionBounds.width,
              height: selectionBounds.height,
            },
            CANVAS_GRID_SIZE,
            MAGNET_TOLERANCE,
          )
        : { x: rawX, y: rawY };
      const offsetX = nextBounds.x - drag.startBoundsX;
      const offsetY = nextBounds.y - drag.startBoundsY;
      const itemStartMap = new Map(
        drag.itemPositions.map((entry) => [entry.id, entry] as const),
      );

      setItemsAndSync((current) => {
        const draggedIdSet = new Set(drag.selectedItemIds);
        // First apply the drag offsets
        let nextItems = current.map((item) => {
          const itemStart = itemStartMap.get(item.id);
          if (itemStart) {
            return { ...item, x: itemStart.x + offsetX, y: itemStart.y + offsetY };
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
                isAnchor(conns.endConnection.anchor) ? conns.endConnection.anchor : null,
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
      const nextViewport: Viewport = {
        ...viewportRef.current,
        x: pan.startVpX + (e.clientX - pan.startMouseX),
        y: pan.startVpY + (e.clientY - pan.startMouseY),
      };
      setViewportAndSync(nextViewport);
      return;
    }

    if (activeTool === 'table') {
      if (toolbarTableInsertPreviewActive) {
        setTableInsertPreview(null);
        return;
      }
      const draft = tableInsertDraftRef.current;
      if (draft === null) {
        setTableInsertPreview(null);
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        setTableInsertPreview(null);
        return;
      }

      const worldPos = getSnappedPoint(
        screenToWorld(e.clientX, e.clientY),
        magnetEnabled,
      );
      const deltaWorldX = worldPos.x - draft.startWorldX;
      const deltaWorldY = worldPos.y - draft.startWorldY;
      const dims = getTableInsertCanvasDimensions(
        deltaWorldX,
        deltaWorldY,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      );
      const size = getTableInsertCanvasSize(
        deltaWorldX,
        deltaWorldY,
        dims.rows,
        dims.cols,
      );
      setTableInsertPreview({
        cursorX: draft.startClientX - rect.left,
        cursorY: draft.startClientY - rect.top,
        cols: dims.cols,
        rows: dims.rows,
        isActive: true,
        worldX: draft.startWorldX,
        worldY: draft.startWorldY,
        width: size.width,
        height: size.height,
      });
      return;
    }

  }

  function handleMouseUp(e?: React.MouseEvent) {
    setAnchorIndicatorItems([]);
    setActiveAnchorHit(null);
    setActiveFrameDropTargetId(null);
    setActiveTableDropTarget(null);

    const tableInsertDraft = tableInsertDraftRef.current;
    tableInsertDraftRef.current = null;
    setTableInsertPreview(null);
    marqueeSelectionRef.current = null;
    setMarqueeSelection(null);

    if (tableInsertDraft !== null) {
      const worldPos =
        e === undefined
          ? {
              x:
                tableInsertDraft.startWorldX +
                ITEM_DEFAULT_SIZE[ITEM_TYPE.table].width,
              y:
                tableInsertDraft.startWorldY +
                ITEM_DEFAULT_SIZE[ITEM_TYPE.table].height,
            }
          : getSnappedPoint(screenToWorld(e.clientX, e.clientY), magnetEnabled);
      const deltaWorldX = worldPos.x - tableInsertDraft.startWorldX;
      const deltaWorldY = worldPos.y - tableInsertDraft.startWorldY;
      const dims = getTableInsertCanvasDimensions(
        deltaWorldX,
        deltaWorldY,
        TABLE_MAX_DIMENSION,
        TABLE_MAX_DIMENSION,
      );
      const size = getTableInsertCanvasSize(
        deltaWorldX,
        deltaWorldY,
        dims.rows,
        dims.cols,
      );
      void handleCreateItem({
        type: ITEM_TYPE.table,
        x: tableInsertDraft.startWorldX,
        y: tableInsertDraft.startWorldY,
        width: size.width,
        height: size.height,
        dataJson: serializeTableData(createTableData(dims.rows, dims.cols)),
      });
      setActiveTool('select');
      return;
    }

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
          const dStart = Math.hypot(
            wpWorld.x - worldPts.start.x,
            wpWorld.y - worldPts.start.y,
          );
          const dEnd = Math.hypot(
            wpWorld.x - worldPts.end.x,
            wpWorld.y - worldPts.end.y,
          );
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
        const snappedEnd = getSnappedPoint(
          rawEnd,
          magnetEnabled && !e.altKey,
        );
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
        finalEnd = anchorHit ? anchorHit.point : snappedEnd;
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

        if (item.type === ITEM_TYPE.table) {
          const relayoutResult = relayoutTableItems(nextItems, [item.id]);
          nextItems = relayoutResult.items;
          for (const changedId of relayoutResult.changedIds) {
            changedIds.add(changedId);
          }
          for (const child of getFrameChildren(nextItems, item.id)) {
            changedIds.add(child.id);
          }

          if (relayoutResult.changedIds.length > 0) {
            setItemsAndSync(nextItems);
          }
        }

        persistItems(nextItems.filter((candidate) => changedIds.has(candidate.id)));
        syncConnectorAnchorsForItems([...changedIds], itemsRef, setConnectorsAndSync);
        syncSegmentConnectionsForItems([...changedIds], itemsRef, setItemsAndSync);
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
            : nextItems.find((item) => item.id === movedItem.parent_item_id) ?? null;
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
          const clampedPosition = clampItemToFrame(movedItem, targetFrame, fittedSize);

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
                      ? {
                          ...c,
                          childItemIds: c.childItemIds.filter(
                            (id) => id !== movedItem.id,
                          ),
                        }
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
                const remainingIds = cellHit.cell.childItemIds.filter(
                  (id) => id !== movedItem.id,
                );
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
                    const layout = computeCellChildLayout(
                      cellBounds,
                      idx,
                      remainingIds.length,
                      CELL_INSET,
                    );
                    nextItems = nextItems.map((it) =>
                      it.id === remainingId
                        ? {
                            ...it,
                            x: layout.x,
                            y: layout.y,
                            width: layout.width,
                            height: layout.height,
                          }
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
              const itemCenterX = movedItem.x + movedItem.width / 2;
              const itemCenterY = movedItem.y + movedItem.height / 2;
              const localX = itemCenterX - previousParent.x;
              const localY = itemCenterY - previousParent.y;
              let hoverCol = -1;
              let cumX = 0;
              for (let c = 0; c < tData.cols; c++) {
                const colW =
                  (tData.colWidths[c] ?? 1 / tData.cols) * previousParent.width;
                if (localX >= cumX && localX < cumX + colW) {
                  hoverCol = c;
                  break;
                }
                cumX += colW;
              }
              let hoverRow = -1;
              let cumY = 0;
              for (let r = 0; r < tData.rows; r++) {
                const rowH =
                  (tData.rowHeights[r] ?? 1 / tData.rows) * previousParent.height;
                if (localY >= cumY && localY < cumY + rowH) {
                  hoverRow = r;
                  break;
                }
                cumY += rowH;
              }
              const hoverRoot =
                hoverRow >= 0 && hoverCol >= 0
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
                const oldRemainingIds = originalCellHit.cell.childItemIds.filter(
                  (id) => id !== movedItem.id,
                );
                const newTargetIds = [...hoverRoot!.cell.childItemIds, movedItem.id];

                const updatedTData = {
                  ...tData,
                  cells: tData.cells.map((row) =>
                    row.map((c) => {
                      if (!c) return c;
                      if (c.id === originalCellHit.cell.id)
                        return { ...c, childItemIds: oldRemainingIds };
                      if (c.id === hoverRoot!.cell.id)
                        return { ...c, childItemIds: newTargetIds };
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
                const myLayout = computeCellChildLayout(
                  newCellBounds,
                  myIndex,
                  newTargetIds.length,
                  CELL_INSET,
                );
                nextParentId = previousParent.id;
                nextX = myLayout.x;
                nextY = myLayout.y;
                nextWidth = myLayout.width;
                nextHeight = myLayout.height;

                // Relayout other items in the new cell
                newTargetIds.forEach((otherId, idx) => {
                  if (otherId === movedItem.id) return;
                  const otherLayout = computeCellChildLayout(
                    newCellBounds,
                    idx,
                    newTargetIds.length,
                    CELL_INSET,
                  );
                  nextItems = nextItems.map((it) =>
                    it.id === otherId
                      ? {
                          ...it,
                          x: otherLayout.x,
                          y: otherLayout.y,
                          width: otherLayout.width,
                          height: otherLayout.height,
                        }
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
                    const layout = computeCellChildLayout(
                      oldCellBounds,
                      idx,
                      oldRemainingIds.length,
                      CELL_INSET,
                    );
                    nextItems = nextItems.map((it) =>
                      it.id === remainId
                        ? {
                            ...it,
                            x: layout.x,
                            y: layout.y,
                            width: layout.width,
                            height: layout.height,
                          }
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
        const sizeChanged = nextWidth !== movedItem.width || nextHeight !== movedItem.height;

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
      syncConnectorAnchorsForItems([...changedIds], itemsRef, setConnectorsAndSync);
      syncSegmentConnectionsForItems([...changedIds], itemsRef, setItemsAndSync);
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
        // Items already parented to a table/frame were handled above — skip re-absorption.
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
            nextItems.length > 0
              ? Math.max(...nextItems.map((it) => it.z_index))
              : 0;

          // Layout the absorbed item
          const myIndex = newChildIds.indexOf(absorbedItemId);
          const myLayout = computeCellChildLayout(
            cellBounds,
            myIndex,
            newChildIds.length,
            CELL_INSET,
          );
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
              const layout = computeCellChildLayout(
                cellBounds,
                idx,
                newChildIds.length,
                CELL_INSET,
              );
              nextItems = nextItems.map((it) =>
                it.id === existingId
                  ? {
                      ...it,
                      x: layout.x,
                      y: layout.y,
                      width: layout.width,
                      height: layout.height,
                    }
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
              void updateBoardItem(itemId, toPayload(latestItem)).catch((err) =>
                console.error('[Canvas] Failed to update item after absorb', err),
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

  return {
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
  };
}
