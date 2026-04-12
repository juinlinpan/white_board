import { describe, expect, it } from 'vitest';

import { buildAppRouteUrl, readAppRoute } from './appRoute';

describe('appRoute', () => {
  it('reads the home route when no project is present', () => {
    expect(readAppRoute('')).toEqual({ view: 'home' });
    expect(readAppRoute('?page=page-1')).toEqual({ view: 'home' });
  });

  it('reads a workspace route from search params', () => {
    expect(readAppRoute('?project=project-1&page=page-2')).toEqual({
      view: 'workspace',
      projectId: 'project-1',
      pageId: 'page-2',
    });
  });

  it('builds the home url', () => {
    expect(buildAppRouteUrl({ view: 'home' })).toBe('/');
  });

  it('builds the workspace url with an optional page id', () => {
    expect(
      buildAppRouteUrl({
        view: 'workspace',
        projectId: 'project-1',
        pageId: null,
      }),
    ).toBe('/?project=project-1');

    expect(
      buildAppRouteUrl({
        view: 'workspace',
        projectId: 'project-1',
        pageId: 'page-2',
      }),
    ).toBe('/?project=project-1&page=page-2');
  });
});
