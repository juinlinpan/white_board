export type MagnetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MagnetPoint = {
  x: number;
  y: number;
};

type AxisMatch = {
  delta: number;
};

function getNearestGridMatch(
  values: number[],
  gridSize: number,
  tolerance: number,
): AxisMatch | null {
  if (gridSize <= 0) {
    return null;
  }

  let bestMatch: AxisMatch | null = null;

  for (const value of values) {
    const candidate = Math.round(value / gridSize) * gridSize;
    const delta = candidate - value;
    if (Math.abs(delta) > tolerance) {
      continue;
    }

    if (bestMatch === null || Math.abs(delta) < Math.abs(bestMatch.delta)) {
      bestMatch = { delta };
    }
  }

  return bestMatch;
}

export function snapValueToGrid(value: number, gridSize: number): number {
  if (gridSize <= 0) {
    return value;
  }

  return Math.round(value / gridSize) * gridSize;
}

export function snapPointToGrid(
  point: MagnetPoint,
  gridSize: number,
): MagnetPoint {
  return {
    x: snapValueToGrid(point.x, gridSize),
    y: snapValueToGrid(point.y, gridSize),
  };
}

export function magnetMoveRect(
  rect: MagnetRect,
  gridSize: number,
  tolerance: number,
): { x: number; y: number } {
  const horizontalMatch = getNearestGridMatch(
    [rect.x, rect.x + rect.width],
    gridSize,
    tolerance,
  );
  const verticalMatch = getNearestGridMatch(
    [rect.y, rect.y + rect.height],
    gridSize,
    tolerance,
  );

  return {
    x: rect.x + (horizontalMatch?.delta ?? 0),
    y: rect.y + (verticalMatch?.delta ?? 0),
  };
}

export function magnetResizeRect(
  rect: MagnetRect,
  gridSize: number,
  tolerance: number,
): { width: number; height: number } {
  const horizontalMatch = getNearestGridMatch(
    [rect.x + rect.width],
    gridSize,
    tolerance,
  );
  const verticalMatch = getNearestGridMatch(
    [rect.y + rect.height],
    gridSize,
    tolerance,
  );

  return {
    width: rect.width + (horizontalMatch?.delta ?? 0),
    height: rect.height + (verticalMatch?.delta ?? 0),
  };
}
