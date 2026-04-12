export type AppRoute =
  | {
      view: 'home';
    }
  | {
      view: 'workspace';
      projectId: string;
      pageId: string | null;
    };

function normalizeId(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function readAppRoute(search: string): AppRoute {
  const searchParams = new URLSearchParams(search);
  const projectId = normalizeId(searchParams.get('project'));

  if (projectId === null) {
    return { view: 'home' };
  }

  return {
    view: 'workspace',
    projectId,
    pageId: normalizeId(searchParams.get('page')),
  };
}

export function buildAppRouteUrl(route: AppRoute): string {
  if (route.view === 'home') {
    return '/';
  }

  const searchParams = new URLSearchParams({
    project: route.projectId,
  });

  if (route.pageId !== null) {
    searchParams.set('page', route.pageId);
  }

  return `/?${searchParams.toString()}`;
}
