import { type BoardItem, type ConnectorLink, type PageBoardData } from './api';

type JsonObject = Record<string, unknown>;

type ExportedPageSnapshot = {
  version: 1;
  kind: 'whiteboard-page';
  page: {
    name: string;
    viewport: {
      x: number;
      y: number;
      zoom: number;
    };
    board_items: Omit<BoardItem, 'page_id' | 'created_at' | 'updated_at'>[];
    item_hierarchy: {
      roots: ItemHierarchyNode[];
    };
    connector_links: Omit<ConnectorLink, 'id'>[];
  };
};

type ItemHierarchyNode = {
  id: string;
  children: ItemHierarchyNode[];
};

type MergeImportedPageOptions = {
  now?: string;
  createId?: () => string;
};

function createLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function ensureObject(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as JsonObject;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  return value;
}

function readNullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string or null.`);
  }

  return value;
}

function readNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function readArray<T>(
  value: unknown,
  label: string,
  mapper: (entry: unknown, index: number) => T,
): T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((entry, index) => mapper(entry, index));
}

function remapSegmentConnectionIds(
  dataJson: string | null,
  idMap: ReadonlyMap<string, string>,
): string | null {
  if (dataJson === null || dataJson.trim().length === 0) {
    return dataJson;
  }

  try {
    const payload = ensureObject(JSON.parse(dataJson), 'segment data');
    if (payload.kind !== 'segment') {
      return dataJson;
    }

    for (const key of ['startConnection', 'endConnection'] as const) {
      const candidate = payload[key];
      if (candidate === undefined || candidate === null) {
        continue;
      }

      const connection = ensureObject(candidate, `segment ${key}`);
      const itemId = readString(connection.itemId, `segment ${key}.itemId`);
      const remappedId = idMap.get(itemId);
      if (remappedId !== undefined) {
        connection.itemId = remappedId;
      }
    }

    return JSON.stringify(payload);
  } catch {
    return dataJson;
  }
}

function parseSnapshotBoardItem(value: unknown, index: number) {
  const label = `page.board_items[${index}]`;
  const item = ensureObject(value, label);

  return {
    id: readString(item.id, `${label}.id`),
    parent_item_id: readNullableString(item.parent_item_id, `${label}.parent_item_id`),
    category: readString(item.category, `${label}.category`),
    type: readString(item.type, `${label}.type`),
    title: readNullableString(item.title, `${label}.title`),
    content: readNullableString(item.content, `${label}.content`),
    content_format: readNullableString(item.content_format, `${label}.content_format`),
    x: readNumber(item.x, `${label}.x`),
    y: readNumber(item.y, `${label}.y`),
    width: readNumber(item.width, `${label}.width`),
    height: readNumber(item.height, `${label}.height`),
    rotation: readNumber(item.rotation, `${label}.rotation`),
    z_index: readNumber(item.z_index, `${label}.z_index`),
    is_collapsed: readBoolean(item.is_collapsed, `${label}.is_collapsed`),
    style_json: readNullableString(item.style_json, `${label}.style_json`),
    data_json: readNullableString(item.data_json, `${label}.data_json`),
  };
}

function parseSnapshotConnector(value: unknown, index: number) {
  const label = `page.connector_links[${index}]`;
  const connector = ensureObject(value, label);

  return {
    connector_item_id: readString(connector.connector_item_id, `${label}.connector_item_id`),
    from_item_id: readNullableString(connector.from_item_id, `${label}.from_item_id`),
    to_item_id: readNullableString(connector.to_item_id, `${label}.to_item_id`),
    from_anchor: readNullableString(connector.from_anchor, `${label}.from_anchor`),
    to_anchor: readNullableString(connector.to_anchor, `${label}.to_anchor`),
  };
}

function buildItemHierarchy(items: ReadonlyArray<{ id: string; parent_item_id: string | null }>): ItemHierarchyNode[] {
  const childrenByParent = new Map<string, ItemHierarchyNode[]>();
  for (const item of items) {
    childrenByParent.set(item.id, []);
  }

  const roots: ItemHierarchyNode[] = [];
  for (const item of items) {
    const node: ItemHierarchyNode = {
      id: item.id,
      children: childrenByParent.get(item.id) ?? [],
    };

    if (item.parent_item_id === null) {
      roots.push(node);
      continue;
    }

    const siblings = childrenByParent.get(item.parent_item_id);
    if (siblings === undefined) {
      roots.push(node);
      continue;
    }

    siblings.push(node);
  }

  return roots;
}

function parseHierarchyNode(value: unknown, label: string): ItemHierarchyNode {
  const node = ensureObject(value, label);
  return {
    id: readString(node.id, `${label}.id`),
    children: readArray(node.children, `${label}.children`, (entry, index) =>
      parseHierarchyNode(entry, `${label}.children[${index}]`),
    ),
  };
}

function validateHierarchy(
  items: ReadonlyArray<{ id: string; parent_item_id: string | null }>,
  roots: ItemHierarchyNode[],
): void {
  const parentByItemId = new Map(items.map((item) => [item.id, item.parent_item_id]));
  const visited = new Set<string>();
  const walk = (node: ItemHierarchyNode, expectedParent: string | null) => {
    const actualParent = parentByItemId.get(node.id);
    if (actualParent === undefined) {
      throw new Error(`item_hierarchy references missing board item "${node.id}".`);
    }

    if (actualParent !== expectedParent) {
      throw new Error(
        `item_hierarchy parent mismatch for "${node.id}". Expected "${actualParent ?? 'null'}".`,
      );
    }

    if (visited.has(node.id)) {
      throw new Error(`item_hierarchy contains duplicate item "${node.id}".`);
    }
    visited.add(node.id);

    node.children.forEach((child) => walk(child, node.id));
  };

  roots.forEach((root) => walk(root, null));

  if (visited.size !== items.length) {
    throw new Error('item_hierarchy must cover all board items.');
  }
}

export function buildPageExportSnapshot(boardData: PageBoardData): string {
  const boardItems = boardData.board_items.map((item) => ({
    id: item.id,
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
  }));
  const connectorLinks = boardData.connector_links.map((connector) => ({
    connector_item_id: connector.connector_item_id,
    from_item_id: connector.from_item_id,
    to_item_id: connector.to_item_id,
    from_anchor: connector.from_anchor,
    to_anchor: connector.to_anchor,
  }));

  const payload: ExportedPageSnapshot = {
    version: 1,
    kind: 'whiteboard-page',
    page: {
      name: boardData.page.name,
      viewport: {
        x: boardData.page.viewport_x,
        y: boardData.page.viewport_y,
        zoom: boardData.page.zoom,
      },
      board_items: boardItems,
      item_hierarchy: {
        roots: buildItemHierarchy(boardItems),
      },
      connector_links: connectorLinks,
    },
  };

  return JSON.stringify(payload, null, 2);
}

export function parsePageImportText(text: string): ExportedPageSnapshot['page'] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON file.');
  }

  const root = ensureObject(parsed, 'import file');
  const kind = root.kind;
  const version = root.version;
  if (kind !== 'whiteboard-page' || version !== 1) {
    throw new Error('Unsupported page import file. Expected kind "whiteboard-page" version 1.');
  }

  const page = ensureObject(root.page, 'import file.page');
  const viewport = ensureObject(page.viewport, 'import file.page.viewport');
  const boardItems = readArray(
    page.board_items,
    'import file.page.board_items',
    parseSnapshotBoardItem,
  );
  const hierarchyRoots = (() => {
    const candidate = page.item_hierarchy;
    if (candidate === undefined) {
      return buildItemHierarchy(boardItems);
    }

    const hierarchy = ensureObject(candidate, 'import file.page.item_hierarchy');
    return readArray(
      hierarchy.roots,
      'import file.page.item_hierarchy.roots',
      (entry, index) =>
        parseHierarchyNode(entry, `import file.page.item_hierarchy.roots[${index}]`),
    );
  })();
  validateHierarchy(boardItems, hierarchyRoots);

  return {
    name: readString(page.name, 'import file.page.name'),
    viewport: {
      x: readNumber(viewport.x, 'import file.page.viewport.x'),
      y: readNumber(viewport.y, 'import file.page.viewport.y'),
      zoom: readNumber(viewport.zoom, 'import file.page.viewport.zoom'),
    },
    board_items: boardItems,
    item_hierarchy: { roots: hierarchyRoots },
    connector_links: readArray(
      page.connector_links,
      'import file.page.connector_links',
      parseSnapshotConnector,
    ),
  };
}

export function mergeImportedPageBoardState(
  pageId: string,
  current: Pick<PageBoardData, 'board_items' | 'connector_links'>,
  importedPage: ReturnType<typeof parsePageImportText>,
  options: MergeImportedPageOptions = {},
): Pick<PageBoardData, 'board_items' | 'connector_links'> {
  const createId = options.createId ?? createLocalId;
  const now = options.now ?? new Date().toISOString();
  const itemIdMap = new Map(
    importedPage.board_items.map((item) => [item.id, createId()]),
  );

  const importedBoardItems: BoardItem[] = importedPage.board_items.map((item) => {
    const nextId = itemIdMap.get(item.id);
    if (nextId === undefined) {
      throw new Error(`Missing mapped id for imported item ${item.id}.`);
    }

    const remappedParentId =
      item.parent_item_id === null ? null : itemIdMap.get(item.parent_item_id) ?? null;

    return {
      id: nextId,
      page_id: pageId,
      parent_item_id: remappedParentId,
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
      data_json: remapSegmentConnectionIds(item.data_json, itemIdMap),
      created_at: now,
      updated_at: now,
    };
  });

  const importedConnectors: ConnectorLink[] = importedPage.connector_links.map((connector) => ({
    id: createId(),
    connector_item_id: itemIdMap.get(connector.connector_item_id) ?? connector.connector_item_id,
    from_item_id:
      connector.from_item_id === null
        ? null
        : itemIdMap.get(connector.from_item_id) ?? connector.from_item_id,
    to_item_id:
      connector.to_item_id === null
        ? null
        : itemIdMap.get(connector.to_item_id) ?? connector.to_item_id,
    from_anchor: connector.from_anchor,
    to_anchor: connector.to_anchor,
  }));

  return {
    board_items: [...current.board_items, ...importedBoardItems],
    connector_links: [...current.connector_links, ...importedConnectors],
  };
}
