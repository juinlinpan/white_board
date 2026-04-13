import type { BoardItem } from './api';
import { ITEM_TYPE } from './types';

export type Point = {
  x: number;
  y: number;
};

export type SegmentEndpoint = 'start' | 'end';

export type SegmentConnection = {
  itemId: string;
  anchor: string;
};

type RelativeSegmentData = {
  kind: 'segment';
  start: Point;
  end: Point;
  waypoints?: Point[];
  startConnection?: SegmentConnection | null;
  endConnection?: SegmentConnection | null;
};

export const SEGMENT_ITEM_PADDING = 20;

const DEFAULT_CLICK_SEGMENT_LENGTH = 120;
const LEGACY_LINE_INSET = 4;

function isFinitePoint(value: unknown): value is Point {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.x === 'number' &&
    Number.isFinite(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isFinite(candidate.y)
  );
}

export function normalizeSegmentDraft(
  start: Point,
  end: Point,
): { start: Point; end: Point } {
  if (start.x === end.x && start.y === end.y) {
    return {
      start,
      end: { x: start.x + DEFAULT_CLICK_SEGMENT_LENGTH, y: start.y },
    };
  }

  return { start, end };
}

function isPointArray(value: unknown): value is Point[] {
  return Array.isArray(value) && value.every(isFinitePoint);
}

function isSegmentConnection(value: unknown): value is SegmentConnection {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.itemId === 'string' &&
    candidate.itemId.length > 0 &&
    typeof candidate.anchor === 'string' &&
    candidate.anchor.length > 0
  );
}

export function parseRelativeSegmentData(
  dataJson: string | null,
): RelativeSegmentData | null {
  if (dataJson === null || dataJson.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(dataJson) as Record<string, unknown>;
    if (
      parsed.kind !== 'segment' ||
      !isFinitePoint(parsed.start) ||
      !isFinitePoint(parsed.end)
    ) {
      return null;
    }

    return {
      kind: 'segment',
      start: parsed.start,
      end: parsed.end,
      waypoints: isPointArray(parsed.waypoints) ? parsed.waypoints : undefined,
      startConnection: isSegmentConnection(parsed.startConnection)
        ? parsed.startConnection
        : null,
      endConnection: isSegmentConnection(parsed.endConnection)
        ? parsed.endConnection
        : null,
    };
  } catch {
    return null;
  }
}

export function getSegmentConnections(
  item: BoardItem,
): { startConnection: SegmentConnection | null; endConnection: SegmentConnection | null } {
  const parsed = parseRelativeSegmentData(item.data_json);
  return {
    startConnection: parsed?.startConnection ?? null,
    endConnection: parsed?.endConnection ?? null,
  };
}

export function canTranslateSegmentItem(item: BoardItem): boolean {
  return item.type === ITEM_TYPE.line || item.type === ITEM_TYPE.arrow;
}

function getLegacyLineLocalPoints(item: BoardItem): { start: Point; end: Point } {
  const centerX = item.width / 2;
  const centerY = item.height / 2;
  const halfLength = Math.max(item.width / 2 - LEGACY_LINE_INSET, 0);
  const radians = (item.rotation * Math.PI) / 180;
  const offsetX = Math.cos(radians) * halfLength;
  const offsetY = Math.sin(radians) * halfLength;

  return {
    start: { x: centerX - offsetX, y: centerY - offsetY },
    end: { x: centerX + offsetX, y: centerY + offsetY },
  };
}

export function hasStoredSegmentData(item: BoardItem): boolean {
  return parseRelativeSegmentData(item.data_json) !== null;
}

export function getSegmentLocalPoints(
  item: BoardItem,
): { start: Point; end: Point } | null {
  const parsed = parseRelativeSegmentData(item.data_json);
  if (parsed !== null) {
    return {
      start: parsed.start,
      end: parsed.end,
    };
  }

  if (item.type === ITEM_TYPE.line) {
    return getLegacyLineLocalPoints(item);
  }

  return null;
}

export function getSegmentWorldPoints(
  item: BoardItem,
): { start: Point; end: Point } | null {
  const local = getSegmentLocalPoints(item);
  if (local === null) {
    return null;
  }

  return {
    start: {
      x: item.x + local.start.x,
      y: item.y + local.start.y,
    },
    end: {
      x: item.x + local.end.x,
      y: item.y + local.end.y,
    },
  };
}

export function buildSegmentGeometry(
  start: Point,
  end: Point,
  waypoints?: Point[] | null,
  startConnection?: SegmentConnection | null,
  endConnection?: SegmentConnection | null,
): {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  data_json: string;
} {
  const normalized = normalizeSegmentDraft(start, end);
  const allPoints = [normalized.start, normalized.end, ...(waypoints ?? [])];
  const left = Math.min(...allPoints.map((p) => p.x)) - SEGMENT_ITEM_PADDING;
  const top = Math.min(...allPoints.map((p) => p.y)) - SEGMENT_ITEM_PADDING;
  const right = Math.max(...allPoints.map((p) => p.x)) + SEGMENT_ITEM_PADDING;
  const bottom = Math.max(...allPoints.map((p) => p.y)) + SEGMENT_ITEM_PADDING;

  const dataObj: Record<string, unknown> = {
    kind: 'segment',
    start: {
      x: normalized.start.x - left,
      y: normalized.start.y - top,
    },
    end: {
      x: normalized.end.x - left,
      y: normalized.end.y - top,
    },
  };

  if (waypoints && waypoints.length > 0) {
    dataObj.waypoints = waypoints.map((wp) => ({
      x: wp.x - left,
      y: wp.y - top,
    }));
  }

  if (startConnection) {
    dataObj.startConnection = startConnection;
  }
  if (endConnection) {
    dataObj.endConnection = endConnection;
  }

  return {
    x: left,
    y: top,
    width: Math.max(right - left, SEGMENT_ITEM_PADDING * 2 + 1),
    height: Math.max(bottom - top, SEGMENT_ITEM_PADDING * 2 + 1),
    rotation: 0,
    data_json: JSON.stringify(dataObj),
  };
}

export function getSegmentWaypoints(item: BoardItem): Point[] {
  const parsed = parseRelativeSegmentData(item.data_json);
  return parsed?.waypoints ?? [];
}

/** Returns all world-space points: [start, ...waypoints, end] */
export function getSegmentAllWorldPoints(item: BoardItem): Point[] | null {
  const parsed = parseRelativeSegmentData(item.data_json);
  if (parsed === null) {
    return null;
  }

  const waypoints = (parsed.waypoints ?? []).map((wp) => ({
    x: item.x + wp.x,
    y: item.y + wp.y,
  }));

  return [
    { x: item.x + parsed.start.x, y: item.y + parsed.start.y },
    ...waypoints,
    { x: item.x + parsed.end.x, y: item.y + parsed.end.y },
  ];
}

/**
 * Inserts a new waypoint at segmentIndex (the gap between all-points[segmentIndex] and
 * all-points[segmentIndex+1]) using the given world-space point.
 * Returns the new geometry and the new waypoint's index in the waypoints array.
 */
export function insertWaypointAt(
  item: BoardItem,
  segmentIndex: number,
  worldPoint: Point,
): {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  data_json: string;
  waypointIndex: number;
} | null {
  const worldPts = getSegmentWorldPoints(item);
  if (worldPts === null) {
    return null;
  }

  const conns = getSegmentConnections(item);
  const existingWorldWaypoints = getSegmentWaypoints(item).map((wp) => ({
    x: item.x + wp.x,
    y: item.y + wp.y,
  }));

  const newWaypoints = [...existingWorldWaypoints];
  newWaypoints.splice(segmentIndex, 0, worldPoint);

  const geometry = buildSegmentGeometry(
    worldPts.start,
    worldPts.end,
    newWaypoints,
    conns.startConnection,
    conns.endConnection,
  );

  return { ...geometry, waypointIndex: segmentIndex };
}

/** Moves a waypoint (by index) to a new world-space position. */
export function moveWaypointAt(
  item: BoardItem,
  waypointIndex: number,
  worldPoint: Point,
): {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  data_json: string;
} | null {
  const worldPts = getSegmentWorldPoints(item);
  if (worldPts === null) {
    return null;
  }

  const conns = getSegmentConnections(item);
  const existingWorldWaypoints = getSegmentWaypoints(item).map((wp) => ({
    x: item.x + wp.x,
    y: item.y + wp.y,
  }));

  const newWaypoints = [...existingWorldWaypoints];
  newWaypoints[waypointIndex] = worldPoint;

  return buildSegmentGeometry(
    worldPts.start,
    worldPts.end,
    newWaypoints,
    conns.startConnection,
    conns.endConnection,
  );
}

export function updateSegmentEndpoint(
  item: BoardItem,
  endpoint: SegmentEndpoint,
  nextPoint: Point,
  connection?: SegmentConnection | null,
): {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  data_json: string;
} | null {
  const currentPoints = getSegmentWorldPoints(item);
  if (currentPoints === null) {
    return null;
  }

  const existing = getSegmentConnections(item);
  const existingWorldWaypoints = getSegmentWaypoints(item).map((wp) => ({
    x: item.x + wp.x,
    y: item.y + wp.y,
  }));
  const startConn = endpoint === 'start' ? (connection ?? null) : existing.startConnection;
  const endConn = endpoint === 'end' ? (connection ?? null) : existing.endConnection;

  return buildSegmentGeometry(
    endpoint === 'start' ? nextPoint : currentPoints.start,
    endpoint === 'end' ? nextPoint : currentPoints.end,
    existingWorldWaypoints,
    startConn,
    endConn,
  );
}
