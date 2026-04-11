import { type ActiveTool } from './types';

type ToolDef = {
  id: ActiveTool;
  label: string;
  icon: string;
  shortcut: string;
};

const TOOLS: ToolDef[] = [
  { id: 'select', label: '選取', icon: '↖', shortcut: 'V' },
  { id: 'text_box', label: '文字框', icon: 'T', shortcut: 'X' },
  { id: 'sticky_note', label: '便利貼', icon: '◧', shortcut: 'S' },
  { id: 'note_paper', label: '筆記紙', icon: '≡', shortcut: 'N' },
  { id: 'frame', label: '框架', icon: '▣', shortcut: 'F' },
];

type Props = {
  activeTool: ActiveTool;
  onToolChange: (tool: ActiveTool) => void;
};

export function Toolbar({ activeTool, onToolChange }: Props) {
  return (
    <div className="toolbar">
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          className={`tool-button ${activeTool === tool.id ? 'is-active' : ''}`}
          title={`${tool.label} (${tool.shortcut})`}
          onClick={() => onToolChange(tool.id)}
        >
          <span className="tool-icon">{tool.icon}</span>
          <span className="tool-label">{tool.label}</span>
        </button>
      ))}
    </div>
  );
}
