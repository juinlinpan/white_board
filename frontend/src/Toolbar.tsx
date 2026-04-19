import { type ReactNode } from 'react';
import { type ActiveTool } from './types';

type ToolDef = {
  id: ActiveTool;
  label: string;
  icon: ReactNode;
  shortcut: string;
};

const icon = (d: string) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

const TOOLS: ToolDef[] = [
  {
    id: 'select',
    label: '選取',
    icon: icon('M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z'),
    shortcut: 'V',
  },
  {
    id: 'line',
    label: '線條',
    icon: icon('M4 20 20 4'),
    shortcut: 'L',
  },
  {
    id: 'table',
    label: '表格',
    icon: icon('M3 5h18M3 12h18M3 19h18M8 5v14M16 5v14M3 5h18v14H3z'),
    shortcut: 'T',
  },
  {
    id: 'text_box',
    label: '文字框',
    icon: icon('M4 7V4h16v3M9 20h6M12 4v16'),
    shortcut: 'X',
  },
  {
    id: 'sticky_note',
    label: '便條',
    icon: icon(
      'M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-5-5zM15 3v5h6',
    ),
    shortcut: 'S',
  },
  {
    id: 'note_paper',
    label: '筆記紙',
    icon: icon(
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8',
    ),
    shortcut: 'N',
  },
  {
    id: 'frame',
    label: '框架',
    icon: icon('M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18'),
    shortcut: 'F',
  },
  {
    id: 'arrow',
    label: '箭頭',
    icon: icon('M5 12h14M12 5l7 7-7 7'),
    shortcut: 'A',
  },
];

type Props = {
  activeTool: ActiveTool;
  onToolChange: (tool: ActiveTool) => void;
  onTableToolClick: (clientX: number, clientY: number) => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  snapEnabled: boolean;
  onToggleSnap: () => void;
  magnetEnabled: boolean;
  onToggleMagnet: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  historyBusy: boolean;
};

export function Toolbar({
  activeTool,
  onToolChange,
  onTableToolClick,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  snapEnabled,
  onToggleSnap,
  magnetEnabled,
  onToggleMagnet,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  historyBusy,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-actions">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            data-tool-id={tool.id}
            className={`tool-button ${activeTool === tool.id ? 'is-active' : ''}`}
            title={`${tool.label} (${tool.shortcut})`}
            onClick={(event) => {
              if (tool.id === 'table') {
                onTableToolClick(event.clientX, event.clientY);
                return;
              }

              onToolChange(tool.id);
            }}
          >
            <span className="tool-icon">{tool.icon}</span>
            <span className="tool-label">{tool.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <button
        type="button"
        className="tool-button tool-button-utility"
        title="Undo (Ctrl/Cmd + Z)"
        disabled={!canUndo || historyBusy}
        onClick={onUndo}
      >
        <span className="tool-icon">
          {icon('M9 14 4 9l5-5M4 9h11a5 5 0 1 1 0 10h-1')}
        </span>
        <span className="tool-label">Undo</span>
      </button>

      <button
        type="button"
        className="tool-button"
        title="Redo (Ctrl/Cmd + Shift + Z)"
        disabled={!canRedo || historyBusy}
        onClick={onRedo}
      >
        <span className="tool-icon">
          {icon('m15 14 5-5-5-5M20 9H9a5 5 0 1 0 0 10h1')}
        </span>
        <span className="tool-label">Redo</span>
      </button>

      <div className="toolbar-divider" />

      <div className="toolbar-zoom-group" aria-label="Zoom controls">
        <button
          type="button"
          className="tool-button tool-button-compact"
          title="縮小"
          onClick={onZoomOut}
        >
          <span className="tool-label">-</span>
        </button>
        <div className="toolbar-zoom-readout" aria-live="polite">
          {zoom.toFixed(1)}x
        </div>
        <button
          type="button"
          className="tool-button tool-button-compact"
          title="放大"
          onClick={onZoomIn}
        >
          <span className="tool-label">+</span>
        </button>
        <button
          type="button"
          className="tool-button"
          title="重設縮放為 1.0x"
          onClick={onResetZoom}
        >
          <span className="tool-label">1.0x</span>
        </button>
      </div>

      <button
        type="button"
        aria-pressed={snapEnabled}
        className={`tool-button ${snapEnabled ? 'is-active' : ''}`}
        title={`Snap ${snapEnabled ? '開啟' : '關閉'}（拖曳時按住 Alt 暫停）`}
        onClick={onToggleSnap}
      >
        <span className="tool-icon">
          {icon('M12 2v7m0 0a4 4 0 1 0 4 4h6m-6-4H8')}
        </span>
        <span className="tool-label">Snap</span>
        <span className="tool-meta">{snapEnabled ? 'On' : 'Off'}</span>
      </button>

      <button
        type="button"
        aria-pressed={magnetEnabled}
        className={`tool-button ${magnetEnabled ? 'is-active' : ''}`}
        title={`Magnet ${magnetEnabled ? '開啟' : '關閉'}（移動時吸附背景網格）`}
        onClick={onToggleMagnet}
      >
        <span className="tool-icon">
          {icon('M7 4h4v6H7a3 3 0 0 0 0 6h3v4H7a7 7 0 0 1 0-14zm6 0h4a7 7 0 0 1 0 14h-3v-4h3a3 3 0 0 0 0-6h-4z')}
        </span>
        <span className="tool-label">Magnet</span>
        <span className="tool-meta">{magnetEnabled ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}
