import type { BoardItem, BoardItemPayload, ConnectorLink } from './api';
import type { BoardSnapshot } from './boardHistory';
import type { Point, SegmentConnection, SegmentEndpoint } from './segmentData';
import type { ActiveTool } from './types';

export type DragState = {
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

export type ResizeState = {
  itemId: string;
  startMouseX: number;
  startMouseY: number;
  startWidth: number;
  startHeight: number;
  snapshot: BoardSnapshot;
};

export type PanState = {
  startMouseX: number;
  startMouseY: number;
  startVpX: number;
  startVpY: number;
};

export type SegmentDraftTool = Extract<ActiveTool, 'line' | 'arrow'>;

export type SegmentDraftState = {
  type: SegmentDraftTool;
  start: Point;
  end: Point;
  startConnection: SegmentConnection | null;
  endConnection: SegmentConnection | null;
  snapshot: BoardSnapshot;
};

export type SegmentEndpointDragState = {
  itemId: string;
  endpoint: SegmentEndpoint;
  connection: SegmentConnection | null;
  snapshot: BoardSnapshot;
};

export type WaypointDragState = {
  itemId: string;
  waypointIndex: number;
  snapshot: BoardSnapshot;
};

export type ClipboardEntry = {
  sourceId: string;
  payload: BoardItemPayload;
};

export type ClipboardSnapshot = {
  items: ClipboardEntry[];
};

export type EditSessionState = {
  itemId: string;
};

export type ItemsUpdater = BoardItem[] | ((current: BoardItem[]) => BoardItem[]);

export type ConnectorsUpdater =
  | ConnectorLink[]
  | ((current: ConnectorLink[]) => ConnectorLink[]);
