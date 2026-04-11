export type SnapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SnapGuide = {
  axis: 'x' | 'y';
  position: number;
};

type AxisMatch = {
  delta: number;
  guidePosition: number;
};

function collectVerticalPositions(targets: SnapRect[]): number[] {
  return targets.flatMap((target) => [
    target.x,
    target.x + target.width / 2,
    target.x + target.width,
  ]);
}

function collectHorizontalPositions(targets: SnapRect[]): number[] {
  return targets.flatMap((target) => [
    target.y,
    target.y + target.height / 2,
    target.y + target.height,
  ]);
}

function getBestAxisMatch(
  featureValues: number[],
  candidateValues: number[],
  tolerance: number,
): AxisMatch | null {
  let bestMatch: AxisMatch | null = null;

  for (const featureValue of featureValues) {
    for (const candidateValue of candidateValues) {
      const delta = candidateValue - featureValue;
      if (Math.abs(delta) > tolerance) {
        continue;
      }

      if (bestMatch === null || Math.abs(delta) < Math.abs(bestMatch.delta)) {
        bestMatch = {
          delta,
          guidePosition: candidateValue,
        };
      }
    }
  }

  return bestMatch;
}

export function snapMoveRect(
  rect: SnapRect,
  targets: SnapRect[],
  tolerance: number,
): { x: number; y: number; guides: SnapGuide[] } {
  const verticalMatch = getBestAxisMatch(
    [rect.x, rect.x + rect.width / 2, rect.x + rect.width],
    collectVerticalPositions(targets),
    tolerance,
  );
  const horizontalMatch = getBestAxisMatch(
    [rect.y, rect.y + rect.height / 2, rect.y + rect.height],
    collectHorizontalPositions(targets),
    tolerance,
  );

  const guides: SnapGuide[] = [];
  if (verticalMatch !== null) {
    guides.push({ axis: 'x', position: verticalMatch.guidePosition });
  }
  if (horizontalMatch !== null) {
    guides.push({ axis: 'y', position: horizontalMatch.guidePosition });
  }

  return {
    x: rect.x + (verticalMatch?.delta ?? 0),
    y: rect.y + (horizontalMatch?.delta ?? 0),
    guides,
  };
}

export function snapResizeRect(
  rect: SnapRect,
  targets: SnapRect[],
  tolerance: number,
): { width: number; height: number; guides: SnapGuide[] } {
  const verticalMatch = getBestAxisMatch(
    [rect.x + rect.width],
    collectVerticalPositions(targets),
    tolerance,
  );
  const horizontalMatch = getBestAxisMatch(
    [rect.y + rect.height],
    collectHorizontalPositions(targets),
    tolerance,
  );

  const guides: SnapGuide[] = [];
  if (verticalMatch !== null) {
    guides.push({ axis: 'x', position: verticalMatch.guidePosition });
  }
  if (horizontalMatch !== null) {
    guides.push({ axis: 'y', position: horizontalMatch.guidePosition });
  }

  return {
    width: rect.width + (verticalMatch?.delta ?? 0),
    height: rect.height + (horizontalMatch?.delta ?? 0),
    guides,
  };
}
