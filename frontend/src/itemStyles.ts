import { type CSSProperties } from 'react';
import { type BoardItem } from './api';
import { ITEM_TYPE } from './types';

export type FontWeightValue = 'normal' | 'bold';
export type FontStyleValue = 'normal' | 'italic';
export type StrokeStyleValue = 'solid' | 'dashed' | 'dotted';

export type BoardItemStyle = {
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
  fontWeight?: FontWeightValue;
  fontStyle?: FontStyleValue;
  strokeColor?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyleValue;
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
};

const STICKY_COLORS = [
  '#fef08a',
  '#bbf7d0',
  '#bfdbfe',
  '#fecaca',
  '#e9d5ff',
  '#fed7aa',
];

function sanitizeColor(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
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

export function getStickyNoteColor(itemId: string): string {
  let hash = 0;
  for (let index = 0; index < itemId.length; index += 1) {
    hash = (hash * 31 + itemId.charCodeAt(index)) >>> 0;
  }

  return STICKY_COLORS[hash % STICKY_COLORS.length] ?? '#fef08a';
}

export function parseBoardItemStyle(styleJson: string | null): BoardItemStyle {
  if (styleJson === null || styleJson.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(styleJson) as Record<string, unknown>;
    return {
      backgroundColor: sanitizeColor(parsed.backgroundColor),
      textColor: sanitizeColor(parsed.textColor),
      fontSize: sanitizeFontSize(parsed.fontSize),
      fontWeight: sanitizeFontWeight(parsed.fontWeight),
      fontStyle: sanitizeFontStyle(parsed.fontStyle),
      strokeColor: sanitizeColor(parsed.strokeColor),
      strokeWidth: sanitizeStrokeWidth(parsed.strokeWidth),
      strokeStyle: sanitizeStrokeStyle(parsed.strokeStyle),
    };
  } catch {
    return {};
  }
}

export function serializeBoardItemStyle(style: BoardItemStyle): string | null {
  const nextStyle: BoardItemStyle = {
    backgroundColor: sanitizeColor(style.backgroundColor),
    textColor: sanitizeColor(style.textColor),
    fontSize: sanitizeFontSize(style.fontSize),
    fontWeight: sanitizeFontWeight(style.fontWeight),
    fontStyle: sanitizeFontStyle(style.fontStyle),
    strokeColor: sanitizeColor(style.strokeColor),
    strokeWidth: sanitizeStrokeWidth(style.strokeWidth),
    strokeStyle: sanitizeStrokeStyle(style.strokeStyle),
  };

  const entries = Object.entries(nextStyle).filter(([, value]) => value !== undefined);
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
      return '#fffdf7';
    case ITEM_TYPE.frame:
      return '#eff6ff';
    case ITEM_TYPE.text_box:
    default:
      return '#ffffff';
  }
}

export function resolveBoardItemStyle(item: BoardItem): ResolvedBoardItemStyle {
  const parsed = parseBoardItemStyle(item.style_json);
  return {
    backgroundColor: parsed.backgroundColor ?? getDefaultBackgroundColor(item),
    textColor: parsed.textColor ?? '#1d1d1f',
    fontSize: parsed.fontSize ?? 14,
    fontWeight: parsed.fontWeight ?? 'normal',
    fontStyle: parsed.fontStyle ?? 'normal',
    strokeColor: parsed.strokeColor ?? '#475569',
    strokeWidth: parsed.strokeWidth ?? 3,
    strokeStyle: parsed.strokeStyle ?? 'solid',
  };
}

export function getBoardItemTypographyStyle(
  item: BoardItem,
): CSSProperties {
  const style = resolveBoardItemStyle(item);
  return {
    color: style.textColor,
    fontSize: `${style.fontSize}px`,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
  };
}
