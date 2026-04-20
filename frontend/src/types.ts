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

export const ITEM_TYPE_LABEL: Record<ItemType, string> = {
  [ITEM_TYPE.line]: '線條',
  [ITEM_TYPE.table]: '表格',
  [ITEM_TYPE.text_box]: '文字框',
  [ITEM_TYPE.sticky_note]: '便利貼',
  [ITEM_TYPE.note_paper]: '筆記紙',
  [ITEM_TYPE.frame]: '框架',
  [ITEM_TYPE.arrow]: '箭頭',
};

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
export const ITEM_DEFAULT_SIZE: Record<
  string,
  { width: number; height: number }
> = {
  [ITEM_TYPE.line]: { width: 240, height: 48 },
  [ITEM_TYPE.text_box]: { width: 216, height: 96 },
  [ITEM_TYPE.sticky_note]: { width: 168, height: 168 },
  [ITEM_TYPE.note_paper]: { width: 264, height: 216 },
  [ITEM_TYPE.frame]: { width: 432, height: 312 },
  [ITEM_TYPE.table]: { width: 360, height: 216 },
  [ITEM_TYPE.arrow]: { width: 192, height: 24 },
};

export const ITEM_MIN_SIZE: Record<string, { width: number; height: number }> =
  {
    [ITEM_TYPE.line]: { width: 96, height: 24 },
    [ITEM_TYPE.text_box]: { width: 168, height: 72 },
    [ITEM_TYPE.sticky_note]: { width: 120, height: 120 },
    [ITEM_TYPE.note_paper]: { width: 240, height: 168 },
    [ITEM_TYPE.frame]: { width: 288, height: 216 },
    [ITEM_TYPE.table]: { width: 240, height: 144 },
    [ITEM_TYPE.arrow]: { width: 120, height: 24 },
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
export type ActiveTool =
  | 'select'
  | 'line'
  | 'table'
  | 'text_box'
  | 'sticky_note'
  | 'note_paper'
  | 'frame'
  | 'arrow';
