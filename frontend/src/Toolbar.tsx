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
    id: 'text_box',
    label: '文字框',
    icon: icon('M4 7V4h16v3M9 20h6M12 4v16'),
    shortcut: 'X',
  },
  {
    id: 'sticky_note',
    label: '便利貼',
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
  snapEnabled: boolean;
  onToggleSnap: () => void;
};

export function Toolbar({
  activeTool,
  onToolChange,
  snapEnabled,
  onToggleSnap,
}: Props) {
  return (
    <div className="toolbar">
      <div className="toolbar-actions">
        {TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`tool-button ${activeTool === tool.id ? 'is-active' : ''}`}
            title={`${tool.label} (${tool.shortcut})`}
            onClick={() => onToolChange(tool.id)}
          >
            <span className="tool-icon">{tool.icon}</span>
            <span className="tool-label">{tool.label}</span>
          </button>
        ))}
      </div>

      <div className="toolbar-divider" />

      <button
        type="button"
        className={`tool-button tool-button-utility ${
          snapEnabled ? 'is-active' : ''
        }`}
        title={`Snap ${snapEnabled ? '開啟' : '關閉'}（拖曳時按住 Alt 可暫時停用）`}
        onClick={onToggleSnap}
      >
        <span className="tool-icon">
          {icon('M12 2v7m0 0a4 4 0 1 0 4 4h6m-6-4H8')}
        </span>
        <span className="tool-label">Snap</span>
        <span className="tool-meta">{snapEnabled ? 'On' : 'Off'}</span>
      </button>
    </div>
  );
}
