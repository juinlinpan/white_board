import type { Page } from './api';

type ResolveProjectEntryPageIdArgs = {
  preferredPageId: string | null;
  targetProjectId: string;
  selectedProjectId: string | null;
  selectedPageId: string | null;
  pages: Page[];
};

export function resolveProjectEntryPageId({
  preferredPageId,
  targetProjectId,
  selectedProjectId,
  selectedPageId,
  pages,
}: ResolveProjectEntryPageIdArgs): string | null {
  if (preferredPageId !== null) {
    return preferredPageId;
  }

  if (targetProjectId !== selectedProjectId) {
    return null;
  }

  return selectedPageId ?? pages[0]?.id ?? null;
}
