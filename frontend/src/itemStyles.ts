import { type CSSProperties } from 'react';
import { type BoardItem } from './api';
import { ITEM_TYPE } from './types';

export type FontWeightValue = 'normal' | 'bold';
export type FontStyleValue = 'normal' | 'italic';
export type StrokeStyleValue = 'solid' | 'dashed' | 'dotted';
export type ColorOption = {
  name: string;
  value: string;
};

export type BoardItemStyle = {
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: FontWeightValue;
  fontStyle?: FontStyleValue;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyleValue;
  arrowHeadSize?: number;
};

export type ResolvedBoardItemStyle = {
  backgroundColor: string;
  textColor: string;
  fontSize: number;
  fontWeight: FontWeightValue;
  fontStyle: FontStyleValue;
  strokeColor: string;
  strokeWidth: number;
  strokeStyle: StrokeStyleValue;
  arrowHeadSize: number;
};

export const BACKGROUND_COLOR_OPTIONS = [
  { name: 'Pearl',       value: '#f9f8f5' },
  { name: 'Butter',      value: '#fef5b3' },
  { name: 'Apricot',    value: '#fdddd0' },
  { name: 'Wheat',      value: '#f4e8d0' },
  { name: 'Sage',       value: '#c8d9c4' },
  { name: 'Periwinkle', value: '#d6e4fa' },
  { name: 'Rose',       value: '#f5d8e8' },
  { name: 'Stone',      value: '#e2e4ea' },
] as const satisfies readonly ColorOption[];

export const TEXT_COLOR_OPTIONS = [
  { name: 'Ink', value: '#1f2937' },
  { name: 'Blue', value: '#1d4ed8' },
  { name: 'Teal', value: '#0f766e' },
  { name: 'Green', value: '#15803d' },
  { name: 'Orange', value: '#c2410c' },
  { name: 'Rose', value: '#be123c' },
] as const satisfies readonly ColorOption[];

const DEFAULT_BACKGROUND_COLOR = BACKGROUND_COLOR_OPTIONS[0].value;
const DEFAULT_FRAME_BACKGROUND_COLOR = BACKGROUND_COLOR_OPTIONS[5].value;
const DEFAULT_TEXT_COLOR = TEXT_COLOR_OPTIONS[0].value;
const STICKY_COLORS = BACKGROUND_COLOR_OPTIONS.slice(1).map(
  (option) => option.value,
);

function createPaletteLookup(
  options: readonly ColorOption[],
  aliases: Record<string, string> = {},
): ReadonlyMap<string, string> {
  return new Map<string, string>([
    ...options.map((option) => [option.value, option.value] as const),
    ...Object.entries(aliases),
  ]);
}

const BACKGROUND_COLOR_LOOKUP = createPaletteLookup(BACKGROUND_COLOR_OPTIONS, {
  '#ffffff': DEFAULT_BACKGROUND_COLOR,
  '#fffdf7': DEFAULT_BACKGROUND_COLOR,
  '#f8fafc': DEFAULT_BACKGROUND_COLOR,
  '#fef08a': BACKGROUND_COLOR_OPTIONS[1].value,
  '#fde68a': BACKGROUND_COLOR_OPTIONS[1].value,
  '#fed7aa': BACKGROUND_COLOR_OPTIONS[2].value,
  '#bbf7d0': BACKGROUND_COLOR_OPTIONS[4].value,
  '#dcfce7': BACKGROUND_COLOR_OPTIONS[4].value,
  '#ecfeff': DEFAULT_FRAME_BACKGROUND_COLOR,
  '#eff6ff': DEFAULT_FRAME_BACKGROUND_COLOR,
  '#bfdbfe': DEFAULT_FRAME_BACKGROUND_COLOR,
  '#fecaca': BACKGROUND_COLOR_OPTIONS[6].value,
  '#ede9fe': BACKGROUND_COLOR_OPTIONS[7].value,
  '#e9d5ff': BACKGROUND_COLOR_OPTIONS[7].value,
});

const TEXT_COLOR_LOOKUP = createPaletteLookup(TEXT_COLOR_OPTIONS, {
  '#1d1d1f': DEFAULT_TEXT_COLOR,
  '#0f172a': DEFAULT_TEXT_COLOR,
  '#164e63': TEXT_COLOR_OPTIONS[2].value,
});

function sanitizeFreeColor(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function sanitizePaletteColor(
  value: unknown,
  lookup: ReadonlyMap<string, string>,
): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  return lookup.get(value.trim().toLowerCase());
}

function sanitizeFontSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(32, Math.max(12, Math.round(value)));
}

function sanitizeFontWeight(value: unknown): FontWeightValue | undefined {
  return value === 'bold' || value === 'normal' ? value : undefined;
}

function sanitizeFontStyle(value: unknown): FontStyleValue | undefined {
  return value === 'italic' || value === 'normal' ? value : undefined;
}

function sanitizeStrokeWidth(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(16, Math.max(1, Math.round(value)));
}

function sanitizeStrokeStyle(value: unknown): StrokeStyleValue | undefined {
  return value === 'solid' || value === 'dashed' || value === 'dotted'
    ? value
    : undefined;
}

function sanitizeArrowHeadSize(value: unknown): number | undefined {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return Math.min(40, Math.max(8, Math.round(value)));
}

export function getStickyNoteColor(itemId: string): string {
  let hash = 0;
  for (let index = 0; index < itemId.length; index += 1) {
    hash = (hash * 31 + itemId.charCodeAt(index)) >>> 0;
  }

  return (
    STICKY_COLORS[hash % STICKY_COLORS.length] ??
    BACKGROUND_COLOR_OPTIONS[1].value
  );
}

export function parseBoardItemStyle(styleJson: string | null): BoardItemStyle {
  if (styleJson === null || styleJson.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(styleJson) as Record<string, unknown>;
    return {
      backgroundColor: sanitizePaletteColor(
        parsed.backgroundColor,
        BACKGROUND_COLOR_LOOKUP,
      ),
      textColor: sanitizePaletteColor(parsed.textColor, TEXT_COLOR_LOOKUP),
      fontSize: sanitizeFontSize(parsed.fontSize),
      fontWeight: sanitizeFontWeight(parsed.fontWeight),
      fontStyle: sanitizeFontStyle(parsed.fontStyle),
      strokeColor: sanitizeFreeColor(parsed.strokeColor),
      strokeWidth: sanitizeStrokeWidth(parsed.strokeWidth),
      strokeStyle: sanitizeStrokeStyle(parsed.strokeStyle),
      arrowHeadSize: sanitizeArrowHeadSize(parsed.arrowHeadSize),
    };
  } catch {
    return {};
  }
}

export function serializeBoardItemStyle(style: BoardItemStyle): string | null {
  const nextStyle: BoardItemStyle = {
    backgroundColor: sanitizePaletteColor(
      style.backgroundColor,
      BACKGROUND_COLOR_LOOKUP,
    ),
    textColor: sanitizePaletteColor(style.textColor, TEXT_COLOR_LOOKUP),
    fontSize: sanitizeFontSize(style.fontSize),
    fontWeight: sanitizeFontWeight(style.fontWeight),
    fontStyle: sanitizeFontStyle(style.fontStyle),
    strokeColor: sanitizeFreeColor(style.strokeColor),
    strokeWidth: sanitizeStrokeWidth(style.strokeWidth),
    strokeStyle: sanitizeStrokeStyle(style.strokeStyle),
    arrowHeadSize: sanitizeArrowHeadSize(style.arrowHeadSize),
  };

  const entries = Object.entries(nextStyle).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) {
    return null;
  }

  return JSON.stringify(Object.fromEntries(entries));
}

function getDefaultBackgroundColor(item: BoardItem): string {
  switch (item.type) {
    case ITEM_TYPE.sticky_note:
      return getStickyNoteColor(item.id);
    case ITEM_TYPE.note_paper:
      return DEFAULT_BACKGROUND_COLOR;
    case ITEM_TYPE.frame:
      return DEFAULT_FRAME_BACKGROUND_COLOR;
    case ITEM_TYPE.text_box:
    default:
      return DEFAULT_BACKGROUND_COLOR;
  }
}

export function resolveBoardItemStyle(item: BoardItem): ResolvedBoardItemStyle {
  const parsed = parseBoardItemStyle(item.style_json);
  return {
    backgroundColor: parsed.backgroundColor ?? getDefaultBackgroundColor(item),
    textColor: parsed.textColor ?? DEFAULT_TEXT_COLOR,
    fontSize: parsed.fontSize ?? 14,
    fontWeight: parsed.fontWeight ?? 'normal',
    fontStyle: parsed.fontStyle ?? 'normal',
    strokeColor: parsed.strokeColor ?? '#475569',
    strokeWidth: parsed.strokeWidth ?? 3,
    strokeStyle: parsed.strokeStyle ?? 'solid',
    arrowHeadSize: parsed.arrowHeadSize ?? 30,
  };
}

export function getBoardItemTypographyStyle(item: BoardItem): CSSProperties {
  const style = resolveBoardItemStyle(item);
  return {
    color: style.textColor,
    fontSize: `${style.fontSize}px`,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
  };
}
