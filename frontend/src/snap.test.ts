import { describe, expect, it } from 'vitest';

import { snapMoveRect, snapResizeRect } from './snap';

describe('snapMoveRect', () => {
  it('snaps move operations to nearby target edges and returns guides', () => {
    const result = snapMoveRect(
      {
        x: 96,
        y: 203,
        width: 60,
        height: 40,
      },
      [
        {
          x: 100,
          y: 200,
          width: 180,
          height: 120,
        },
      ],
      5,
    );

    expect(result).toEqual({
      x: 100,
      y: 200,
      guides: [
        { axis: 'x', position: 100 },
        { axis: 'y', position: 200 },
      ],
    });
  });

  it('leaves move operations unchanged when nothing is within tolerance', () => {
    const result = snapMoveRect(
      {
        x: 40,
        y: 50,
        width: 60,
        height: 40,
      },
      [
        {
          x: 200,
          y: 200,
          width: 100,
          height: 100,
        },
      ],
      5,
    );

    expect(result).toEqual({
      x: 40,
      y: 50,
      guides: [],
    });
  });
});

describe('snapResizeRect', () => {
  it('snaps resize operations to nearby target positions and returns guides', () => {
    const result = snapResizeRect(
      {
        x: 0,
        y: 0,
        width: 97,
        height: 104,
      },
      [
        {
          x: 100,
          y: 105,
          width: 140,
          height: 120,
        },
      ],
      5,
    );

    expect(result).toEqual({
      width: 100,
      height: 105,
      guides: [
        { axis: 'x', position: 100 },
        { axis: 'y', position: 105 },
      ],
    });
  });
});
