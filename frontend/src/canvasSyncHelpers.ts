import type { MutableRefObject } from 'react';
import {
  type BoardItem,
  type ConnectorLink,
  updateBoardItem,
  updateConnector,
} from './api';
import {
  getAutoAnchors,
  getAnchorPoint,
  isAnchor,
  toConnectorPayload,
  toPayload,
} from './canvasHelpers';
import type { ConnectorsUpdater, ItemsUpdater } from './canvasTypes';
import {
  buildSegmentGeometry,
  getSegmentConnections,
  getSegmentWaypoints,
  getSegmentWorldPoints,
  hasStoredSegmentData,
} from './segmentData';
import { ITEM_TYPE } from './types';

/**
 * Persist a batch of items to the backend. Fire-and-forget.
 */
export function persistItems(items: BoardItem[]): void {
  if (items.length === 0) {
    return;
  }

  void Promise.all(
    items.map((item) => updateBoardItem(item.id, toPayload(item))),
  ).catch((err) => {
    console.error('[Canvas] Failed to persist items', err);
  });
}

/**
 * After connectable items move, update any legacy arrow-connector whose
 * auto-anchors have become stale.
 */
export function syncConnectorAnchorsForItems(
  changedItemIds: string[],
  itemsRef: MutableRefObject<BoardItem[]>,
  setConnectorsAndSync: (updater: ConnectorsUpdater) => void,
): void {
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
export function syncSegmentConnectionsForItems(
  changedItemIds: string[],
  itemsRef: MutableRefObject<BoardItem[]>,
  setItemsAndSync: (updater: ItemsUpdater) => void,
): void {
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
