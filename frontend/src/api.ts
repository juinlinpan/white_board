const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:18000';

export type HealthResponse = {
  service: string;
  status: string;
};

export type Project = {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type Page = {
  id: string;
  project_id: string;
  name: string;
  sort_order: number;
  viewport_x: number;
  viewport_y: number;
  zoom: number;
  created_at: string;
  updated_at: string;
};

type ListResponse<T> = {
  items: T[];
};

type ErrorResponse = {
  detail?: string;
};

type RequestOptions = RequestInit & {
  signal?: AbortSignal;
};

async function parseError(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as ErrorResponse;
    if (typeof payload.detail === 'string' && payload.detail.length > 0) {
      return payload.detail;
    }
  }

  return `Request failed with status ${response.status}`;
}

async function requestJson<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  return (await response.json()) as T;
}

async function requestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const response = await fetch(`${apiBaseUrl}${path}`, options);

  if (!response.ok) {
    throw new Error(await parseError(response));
  }
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/healthz', { signal });
}

export async function listProjects(signal?: AbortSignal): Promise<Project[]> {
  const payload = await requestJson<ListResponse<Project>>('/projects', { signal });
  return payload.items;
}

export async function createProject(name: string): Promise<Project> {
  return requestJson<Project>('/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function updateProject(id: string, name: string): Promise<Project> {
  return requestJson<Project>(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await requestVoid(`/projects/${id}`, { method: 'DELETE' });
}

export async function listPages(
  projectId: string,
  signal?: AbortSignal,
): Promise<Page[]> {
  const payload = await requestJson<ListResponse<Page>>(
    `/projects/${projectId}/pages`,
    { signal },
  );
  return payload.items;
}

export async function createPage(projectId: string, name: string): Promise<Page> {
  return requestJson<Page>(`/projects/${projectId}/pages`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function updatePage(id: string, name: string): Promise<Page> {
  return requestJson<Page>(`/pages/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function deletePage(id: string): Promise<void> {
  await requestVoid(`/pages/${id}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────────
// BoardItem types & API
// ──────────────────────────────────────────────

export type BoardItem = {
  id: string;
  page_id: string;
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
  created_at: string;
  updated_at: string;
};

export type BoardItemPayload = Omit<BoardItem, 'id' | 'created_at' | 'updated_at'>;

export type PageBoardData = {
  page: Page;
  board_items: BoardItem[];
  connector_links: unknown[];
};

export async function getPageBoardData(
  pageId: string,
  signal?: AbortSignal,
): Promise<PageBoardData> {
  return requestJson<PageBoardData>(`/pages/${pageId}/board-data`, { signal });
}

// Backend: POST /board-items（page_id in body）
export async function createBoardItem(payload: BoardItemPayload): Promise<BoardItem> {
  return requestJson<BoardItem>('/board-items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Backend: PATCH /board-items/{id}（full payload）
export async function updateBoardItem(
  id: string,
  payload: BoardItemPayload,
): Promise<BoardItem> {
  return requestJson<BoardItem>(`/board-items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteBoardItem(id: string): Promise<void> {
  await requestVoid(`/board-items/${id}`, { method: 'DELETE' });
}

// ──────────────────────────────────────────────
// Viewport sync
// ──────────────────────────────────────────────

export async function updatePageViewport(
  pageId: string,
  viewport: { viewport_x: number; viewport_y: number; zoom: number },
): Promise<Page> {
  return requestJson<Page>(`/pages/${pageId}/viewport`, {
    method: 'PATCH',
    body: JSON.stringify(viewport),
  });
}

export { apiBaseUrl };
