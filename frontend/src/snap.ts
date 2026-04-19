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

type SnapOptions = {
  gridSize?: number;
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

function getNearestGridAxisMatch(
  featureValues: number[],
  gridSize: number,
  tolerance: number,
): AxisMatch | null {
  if (gridSize <= 0) {
    return null;
  }

  let bestMatch: AxisMatch | null = null;

  for (const featureValue of featureValues) {
    const candidateValue = Math.round(featureValue / gridSize) * gridSize;
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

  return bestMatch;
}

function pickClosestAxisMatch(
  ...matches: Array<AxisMatch | null>
): AxisMatch | null {
  return matches.reduce<AxisMatch | null>((bestMatch, nextMatch) => {
    if (nextMatch === null) {
      return bestMatch;
    }

    if (bestMatch === null) {
      return nextMatch;
    }

    return Math.abs(nextMatch.delta) < Math.abs(bestMatch.delta)
      ? nextMatch
      : bestMatch;
  }, null);
}

export function snapMoveRect(
  rect: SnapRect,
  targets: SnapRect[],
  tolerance: number,
  options: SnapOptions = {},
): { x: number; y: number; guides: SnapGuide[] } {
  const verticalFeatures = [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
  const horizontalFeatures = [
    rect.y,
    rect.y + rect.height / 2,
    rect.y + rect.height,
  ];

  const verticalMatch = pickClosestAxisMatch(
    getBestAxisMatch(verticalFeatures, collectVerticalPositions(targets), tolerance),
    options.gridSize === undefined
      ? null
      : getNearestGridAxisMatch(verticalFeatures, options.gridSize, tolerance),
  );
  const horizontalMatch = pickClosestAxisMatch(
    getBestAxisMatch(
      horizontalFeatures,
      collectHorizontalPositions(targets),
      tolerance,
    ),
    options.gridSize === undefined
      ? null
      : getNearestGridAxisMatch(horizontalFeatures, options.gridSize, tolerance),
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
  options: SnapOptions = {},
): { width: number; height: number; guides: SnapGuide[] } {
  const verticalFeatures = [rect.x + rect.width];
  const horizontalFeatures = [rect.y + rect.height];

  const verticalMatch = pickClosestAxisMatch(
    getBestAxisMatch(verticalFeatures, collectVerticalPositions(targets), tolerance),
    options.gridSize === undefined
      ? null
      : getNearestGridAxisMatch(verticalFeatures, options.gridSize, tolerance),
  );
  const horizontalMatch = pickClosestAxisMatch(
    getBestAxisMatch(
      horizontalFeatures,
      collectHorizontalPositions(targets),
      tolerance,
    ),
    options.gridSize === undefined
      ? null
      : getNearestGridAxisMatch(horizontalFeatures, options.gridSize, tolerance),
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
