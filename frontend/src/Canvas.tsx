import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  createBoardItem,
  deleteBoardItem,
  getPageBoardData,
  updateBoardItem,
  updatePageViewport,
  type BoardItem,
  type BoardItemPayload,
  type Page,
} from './api';
import { BoardItemRenderer } from './items/BoardItemRenderer';
import { Toolbar } from './Toolbar';
import {
  ITEM_CATEGORY_FOR_TYPE,
  ITEM_DEFAULT_SIZE,
  type ActiveTool,
  type Viewport,
} from './types';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const VIEWPORT_SAVE_DELAY = 600; // ms

// ──────────────────────────────────────────────
// Drag / pan state (stored in refs to avoid re-renders)
// ──────────────────────────────────────────────
type DragState = {
  itemId: string;
  startMouseX: number;
  startMouseY: number;
  startItemX: number;
  startItemY: number;
};

type PanState = {
  startMouseX: number;
  startMouseY: number;
  startVpX: number;
  startVpY: number;
};

// ──────────────────────────────────────────────
// Helper: convert full BoardItem to update payload
// ──────────────────────────────────────────────
function toPayload(item: BoardItem): BoardItemPayload {
  return {
    page_id: item.page_id,
    parent_item_id: item.parent_item_id,
    category: item.category,
    type: item.type,
    title: item.title,
    content: item.content,
    content_format: item.content_format,
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    rotation: item.rotation,
    z_index: item.z_index,
    is_collapsed: item.is_collapsed,
    style_json: item.style_json,
    data_json: item.data_json,
  };
}

// ──────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────
type Props = {
  page: Page;
};

// ──────────────────────────────────────────────
// Canvas
// ──────────────────────────────────────────────
export function Canvas({ page }: Props) {
  const [viewport, setViewport] = useState<Viewport>({
    x: page.viewport_x,
    y: page.viewport_y,
    zoom: page.zoom,
  });
  const [items, setItems] = useState<BoardItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [isSpaceDown, setIsSpaceDown] = useState(false);

  // Refs for mouse-event handlers (avoid stale closures in event callbacks)
  const viewportRef = useRef<Viewport>(viewport);
  const itemsRef = useRef<BoardItem[]>(items);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const isSpaceRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const vpSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync with latest state (must run in layout effect, not render)
  useLayoutEffect(() => {
    viewportRef.current = viewport;
    itemsRef.current = items;
  });

  // ── Load board data when page changes ──
  // Note: Canvas is keyed by page.id in App, so component remounts on page switch.
  // State (items, selection, viewport) is already fresh on each mount.
  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const data = await getPageBoardData(page.id, controller.signal);
        setItems(data.board_items);
        setViewport({
          x: data.page.viewport_x,
          y: data.page.viewport_y,
          zoom: data.page.zoom,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        console.error('[Canvas] Failed to load board data', err);
      }
    }

    void load();
    return () => controller.abort();
  }, [page.id]);

  // ── Space-bar: toggle pan mode ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' && !isSpaceRef.current) {
        // Only go into pan mode if no input is focused
        const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        isSpaceRef.current = true;
        setIsSpaceDown(true);
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.key === ' ') {
        isSpaceRef.current = false;
        setIsSpaceDown(false);
        panRef.current = null;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ── Delete / Escape keys ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId !== null) {
        const id = selectedId;
        setItems((curr) => curr.filter((item) => item.id !== id));
        setSelectedId(null);
        void deleteBoardItem(id);
      }
      if (e.key === 'Escape') {
        setSelectedId(null);
        setEditingId(null);
        setActiveTool('select');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  // ── Keyboard shortcut: switch tool ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      if (key === 'v') setActiveTool('select');
      if (key === 'x') setActiveTool('text_box');
      if (key === 's') setActiveTool('sticky_note');
      if (key === 'n') setActiveTool('note_paper');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Screen → world coordinate conversion ──
  function screenToWorld(screenX: number, screenY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const vp = viewportRef.current;
    return {
      x: (screenX - rect.left - vp.x) / vp.zoom,
      y: (screenY - rect.top - vp.y) / vp.zoom,
    };
  }

  // ── Debounced viewport save ──
  function scheduleViewportSave(vp: Viewport) {
    if (vpSaveTimer.current !== null) clearTimeout(vpSaveTimer.current);
    vpSaveTimer.current = setTimeout(() => {
      void updatePageViewport(page.id, {
        viewport_x: vp.x,
        viewport_y: vp.y,
        zoom: vp.zoom,
      });
    }, VIEWPORT_SAVE_DELAY);
  }

  // ── Wheel: zoom centred on cursor ──
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = -e.deltaY * 0.001;
    const vp = viewportRef.current;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.zoom * (1 + delta)));
    const scale = newZoom / vp.zoom;
    const newVp: Viewport = {
      x: mouseX - scale * (mouseX - vp.x),
      y: mouseY - scale * (mouseY - vp.y),
      zoom: newZoom,
    };
    setViewport(newVp);
    scheduleViewportSave(newVp);
  }

  // ── Canvas mousedown: pan or create item ──
  function handleCanvasMouseDown(e: React.MouseEvent) {
    // Middle mouse → pan
    if (e.button === 1) {
      e.preventDefault();
      panRef.current = {
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startVpX: viewportRef.current.x,
        startVpY: viewportRef.current.y,
      };
      return;
    }
    if (e.button !== 0) return;

    // Space + left mouse → pan
    if (isSpaceRef.current) {
      panRef.current = {
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startVpX: viewportRef.current.x,
        startVpY: viewportRef.current.y,
      };
      return;
    }

    // Active tool → create new item at click position
    if (activeTool !== 'select') {
      const worldPos = screenToWorld(e.clientX, e.clientY);
      const size = ITEM_DEFAULT_SIZE[activeTool] ?? { width: 200, height: 100 };
      void handleCreateItem({
        type: activeTool,
        x: worldPos.x - size.width / 2,
        y: worldPos.y - size.height / 2,
        ...size,
      });
      setActiveTool('select');
      return;
    }

    // Select tool, click on background → deselect
    setSelectedId(null);
    setEditingId(null);
  }

  // ── Create item ──
  async function handleCreateItem(params: {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const category = ITEM_CATEGORY_FOR_TYPE[params.type] ?? 'small_item';
    const maxZ = itemsRef.current.reduce((m, it) => Math.max(m, it.z_index), 0);

    const payload: BoardItemPayload = {
      page_id: page.id,
      parent_item_id: null,
      category,
      type: params.type,
      title: null,
      content: '',
      content_format: null,
      x: params.x,
      y: params.y,
      width: params.width,
      height: params.height,
      rotation: 0,
      z_index: maxZ + 1,
      is_collapsed: false,
      style_json: null,
      data_json: null,
    };

    try {
      const created = await createBoardItem(payload);
      setItems((curr) => [...curr, created]);
      setSelectedId(created.id);
    } catch (err) {
      console.error('[Canvas] Failed to create item', err);
    }
  }

  // ── Item mousedown: start dragging ──
  function handleItemMouseDown(e: React.MouseEvent, itemId: string) {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    const item = itemsRef.current.find((it) => it.id === itemId);
    if (!item) return;

    setSelectedId(itemId);
    dragRef.current = {
      itemId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startItemX: item.x,
      startItemY: item.y,
    };
  }

  // ── Mouse move: drag item or pan canvas ──
  function handleMouseMove(e: React.MouseEvent) {
    const drag = dragRef.current;
    if (drag) {
      const vp = viewportRef.current;
      const dx = (e.clientX - drag.startMouseX) / vp.zoom;
      const dy = (e.clientY - drag.startMouseY) / vp.zoom;
      setItems((curr) =>
        curr.map((it) =>
          it.id === drag.itemId
            ? { ...it, x: drag.startItemX + dx, y: drag.startItemY + dy }
            : it,
        ),
      );
      return;
    }

    const pan = panRef.current;
    if (pan) {
      const newVp: Viewport = {
        ...viewportRef.current,
        x: pan.startVpX + (e.clientX - pan.startMouseX),
        y: pan.startVpY + (e.clientY - pan.startMouseY),
      };
      setViewport(newVp);
    }
  }

  // ── Mouse up: commit drag or pan ──
  function handleMouseUp() {
    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      const item = itemsRef.current.find((it) => it.id === drag.itemId);
      if (item) {
        void updateBoardItem(item.id, toPayload(item));
      }
    }

    if (panRef.current) {
      panRef.current = null;
      scheduleViewportSave(viewportRef.current);
    }
  }

  // ── Item content update (from inline editing) ──
  // Debounced to avoid hammering the API on every keystroke
  const handleItemUpdate = useCallback((updated: BoardItem) => {
    setItems((curr) => curr.map((it) => (it.id === updated.id ? updated : it)));

    if (textSaveTimer.current !== null) clearTimeout(textSaveTimer.current);
    textSaveTimer.current = setTimeout(() => {
      void updateBoardItem(updated.id, toPayload(updated));
    }, 500);
  }, []);

  const handleEditEnd = useCallback(() => setEditingId(null), []);

  // ── Cursor class ──
  const cursorClass =
    activeTool !== 'select'
      ? 'cursor-crosshair'
      : isSpaceDown
        ? 'cursor-grab'
        : '';

  const worldTransform = `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`;

  return (
    <div className="canvas-root">
      <Toolbar activeTool={activeTool} onToolChange={setActiveTool} />
      <div
        ref={containerRef}
        className={`canvas-container ${cursorClass}`}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Dot-grid background */}
        <div className="canvas-dot-grid" />

        {/* World layer – all items live here */}
        <div
          className="canvas-world"
          style={{ transform: worldTransform, transformOrigin: '0 0' }}
        >
          {items.map((item) => (
            <BoardItemRenderer
              key={item.id}
              item={item}
              isSelected={item.id === selectedId}
              isEditing={item.id === editingId}
              onMouseDown={(e) => handleItemMouseDown(e, item.id)}
              onDoubleClick={() => {
                setSelectedId(item.id);
                setEditingId(item.id);
              }}
              onUpdate={handleItemUpdate}
              onEditEnd={handleEditEnd}
            />
          ))}
        </div>

        {/* Empty state hint */}
        {items.length === 0 && (
          <div className="canvas-empty-hint">
            <p>選擇工具後點擊畫布新增物件，或滾輪縮放、空白鍵拖曳平移</p>
          </div>
        )}

        {/* Viewport info badge */}
        <div className="canvas-status-badge">
          {Math.round(viewport.zoom * 100)}%
        </div>
      </div>
    </div>
  );
}
