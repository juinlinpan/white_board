import { describe, expect, it } from 'vitest';

import {
  getCanvasContextMenuActionKeys,
  getCanvasContextMenuPosition,
  isCanvasContextMenuActionDisabled,
  type CanvasContextMenuState,
} from './canvasContextMenu';

function createContextMenuState(
  overrides: Partial<CanvasContextMenuState> = {},
): CanvasContextMenuState {
  return {
    clientX: 180,
    clientY: 120,
    scope: 'selection',
    selectionCount: 1,
    hasClipboardData: true,
    ...overrides,
  };
}

describe('canvas context menu helpers', () => {
  it('shows object actions for selection menus', () => {
    expect(getCanvasContextMenuActionKeys(createContextMenuState())).toEqual([
      'cut',
      'copy',
      'paste',
      'delete',
    ]);
  });

  it('shows only paste for canvas menus', () => {
    expect(
      getCanvasContextMenuActionKeys(createContextMenuState({ scope: 'canvas' })),
    ).toEqual(['paste']);
  });

  it('disables destructive actions when nothing is selected', () => {
    const state = createContextMenuState({
      scope: 'selection',
      selectionCount: 0,
    });

    expect(isCanvasContextMenuActionDisabled(state, 'cut')).toBe(true);
    expect(isCanvasContextMenuActionDisabled(state, 'copy')).toBe(true);
    expect(isCanvasContextMenuActionDisabled(state, 'delete')).toBe(true);
    expect(isCanvasContextMenuActionDisabled(state, 'paste')).toBe(false);
  });

  it('disables paste when the clipboard is empty', () => {
    expect(
      isCanvasContextMenuActionDisabled(
        createContextMenuState({ hasClipboardData: false }),
        'paste',
      ),
    ).toBe(true);
  });

  it('clamps the menu position to the viewport edge', () => {
    expect(
      getCanvasContextMenuPosition(
        createContextMenuState({ clientX: 500, clientY: 400 }),
        640,
        480,
      ),
    ).toEqual({
      left: 408,
      top: 312,
    });
  });

  it('opens beside the cursor when there is enough space', () => {
    expect(
      getCanvasContextMenuPosition(
        createContextMenuState({ clientX: 180, clientY: 120 }),
        1280,
        720,
      ),
    ).toEqual({
      left: 194,
      top: 130,
    });
  });
});
