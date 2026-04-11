import { type BoardItem, type ConnectorLink } from '../api';

type Point = {
  x: number;
  y: number;
};

type Props = {
  item: BoardItem;
  connector: ConnectorLink;
  fromPoint: Point;
  toPoint: Point;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent<SVGLineElement>) => void;
};

const PADDING = 20;

function getBounds(fromPoint: Point, toPoint: Point) {
  const left = Math.min(fromPoint.x, toPoint.x) - PADDING;
  const top = Math.min(fromPoint.y, toPoint.y) - PADDING;
  const width = Math.max(Math.abs(toPoint.x - fromPoint.x) + PADDING * 2, 40);
  const height = Math.max(Math.abs(toPoint.y - fromPoint.y) + PADDING * 2, 40);

  return { left, top, width, height };
}

export function ArrowConnector({
  item,
  connector,
  fromPoint,
  toPoint,
  isSelected,
  onMouseDown,
}: Props) {
  const bounds = getBounds(fromPoint, toPoint);
  const start = {
    x: fromPoint.x - bounds.left,
    y: fromPoint.y - bounds.top,
  };
  const end = {
    x: toPoint.x - bounds.left,
    y: toPoint.y - bounds.top,
  };
  const markerId = `arrow-head-${connector.id}`;

  return (
    <div
      className={`arrow-connector ${isSelected ? 'is-selected' : ''}`}
      style={{
        position: 'absolute',
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        zIndex: item.z_index,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    >
      <svg width={bounds.width} height={bounds.height} className="arrow-svg">
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head-shape" />
          </marker>
        </defs>

        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          className="arrow-line"
          markerEnd={`url(#${markerId})`}
        />
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          className="arrow-hit-line"
          onMouseDown={onMouseDown}
          markerEnd={`url(#${markerId})`}
        />
      </svg>
    </div>
  );
}
