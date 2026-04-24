import { describe, expect, it } from 'vitest';

import {
  TABLE_MAX_DIMENSION,
  addCol,
  addRow,
  computeColSegmentGroups,
  computeRowSegmentGroups,
  createTableData,
  getTableMinSize,
  getEffectiveColEdge,
  getEffectiveRowEdge,
  mergeCells,
  preserveOuterAddColLayout,
  preserveOuterAddRowLayout,
  resizeColGroup,
  resizeRowGroup,
  scaleTableDividerPositions,
  splitCellHorizontal,
  splitCellVertical,
} from './tableData';

describe('tableData merge and split semantics', () => {
  it('treats split cells as new cells instead of restoring the original ones', () => {
    const data = createTableData(3, 2);
    const originalIds = [data.cells[1]?.[0]?.id, data.cells[1]?.[1]?.id];

    const merged = mergeCells(data, [[1, 0], [1, 1]]);
    const mergedCellId = merged.cells[1]?.[0]?.id;
    expect(mergedCellId).toBeTruthy();

    const split = splitCellVertical(merged, mergedCellId!);

    expect(split.cells[1]?.[0]?.id).toBeTruthy();
    expect(split.cells[1]?.[1]?.id).toBeTruthy();
    expect(split.cells[1]?.[0]?.id).not.toBe(originalIds[0]);
    expect(split.cells[1]?.[1]?.id).not.toBe(originalIds[1]);

    const groups = computeColSegmentGroups(split).filter(
      (group) => group.boundaryIndex === 0,
    );
    expect(groups.map((group) => group.segments)).toEqual([[0], [1], [2]]);
    expect(split.colDividerBreaks?.['c0r0']).toBe(true);
    expect(split.colDividerBreaks?.['c0r1']).toBe(true);
  });

  it('rebuilds a split divider from the merged cell bounds instead of the original column edge', () => {
    const data = createTableData(1, 3);
    data.colWidths = [0.2, 0.5, 0.3];

    const merged = mergeCells(data, [[0, 0], [0, 1]]);
    const split = splitCellVertical(merged, merged.cells[0]?.[0]?.id!);

    expect(split.colDividerPositions?.['c0r0']).toBeCloseTo(0.35, 5);
    expect(getEffectiveColEdge(split, 1, 0)).toBeCloseTo(0.35, 5);
    expect(getEffectiveColEdge(split, 1, 0)).not.toBeCloseTo(0.2, 5);
  });

  it('keeps a horizontal split isolated from the original left and right row segments', () => {
    const data = createTableData(2, 3);
    const originalId = data.cells[0]?.[1]?.id;

    const merged = mergeCells(data, [[0, 1], [1, 1]]);
    const mergedCellId = merged.cells[0]?.[1]?.id;
    expect(mergedCellId).toBeTruthy();

    const split = splitCellHorizontal(merged, mergedCellId!);

    expect(split.cells[0]?.[1]?.id).toBeTruthy();
    expect(split.cells[1]?.[1]?.id).toBeTruthy();
    expect(split.cells[0]?.[1]?.id).not.toBe(originalId);

    const groups = computeRowSegmentGroups(split).filter(
      (group) => group.boundaryIndex === 0,
    );
    expect(groups.map((group) => group.segments)).toEqual([[0], [1], [2]]);
    expect(split.rowDividerBreaks?.['r0c0']).toBe(true);
    expect(split.rowDividerBreaks?.['r0c1']).toBe(true);
    expect(getEffectiveRowEdge(split, 1, 1)).toBeCloseTo(0.5, 5);
  });

  it('keeps existing x positions exact when adding an outer column', () => {
    const oldWidth = 300;
    const nextWidth = 450;
    const data = createTableData(2, 2);
    data.colDividerPositions = {
      c0r0: 0.25,
      c0r1: 0.6,
    };

    const oldPixels = [0, 1].map((row) => getEffectiveColEdge(data, 1, row) * oldWidth);

    const expanded = scaleTableDividerPositions(
      addCol(data, data.cols - 1),
      oldWidth / nextWidth,
      1,
    );

    const newPixels = [0, 1].map((row) =>
      getEffectiveColEdge(expanded, 1, row) * nextWidth,
    );

    expect(newPixels[0]).toBeCloseTo(oldPixels[0], 5);
    expect(newPixels[1]).toBeCloseTo(oldPixels[1], 5);
    expect(getEffectiveColEdge(expanded, 2, 0) * nextWidth).toBeCloseTo(oldWidth, 5);
    expect(getEffectiveColEdge(expanded, 2, 1) * nextWidth).toBeCloseTo(oldWidth, 5);
  });

  it('keeps existing y positions exact when adding an outer row', () => {
    const oldHeight = 240;
    const nextHeight = 360;
    const data = createTableData(2, 2);
    data.rowDividerPositions = {
      r0c0: 0.3,
      r0c1: 0.7,
    };

    const oldPixels = [0, 1].map((col) => getEffectiveRowEdge(data, 1, col) * oldHeight);

    const expanded = scaleTableDividerPositions(
      addRow(data, data.rows - 1),
      1,
      oldHeight / nextHeight,
    );

    const newPixels = [0, 1].map((col) =>
      getEffectiveRowEdge(expanded, 1, col) * nextHeight,
    );

    expect(newPixels[0]).toBeCloseTo(oldPixels[0], 5);
    expect(newPixels[1]).toBeCloseTo(oldPixels[1], 5);
    expect(getEffectiveRowEdge(expanded, 2, 0) * nextHeight).toBeCloseTo(oldHeight, 5);
    expect(getEffectiveRowEdge(expanded, 2, 1) * nextHeight).toBeCloseTo(oldHeight, 5);
  });

  it('preserves exact default and moved column layout after outer add with rounded width', () => {
    const oldWidth = 319;
    const nextWidth = Math.round((oldWidth * 3) / 2);
    const data = createTableData(2, 2);
    data.colDividerPositions = {
      c0r0: 0.42,
    };

    const explicitOldPx = getEffectiveColEdge(data, 1, 0) * oldWidth;
    const defaultOldPx = getEffectiveColEdge(data, 1, 1) * oldWidth;

    const expanded = preserveOuterAddColLayout(
      data,
      addCol(data, data.cols - 1),
      oldWidth,
      nextWidth,
    );

    expect(getEffectiveColEdge(expanded, 1, 0) * nextWidth).toBeCloseTo(explicitOldPx, 5);
    expect(getEffectiveColEdge(expanded, 1, 1) * nextWidth).toBeCloseTo(defaultOldPx, 5);
    expect(getEffectiveColEdge(expanded, 2, 0) * nextWidth).toBeCloseTo(oldWidth, 5);
    expect(getEffectiveColEdge(expanded, 2, 1) * nextWidth).toBeCloseTo(oldWidth, 5);
  });

  it('preserves exact default and moved row layout after outer add with rounded height', () => {
    const oldHeight = 241;
    const nextHeight = Math.round((oldHeight * 3) / 2);
    const data = createTableData(2, 2);
    data.rowDividerPositions = {
      r0c0: 0.38,
    };

    const explicitOldPx = getEffectiveRowEdge(data, 1, 0) * oldHeight;
    const defaultOldPx = getEffectiveRowEdge(data, 1, 1) * oldHeight;

    const expanded = preserveOuterAddRowLayout(
      data,
      addRow(data, data.rows - 1),
      oldHeight,
      nextHeight,
    );

    expect(getEffectiveRowEdge(expanded, 1, 0) * nextHeight).toBeCloseTo(explicitOldPx, 5);
    expect(getEffectiveRowEdge(expanded, 1, 1) * nextHeight).toBeCloseTo(defaultOldPx, 5);
    expect(getEffectiveRowEdge(expanded, 2, 0) * nextHeight).toBeCloseTo(oldHeight, 5);
    expect(getEffectiveRowEdge(expanded, 2, 1) * nextHeight).toBeCloseTo(oldHeight, 5);
  });

  it('preserves every existing boundary across merged layout after adding outer columns twice', () => {
    const originalWidth = 480;
    const base = createTableData(3, 4);
    const mergedTop = mergeCells(base, [[0, 1], [0, 2]]);
    const mergedMiddle = mergeCells(mergedTop, [[1, 1], [1, 2]]);
    const data = mergeCells(mergedMiddle, [[2, 1], [2, 2]]);
    data.colDividerPositions = {
      c0r0: 0.22,
      c0r1: 0.22,
      c0r2: 0.22,
      c1r0: 0.5,
      c1r2: 0.5,
      c2r0: 0.64,
      c2r1: 0.64,
      c2r2: 0.64,
    };

    const baseline = new Map<string, number>();
    for (let row = 0; row < data.rows; row += 1) {
      for (let edge = 1; edge < data.cols; edge += 1) {
        baseline.set(`c${edge}r${row}`, getEffectiveColEdge(data, edge, row) * originalWidth);
      }
    }

    const widthAfterFirstAdd = Math.round((originalWidth * 5) / 4);
    const afterFirstAdd = preserveOuterAddColLayout(
      data,
      addCol(data, data.cols - 1),
      originalWidth,
      widthAfterFirstAdd,
    );

    const widthAfterSecondAdd = Math.round((widthAfterFirstAdd * 6) / 5);
    const afterSecondAdd = preserveOuterAddColLayout(
      afterFirstAdd,
      addCol(afterFirstAdd, afterFirstAdd.cols - 1),
      widthAfterFirstAdd,
      widthAfterSecondAdd,
    );

    for (let row = 0; row < data.rows; row += 1) {
      for (let edge = 1; edge < data.cols; edge += 1) {
        expect(
          getEffectiveColEdge(afterFirstAdd, edge, row) * widthAfterFirstAdd,
        ).toBeCloseTo(baseline.get(`c${edge}r${row}`)!, 5);
        expect(
          getEffectiveColEdge(afterSecondAdd, edge, row) * widthAfterSecondAdd,
        ).toBeCloseTo(baseline.get(`c${edge}r${row}`)!, 5);
      }
    }
  });

  it('caps created tables at 20 by 20', () => {
    const data = createTableData(99, 99);

    expect(data.rows).toBe(20);
    expect(data.cols).toBe(20);
  });

  it('uses text box minimum size as the minimum size of each table cell', () => {
    expect(getTableMinSize(1, 1)).toEqual({ width: 120, height: 72 });
    expect(getTableMinSize(4, 5)).toEqual({ width: 600, height: 288 });
  });

  it('keeps table minimum sizes on the canvas grid', () => {
    const gridSize = 24;

    for (let rows = 1; rows <= TABLE_MAX_DIMENSION; rows += 1) {
      for (let cols = 1; cols <= TABLE_MAX_DIMENSION; cols += 1) {
        const minSize = getTableMinSize(rows, cols);

        expect(minSize.width % gridSize).toBe(0);
        expect(minSize.height % gridSize).toBe(0);
      }
    }
  });

  it('keeps resized column groups above the requested minimum fraction', () => {
    const data = createTableData(2, 2);
    const group = computeColSegmentGroups(data)[0]!;

    const next = resizeColGroup(data, group, 0.05, 0.2);

    expect(next.colDividerPositions?.['c0r0']).toBeCloseTo(0.2, 5);
    expect(next.colDividerPositions?.['c0r1']).toBeCloseTo(0.2, 5);
  });

  it('keeps resized row groups above the requested minimum fraction', () => {
    const data = createTableData(2, 2);
    const group = computeRowSegmentGroups(data)[0]!;

    const next = resizeRowGroup(data, group, 0.05, 0.25);

    expect(next.rowDividerPositions?.['r0c0']).toBeCloseTo(0.25, 5);
    expect(next.rowDividerPositions?.['r0c1']).toBeCloseTo(0.25, 5);
  });
});
