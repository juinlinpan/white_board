import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  onImportPage: () => void;
  onExportPage: () => void;
  importExportDisabled: boolean;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  magnetEnabled: boolean;
  onToggleMagnet: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  historyBusy: boolean;
};

type ToolbarMenuId = 'file' | 'edit' | null;

export function Toolbar({
  activeTool,
  onToolChange,
  onTableToolClick,
  onImportPage,
  onExportPage,
  importExportDisabled,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  magnetEnabled,
  onToggleMagnet,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  historyBusy,
}: Props) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [openMenu, setOpenMenu] = useState<ToolbarMenuId>(null);
  const [fileSubmenuOpen, setFileSubmenuOpen] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
        setFileSubmenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setFileSubmenuOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  function toggleMenu(menuId: Exclude<ToolbarMenuId, null>) {
    setFileSubmenuOpen(false);
    setOpenMenu((current) => (current === menuId ? null : menuId));
  }

  return (
    <div ref={toolbarRef} className="toolbar">
      <div className="toolbar-left">
        <div className="toolbar-menu-dropdown" aria-label="檔案">
          <button
            type="button"
            className={`tool-button toolbar-menu-trigger ${openMenu === 'file' ? 'is-active' : ''}`}
            aria-expanded={openMenu === 'file'}
            onClick={() => toggleMenu('file')}
          >
            <span className="tool-label">檔案</span>
          </button>
          {openMenu === 'file' ? (
            <div className="toolbar-dropdown-panel" role="menu" aria-label="檔案選單">
              <button
                type="button"
                className="toolbar-dropdown-item"
                role="menuitem"
                disabled={importExportDisabled}
                onMouseEnter={() => setFileSubmenuOpen(false)}
                onClick={() => {
                  onImportPage();
                  setOpenMenu(null);
                }}
              >
                Import
              </button>
              <div
                className="toolbar-dropdown-item-submenu"
                onMouseEnter={() => {
                  if (!importExportDisabled) {
                    setFileSubmenuOpen(true);
                  }
                }}
                onMouseLeave={() => setFileSubmenuOpen(false)}
              >
                <button
                  type="button"
                  className="toolbar-dropdown-item toolbar-dropdown-item-submenu-trigger"
                  role="menuitem"
                  disabled={importExportDisabled}
                  aria-haspopup="menu"
                  aria-expanded={fileSubmenuOpen}
                  onFocus={() => {
                    if (!importExportDisabled) {
                      setFileSubmenuOpen(true);
                    }
                  }}
                  onClick={() => {
                    if (!importExportDisabled) {
                      setFileSubmenuOpen((current) => !current);
                    }
                  }}
                >
                  <span>Export</span>
                  <span className="toolbar-submenu-chevron">›</span>
                </button>
                {fileSubmenuOpen ? (
                  <div className="toolbar-submenu-panel" role="menu" aria-label="Export formats">
                    <button
                      type="button"
                      className="toolbar-dropdown-item"
                      role="menuitem"
                      disabled={importExportDisabled}
                      onClick={() => {
                        onExportPage();
                        setOpenMenu(null);
                        setFileSubmenuOpen(false);
                      }}
                    >
                      JSON (.json)
                    </button>
                    <button type="button" className="toolbar-dropdown-item" role="menuitem" disabled>
                      PNG（即將支援）
                    </button>
                    <button type="button" className="toolbar-dropdown-item" role="menuitem" disabled>
                      PDF（即將支援）
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="toolbar-menu-dropdown" aria-label="編輯">
          <button
            type="button"
            className={`tool-button toolbar-menu-trigger ${openMenu === 'edit' ? 'is-active' : ''}`}
            aria-expanded={openMenu === 'edit'}
            onClick={() => toggleMenu('edit')}
          >
            <span className="tool-label">編輯</span>
          </button>
          {openMenu === 'edit' ? (
            <div className="toolbar-dropdown-panel" role="menu" aria-label="編輯選單">
              <button
                type="button"
                className="toolbar-dropdown-item"
                title="Undo (Ctrl/Cmd + Z)"
                role="menuitem"
                disabled={!canUndo || historyBusy}
                onClick={() => {
                  onUndo();
                  setOpenMenu(null);
                }}
              >
                Undo
              </button>

              <button
                type="button"
                className="toolbar-dropdown-item"
                title="Redo (Ctrl/Cmd + Shift + Z)"
                role="menuitem"
                disabled={!canRedo || historyBusy}
                onClick={() => {
                  onRedo();
                  setOpenMenu(null);
                }}
              >
                Redo
              </button>
            </div>
          ) : null}
        </div>

        <div className="toolbar-divider" />

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
      </div>

      <div className="toolbar-spacer" />

      <div className="toolbar-right">
        <button
          type="button"
          aria-pressed={magnetEnabled}
          className={`tool-button ${magnetEnabled ? 'is-active' : ''}`}
          title={`Magnet ${magnetEnabled ? '開啟' : '關閉'}（移動/縮放時按住 Alt 暫停）`}
          onClick={onToggleMagnet}
        >
          <span className="tool-icon">
            {icon('M7 4h4v6H7a3 3 0 0 0 0 6h3v4H7a7 7 0 0 1 0-14zm6 0h4a7 7 0 0 1 0 14h-3v-4h3a3 3 0 0 0 0-6h-4z')}
          </span>
          <span className="tool-label">Magnet</span>
        </button>

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
      </div>
    </div>
  );
}
