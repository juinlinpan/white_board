import {
  createPage,
  createProject,
  deleteProject,
  replacePageBoardState,
  updatePageViewport,
  type BoardItem,
  type ConnectorLink,
  type Project,
} from './api';

type JsonObject = Record<string, unknown>;

export type ImportedBoardItem = {
  id: string;
  parent_item_id: string | null;
  category: string;
  type: string;
  title: string | null;
  content: string | null;
  content_format: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  z_index: number;
  is_collapsed: boolean;
  style_json: string | null;
  data_json: string | null;
};

export type ImportedConnectorLink = {
  connector_item_id: string;
  from_item_id: string | null;
  to_item_id: string | null;
  from_anchor: string | null;
  to_anchor: string | null;
};

export type ImportedPage = {
  name: string;
  viewport_x: number;
  viewport_y: number;
  zoom: number;
  board_items: ImportedBoardItem[];
  connector_links: ImportedConnectorLink[];
};

export type ImportedProjectSnapshot = {
  version: 1;
  name: string;
  pages: ImportedPage[];
};

export type ImportProjectResult = {
  project: Project;
  firstPageId: string | null;
};

type PrepareImportedPageOptions = {
  now?: string;
  createId?: () => string;
};

type StringReadOptions = {
  trim?: boolean;
};

function ensureObject(value: unknown, label: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value as JsonObject;
}

function readRequiredString(
  value: unknown,
  label: string,
  options: StringReadOptions = {},
): string {
  const trim = options.trim ?? true;
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  const nextValue = trim ? value.trim() : value;
  if (nextValue.length === 0) {
    throw new Error(`${label} cannot be blank.`);
  }

  return nextValue;
}

function readOptionalString(
  value: unknown,
  label: string,
  options: StringReadOptions = {},
): string | null {
  const trim = options.trim ?? false;
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string or null.`);
  }

  const nextValue = trim ? value.trim() : value;
  return trim && nextValue.length === 0 ? null : nextValue;
}

function readNumber(
  value: unknown,
  label: string,
  fallback?: number,
): number {
  if (value === undefined) {
    if (fallback !== undefined) {
      return fallback;
    }

    throw new Error(`${label} must be a number.`);
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }

  return value;
}

function readInteger(
  value: unknown,
  label: string,
  fallback?: number,
): number {
  const nextValue = readNumber(value, label, fallback);
  if (!Number.isInteger(nextValue)) {
    throw new Error(`${label} must be an integer.`);
  }

  return nextValue;
}

function readBoolean(
  value: unknown,
  label: string,
  fallback = false,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function readArray<T>(
  value: unknown,
  label: string,
  mapItem: (item: unknown, index: number) => T,
): T[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }

  return value.map((item, index) => mapItem(item, index));
}

function getSegmentConnectionIds(dataJson: string | null): string[] {
  if (dataJson === null || dataJson.trim().length === 0) {
    return [];
  }

  try {
    const parsed = ensureObject(JSON.parse(dataJson), 'segment data');
    if (parsed.kind !== 'segment') {
      return [];
    }

    const ids: string[] = [];
    for (const key of ['startConnection', 'endConnection'] as const) {
      const candidate = parsed[key];
      if (candidate === undefined || candidate === null) {
        continue;
      }

      const connection = ensureObject(candidate, `segment ${key}`);
      ids.push(readRequiredString(connection.itemId, `segment ${key}.itemId`));
    }

    return ids;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`segment data_json is invalid: ${error.message}`);
    }

    throw error;
  }
}

function parseImportedBoardItem(
  value: unknown,
  pageLabel: string,
  index: number,
): ImportedBoardItem {
  const label = `${pageLabel}.board_items[${index}]`;
  const item = ensureObject(value, label);

  return {
    id: readRequiredString(item.id, `${label}.id`),
    parent_item_id: readOptionalString(
      item.parent_item_id,
      `${label}.parent_item_id`,
      { trim: true },
    ),
    category: readRequiredString(item.category, `${label}.category`),
    type: readRequiredString(item.type, `${label}.type`),
    title: readOptionalString(item.title, `${label}.title`),
    content: readOptionalString(item.content, `${label}.content`),
    content_format: readOptionalString(
      item.content_format,
      `${label}.content_format`,
    ),
    x: readNumber(item.x, `${label}.x`),
    y: readNumber(item.y, `${label}.y`),
    width: readNumber(item.width, `${label}.width`),
    height: readNumber(item.height, `${label}.height`),
    rotation: readNumber(item.rotation, `${label}.rotation`, 0),
    z_index: readInteger(item.z_index, `${label}.z_index`, index),
    is_collapsed: readBoolean(
      item.is_collapsed,
      `${label}.is_collapsed`,
      false,
    ),
    style_json: readOptionalString(item.style_json, `${label}.style_json`),
    data_json: readOptionalString(item.data_json, `${label}.data_json`),
  };
}

function parseImportedConnectorLink(
  value: unknown,
  pageLabel: string,
  index: number,
): ImportedConnectorLink {
  const label = `${pageLabel}.connector_links[${index}]`;
  const connector = ensureObject(value, label);

  return {
    connector_item_id: readRequiredString(
      connector.connector_item_id,
      `${label}.connector_item_id`,
    ),
    from_item_id: readOptionalString(
      connector.from_item_id,
      `${label}.from_item_id`,
      { trim: true },
    ),
    to_item_id: readOptionalString(
      connector.to_item_id,
      `${label}.to_item_id`,
      { trim: true },
    ),
    from_anchor: readOptionalString(
      connector.from_anchor,
      `${label}.from_anchor`,
      { trim: true },
    ),
    to_anchor: readOptionalString(connector.to_anchor, `${label}.to_anchor`, {
      trim: true,
    }),
  };
}

function parseImportedPage(value: unknown, index: number): ImportedPage {
  const label = `pages[${index}]`;
  const page = ensureObject(value, label);
  const viewport =
    page.viewport === undefined
      ? page
      : ensureObject(page.viewport, `${label}.viewport`);

  const parsedPage: ImportedPage = {
    name: readRequiredString(page.name, `${label}.name`),
    viewport_x: readNumber(
      viewport.viewport_x ?? viewport.x,
      `${label}.viewport_x`,
      0,
    ),
    viewport_y: readNumber(
      viewport.viewport_y ?? viewport.y,
      `${label}.viewport_y`,
      0,
    ),
    zoom: readNumber(viewport.zoom, `${label}.zoom`, 1),
    board_items: readArray(page.board_items, `${label}.board_items`, (item, itemIndex) =>
      parseImportedBoardItem(item, label, itemIndex),
    ),
    connector_links: readArray(
      page.connector_links,
      `${label}.connector_links`,
      (connector, connectorIndex) =>
        parseImportedConnectorLink(connector, label, connectorIndex),
    ),
  };

  validateImportedPage(parsedPage, label);
  return parsedPage;
}

function validateImportedPage(page: ImportedPage, label: string): void {
  const itemIds = new Set<string>();
  for (const item of page.board_items) {
    if (itemIds.has(item.id)) {
      throw new Error(`${label} contains duplicate board item id "${item.id}".`);
    }

    itemIds.add(item.id);
  }

  for (const item of page.board_items) {
    if (
      item.parent_item_id !== null &&
      !itemIds.has(item.parent_item_id)
    ) {
      throw new Error(
        `${label} item "${item.id}" references missing parent "${item.parent_item_id}".`,
      );
    }

    for (const linkedItemId of getSegmentConnectionIds(item.data_json)) {
      if (!itemIds.has(linkedItemId)) {
        throw new Error(
          `${label} item "${item.id}" segment data references missing item "${linkedItemId}".`,
        );
      }
    }
  }

  page.connector_links.forEach((connector, index) => {
    for (const [field, itemId] of [
      ['connector_item_id', connector.connector_item_id],
      ['from_item_id', connector.from_item_id],
      ['to_item_id', connector.to_item_id],
    ] as const) {
      if (itemId !== null && !itemIds.has(itemId)) {
        throw new Error(
          `${label}.connector_links[${index}].${field} references missing item "${itemId}".`,
        );
      }
    }
  });
}

function remapSegmentDataJson(
  dataJson: string | null,
  itemIdMap: Map<string, string>,
): string | null {
  if (dataJson === null || dataJson.trim().length === 0) {
    return dataJson;
  }

  let parsed: JsonObject;
  try {
    parsed = ensureObject(JSON.parse(dataJson), 'segment data');
  } catch {
    return dataJson;
  }

  if (parsed.kind !== 'segment') {
    return dataJson;
  }

  let changed = false;
  for (const key of ['startConnection', 'endConnection'] as const) {
    const connection = parsed[key];
    if (typeof connection !== 'object' || connection === null) {
      continue;
    }

    const nextConnection = { ...(connection as JsonObject) };
    const currentItemId = nextConnection.itemId;
    if (typeof currentItemId !== 'string' || currentItemId.trim().length === 0) {
      continue;
    }

    const remappedItemId = itemIdMap.get(currentItemId.trim());
    if (remappedItemId === undefined) {
      throw new Error(
        `Segment connection references missing board item "${currentItemId}".`,
      );
    }

    nextConnection.itemId = remappedItemId;
    parsed[key] = nextConnection;
    changed = true;
  }

  return changed ? JSON.stringify(parsed) : dataJson;
}

function remapRequiredItemId(
  itemIdMap: Map<string, string>,
  itemId: string,
  label: string,
): string {
  const remappedItemId = itemIdMap.get(itemId);
  if (remappedItemId === undefined) {
    throw new Error(`${label} references missing board item "${itemId}".`);
  }

  return remappedItemId;
}

export function parseProjectImportText(
  rawText: string,
): ImportedProjectSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Import file is not valid JSON: ${error.message}`);
    }

    throw new Error('Import file is not valid JSON.');
  }

  const root = ensureObject(parsed, 'import file');
  const payload =
    root.project === undefined
      ? root
      : ensureObject(root.project, 'import file.project');
  const versionValue = root.version ?? payload.version ?? 1;
  if (versionValue !== 1) {
    const printableVersion =
      typeof versionValue === 'string' ||
      typeof versionValue === 'number' ||
      typeof versionValue === 'boolean'
        ? String(versionValue)
        : 'non-scalar';
    throw new Error(
      `Unsupported import format version "${printableVersion}".`,
    );
  }

  return {
    version: 1,
    name: readRequiredString(payload.name, 'project.name'),
    pages: readArray(payload.pages, 'project.pages', parseImportedPage),
  };
}

export function prepareImportedPageBoardState(
  pageId: string,
  importedPage: ImportedPage,
  options: PrepareImportedPageOptions = {},
): Pick<{ board_items: BoardItem[]; connector_links: ConnectorLink[] }, 'board_items' | 'connector_links'> {
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? new Date().toISOString();
  const itemIdMap = new Map(
    importedPage.board_items.map((item) => [item.id, createId()]),
  );

  const board_items: BoardItem[] = importedPage.board_items.map((item) => ({
    id: remapRequiredItemId(itemIdMap, item.id, 'board item'),
    page_id: pageId,
    parent_item_id:
      item.parent_item_id === null
        ? null
        : remapRequiredItemId(
            itemIdMap,
            item.parent_item_id,
            `board item "${item.id}" parent_item_id`,
          ),
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
    data_json: remapSegmentDataJson(item.data_json, itemIdMap),
    created_at: now,
    updated_at: now,
  }));

  const connector_links: ConnectorLink[] = importedPage.connector_links.map(
    (connector, index) => ({
      id: createId(),
      connector_item_id: remapRequiredItemId(
        itemIdMap,
        connector.connector_item_id,
        `connector_links[${index}].connector_item_id`,
      ),
      from_item_id:
        connector.from_item_id === null
          ? null
          : remapRequiredItemId(
              itemIdMap,
              connector.from_item_id,
              `connector_links[${index}].from_item_id`,
            ),
      to_item_id:
        connector.to_item_id === null
          ? null
          : remapRequiredItemId(
              itemIdMap,
              connector.to_item_id,
              `connector_links[${index}].to_item_id`,
            ),
      from_anchor: connector.from_anchor,
      to_anchor: connector.to_anchor,
    }),
  );

  return { board_items, connector_links };
}

export async function importProjectSnapshot(
  snapshot: ImportedProjectSnapshot,
): Promise<ImportProjectResult> {
  let project: Project | null = null;
  let firstPageId: string | null = null;

  try {
    project = await createProject(snapshot.name);

    for (const importedPage of snapshot.pages) {
      const page = await createPage(project.id, importedPage.name);
      if (firstPageId === null) {
        firstPageId = page.id;
      }

      await updatePageViewport(page.id, {
        viewport_x: importedPage.viewport_x,
        viewport_y: importedPage.viewport_y,
        zoom: importedPage.zoom,
      });

      const boardState = prepareImportedPageBoardState(page.id, importedPage);
      await replacePageBoardState(page.id, boardState);
    }

    return { project, firstPageId };
  } catch (error) {
    if (project !== null) {
      try {
        await deleteProject(project.id);
      } catch {
        // Cleanup failure should not hide the original import error.
      }
    }

    throw error;
  }
}
