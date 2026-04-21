import { describe, expect, it } from 'vitest';

import {
  magnetMoveRect,
  magnetResizeRect,
  snapPointToGrid,
  snapValueToGrid,
} from './magnet';

describe('magnetMoveRect', () => {
  it('snaps move operations to the background grid', () => {
    const result = magnetMoveRect(
      {
        x: 22,
        y: 47,
        width: 60,
        height: 40,
      },
      24,
      3,
    );

    expect(result).toEqual({
      x: 24,
      y: 48,
    });
  });

  it('can align a rectangle by its far edges, not only its top-left corner', () => {
    const result = magnetMoveRect(
      {
        x: 13,
        y: 35,
        width: 59,
        height: 38,
      },
      24,
      2,
    );

    expect(result).toEqual({
      x: 13,
      y: 34,
    });
  });

  it('leaves move operations unchanged when outside the tolerance', () => {
    const result = magnetMoveRect(
      {
        x: 19,
        y: 43,
        width: 60,
        height: 40,
      },
      24,
      3,
    );

    expect(result).toEqual({
      x: 19,
      y: 43,
    });
  });
});

describe('magnetResizeRect', () => {
  it('snaps the resized right and bottom edges to the background grid', () => {
    const result = magnetResizeRect(
      {
        x: 24,
        y: 24,
        width: 46,
        height: 71,
      },
      24,
      3,
    );

    expect(result).toEqual({
      width: 48,
      height: 72,
    });
  });

  it('leaves resize unchanged when the edges are outside the tolerance', () => {
    const result = magnetResizeRect(
      {
        x: 24,
        y: 24,
        width: 41,
        height: 65,
      },
      24,
      3,
    );

    expect(result).toEqual({
      width: 41,
      height: 65,
    });
  });
});

describe('grid helpers', () => {
  it('snaps scalar values to the nearest grid line', () => {
    expect(snapValueToGrid(35, 24)).toBe(24);
    expect(snapValueToGrid(37, 24)).toBe(48);
  });

  it('snaps freeform points to the background grid', () => {
    expect(
      snapPointToGrid(
        {
          x: 35,
          y: 61,
        },
        24,
      ),
    ).toEqual({
      x: 24,
      y: 72,
    });
  });
});
