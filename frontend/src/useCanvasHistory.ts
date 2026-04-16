import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
  useRef,
  useState,
} from 'react';
import { replacePageBoardState } from './api';
import type { BoardItem, ConnectorLink } from './api';
import {
  areBoardSnapshotsEqual,
  cloneBoardSnapshot,
  type BoardHistoryEntry,
  type BoardSnapshot,
  prepareRedoHistory,
  prepareUndoHistory,
  pushUndoHistory,
} from './boardHistory';
import { MAX_HISTORY_ENTRIES } from './canvasConstants';
import type {
  ConnectorsUpdater,
  DragState,
  EditSessionState,
  ItemsUpdater,
  PanState,
  ResizeState,
  SegmentDraftState,
} from './canvasTypes';
import type { SnapGuide } from './snap';

interface UseCanvasHistoryParams {
  pageId: string;
  itemsRef: MutableRefObject<BoardItem[]>;
  connectorsRef: MutableRefObject<ConnectorLink[]>;
  selectedIdsRef: MutableRefObject<string[]>;
  itemSaveTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  editSessionRef: MutableRefObject<EditSessionState | null>;
  dragRef: MutableRefObject<DragState | null>;
  resizeRef: MutableRefObject<ResizeState | null>;
  panRef: MutableRefObject<PanState | null>;
  setItemsAndSync: (updater: ItemsUpdater) => void;
  setConnectorsAndSync: (updater: ConnectorsUpdater) => void;
  setSelection: (ids: string[]) => void;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  setSegmentDraft: Dispatch<SetStateAction<SegmentDraftState | null>>;
  setSnapGuides: Dispatch<SetStateAction<SnapGuide[]>>;
}

export function useCanvasHistory({
  pageId,
  itemsRef,
  connectorsRef,
  selectedIdsRef,
  itemSaveTimerRef,
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
}: UseCanvasHistoryParams) {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isHistorySyncing, setIsHistorySyncing] = useState(false);

  const undoStackRef = useRef<BoardHistoryEntry[]>([]);
  const redoStackRef = useRef<BoardHistoryEntry[]>([]);

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
  }, [connectorsRef, itemsRef, selectedIdsRef]);

  const resetHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    editSessionRef.current = null;
    syncHistoryState();
  }, [editSessionRef, syncHistoryState]);

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
    if (itemSaveTimerRef.current !== null) {
      clearTimeout(itemSaveTimerRef.current);
      itemSaveTimerRef.current = null;
    }
    editSessionRef.current = null;
  }, [editSessionRef, itemSaveTimerRef]);

  const restoreBoardSnapshot = useCallback(
    async (snapshot: BoardSnapshot): Promise<boolean> => {
      clearPendingItemSave();
      setIsHistorySyncing(true);

      try {
        const restored = await replacePageBoardState(pageId, {
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
      pageId,
      setConnectorsAndSync,
      setEditingId,
      setItemsAndSync,
      setSegmentDraft,
      setSelection,
      setSnapGuides,
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
    dragRef,
    isHistorySyncing,
    panRef,
    resizeRef,
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
    dragRef,
    isHistorySyncing,
    panRef,
    resizeRef,
    restoreBoardSnapshot,
    syncHistoryState,
  ]);

  return {
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
  };
}
