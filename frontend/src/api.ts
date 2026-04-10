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

export { apiBaseUrl };
