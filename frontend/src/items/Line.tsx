import { type BoardItem } from '../api';
import { resolveBoardItemStyle } from '../itemStyles';

type Props = {
  item: BoardItem;
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

export function Line({ item }: Props) {
  const resolvedStyle = resolveBoardItemStyle(item);
  const width = Math.max(item.width, 1);
  const height = Math.max(item.height, 1);
  const inset = Math.max(resolvedStyle.strokeWidth / 2 + 2, 4);
  const y = height / 2;

  return (
    <div className="line-shape" aria-hidden="true">
      <svg
        className="line-shape-svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ transform: `rotate(${item.rotation}deg)` }}
      >
        <line
          x1={inset}
          y1={y}
          x2={width - inset}
          y2={y}
          className="line-shape-stroke"
          style={{
            stroke: resolvedStyle.strokeColor,
            strokeWidth: resolvedStyle.strokeWidth,
            strokeDasharray: getStrokeDasharray(resolvedStyle.strokeStyle),
          }}
        />
      </svg>
    </div>
  );
}
