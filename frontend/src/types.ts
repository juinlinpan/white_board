// ──────────────────────────────────────────────
// Item categories（對應 spec 物件分類）
// ──────────────────────────────────────────────
export const ITEM_CATEGORY = {
  shape: 'shape',
  small_item: 'small_item',
  large_item: 'large_item',
  connector: 'connector',
} as const;

// ──────────────────────────────────────────────
// Item types
// ──────────────────────────────────────────────
export const ITEM_TYPE = {
  line: 'line',
  table: 'table',
  text_box: 'text_box',
  sticky_note: 'sticky_note',
  note_paper: 'note_paper',
  frame: 'frame',
  arrow: 'arrow',
} as const;

export type ItemType = (typeof ITEM_TYPE)[keyof typeof ITEM_TYPE];

// ──────────────────────────────────────────────
// Category mapping（每個 type 歸屬的 category）
// ──────────────────────────────────────────────
export const ITEM_CATEGORY_FOR_TYPE: Record<string, string> = {
  [ITEM_TYPE.line]: ITEM_CATEGORY.shape,
  [ITEM_TYPE.table]: ITEM_CATEGORY.shape,
  [ITEM_TYPE.text_box]: ITEM_CATEGORY.small_item,
  [ITEM_TYPE.sticky_note]: ITEM_CATEGORY.small_item,
  [ITEM_TYPE.note_paper]: ITEM_CATEGORY.small_item,
  [ITEM_TYPE.frame]: ITEM_CATEGORY.large_item,
  [ITEM_TYPE.arrow]: ITEM_CATEGORY.connector,
};

// ──────────────────────────────────────────────
// Default sizes for each item type
// ──────────────────────────────────────────────
export const ITEM_DEFAULT_SIZE: Record<string, { width: number; height: number }> = {
  [ITEM_TYPE.text_box]: { width: 220, height: 80 },
  [ITEM_TYPE.sticky_note]: { width: 160, height: 160 },
  [ITEM_TYPE.note_paper]: { width: 260, height: 220 },
  [ITEM_TYPE.frame]: { width: 420, height: 300 },
  [ITEM_TYPE.line]: { width: 200, height: 4 },
  [ITEM_TYPE.table]: { width: 320, height: 200 },
  [ITEM_TYPE.arrow]: { width: 200, height: 4 },
};

// ──────────────────────────────────────────────
// Viewport
// ──────────────────────────────────────────────
export type Viewport = {
  x: number;
  y: number;
  zoom: number;
};

// ──────────────────────────────────────────────
// Active tool
// ──────────────────────────────────────────────
export type ActiveTool = 'select' | 'text_box' | 'sticky_note' | 'note_paper';
