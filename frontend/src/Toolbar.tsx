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
};
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
}: Props) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<ToolbarPosition>('top');
  const [previewPosition, setPreviewPosition] = useState<ToolbarPosition | null>(null);
  const [dragCoords, setDragCoords] = useState<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const pendingPositionRef = useRef<ToolbarPosition>('top');

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        isDraggingRef.current = false;
      }
    }
    window.addEventListener('keydown', handleEscape);
    return () => {
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

  const activePosition = (isDraggingRef.current && previewPosition) ? previewPosition : position;
  const showToolbarText = activePosition === 'top' || activePosition === 'bottom';
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
              {showToolbarText ? <span className="tool-label">{tool.label}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
