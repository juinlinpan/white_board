import type { BoardItem, ConnectorLink } from './api';

export type BoardSnapshot = {
  items: BoardItem[];
  connectors: ConnectorLink[];
  selectedIds: string[];
};

export type BoardHistoryEntry = {
  snapshot: BoardSnapshot;
  signature: string;
};

type NormalizedBoardSnapshot = {
  items: BoardItem[];
  connectors: ConnectorLink[];
  selectedIds: string[];
};

function cloneBoardItem(item: BoardItem): BoardItem {
  return { ...item };
}

function cloneConnectorLink(connector: ConnectorLink): ConnectorLink {
  return { ...connector };
}

export function cloneBoardSnapshot(snapshot: BoardSnapshot): BoardSnapshot {
  return {
    items: snapshot.items.map(cloneBoardItem),
    connectors: snapshot.connectors.map(cloneConnectorLink),
    selectedIds: [...snapshot.selectedIds],
  };
}

function normalizeBoardSnapshot(
  snapshot: BoardSnapshot,
): NormalizedBoardSnapshot {
  return {
    items: [...snapshot.items].sort((a, b) => a.id.localeCompare(b.id)),
    connectors: [...snapshot.connectors].sort((a, b) => a.id.localeCompare(b.id)),
    selectedIds: [...snapshot.selectedIds].sort((a, b) => a.localeCompare(b)),
  };
}

export function createBoardSnapshotSignature(snapshot: BoardSnapshot): string {
  return JSON.stringify(normalizeBoardSnapshot(snapshot));
}

export function createBoardHistoryEntry(
  snapshot: BoardSnapshot,
): BoardHistoryEntry {
  const clonedSnapshot = cloneBoardSnapshot(snapshot);
  return {
    snapshot: clonedSnapshot,
    signature: createBoardSnapshotSignature(clonedSnapshot),
  };
}

export function areBoardSnapshotsEqual(
  left: BoardSnapshot | BoardHistoryEntry,
  right: BoardSnapshot | BoardHistoryEntry,
): boolean {
  const leftSignature =
    'signature' in left ? left.signature : createBoardSnapshotSignature(left);
  const rightSignature =
    'signature' in right ? right.signature : createBoardSnapshotSignature(right);
  return leftSignature === rightSignature;
}

function trimHistoryEntries<T>(entries: T[], maxEntries: number): T[] {
  if (entries.length <= maxEntries) {
    return entries;
  }

  return entries.slice(entries.length - maxEntries);
}

export function pushUndoHistory(
  undoStack: BoardHistoryEntry[],
  snapshot: BoardSnapshot,
  maxEntries: number,
): { undoStack: BoardHistoryEntry[]; added: boolean } {
  const nextEntry = createBoardHistoryEntry(snapshot);
  const previousEntry = undoStack[undoStack.length - 1] ?? null;
  if (previousEntry !== null && previousEntry.signature === nextEntry.signature) {
    return {
      undoStack,
      added: false,
    };
  }

  return {
    undoStack: trimHistoryEntries([...undoStack, nextEntry], maxEntries),
    added: true,
  };
}

export function prepareUndoHistory(
  undoStack: BoardHistoryEntry[],
  redoStack: BoardHistoryEntry[],
  currentSnapshot: BoardSnapshot,
  maxEntries: number,
): {
  targetSnapshot: BoardSnapshot | null;
  undoStack: BoardHistoryEntry[];
  redoStack: BoardHistoryEntry[];
} {
  const targetEntry = undoStack[undoStack.length - 1] ?? null;
  if (targetEntry === null) {
    return {
      targetSnapshot: null,
      undoStack,
      redoStack,
    };
  }

  return {
    targetSnapshot: cloneBoardSnapshot(targetEntry.snapshot),
    undoStack: undoStack.slice(0, -1),
    redoStack: trimHistoryEntries(
      [...redoStack, createBoardHistoryEntry(currentSnapshot)],
      maxEntries,
    ),
  };
}

export function prepareRedoHistory(
  undoStack: BoardHistoryEntry[],
  redoStack: BoardHistoryEntry[],
  currentSnapshot: BoardSnapshot,
  maxEntries: number,
): {
  targetSnapshot: BoardSnapshot | null;
  undoStack: BoardHistoryEntry[];
  redoStack: BoardHistoryEntry[];
} {
  const targetEntry = redoStack[redoStack.length - 1] ?? null;
  if (targetEntry === null) {
    return {
      targetSnapshot: null,
      undoStack,
      redoStack,
    };
  }

  return {
    targetSnapshot: cloneBoardSnapshot(targetEntry.snapshot),
    undoStack: trimHistoryEntries(
      [...undoStack, createBoardHistoryEntry(currentSnapshot)],
      maxEntries,
    ),
    redoStack: redoStack.slice(0, -1),
  };
}
