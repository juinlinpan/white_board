import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  type BoardItem,
  type ConnectorLink,
  type ConnectorLinkPayload,
  createBoardItem,
  createConnector,
  deleteBoardItem,
  getPageBoardData,
  updateBoardItem,
  updateConnector,
  updatePageViewport,
  type BoardItemPayload,
  type Page,
} from './api';
import { Inspector } from './Inspector';
import { Toolbar } from './Toolbar';
import { ArrowConnector } from './items/ArrowConnector';
import { BoardItemRenderer } from './items/BoardItemRenderer';
import { type FrameSummaryEntry } from './items/Frame';
import {
  ITEM_CATEGORY,
  ITEM_CATEGORY_FOR_TYPE,
  ITEM_DEFAULT_SIZE,
  ITEM_MIN_SIZE,
  ITEM_TYPE,
  type ActiveTool,
  type Viewport,
} from './types';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const VIEWPORT_SAVE_DELAY = 600;
const ITEM_SAVE_DELAY = 500;
const CONNECTOR_ITEM_PADDING = 20;

type Anchor = 'top' | 'right' | 'bottom' | 'left';
type Point = {
  x: number;
  y: number;
};

type DragState = {
  itemId: string;
  startMouseX: number;
  startMouseY: number;
  startItemX: number;
  startItemY: number;
  childPositions: Array<{ id: string; x: number; y: number }>;
};

type ResizeState = {
  itemId: string;
  startMouseX: number;
  startMouseY: number;
  startWidth: number;
  startHeight: number;
};

type PanState = {
  startMouseX: number;
  startMouseY: number;
  startVpX: number;
  startVpY: number;
};

type ArrowDraftState = {
  fromItemId: string;
};

type Props = {
  page: Page;
};

type ItemsUpdater = BoardItem[] | ((current: BoardItem[]) => BoardItem[]);
type ConnectorsUpdater =
  | ConnectorLink[]
  | ((current: ConnectorLink[]) => ConnectorLink[]);

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

function toConnectorPayload(connector: ConnectorLink): ConnectorLinkPayload {
  return {
    connector_item_id: connector.connector_item_id,
    from_item_id: connector.from_item_id,
    to_item_id: connector.to_item_id,
    from_anchor: connector.from_anchor,
    to_anchor: connector.to_anchor,
  };
}

function isFrame(item: BoardItem): boolean {
  return item.type === ITEM_TYPE.frame;
}

function isSmallItem(item: BoardItem): boolean {
  return item.category === ITEM_CATEGORY.small_item;
}

function isArrowConnectable(item: BoardItem): boolean {
  return isSmallItem(item) || item.type === ITEM_TYPE.frame;
}

function isInlineEditable(item: BoardItem): boolean {
  return (
    item.type === ITEM_TYPE.text_box ||
    item.type === ITEM_TYPE.sticky_note ||
    item.type === ITEM_TYPE.note_paper
  );
}

function getFirstNonEmptyLine(content: string | null): string | null {
  if (content === null) {
    return null;
  }

  for (const line of content.split(/\r?\n/)) {
    const normalized = line.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }

  return null;
}

function getMarkdownH1(content: string | null): string | null {
  if (content === null) {
    return null;
  }

  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+)$/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function ellipsize(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength).trimEnd()}…`;
}

function summarizeFrameChild(item: BoardItem): FrameSummaryEntry {
  const text = item.content?.trim() ?? '';

  if (item.type === ITEM_TYPE.text_box) {
    return {
      id: item.id,
      type: item.type,
      title: '文字框',
      body: text.length > 0 ? text : '尚未輸入文字',
    };
  }

  if (item.type === ITEM_TYPE.sticky_note) {
    return {
      id: item.id,
      type: item.type,
      title: '便利貼',
      body: text.length > 0 ? ellipsize(text, 80) : '尚未輸入內容',
    };
  }

  const h1 = getMarkdownH1(text);
  const fallback = getFirstNonEmptyLine(text);

  return {
    id: item.id,
    type: item.type,
    title: h1 ?? fallback ?? 'Untitled note',
    body: h1 !== null ? 'Markdown H1 摘要' : '未找到 H1，改用第一行內容',
  };
}

function clampItemSize(
  type: string,
  width: number,
  height: number,
): { width: number; height: number } {
  const minSize = ITEM_MIN_SIZE[type];
  return {
    width: Math.max(minSize?.width ?? 60, width),
    height: Math.max(minSize?.height ?? 40, height),
  };
}

function getFrameChildren(items: BoardItem[], frameId: string): BoardItem[] {
  return items
    .filter((item) => item.parent_item_id === frameId)
    .sort((a, b) => a.y - b.y || a.x - b.x || a.z_index - b.z_index);
}

function isPointInsideFrame(x: number, y: number, frame: BoardItem): boolean {
  return (
    x >= frame.x &&
    x <= frame.x + frame.width &&
    y >= frame.y &&
    y <= frame.y + frame.height
  );
}

function isHiddenByCollapsedFrame(
  item: BoardItem,
  items: BoardItem[],
): boolean {
  if (item.parent_item_id === null) {
    return false;
  }

  const parent = items.find(
    (candidate) => candidate.id === item.parent_item_id,
  );
  return parent?.type === ITEM_TYPE.frame && parent.is_collapsed;
}

function findContainingFrame(
  item: BoardItem,
  items: BoardItem[],
): BoardItem | null {
  const centerX = item.x + item.width / 2;
  const centerY = item.y + item.height / 2;

  const candidates = items
    .filter(
      (candidate) =>
        candidate.type === ITEM_TYPE.frame &&
        candidate.id !== item.id &&
        isPointInsideFrame(centerX, centerY, candidate),
    )
    .sort((a, b) => {
      const areaA = a.width * a.height;
      const areaB = b.width * b.height;
      if (areaA !== areaB) {
        return areaA - areaB;
      }

      return b.z_index - a.z_index;
    });

  return candidates[0] ?? null;
}

function getItemCenter(item: BoardItem): Point {
  return {
    x: item.x + item.width / 2,
    y: item.y + item.height / 2,
  };
}

function getAutoAnchors(
  fromItem: BoardItem,
  toItem: BoardItem,
): { from_anchor: Anchor; to_anchor: Anchor } {
  const fromCenter = getItemCenter(fromItem);
  const toCenter = getItemCenter(toItem);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { from_anchor: 'right', to_anchor: 'left' }
      : { from_anchor: 'left', to_anchor: 'right' };
  }

  return dy >= 0
    ? { from_anchor: 'bottom', to_anchor: 'top' }
    : { from_anchor: 'top', to_anchor: 'bottom' };
}

function getAnchorPoint(item: BoardItem, anchor: Anchor | null): Point {
  switch (anchor) {
    case 'top':
      return { x: item.x + item.width / 2, y: item.y };
    case 'right':
      return { x: item.x + item.width, y: item.y + item.height / 2 };
    case 'bottom':
      return { x: item.x + item.width / 2, y: item.y + item.height };
    case 'left':
      return { x: item.x, y: item.y + item.height / 2 };
    default:
      return getItemCenter(item);
  }
}

function getConnectorPoints(
  connector: ConnectorLink,
  items: BoardItem[],
): { fromPoint: Point; toPoint: Point } | null {
  if (connector.from_item_id === null || connector.to_item_id === null) {
    return null;
  }

  const fromItem = items.find((item) => item.id === connector.from_item_id);
  const toItem = items.find((item) => item.id === connector.to_item_id);
  if (!fromItem || !toItem) {
    return null;
  }

  if (
    isHiddenByCollapsedFrame(fromItem, items) ||
    isHiddenByCollapsedFrame(toItem, items)
  ) {
    return null;
  }

  const autoAnchors = getAutoAnchors(fromItem, toItem);
  return {
    fromPoint: getAnchorPoint(
      fromItem,
      (connector.from_anchor as Anchor | null) ?? autoAnchors.from_anchor,
    ),
    toPoint: getAnchorPoint(
      toItem,
      (connector.to_anchor as Anchor | null) ?? autoAnchors.to_anchor,
    ),
  };
}

export function Canvas({ page }: Props) {
  const [viewport, setViewport] = useState<Viewport>({
    x: page.viewport_x,
    y: page.viewport_y,
    zoom: page.zoom,
  });
  const [items, setItems] = useState<BoardItem[]>([]);
  const [connectors, setConnectors] = useState<ConnectorLink[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ActiveTool>('select');
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [arrowDraft, setArrowDraft] = useState<ArrowDraftState | null>(null);

  const viewportRef = useRef<Viewport>(viewport);
  const itemsRef = useRef<BoardItem[]>(items);
  const connectorsRef = useRef<ConnectorLink[]>(connectors);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const isSpaceRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const vpSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    viewportRef.current = viewport;
    itemsRef.current = items;
    connectorsRef.current = connectors;
  });

  const setItemsAndSync = useCallback((updater: ItemsUpdater) => {
    setItems((current) => {
      const nextItems =
        typeof updater === 'function' ? updater(current) : updater;
      itemsRef.current = nextItems;
      return nextItems;
    });
  }, []);

  const setViewportAndSync = useCallback((nextViewport: Viewport) => {
    viewportRef.current = nextViewport;
    setViewport(nextViewport);
  }, []);

  const setConnectorsAndSync = useCallback((updater: ConnectorsUpdater) => {
    setConnectors((current) => {
      const nextConnectors =
        typeof updater === 'function' ? updater(current) : updater;
      connectorsRef.current = nextConnectors;
      return nextConnectors;
    });
  }, []);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );
  const selectedConnector = useMemo(
    () =>
      connectors.find((connector) => connector.connector_item_id === selectedId) ??
      null,
    [connectors, selectedId],
  );
  const connectorByItemId = useMemo(
    () =>
      new Map(
        connectors.map((connector) => [connector.connector_item_id, connector]),
      ),
    [connectors],
  );

  const selectedChildCount = useMemo(() => {
    if (selectedItem?.type !== ITEM_TYPE.frame) {
      return 0;
    }

    return getFrameChildren(items, selectedItem.id).length;
  }, [items, selectedItem]);

  const visibleItems = useMemo(
    () =>
      [...items]
        .filter((item) => !isHiddenByCollapsedFrame(item, items))
        .sort(
          (a, b) =>
            a.z_index - b.z_index || a.created_at.localeCompare(b.created_at),
        ),
    [items],
  );

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const data = await getPageBoardData(page.id, controller.signal);
        setItemsAndSync(data.board_items);
        setConnectorsAndSync(data.connector_links);
        setViewportAndSync({
          x: data.page.viewport_x,
          y: data.page.viewport_y,
          zoom: data.page.zoom,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }

        console.error('[Canvas] Failed to load board data', err);
      }
    }

    void load();
    return () => controller.abort();
  }, [page.id, setConnectorsAndSync, setItemsAndSync, setViewportAndSync]);

  useEffect(
    () => () => {
      if (vpSaveTimer.current !== null) {
        clearTimeout(vpSaveTimer.current);
      }
      if (itemSaveTimer.current !== null) {
        clearTimeout(itemSaveTimer.current);
      }
    },
    [],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === ' ' && !isSpaceRef.current) {
        const tag =
          (document.activeElement as HTMLElement | null)?.tagName ?? '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          return;
        }

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

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      const target = itemsRef.current.find((item) => item.id === itemId);
      if (!target) {
        return;
      }

      const relatedConnectors = connectorsRef.current.filter(
        (connector) =>
          connector.connector_item_id === itemId ||
          connector.from_item_id === itemId ||
          connector.to_item_id === itemId,
      );
      const relatedItemIds = new Set<string>([
        itemId,
        ...relatedConnectors.map((connector) => connector.connector_item_id),
      ]);
      const relatedConnectorIds = new Set(
        relatedConnectors.map((connector) => connector.id),
      );

      setItemsAndSync((current) =>
        current
          .filter((item) => !relatedItemIds.has(item.id))
          .map((item) =>
            item.parent_item_id !== null && relatedItemIds.has(item.parent_item_id)
              ? { ...item, parent_item_id: null }
              : item,
          ),
      );
      setConnectorsAndSync((current) =>
        current.filter((connector) => !relatedConnectorIds.has(connector.id)),
      );

      if (selectedId !== null && relatedItemIds.has(selectedId)) {
        setSelectedId(null);
      }
      if (editingId !== null && relatedItemIds.has(editingId)) {
        setEditingId(null);
      }
      if (arrowDraft !== null && relatedItemIds.has(arrowDraft.fromItemId)) {
        setArrowDraft(null);
      }

      try {
        await deleteBoardItem(itemId);
      } catch (err) {
        console.error('[Canvas] Failed to delete item', err);
      }
    },
    [arrowDraft, editingId, selectedId, setConnectorsAndSync, setItemsAndSync],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        return;
      }

      if (
        (e.key === 'Delete' || e.key === 'Backspace') &&
        selectedId !== null
      ) {
        void handleDeleteItem(selectedId);
      }

      if (e.key === 'Escape') {
        setSelectedId(null);
        setEditingId(null);
        setArrowDraft(null);
        setActiveTool('select');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDeleteItem, selectedId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        return;
      }

      const key = e.key.toLowerCase();
      if (key === 'v') {
        setActiveTool('select');
      }
      if (key === 'x') {
        setActiveTool('text_box');
      }
      if (key === 's') {
        setActiveTool('sticky_note');
      }
      if (key === 'n') {
        setActiveTool('note_paper');
      }
      if (key === 'f') {
        setActiveTool('frame');
      }
      if (key === 'a') {
        setActiveTool('arrow');
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (activeTool !== 'arrow' && arrowDraft !== null) {
      setArrowDraft(null);
    }
  }, [activeTool, arrowDraft]);

  function screenToWorld(screenX: number, screenY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return { x: 0, y: 0 };
    }

    const vp = viewportRef.current;
    return {
      x: (screenX - rect.left - vp.x) / vp.zoom,
      y: (screenY - rect.top - vp.y) / vp.zoom,
    };
  }

  function scheduleViewportSave(nextViewport: Viewport) {
    if (vpSaveTimer.current !== null) {
      clearTimeout(vpSaveTimer.current);
    }

    vpSaveTimer.current = setTimeout(() => {
      void updatePageViewport(page.id, {
        viewport_x: nextViewport.x,
        viewport_y: nextViewport.y,
        zoom: nextViewport.zoom,
      });
    }, VIEWPORT_SAVE_DELAY);
  }

  function persistItems(nextItems: BoardItem[]) {
    if (nextItems.length === 0) {
      return;
    }

    void Promise.all(
      nextItems.map((item) => updateBoardItem(item.id, toPayload(item))),
    ).catch((err) => {
      console.error('[Canvas] Failed to persist items', err);
    });
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = -e.deltaY * 0.001;
    const vp = viewportRef.current;
    const newZoom = Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, vp.zoom * (1 + delta)),
    );
    const scale = newZoom / vp.zoom;
    const nextViewport: Viewport = {
      x: mouseX - scale * (mouseX - vp.x),
      y: mouseY - scale * (mouseY - vp.y),
      zoom: newZoom,
    };

    setViewportAndSync(nextViewport);
    scheduleViewportSave(nextViewport);
  }

  function handleToggleFrameCollapse(frameId: string) {
    const frame = itemsRef.current.find((item) => item.id === frameId);
    if (!frame || frame.type !== ITEM_TYPE.frame) {
      return;
    }

    const updatedFrame = { ...frame, is_collapsed: !frame.is_collapsed };
    setItemsAndSync((current) =>
      current.map((item) => (item.id === frameId ? updatedFrame : item)),
    );

    if (updatedFrame.is_collapsed && selectedItem?.parent_item_id === frameId) {
      setSelectedId(frameId);
      setEditingId(null);
    }

    void updateBoardItem(frameId, toPayload(updatedFrame)).catch((err) => {
      console.error('[Canvas] Failed to toggle frame collapse', err);
    });
  }

  function handleCanvasMouseDown(e: React.MouseEvent) {
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

    if (e.button !== 0) {
      return;
    }

    if (isSpaceRef.current) {
      panRef.current = {
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startVpX: viewportRef.current.x,
        startVpY: viewportRef.current.y,
      };
      return;
    }

    if (activeTool === 'arrow') {
      setSelectedId(null);
      setEditingId(null);
      setArrowDraft(null);
      return;
    }

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

    setSelectedId(null);
    setEditingId(null);
  }

  async function handleCreateItem(params: {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }) {
    const category =
      ITEM_CATEGORY_FOR_TYPE[params.type] ?? ITEM_CATEGORY.small_item;
    const zIndexes = itemsRef.current.map((item) => item.z_index);
    const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;
    const minZ = zIndexes.length > 0 ? Math.min(...zIndexes) : 0;
    const size = clampItemSize(params.type, params.width, params.height);

    const payload: BoardItemPayload = {
      page_id: page.id,
      parent_item_id: null,
      category,
      type: params.type,
      title: params.type === ITEM_TYPE.frame ? 'New Frame' : null,
      content: params.type === ITEM_TYPE.note_paper ? '# Untitled note\n' : '',
      content_format: params.type === ITEM_TYPE.note_paper ? 'markdown' : null,
      x: params.x,
      y: params.y,
      width: size.width,
      height: size.height,
      rotation: 0,
      z_index: params.type === ITEM_TYPE.frame ? minZ - 1 : maxZ + 1,
      is_collapsed: false,
      style_json: null,
      data_json: null,
    };

    try {
      const created = await createBoardItem(payload);
      setItemsAndSync((current) => [...current, created]);
      setSelectedId(created.id);
      setEditingId(isInlineEditable(created) ? created.id : null);
    } catch (err) {
      console.error('[Canvas] Failed to create item', err);
    }
  }

  function syncConnectorAnchorsForItems(changedItemIds: string[]) {
    if (changedItemIds.length === 0) {
      return;
    }

    const changedIdSet = new Set(changedItemIds);
    const connectorUpdates: ConnectorLink[] = [];

    setConnectorsAndSync((current) =>
      current.map((connector) => {
        const touchesChangedItem =
          (connector.from_item_id !== null &&
            changedIdSet.has(connector.from_item_id)) ||
          (connector.to_item_id !== null &&
            changedIdSet.has(connector.to_item_id));

        if (!touchesChangedItem) {
          return connector;
        }

        if (connector.from_item_id === null || connector.to_item_id === null) {
          return connector;
        }

        const fromItem = itemsRef.current.find(
          (item) => item.id === connector.from_item_id,
        );
        const toItem = itemsRef.current.find(
          (item) => item.id === connector.to_item_id,
        );
        if (!fromItem || !toItem) {
          return connector;
        }

        const nextAnchors = getAutoAnchors(fromItem, toItem);
        if (
          connector.from_anchor === nextAnchors.from_anchor &&
          connector.to_anchor === nextAnchors.to_anchor
        ) {
          return connector;
        }

        const updatedConnector = { ...connector, ...nextAnchors };
        connectorUpdates.push(updatedConnector);
        return updatedConnector;
      }),
    );

    if (connectorUpdates.length === 0) {
      return;
    }

    void Promise.all(
      connectorUpdates.map((connector) =>
        updateConnector(connector.id, toConnectorPayload(connector)),
      ),
    ).catch((err) => {
      console.error('[Canvas] Failed to sync connector anchors', err);
    });
  }

  async function handleCreateArrow(fromItemId: string, toItemId: string) {
    if (fromItemId === toItemId) {
      setArrowDraft(null);
      return;
    }

    const fromItem = itemsRef.current.find((item) => item.id === fromItemId);
    const toItem = itemsRef.current.find((item) => item.id === toItemId);
    if (!fromItem || !toItem || !isArrowConnectable(fromItem) || !isArrowConnectable(toItem)) {
      setArrowDraft(null);
      return;
    }

    const anchors = getAutoAnchors(fromItem, toItem);
    const fromPoint = getAnchorPoint(fromItem, anchors.from_anchor);
    const toPoint = getAnchorPoint(toItem, anchors.to_anchor);
    const zIndexes = itemsRef.current.map((item) => item.z_index);
    const maxZ = zIndexes.length > 0 ? Math.max(...zIndexes) : 0;
    let createdArrow: BoardItem | null = null;

    try {
      createdArrow = await createBoardItem({
        page_id: page.id,
        parent_item_id: null,
        category: ITEM_CATEGORY.connector,
        type: ITEM_TYPE.arrow,
        title: null,
        content: null,
        content_format: null,
        x: Math.min(fromPoint.x, toPoint.x) - CONNECTOR_ITEM_PADDING,
        y: Math.min(fromPoint.y, toPoint.y) - CONNECTOR_ITEM_PADDING,
        width: Math.max(
          Math.abs(toPoint.x - fromPoint.x) + CONNECTOR_ITEM_PADDING * 2,
          40,
        ),
        height: Math.max(
          Math.abs(toPoint.y - fromPoint.y) + CONNECTOR_ITEM_PADDING * 2,
          40,
        ),
        rotation: 0,
        z_index: maxZ + 1,
        is_collapsed: false,
        style_json: null,
        data_json: '{"kind":"straight"}',
      });

      const connector = await createConnector({
        connector_item_id: createdArrow.id,
        from_item_id: fromItem.id,
        to_item_id: toItem.id,
        from_anchor: anchors.from_anchor,
        to_anchor: anchors.to_anchor,
      });

      setItemsAndSync((current) => [...current, createdArrow as BoardItem]);
      setConnectorsAndSync((current) => [...current, connector]);
      setSelectedId(createdArrow.id);
      setEditingId(null);
      setActiveTool('select');
    } catch (err) {
      if (createdArrow !== null) {
        void deleteBoardItem(createdArrow.id).catch((cleanupError) => {
          console.error('[Canvas] Failed to cleanup incomplete arrow', cleanupError);
        });
      }
      console.error('[Canvas] Failed to create arrow', err);
    } finally {
      setArrowDraft(null);
    }
  }

  function handleItemMouseDown(e: React.MouseEvent, itemId: string) {
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    e.stopPropagation();

    if (activeTool === 'arrow') {
      if (!isArrowConnectable(item)) {
        return;
      }

      setEditingId(null);
      if (arrowDraft === null) {
        setArrowDraft({ fromItemId: itemId });
        setSelectedId(itemId);
        return;
      }

      void handleCreateArrow(arrowDraft.fromItemId, itemId);
      return;
    }

    if (activeTool !== 'select') {
      return;
    }

    setSelectedId(itemId);
    setEditingId(null);
    dragRef.current = {
      itemId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startItemX: item.x,
      startItemY: item.y,
      childPositions: isFrame(item)
        ? getFrameChildren(itemsRef.current, itemId).map((child) => ({
            id: child.id,
            x: child.x,
            y: child.y,
          }))
        : [],
    };
  }

  function handleArrowMouseDown(
    e: React.MouseEvent<SVGLineElement>,
    itemId: string,
  ) {
    e.stopPropagation();

    if (activeTool !== 'select') {
      return;
    }

    setSelectedId(itemId);
    setEditingId(null);
  }

  function handleResizeMouseDown(e: React.MouseEvent, itemId: string) {
    e.stopPropagation();
    const item = itemsRef.current.find((candidate) => candidate.id === itemId);
    if (!item) {
      return;
    }

    setSelectedId(itemId);
    setEditingId(null);
    resizeRef.current = {
      itemId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startWidth: item.width,
      startHeight: item.height,
    };
  }

  function handleMouseMove(e: React.MouseEvent) {
    const resize = resizeRef.current;
    if (resize) {
      const vp = viewportRef.current;
      const dx = (e.clientX - resize.startMouseX) / vp.zoom;
      const dy = (e.clientY - resize.startMouseY) / vp.zoom;
      setItemsAndSync((current) =>
        current.map((item) => {
          if (item.id !== resize.itemId) {
            return item;
          }

          const nextSize = clampItemSize(
            item.type,
            resize.startWidth + dx,
            resize.startHeight + dy,
          );
          return {
            ...item,
            width: nextSize.width,
            height: nextSize.height,
          };
        }),
      );
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      const vp = viewportRef.current;
      const dx = (e.clientX - drag.startMouseX) / vp.zoom;
      const dy = (e.clientY - drag.startMouseY) / vp.zoom;
      const childStartMap = new Map(
        drag.childPositions.map((child) => [child.id, child] as const),
      );

      setItemsAndSync((current) =>
        current.map((item) => {
          if (item.id === drag.itemId) {
            return {
              ...item,
              x: drag.startItemX + dx,
              y: drag.startItemY + dy,
            };
          }

          const childStart = childStartMap.get(item.id);
          if (childStart) {
            return {
              ...item,
              x: childStart.x + dx,
              y: childStart.y + dy,
            };
          }

          return item;
        }),
      );
      return;
    }

    const pan = panRef.current;
    if (pan) {
      const nextViewport: Viewport = {
        ...viewportRef.current,
        x: pan.startVpX + (e.clientX - pan.startMouseX),
        y: pan.startVpY + (e.clientY - pan.startMouseY),
      };
      setViewportAndSync(nextViewport);
    }
  }

  function handleMouseUp() {
    const resize = resizeRef.current;
    if (resize) {
      resizeRef.current = null;
      const item = itemsRef.current.find(
        (candidate) => candidate.id === resize.itemId,
      );
      if (item) {
        persistItems([item]);
        syncConnectorAnchorsForItems([item.id]);
      }
    }

    const drag = dragRef.current;
    if (drag) {
      dragRef.current = null;
      const draggedItem = itemsRef.current.find(
        (item) => item.id === drag.itemId,
      );
      if (draggedItem) {
        if (isSmallItem(draggedItem)) {
          const nextParent = findContainingFrame(draggedItem, itemsRef.current);
          const updatedItem =
            nextParent?.id !== draggedItem.parent_item_id
              ? { ...draggedItem, parent_item_id: nextParent?.id ?? null }
              : draggedItem;

          if (updatedItem !== draggedItem) {
            setItemsAndSync((current) =>
              current.map((item) =>
                item.id === updatedItem.id ? updatedItem : item,
              ),
            );
          }

          persistItems([updatedItem]);
          syncConnectorAnchorsForItems([updatedItem.id]);
        } else if (isFrame(draggedItem)) {
          const movedItems = [
            draggedItem,
            ...getFrameChildren(itemsRef.current, draggedItem.id),
          ];
          persistItems(movedItems);
          syncConnectorAnchorsForItems(movedItems.map((item) => item.id));
        } else {
          persistItems([draggedItem]);
          syncConnectorAnchorsForItems([draggedItem.id]);
        }
      }
    }

    if (panRef.current) {
      panRef.current = null;
      scheduleViewportSave(viewportRef.current);
    }
  }

  const handleItemUpdate = useCallback(
    (updated: BoardItem) => {
      setItemsAndSync((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );

      if (itemSaveTimer.current !== null) {
        clearTimeout(itemSaveTimer.current);
      }

      itemSaveTimer.current = setTimeout(() => {
        void updateBoardItem(updated.id, toPayload(updated)).catch((err) => {
          console.error('[Canvas] Failed to update item', err);
        });
      }, ITEM_SAVE_DELAY);
    },
    [setItemsAndSync],
  );

  const handleEditEnd = useCallback(() => setEditingId(null), []);

  function handleItemDoubleClick(item: BoardItem) {
    setSelectedId(item.id);
    if (isFrame(item)) {
      handleToggleFrameCollapse(item.id);
      return;
    }

    if (isInlineEditable(item)) {
      setEditingId(item.id);
    }
  }

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
      <div className="canvas-content">
        <div className="canvas-stage">
          <div
            ref={containerRef}
            className={`canvas-container ${cursorClass}`}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <div className="canvas-dot-grid" />

            <div
              className="canvas-world"
              style={{ transform: worldTransform, transformOrigin: '0 0' }}
            >
              {visibleItems.map((item) => {
                if (item.type === ITEM_TYPE.arrow) {
                  const connector = connectorByItemId.get(item.id);
                  const connectorPoints =
                    connector !== undefined
                      ? getConnectorPoints(connector, items)
                      : null;

                  if (!connector || !connectorPoints) {
                    return null;
                  }

                  return (
                    <ArrowConnector
                      key={item.id}
                      item={item}
                      connector={connector}
                      fromPoint={connectorPoints.fromPoint}
                      toPoint={connectorPoints.toPoint}
                      isSelected={item.id === selectedId}
                      onMouseDown={(e) => handleArrowMouseDown(e, item.id)}
                    />
                  );
                }

                const childItems = isFrame(item)
                  ? getFrameChildren(items, item.id)
                  : [];
                return (
                  <BoardItemRenderer
                    key={item.id}
                    item={item}
                    childCount={childItems.length}
                    childSummaries={childItems.map(summarizeFrameChild)}
                    isSelected={item.id === selectedId}
                    isEditing={item.id === editingId}
                    onMouseDown={(e) => handleItemMouseDown(e, item.id)}
                    onDoubleClick={() => handleItemDoubleClick(item)}
                    onResizeMouseDown={(e) => handleResizeMouseDown(e, item.id)}
                    onToggleCollapse={() => handleToggleFrameCollapse(item.id)}
                    onUpdate={handleItemUpdate}
                    onEditEnd={handleEditEnd}
                  />
                );
              })}
            </div>

            {items.length === 0 ? (
              <div className="canvas-empty-hint">
                <p>
                  用工具列新增文字框、便利貼、筆記紙、frame 或箭頭，滑鼠滾輪縮放，按住空白鍵拖曳平移。
                </p>
              </div>
            ) : null}

            {activeTool === 'arrow' ? (
              <div className="canvas-guide-badge">
                {arrowDraft === null
                  ? '箭頭工具：先點選起點物件'
                  : '箭頭工具：再點選終點物件完成連線'}
              </div>
            ) : null}

            <div className="canvas-status-badge">
              {Math.round(viewport.zoom * 100)}%
            </div>
          </div>
        </div>

        <Inspector
          item={selectedItem}
          connector={selectedConnector}
          childCount={selectedChildCount}
          onUpdate={handleItemUpdate}
          onDelete={() => {
            if (selectedItem !== null) {
              void handleDeleteItem(selectedItem.id);
            }
          }}
          onToggleCollapse={() => {
            if (selectedItem?.type === ITEM_TYPE.frame) {
              handleToggleFrameCollapse(selectedItem.id);
            }
          }}
        />
      </div>
    </div>
  );
}
