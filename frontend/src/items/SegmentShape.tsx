import { type BoardItem } from '../api';
import { resolveBoardItemStyle } from '../itemStyles';
import { getSegmentLocalPoints, getSegmentWaypoints, type SegmentEndpoint } from '../segmentData';
import { ITEM_TYPE } from '../types';

type Props = {
  item: BoardItem;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent<SVGPolylineElement>) => void;
  onEndpointMouseDown: (
    e: React.MouseEvent<HTMLButtonElement>,
    endpoint: SegmentEndpoint,
  ) => void;
  onWaypointMouseDown: (e: React.MouseEvent<HTMLButtonElement>, waypointIndex: number) => void;
  onMidpointMouseDown: (e: React.MouseEvent<HTMLButtonElement>, segmentIndex: number) => void;
  deletingWaypointIndex?: number;
};

function getStrokeDasharray(style: 'solid' | 'dashed' | 'dotted'): string | undefined {
  switch (style) {
    case 'dashed':
      return '14 10';
    case 'dotted':
      return '2 8';
    default:
      return undefined;
  }
}

export function SegmentShape({
  item,
  isSelected,
  onMouseDown,
  onEndpointMouseDown,
  onWaypointMouseDown,
  onMidpointMouseDown,
  deletingWaypointIndex,
}: Props) {
  const points = getSegmentLocalPoints(item);
  const localWaypoints = getSegmentWaypoints(item);
  const resolvedStyle = resolveBoardItemStyle(item);
  const markerId = `segment-arrow-head-${item.id}`;
  // Calculate arrow head dimensions based on size preference
  const arrowSize = resolvedStyle.arrowHeadSize;
  const arrowWidth = arrowSize;
  const arrowHeight = (arrowSize * 7) / 10;

  if (points === null) {
    return null;
  }

  // All points in local (item-relative) coordinates
  const allLocalPoints = [points.start, ...localWaypoints, points.end];
  const polylinePoints = allLocalPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const strokeDasharray = getStrokeDasharray(resolvedStyle.strokeStyle);

  return (
    <div className="segment-shape" aria-hidden="true">
      <svg
        className="segment-shape-svg"
        width={item.width}
        height={item.height}
        viewBox={`0 0 ${item.width} ${item.height}`}
      >
        {item.type === ITEM_TYPE.arrow ? (
          <defs>
            <marker
              id={markerId}
              markerWidth={arrowWidth}
              markerHeight={arrowHeight}
              refX={arrowWidth - 2}
              refY={arrowHeight / 2}
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path
                d={`M 0 0 L ${arrowWidth} ${arrowHeight / 2} L 0 ${arrowHeight} z`}
                className="segment-marker-head"
                style={{ fill: resolvedStyle.strokeColor }}
              />
            </marker>
          </defs>
        ) : null}

        <polyline
          points={polylinePoints}
          fill="none"
          className={`segment-line ${isSelected ? 'is-selected' : ''}`}
          style={{
            stroke: resolvedStyle.strokeColor,
            strokeWidth: resolvedStyle.strokeWidth,
            strokeDasharray,
          }}
          markerEnd={item.type === ITEM_TYPE.arrow ? `url(#${markerId})` : undefined}
        />
        <polyline
          points={polylinePoints}
          fill="none"
          className="segment-hit-line"
          onMouseDown={onMouseDown}
        />
      </svg>

      {isSelected ? (
        <>
          {/* Start endpoint handle */}
          <button
            type="button"
            className="segment-endpoint-handle"
            style={{ left: points.start.x, top: points.start.y }}
            onMouseDown={(e) => onEndpointMouseDown(e, 'start')}
            aria-label="Adjust start point"
          />
          {/* End endpoint handle */}
          <button
            type="button"
            className="segment-endpoint-handle"
            style={{ left: points.end.x, top: points.end.y }}
            onMouseDown={(e) => onEndpointMouseDown(e, 'end')}
            aria-label="Adjust end point"
          />
          {/* Waypoint handles */}
          {localWaypoints.map((wp, i) => (
            <button
              key={`wp-${i}`}
              type="button"
              className={`segment-waypoint-handle${i === deletingWaypointIndex ? ' is-deleting' : ''}`}
              style={{ left: wp.x, top: wp.y }}
              onMouseDown={(e) => onWaypointMouseDown(e, i)}
              aria-label={`Waypoint ${i + 1}`}
            />
          ))}
          {/* Midpoint add-bend handles (one per segment) */}
          {allLocalPoints.map((pt, i) => {
            if (i === allLocalPoints.length - 1) {
              return null;
            }
            const next = allLocalPoints[i + 1];
            if (next === undefined) {
              return null;
            }
            const midX = (pt.x + next.x) / 2;
            const midY = (pt.y + next.y) / 2;
            return (
              <button
                key={`mid-${i}`}
                type="button"
                className="segment-midpoint-handle"
                style={{ left: midX, top: midY }}
                onMouseDown={(e) => onMidpointMouseDown(e, i)}
                aria-label={`Add bend point`}
              />
            );
          })}
        </>
      ) : null}
    </div>
  );
}
