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
    label: 'Select',
    icon: icon('M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z'),
    shortcut: 'V',
  },
  {
    id: 'line',
    label: 'Line',
    icon: icon('M4 20 20 4'),
    shortcut: 'L',
  },
  {
    id: 'table',
    label: 'Table',
    icon: icon('M3 5h18M3 12h18M3 19h18M8 5v14M16 5v14M3 5h18v14H3z'),
    shortcut: 'T',
  },
  {
    id: 'text_box',
    label: 'Text',
    icon: icon('M4 7V4h16v3M9 20h6M12 4v16'),
    shortcut: 'X',
  },
  {
    id: 'sticky_note',
    label: 'Sticky',
    icon: icon(
      'M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8l-5-5zM15 3v5h6',
    ),
    shortcut: 'S',
  },
  {
    id: 'note_paper',
    label: 'Note',
    icon: icon(
      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8',
    ),
    shortcut: 'N',
  },
  {
    id: 'frame',
    label: 'Frame',
    icon: icon('M3 3h18v18H3zM9 3v18M15 3v18M3 9h18M3 15h18'),
    shortcut: 'F',
  },
  {
    id: 'arrow',
    label: 'Arrow',
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
  resetZoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onResetZoomAdjust: (direction: -1 | 1) => void;
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
  resetZoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onResetZoomAdjust,
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
  const [resetZoomEditorOpen, setResetZoomEditorOpen] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!toolbarRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
        setFileSubmenuOpen(false);
        setResetZoomEditorOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenMenu(null);
        setFileSubmenuOpen(false);
        setResetZoomEditorOpen(false);
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
        <div className="toolbar-menu-dropdown" aria-label="File">
          <button
            type="button"
            className={`tool-button toolbar-menu-trigger ${openMenu === 'file' ? 'is-active' : ''}`}
            aria-expanded={openMenu === 'file'}
            onClick={() => toggleMenu('file')}
          >
            <span className="tool-label">File</span>
          </button>
          {openMenu === 'file' ? (
            <div className="toolbar-dropdown-panel" role="menu" aria-label="File menu">
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
                  <span className="toolbar-submenu-chevron">&gt;</span>
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
                      PNG (coming soon)
                    </button>
                    <button type="button" className="toolbar-dropdown-item" role="menuitem" disabled>
                      PDF (coming soon)
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="toolbar-menu-dropdown" aria-label="Edit">
          <button
            type="button"
            className={`tool-button toolbar-menu-trigger ${openMenu === 'edit' ? 'is-active' : ''}`}
            aria-expanded={openMenu === 'edit'}
            onClick={() => toggleMenu('edit')}
          >
            <span className="tool-label">Edit</span>
          </button>
          {openMenu === 'edit' ? (
            <div className="toolbar-dropdown-panel" role="menu" aria-label="Edit menu">
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
          title={'Magnet ' + (magnetEnabled ? 'on' : 'off') + '; hold Alt to bypass'}
          onClick={onToggleMagnet}
        >
          <span className="tool-icon">
            {icon('M7 4h4v6H7a3 3 0 0 0 0 6h3v4H7a7 7 0 0 1 0-14zm6 0h4a7 7 0 0 1 0 14h-3v-4h3a3 3 0 0 0 0-6h-4z')}
          </span>
          <span className="tool-label">Magnet</span>
        </button>

        <div className="toolbar-zoom-group" aria-label="Zoom controls">
          <div className="toolbar-zoom-stepper" aria-label="Current zoom controls">
            <button
              type="button"
              className="tool-button tool-button-compact toolbar-zoom-step"
              title="Zoom in"
              onClick={onZoomIn}
            >
              <span className="tool-label">+</span>
            </button>
            <div className="toolbar-zoom-readout" aria-live="polite">
              <span className="toolbar-zoom-value">{zoom.toFixed(1)}x</span>
              <span className="toolbar-zoom-caption">Zoom</span>
            </div>
            <button
              type="button"
              className="tool-button tool-button-compact toolbar-zoom-step"
              title="Zoom out"
              onClick={onZoomOut}
            >
              <span className="tool-label">-</span>
            </button>
          </div>
          <div className="toolbar-zoom-reset-tools">
            <button
              type="button"
              className="tool-button toolbar-zoom-reset-button"
              title={'Reset zoom to ' + resetZoom.toFixed(1) + 'x'}
              onClick={onResetZoom}
            >
              <span className="toolbar-zoom-reset-action">Reset</span>
              <span className="toolbar-zoom-reset-target">
                {resetZoom.toFixed(1)}x
              </span>
            </button>
            <button
              type="button"
              className="tool-button toolbar-zoom-adjust-button"
              title="Adjust reset zoom target"
              aria-expanded={resetZoomEditorOpen}
              onClick={() => setResetZoomEditorOpen((current) => !current)}
            >
              <span className="tool-label">Adjust</span>
            </button>
            {resetZoomEditorOpen ? (
              <div className="toolbar-zoom-reset-panel" aria-label="Reset zoom target controls">
                <span className="toolbar-zoom-reset-panel-label">
                  Reset target
                </span>
                <button
                  type="button"
                  className="tool-button tool-button-compact"
                  title="Lower reset zoom target by 0.1x"
                  onClick={() => onResetZoomAdjust(-1)}
                >
                  <span className="tool-label">-</span>
                </button>
                <span className="toolbar-zoom-reset-value">
                  {resetZoom.toFixed(1)}x
                </span>
                <button
                  type="button"
                  className="tool-button tool-button-compact"
                  title="Raise reset zoom target by 0.1x"
                  onClick={() => onResetZoomAdjust(1)}
                >
                  <span className="tool-label">+</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
