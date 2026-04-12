import { type BoardItem } from '../api';
import { resolveBoardItemStyle } from '../itemStyles';
import { getSegmentLocalPoints, type SegmentEndpoint } from '../segmentData';
import { ITEM_TYPE } from '../types';

type Props = {
  item: BoardItem;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent<SVGLineElement>) => void;
  onEndpointMouseDown: (
    e: React.MouseEvent<HTMLButtonElement>,
    endpoint: SegmentEndpoint,
  ) => void;
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
}: Props) {
  const points = getSegmentLocalPoints(item);
  const resolvedStyle = resolveBoardItemStyle(item);
  const markerId = `segment-arrow-head-${item.id}`;
  // Calculate arrow head dimensions based on size preference
  const arrowSize = resolvedStyle.arrowHeadSize;
  const arrowWidth = arrowSize;
  const arrowHeight = (arrowSize * 7) / 10;

  if (points === null) {
    return null;
  }

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

        <line
          x1={points.start.x}
          y1={points.start.y}
          x2={points.end.x}
          y2={points.end.y}
          className={`segment-line ${isSelected ? 'is-selected' : ''}`}
          style={{
            stroke: resolvedStyle.strokeColor,
            strokeWidth: resolvedStyle.strokeWidth,
            strokeDasharray: getStrokeDasharray(resolvedStyle.strokeStyle),
          }}
          markerEnd={item.type === ITEM_TYPE.arrow ? `url(#${markerId})` : undefined}
        />
        <line
          x1={points.start.x}
          y1={points.start.y}
          x2={points.end.x}
          y2={points.end.y}
          className="segment-hit-line"
          onMouseDown={onMouseDown}
          markerEnd={item.type === ITEM_TYPE.arrow ? `url(#${markerId})` : undefined}
        />
      </svg>

      {isSelected ? (
        <>
          <button
            type="button"
            className="segment-endpoint-handle"
            style={{ left: points.start.x, top: points.start.y }}
            onMouseDown={(e) => onEndpointMouseDown(e, 'start')}
            aria-label="Adjust start point"
          />
          <button
            type="button"
            className="segment-endpoint-handle"
            style={{ left: points.end.x, top: points.end.y }}
            onMouseDown={(e) => onEndpointMouseDown(e, 'end')}
            aria-label="Adjust end point"
          />
        </>
      ) : null}
    </div>
  );
}
