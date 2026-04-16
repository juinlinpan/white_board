import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useRef,
} from 'react';
import {
  type BoardItem,
  type BoardItemPayload,
  type ConnectorLink,
  createBoardItem,
  deleteBoardItem,
  updateBoardItem,
} from './api';
import type { BoardSnapshot } from './boardHistory';
import { PASTE_OFFSET_STEP, ITEM_SAVE_DELAY } from './canvasConstants';
import {
  clampItemSize,
  expandSelectionItemIds,
  getPrimarySelectionId,
  getUniqueItemIds,
  isInlineEditable,
  reorderItemsForLayer,
  sortItemsForClipboard,
  toPayload,
} from './canvasHelpers';
import type {
  ClipboardSnapshot,
  ConnectorsUpdater,
  EditSessionState,
  ItemsUpdater,
  SegmentDraftState,
} from './canvasTypes';
import {
  buildSegmentGeometry,
} from './segmentData';
import type { SegmentDraftTool } from './canvasTypes';
import { createTableData, serializeTableData } from './tableData';
import {
  ITEM_CATEGORY,
  ITEM_CATEGORY_FOR_TYPE,
  ITEM_TYPE,
  type ActiveTool,
} from './types';
import type { AnchorHit, LayerAction } from './canvasHelpers';

interface UseCanvasItemActionsParams {
  pageId: string;
  itemsRef: MutableRefObject<BoardItem[]>;
  connectorsRef: MutableRefObject<ConnectorLink[]>;
  selectedIdsRef: MutableRefObject<string[]>;
  itemSaveTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  editSessionRef: MutableRefObject<EditSessionState | null>;
  editingId: string | null;
  primarySelectedId: string | null;
  captureBoardSnapshot: () => BoardSnapshot;
  pushUndoSnapshot: (snapshot: BoardSnapshot) => void;
  recordHistoryCheckpoint: (snapshot: BoardSnapshot) => void;
  setItemsAndSync: (updater: ItemsUpdater) => void;
  setConnectorsAndSync: (updater: ConnectorsUpdater) => void;
  setSelection: (ids: string[]) => void;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  setActiveTool: Dispatch<SetStateAction<ActiveTool>>;
  setAnchorIndicatorItems: Dispatch<SetStateAction<BoardItem[]>>;
  setActiveAnchorHit: Dispatch<SetStateAction<AnchorHit | null>>;
}

export function useCanvasItemActions({
  pageId,
  itemsRef,
  connectorsRef,
  selectedIdsRef,
  itemSaveTimerRef,
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
}: UseCanvasItemActionsParams) {
  const clipboardRef = useRef<ClipboardSnapshot | null>(null);
  const pasteCountRef = useRef(0);

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
      connectorsRef,
      editingId,
      itemsRef,
      pushUndoSnapshot,
      selectedIdsRef,
      setConnectorsAndSync,
      setEditingId,
      setItemsAndSync,
      setSelection,
    ],
  );

  const handleDeleteSelection = useCallback(async () => {
    await handleDeleteItems(selectedIdsRef.current);
  }, [handleDeleteItems, selectedIdsRef]);

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
      void Promise.all(
        changedItems.map((item) => updateBoardItem(item.id, toPayload(item))),
      ).catch((err) => {
        console.error('[Canvas] Failed to persist items', err);
      });
    },
    [
      captureBoardSnapshot,
      itemsRef,
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
  }, [itemsRef, selectedIdsRef]);

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
          page_id: pageId,
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
    itemsRef,
    pageId,
    pushUndoSnapshot,
    setEditingId,
    setItemsAndSync,
    setSelection,
  ]);

  const handleCreateItem = useCallback(
    async (params: {
      type: string;
      x: number;
      y: number;
      width: number;
      height: number;
    }) => {
      const snapshotBeforeCreate = captureBoardSnapshot();
      const category =
        ITEM_CATEGORY_FOR_TYPE[params.type] ?? ITEM_CATEGORY.small_item;
      const zIndexes = itemsRef.current.map((item) => item.z_index);
      const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;
      const minZ = zIndexes.length > 0 ? Math.min(...zIndexes) : 0;
      const size = clampItemSize(params.type, params.width, params.height);

      const payload: BoardItemPayload = {
        page_id: pageId,
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
        content_format:
          params.type === ITEM_TYPE.note_paper ? 'markdown' : null,
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
    },
    [
      captureBoardSnapshot,
      itemsRef,
      pageId,
      pushUndoSnapshot,
      setEditingId,
      setItemsAndSync,
      setSelection,
    ],
  );

  const handleCreateSegmentItem = useCallback(
    async (draft: SegmentDraftState) => {
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
          page_id: pageId,
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
    },
    [
      itemsRef,
      pageId,
      pushUndoSnapshot,
      setActiveAnchorHit,
      setActiveTool,
      setAnchorIndicatorItems,
      setEditingId,
      setItemsAndSync,
      setSelection,
    ],
  );

  const handleItemUpdate = useCallback(
    (updated: BoardItem) => {
      if (editSessionRef.current?.itemId !== updated.id) {
        pushUndoSnapshot(captureBoardSnapshot());
        editSessionRef.current = { itemId: updated.id };
      }

      setItemsAndSync((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );

      if (itemSaveTimerRef.current !== null) {
        clearTimeout(itemSaveTimerRef.current);
      }

      itemSaveTimerRef.current = setTimeout(() => {
        void updateBoardItem(updated.id, toPayload(updated)).catch((err) => {
          console.error('[Canvas] Failed to update item', err);
        });
        if (editSessionRef.current?.itemId === updated.id) {
          editSessionRef.current = null;
        }
      }, ITEM_SAVE_DELAY);
    },
    [
      captureBoardSnapshot,
      editSessionRef,
      itemSaveTimerRef,
      pushUndoSnapshot,
      setItemsAndSync,
    ],
  );

  const handleEditEnd = useCallback(() => {
    editSessionRef.current = null;
    setEditingId(null);
  }, [editSessionRef, setEditingId]);

  return {
    handleCreateItem,
    handleCreateSegmentItem,
    handleDeleteItems,
    handleDeleteSelection,
    handleCopySelection,
    handlePasteSelection,
    handleLayerChange,
    handleItemUpdate,
    handleEditEnd,
  };
}
