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
  onExportPage: (format: 'json' | 'png' | 'pptx') => void;
  importExportDisabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  historyBusy: boolean;
};

type ToolbarMenuId = 'file' | 'edit' | null;
export type ToolbarPosition = 'top' | 'bottom' | 'left' | 'right';

type RectLike = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;

export function getToolbarDockPosition(
  clientX: number,
  clientY: number,
  parentRect: RectLike,
): ToolbarPosition {
  const relX = (clientX - parentRect.left) / parentRect.width;
  const relY = (clientY - parentRect.top) / parentRect.height;
  const distances: Array<{ position: ToolbarPosition; distance: number }> = [
    { position: 'top', distance: relY },
    { position: 'bottom', distance: 1 - relY },
    { position: 'left', distance: relX },
    { position: 'right', distance: 1 - relX },
  ];

  return distances.reduce((closest, candidate) =>
    candidate.distance < closest.distance ? candidate : closest,
  ).position;
}

export function Toolbar({
  activeTool,
  onToolChange,
  onTableToolClick,
  onImportPage,
  onExportPage,
  importExportDisabled,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  historyBusy,
}: Props) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [openMenu, setOpenMenu] = useState<ToolbarMenuId>(null);
  const [fileSubmenuOpen, setFileSubmenuOpen] = useState(false);
  const [position, setPosition] = useState<ToolbarPosition>('top');
  const [previewPosition, setPreviewPosition] = useState<ToolbarPosition | null>(null);
  const [dragCoords, setDragCoords] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const pendingPositionRef = useRef<ToolbarPosition>('top');

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

  const handleDragStart = (event: React.PointerEvent) => {
    if (!toolbarRef.current) return;
    event.preventDefault();
    const rect = toolbarRef.current.getBoundingClientRect();
    const parentRect = toolbarRef.current.parentElement?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    pendingPositionRef.current = position;
    isDraggingRef.current = true;

    // Pointer capture: ALL subsequent pointermove/pointerup go to this element
    // even if the pointer leaves it — no timing gaps, no missed events.
    toolbarRef.current.setPointerCapture(event.pointerId);

    setPreviewPosition(position);
    setDragCoords({ x: rect.left - parentRect.left, y: rect.top - parentRect.top });
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!isDraggingRef.current || !dragOffsetRef.current || !toolbarRef.current) return;
    const parentRect = toolbarRef.current.parentElement?.getBoundingClientRect() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

    const newX = event.clientX - dragOffsetRef.current.x - parentRect.left;
    const newY = event.clientY - dragOffsetRef.current.y - parentRect.top;
    setDragCoords({ x: newX, y: newY });

    const closest = getToolbarDockPosition(event.clientX, event.clientY, parentRect);
    pendingPositionRef.current = closest;
    setPreviewPosition(closest);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    toolbarRef.current?.releasePointerCapture(event.pointerId);

    setPosition(pendingPositionRef.current);
    setDragCoords(null);
    setPreviewPosition(null);
    dragOffsetRef.current = null;
  };

  function toggleMenu(menuId: Exclude<ToolbarMenuId, null>) {
    setFileSubmenuOpen(false);
    setOpenMenu((current) => (current === menuId ? null : menuId));
  }

  const activePosition = (isDraggingRef.current && previewPosition) ? previewPosition : position;
  const dragStyles: React.CSSProperties = dragCoords
    ? {
        top: dragCoords.y,
        left: dragCoords.x,
        right: 'auto',
        bottom: 'auto',
        transform: 'none',
      }
    : {};

  return (
    <div
      ref={toolbarRef}
      className={`toolbar toolbar-position-${activePosition} ${dragCoords ? 'is-dragging' : ''}`}
      style={dragStyles}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div
        className="toolbar-drag-handle"
        onPointerDown={handleDragStart}
        title="Drag to move toolbar"
      >
        <span className="toolbar-drag-dots">
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="4" cy="2" r="1.5" />
            <circle cx="8" cy="2" r="1.5" />
            <circle cx="4" cy="8" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="4" cy="14" r="1.5" />
            <circle cx="8" cy="14" r="1.5" />
          </svg>
        </span>
      </div>
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
                        onExportPage('json');
                        setOpenMenu(null);
                        setFileSubmenuOpen(false);
                      }}
                    >
                      JSON (.json)
                    </button>
                    <button
                      type="button"
                      className="toolbar-dropdown-item"
                      role="menuitem"
                      disabled={importExportDisabled}
                      onClick={() => {
                        onExportPage('png');
                        setOpenMenu(null);
                        setFileSubmenuOpen(false);
                      }}
                    >
                      PNG (.png)
                    </button>
                    <button
                      type="button"
                      className="toolbar-dropdown-item"
                      role="menuitem"
                      disabled={importExportDisabled}
                      onClick={() => {
                        onExportPage('pptx');
                        setOpenMenu(null);
                        setFileSubmenuOpen(false);
                      }}
                    >
                      PPTX (.pptx)
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
    </div>
  );
}
