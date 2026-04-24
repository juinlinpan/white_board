export type CanvasContextMenuScope = 'canvas' | 'selection';

export type CanvasContextMenuState = {
  clientX: number;
  clientY: number;
  scope: CanvasContextMenuScope;
  selectionCount: number;
  hasClipboardData: boolean;
  canBringForward: boolean;
  canSendBackward: boolean;
  canBringToFront: boolean;
  canSendToBack: boolean;
};

export type CanvasContextMenuActionKey =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'delete'
  | 'bringForward'
  | 'sendBackward'
  | 'bringToFront'
  | 'sendToBack';

const MENU_MARGIN = 12;
const MENU_WIDTH = 220;
const MENU_BUTTON_HEIGHT = 32;
const MENU_GAP = 4;
const MENU_PADDING = 16;
const CURSOR_OFFSET_X = 14;
const CURSOR_OFFSET_Y = 10;

export function getCanvasContextMenuActionKeys(
  state: CanvasContextMenuState,
): CanvasContextMenuActionKey[] {
  if (state.scope === 'selection') {
    return [
      'cut',
      'copy',
      'paste',
      'delete',
      'bringForward',
      'sendBackward',
      'bringToFront',
      'sendToBack',
    ];
  }

  return ['paste'];
}

export function isCanvasContextMenuActionDisabled(
  state: CanvasContextMenuState,
  action: CanvasContextMenuActionKey,
): boolean {
  switch (action) {
    case 'paste':
      return !state.hasClipboardData;
    case 'cut':
    case 'copy':
    case 'delete':
      return state.selectionCount === 0;
    case 'bringForward':
      return !state.canBringForward;
    case 'sendBackward':
      return !state.canSendBackward;
    case 'bringToFront':
      return !state.canBringToFront;
    case 'sendToBack':
      return !state.canSendToBack;
    default:
      return false;
  }
}

export function getCanvasContextMenuPosition(
  state: CanvasContextMenuState,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  const actionCount = getCanvasContextMenuActionKeys(state).length;
  const estimatedHeight =
    MENU_PADDING +
    actionCount * MENU_BUTTON_HEIGHT +
    Math.max(0, actionCount - 1) * MENU_GAP;

  const preferredLeft = state.clientX + CURSOR_OFFSET_X;
  const preferredTop = state.clientY + CURSOR_OFFSET_Y;

  return {
    left: Math.max(
      MENU_MARGIN,
      Math.min(preferredLeft, viewportWidth - MENU_WIDTH - MENU_MARGIN),
    ),
    top: Math.max(
      MENU_MARGIN,
      Math.min(preferredTop, viewportHeight - estimatedHeight - MENU_MARGIN),
    ),
  };
}
