import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
} from 'react';
import {
  createPage,
  createProject,
  deletePage,
  deleteProject,
  getPageBoardData,
  getHealth,
  listPages,
  listProjects,
  replacePageBoardState,
  reorderPages,
  updatePage,
  updateProject,
  type BoardItem,
  type ConnectorLink,
  type Page,
  type PageBoardData,
  type Project,
  type ProjectThemeColor,
} from './api';
import { Canvas } from './Canvas';
import { HomeView } from './HomeView';
import { syncPageViewport } from './pageViewport';
import {
  importProjectSnapshot,
  parseProjectImportText,
} from './projectImport';
import {
  buildPageExportSnapshot,
  mergeImportedPageBoardState,
  parsePageImportText,
} from './pageTransfer';
import { buildAppRouteUrl, readAppRoute, type AppRoute } from './appRoute';
import { resolveProjectEntryPageId } from './workspaceNavigation';

type AppView = 'home' | 'workspace';
type LoadState = 'loading' | 'ready' | 'error';
type SidebarListKind = 'pages';
type DropPosition = 'before' | 'after';
type SidebarDragState = {
  kind: SidebarListKind;
  itemId: string;
};
type SidebarDropState = SidebarDragState & {
  position: DropPosition;
};

const SIDEBAR_COLLAPSED_STORAGE_KEY =
  'whiteboard.workspaceSidebarCollapsed';

const PROJECT_THEME_OPTIONS: Array<{
  value: ProjectThemeColor;
  label: string;
}> = [
  { value: 'default', label: 'Default' },
  { value: 'sage', label: 'Sage' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'ocean', label: 'Ocean' },
];

function IconSettings() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.8 1.8 0 0 1-3.6 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.8 1.8 0 0 1 0-3.6h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a1.8 1.8 0 0 1 3.6 0v.2a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a1.8 1.8 0 0 1 0 3.6h-.2a1 1 0 0 0-.9.6Z" />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L8 20l-5 1 1-5Z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M9 3h6l1 2H8l1-2Z" />
      <path d="M7 7v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V7" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  );
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<{
    createWritable: () => Promise<{
      write: (data: Blob | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

function sanitizeExportName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized.length > 0 ? normalized : 'page';
}

async function savePageSnapshotWithPicker(
  payload: string,
  suggestedName: string,
): Promise<void> {
  const pickerWindow = window as SaveFilePickerWindow;
  if (pickerWindow.showSaveFilePicker === undefined) {
    throw new Error('目前瀏覽器不支援「選擇儲存位置」匯出，請改用支援 File System Access API 的瀏覽器。');
  }

  let fileHandle: Awaited<
    ReturnType<NonNullable<SaveFilePickerWindow['showSaveFilePicker']>>
  >;
  try {
    fileHandle = await pickerWindow.showSaveFilePicker({
      suggestedName,
      types: [
        {
          description: 'Whiteboard JSON',
          accept: {
            'application/json': ['.json'],
          },
        },
      ],
    });
  } catch (error) {
    if (isUserCancelledFilePickerError(error)) {
      return;
    }

    throw error;
  }

  const writable = await fileHandle.createWritable();
  await writable.write(payload);
  await writable.close();
}

function buildProjectExportSnapshot(
  project: Project,
  boardDataByPage: PageBoardData[],
): string {
  const payload = {
    version: 1,
    kind: 'whiteboard-project',
    project: {
      name: project.name,
      theme_color: project.theme_color,
      pages: boardDataByPage.map((boardData) => ({
        name: boardData.page.name,
        viewport: {
          x: boardData.page.viewport_x,
          y: boardData.page.viewport_y,
          zoom: boardData.page.zoom,
        },
        board_items: boardData.board_items.map(
          ({ page_id, created_at, updated_at, ...item }: BoardItem) => item,
        ),
        connector_links: boardData.connector_links.map(
          ({ id, ...connector }: ConnectorLink) => connector,
        ),
      })),
    },
  };

  return JSON.stringify(payload, null, 2);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return 'Unknown error';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function isUserCancelledFilePickerError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  if (error instanceof Error) {
    const normalizedMessage = error.message.toLowerCase();
    return (
      normalizedMessage.includes('user aborted') ||
      normalizedMessage.includes('aborted a request')
    );
  }

  return false;
}

function askForName(label: string, initialValue: string): string | null {
  const value = window.prompt(label, initialValue);
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function buildUntitledPageName(pages: Page[]): string {
  const takenNumbers = new Set<number>();

  for (const page of pages) {
    const matched = page.name.trim().match(/^untitled_(\d+)$/i);
    if (matched === null) {
      continue;
    }

    const parsed = Number.parseInt(matched[1], 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      takenNumbers.add(parsed);
    }
  }

  let candidate = 1;
  while (takenNumbers.has(candidate)) {
    candidate += 1;
  }

  return `untitled_${candidate}`;
}

function selectFallbackId<T extends { id: string }>(
  items: T[],
  preferredId: string | null,
): string | null {
  if (preferredId !== null && items.some((item) => item.id === preferredId)) {
    return preferredId;
  }

  return items[0]?.id ?? null;
}

function buildDraggedOrder<T extends { id: string }>(
  items: T[],
  draggedId: string,
  targetId: string,
  position: DropPosition,
): string[] | null {
  const orderedIds = items.map((item) => item.id);
  const draggedIndex = orderedIds.indexOf(draggedId);
  const targetIndex = orderedIds.indexOf(targetId);
  if (draggedIndex === -1 || targetIndex === -1) {
    return null;
  }

  const [movedId] = orderedIds.splice(draggedIndex, 1);
  if (movedId === undefined) {
    return null;
  }

  const insertionIndex = orderedIds.indexOf(targetId);
  if (insertionIndex === -1) {
    return null;
  }

  orderedIds.splice(
    position === 'after' ? insertionIndex + 1 : insertionIndex,
    0,
    movedId,
  );

  return orderedIds.every((id, index) => id === items[index]?.id)
    ? null
    : orderedIds;
}

function reorderItemsByIds<T extends { id: string }>(
  items: T[],
  orderedIds: string[],
): T[] {
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  return [...items].sort((left, right) => {
    const leftPosition = positions.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightPosition = positions.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftPosition - rightPosition;
  });
}

function getDropPosition(event: ReactDragEvent<HTMLElement>): DropPosition {
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientY - bounds.top < bounds.height / 2 ? 'before' : 'after';
}

function readStoredBoolean(key: string, fallbackValue: boolean): boolean {
  if (typeof window === 'undefined') {
    return fallbackValue;
  }

  const storedValue = window.localStorage.getItem(key);
  if (storedValue === 'true') {
    return true;
  }

  if (storedValue === 'false') {
    return false;
  }

  return fallbackValue;
}

function syncBrowserRoute(route: AppRoute, mode: 'push' | 'replace'): void {
  const nextUrl = buildAppRouteUrl(route);
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (currentUrl === nextUrl) {
    return;
  }

  if (mode === 'push') {
    window.history.pushState(null, '', nextUrl);
    return;
  }

  window.history.replaceState(null, '', nextUrl);
}

export function App() {
  const initialRoute = readAppRoute(window.location.search);
  const [appView, setAppView] = useState<AppView>(initialRoute.view);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialRoute.view === 'workspace' ? initialRoute.projectId : null,
  );
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    initialRoute.view === 'workspace' ? initialRoute.pageId : null,
  );
  const [openPageIds, setOpenPageIds] = useState<string[]>([]);
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [projectSettingsDialogOpen, setProjectSettingsDialogOpen] =
    useState(false);
  const [pageRenameTargetId, setPageRenameTargetId] = useState<string | null>(
    null,
  );
  const [pageRenameDraft, setPageRenameDraft] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [pageRefreshTokenById, setPageRefreshTokenById] = useState<
    Record<string, number>
  >({});
  const [dragState, setDragState] = useState<SidebarDragState | null>(null);
  const [dropState, setDropState] = useState<SidebarDropState | null>(null);
  const [projectDeleteDialogOpen, setProjectDeleteDialogOpen] = useState(false);
  const [projectDeleteConfirmation, setProjectDeleteConfirmation] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() =>
    readStoredBoolean(SIDEBAR_COLLAPSED_STORAGE_KEY, false),
  );
  const projectImportInputRef = useRef<HTMLInputElement | null>(null);
  const pageImportInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? null,
    [pages, selectedPageId],
  );
  const normalizedProjectNameDraft = projectNameDraft.trim();
  const projectDeletePhrase =
    selectedProject === null ? '' : `delete ${selectedProject.name}`;
  const canConfirmProjectDelete =
    selectedProject !== null &&
    projectDeleteConfirmation === projectDeletePhrase &&
    !isMutating;

  const handlePageViewportChange = useCallback(
    (pageId: string, viewport: { x: number; y: number; zoom: number }) => {
      setPages((current) => syncPageViewport(current, pageId, viewport));
    },
    [],
  );

  function goHome(mode: 'push' | 'replace' = 'push'): void {
    syncBrowserRoute({ view: 'home' }, mode);
    setAppView('home');
  }

  function openProject(
    projectId: string,
    preferredPageId: string | null,
    mode: 'push' | 'replace' = 'push',
  ): void {
    const nextPageId = resolveProjectEntryPageId({
      preferredPageId,
      targetProjectId: projectId,
      selectedProjectId,
      selectedPageId,
      pages,
    });

    syncBrowserRoute(
      {
        view: 'workspace',
        projectId,
        pageId: nextPageId,
      },
      mode,
    );
    setSelectedPageId(nextPageId);
    setSelectedProjectId(projectId);
    setAppView('workspace');
  }

  const loadWorkspace = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
    setLoadState('loading');
    setErrorMessage(null);

    try {
      const [, nextProjects] = await Promise.all([
        getHealth(signal),
        listProjects(signal),
      ]);

      setProjects(nextProjects);
      setSelectedProjectId((current) =>
        appView === 'workspace'
          ? current
          : selectFallbackId(nextProjects, current),
      );
      setLoadState('ready');
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      setErrorMessage(getErrorMessage(error));
      setProjects([]);
      setPages([]);
      setSelectedProjectId(null);
      setSelectedPageId(null);
      setLoadState('error');
      syncBrowserRoute({ view: 'home' }, 'replace');
      setAppView('home');
    }
    },
    [appView],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, [loadWorkspace]);

  useEffect(() => {
    function handlePopState(): void {
      const route = readAppRoute(window.location.search);
      if (route.view === 'home') {
        setAppView('home');
        return;
      }

      setSelectedProjectId(route.projectId);
      setSelectedPageId(route.pageId);
      setAppView('workspace');
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (appView === 'workspace' && selectedProjectId !== null) {
      syncBrowserRoute(
        {
          view: 'workspace',
          projectId: selectedProjectId,
          pageId: selectedPageId,
        },
        'replace',
      );
      return;
    }

    if (appView === 'home') {
      syncBrowserRoute({ view: 'home' }, 'replace');
    }
  }, [appView, selectedProjectId, selectedPageId]);

  useEffect(() => {
    if (
      loadState !== 'ready' ||
      appView !== 'workspace' ||
      selectedProjectId === null
    ) {
      return;
    }

    if (projects.some((project) => project.id === selectedProjectId)) {
      return;
    }

    if (projects.length === 0) {
      setErrorMessage(null);
      setSelectedProjectId(null);
      setSelectedPageId(null);
      syncBrowserRoute({ view: 'home' }, 'replace');
      setAppView('home');
      return;
    }

    setErrorMessage('The requested project no longer exists.');
    syncBrowserRoute({ view: 'home' }, 'replace');
    setAppView('home');
  }, [appView, loadState, projects, selectedProjectId]);

  useEffect(() => {
    setProjectNameDraft(selectedProject?.name ?? '');
  }, [selectedProject?.name]);

  useEffect(() => {
    setProjectSettingsDialogOpen(false);
    setProjectDeleteDialogOpen(false);
    setProjectDeleteConfirmation('');
  }, [selectedProjectId]);

  useEffect(() => {
    setOpenPageIds([]);
    setPageRenameTargetId(null);
    setPageRenameDraft('');
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedPage !== null) {
      setOpenPageIds((current) => {
        if (!current.includes(selectedPage.id)) {
          return [...current, selectedPage.id];
        }
        return current;
      });
    }
  }, [selectedPage]);

  useEffect(() => {
    if (
      pageRenameTargetId !== null &&
      !pages.some((page) => page.id === pageRenameTargetId)
    ) {
      setPageRenameTargetId(null);
      setPageRenameDraft('');
    }
  }, [pageRenameTargetId, pages]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(isSidebarCollapsed),
    );
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (selectedProjectId === null) {
      setPages([]);
      setSelectedPageId(null);
      return;
    }

    const projectId = selectedProjectId;
    const controller = new AbortController();
    setIsLoadingPages(true);
    setErrorMessage(null);

    async function loadProjectPages(): Promise<void> {
      try {
        const nextPages = await listPages(projectId, controller.signal);
        setPages(nextPages);
        setSelectedPageId((current) => selectFallbackId(nextPages, current));
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        setErrorMessage(getErrorMessage(error));
        setPages([]);
        setSelectedPageId(null);
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingPages(false);
        }
      }
    }

    void loadProjectPages();
    return () => controller.abort();
  }, [selectedProjectId]);

  async function runMutation(task: () => Promise<void>): Promise<void> {
    setIsMutating(true);
    setErrorMessage(null);

    try {
      await task();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  async function handleCreateProject(): Promise<void> {
    const name = askForName('新增 Project 名稱', 'Untitled Project');
    if (name === null) {
      return;
    }

    await runMutation(async () => {
      const project = await createProject(name);
      setProjects((current) => [...current, project]);
      openProject(project.id, null);
    });
  }

  async function handleSaveProjectName(): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    if (
      normalizedProjectNameDraft.length === 0 ||
      normalizedProjectNameDraft === selectedProject.name
    ) {
      return;
    }

    await runMutation(async () => {
      const updatedProject = await updateProject(selectedProject.id, {
        name: normalizedProjectNameDraft,
      });
      setProjects((current) =>
        current.map((project) =>
          project.id === updatedProject.id ? updatedProject : project,
        ),
      );
      setProjectNameDraft(updatedProject.name);
    });
  }

  async function handleCreatePage(): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    const name = buildUntitledPageName(pages);

    await runMutation(async () => {
      const page = await createPage(selectedProject.id, name);
      setPages((current) => [...current, page]);
      setSelectedPageId(page.id);
    });
  }

  async function handleSavePageName(
    pageToRename: Page | null,
    nextName: string,
  ): Promise<void> {
    if (pageToRename === null) {
      return;
    }

    const normalizedName = nextName.trim();

    if (normalizedName.length === 0 || normalizedName === pageToRename.name) {
      setPageRenameTargetId(null);
      setPageRenameDraft('');
      return;
    }

    await runMutation(async () => {
      const updatedPage = await updatePage(pageToRename.id, normalizedName);
      setPages((current) =>
        current.map((page) =>
          page.id === updatedPage.id ? updatedPage : page,
        ),
      );
      setPageRenameTargetId(null);
      setPageRenameDraft('');
    });
  }

  async function handleDeletePage(
    pageToDelete: Page | null = selectedPage,
  ): Promise<void> {
    if (pageToDelete === null) {
      return;
    }
    const selectedPage = pageToDelete;

    const confirmed = window.confirm(`刪除 Page「${selectedPage.name}」？`);
    if (!confirmed) {
      return;
    }

    const remainingPages = pages.filter((page) => page.id !== selectedPage.id);

    await runMutation(async () => {
      await deletePage(selectedPage.id);
      setPages(remainingPages);
      setOpenPageIds((current) =>
        current.filter((pageId) => pageId !== selectedPage.id),
      );
      setSelectedPageId((current) =>
        current === selectedPage.id ? remainingPages[0]?.id ?? null : current,
      );
    });
  }

  async function handleChangeProjectTheme(
    nextThemeColor: ProjectThemeColor,
  ): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    if (nextThemeColor === selectedProject.theme_color) {
      return;
    }

    await runMutation(async () => {
      const updatedProject = await updateProject(selectedProject.id, {
        theme_color: nextThemeColor,
      });
      setProjects((current) =>
        current.map((project) =>
          project.id === updatedProject.id ? updatedProject : project,
        ),
      );
    });
  }

  function handleExportProjectClick(): void {
    if (selectedProject === null || isMutating) {
      return;
    }

    void runMutation(async () => {
      const projectPages = await listPages(selectedProject.id);
      const boardDataByPage = await Promise.all(
        projectPages.map((page) => getPageBoardData(page.id)),
      );
      const payload = buildProjectExportSnapshot(selectedProject, boardDataByPage);
      const safeProjectName = sanitizeExportName(selectedProject.name);
      await savePageSnapshotWithPicker(
        payload,
        `${safeProjectName}.whiteboard-project.json`,
      );
    });
  }

  function openProjectDeleteDialog(): void {
    if (selectedProject === null || isMutating) {
      return;
    }

    setProjectSettingsDialogOpen(false);
    setProjectDeleteConfirmation('');
    setProjectDeleteDialogOpen(true);
  }

  function openProjectSettingsDialog(): void {
    if (selectedProject === null || isMutating) {
      return;
    }

    setProjectSettingsDialogOpen(true);
  }

  function closeProjectSettingsDialog(): void {
    if (isMutating) {
      return;
    }

    setProjectSettingsDialogOpen(false);
  }

  function beginPageRename(page: Page): void {
    if (isMutating) {
      return;
    }

    setPageRenameTargetId(page.id);
    setPageRenameDraft(page.name);
  }

  function cancelPageRename(): void {
    setPageRenameTargetId(null);
    setPageRenameDraft('');
  }

  function closeProjectDeleteDialog(): void {
    if (isMutating) {
      return;
    }

    setProjectDeleteDialogOpen(false);
    setProjectDeleteConfirmation('');
  }

  async function handleDeleteProject(): Promise<void> {
    if (selectedProject === null || !canConfirmProjectDelete) {
      return;
    }

    const projectToDelete = selectedProject;

    await runMutation(async () => {
      await deleteProject(projectToDelete.id);
      setProjects((current) =>
        current.filter((project) => project.id !== projectToDelete.id),
      );
      setPages([]);
      setSelectedProjectId(null);
      setSelectedPageId(null);
      setProjectDeleteDialogOpen(false);
      setProjectDeleteConfirmation('');
      goHome('replace');
    });
  }

  function clearDragState(): void {
    setDragState(null);
    setDropState(null);
  }

  function handleSidebarDragStart(
    kind: SidebarListKind,
    itemId: string,
    event: ReactDragEvent<HTMLButtonElement>,
  ): void {
    if (isMutating) {
      event.preventDefault();
      return;
    }

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${kind}:${itemId}`);
    setDragState({ kind, itemId });
    setDropState(null);
  }

  function handleSidebarDragOver(
    kind: SidebarListKind,
    targetId: string,
    event: ReactDragEvent<HTMLElement>,
  ): void {
    if (
      dragState === null ||
      dragState.kind !== kind ||
      dragState.itemId === targetId
    ) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const position = getDropPosition(event);
    setDropState((current) => {
      if (
        current !== null &&
        current.kind === kind &&
        current.itemId === targetId &&
        current.position === position
      ) {
        return current;
      }

      return { kind, itemId: targetId, position };
    });
  }

  async function handlePageDrop(
    draggedId: string,
    targetId: string,
    position: DropPosition,
  ): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    const orderedIds = buildDraggedOrder(pages, draggedId, targetId, position);
    if (orderedIds === null) {
      return;
    }

    const previousPages = pages;
    setPages(reorderItemsByIds(pages, orderedIds));
    setIsMutating(true);
    setErrorMessage(null);

    try {
      const nextPages = await reorderPages(selectedProject.id, orderedIds);
      setPages(nextPages);
    } catch (error) {
      setPages(previousPages);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
  }

  function handleSidebarDrop(
    kind: SidebarListKind,
    targetId: string,
    event: ReactDragEvent<HTMLElement>,
  ): void {
    event.preventDefault();
    const currentDragState = dragState;
    const position = getDropPosition(event);
    clearDragState();

    if (
      currentDragState === null ||
      currentDragState.kind !== kind ||
      currentDragState.itemId === targetId
    ) {
      return;
    }

    void handlePageDrop(currentDragState.itemId, targetId, position);
  }

  function handleImportButtonClick(): void {
    if (isMutating) {
      return;
    }

    projectImportInputRef.current?.click();
  }

  async function handleImportInputChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';

    if (file === undefined) {
      return;
    }

    await runMutation(async () => {
      const importedSnapshot = parseProjectImportText(await file.text());
      const importedProject = await importProjectSnapshot(importedSnapshot);
      setProjects((current) => [...current, importedProject.project]);
      openProject(importedProject.project.id, importedProject.firstPageId);
    });
  }

  function handleExportPageClick(): void {
    if (selectedPage === null || isMutating) {
      return;
    }

    void runMutation(async () => {
      try {
        const boardData = await getPageBoardData(selectedPage.id);
        const payload = buildPageExportSnapshot(boardData);
        const safePageName = sanitizeExportName(selectedPage.name);
        const suggestedFileName = `${safePageName}.whiteboard-page.json`;
        await savePageSnapshotWithPicker(
          payload,
          suggestedFileName,
        );
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        throw error;
      }
    });
  }

  function handleImportPageButtonClick(): void {
    if (selectedPage === null || isMutating) {
      return;
    }

    pageImportInputRef.current?.click();
  }

  async function handleImportPageInputChange(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';

    if (file === undefined || selectedPage === null) {
      return;
    }

    await runMutation(async () => {
      const importedPage = parsePageImportText(await file.text());
      const currentBoardData = await getPageBoardData(selectedPage.id);
      const mergedBoardState = mergeImportedPageBoardState(
        selectedPage.id,
        currentBoardData,
        importedPage,
      );
      await replacePageBoardState(selectedPage.id, mergedBoardState);
      setPageRefreshTokenById((current) => ({
        ...current,
        [selectedPage.id]: (current[selectedPage.id] ?? 0) + 1,
      }));
    });
  }

  function handleCloseTab(pageIdToClose: string): void {
    setOpenPageIds((current) => {
      const closedIndex = current.indexOf(pageIdToClose);
      const next = current.filter((id) => id !== pageIdToClose);

      if (selectedPageId === pageIdToClose && selectedProject !== null) {
        const fallbackId =
          next[Math.min(Math.max(closedIndex, 0), next.length - 1)] ?? null;
        syncBrowserRoute(
          {
            view: 'workspace',
            projectId: selectedProject.id,
            pageId: fallbackId,
          },
          'push',
        );
        setSelectedPageId(fallbackId);
      }

      return next;
    });
  }

  if (loadState === 'error' || appView === 'home') {
    return (
      <>
        <input
          ref={projectImportInputRef}
          hidden
          accept=".json,.whiteboard-project.json"
          type="file"
          onChange={(event) => void handleImportInputChange(event)}
        />
        <HomeView
          errorMessage={errorMessage}
          isBusy={isMutating}
          isLoading={loadState === 'loading'}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onCreateProject={() => void handleCreateProject()}
          onImportProject={handleImportButtonClick}
          onOpenProject={(projectId) => openProject(projectId, null)}
        />
      </>
    );
  }

  return (
    <>
      <input
        ref={projectImportInputRef}
        hidden
        accept=".json,.whiteboard-project.json"
        type="file"
        onChange={(event) => void handleImportInputChange(event)}
      />
      <input
        ref={pageImportInputRef}
        hidden
        accept=".json,.whiteboard-page.json"
        type="file"
        onChange={(event) => void handleImportPageInputChange(event)}
      />

      <main
        className={`app-shell ${isSidebarCollapsed ? 'is-sidebar-collapsed' : ''}`}
        data-project-theme={selectedProject?.theme_color ?? 'default'}
      >
        <aside className={`sidebar ${isSidebarCollapsed ? 'is-collapsed' : ''}`}>
          <button
            type="button"
            className="ghost-button sidebar-edge-toggle"
            aria-label={
              isSidebarCollapsed ? 'Expand pages panel' : 'Collapse pages panel'
            }
            aria-expanded={!isSidebarCollapsed}
            onClick={() => setIsSidebarCollapsed((current) => !current)}
            title={
              isSidebarCollapsed ? 'Expand pages panel' : 'Collapse pages panel'
            }
          >
            {isSidebarCollapsed ? '>' : '<'}
          </button>
          <section className="sidebar-header">
            <div className="sidebar-brand-row">
              <div>
                <h1>Planvas</h1>
                <p className="sidebar-copy">
                  {selectedProject !== null ? 'Local workspace' : 'Select a project'}
                </p>
              </div>
              <button
                className="ghost-button sidebar-home-button"
                aria-label="Home"
                disabled={isMutating}
                onClick={() => goHome()}
                title="Home"
              >
                <span className="sidebar-home-button-label">Home</span>
              </button>
            </div>
            <div className="sidebar-project-strip">
              <div className="sidebar-project-strip-label">Project</div>
              <div className="sidebar-project-strip-row">
                <strong
                  className="sidebar-project-strip-name"
                  title={selectedProject?.name ?? 'No project selected'}
                >
                  {selectedProject?.name ?? 'No project selected'}
                </strong>
                <button
                  type="button"
                  className="ghost-button sidebar-project-settings-button"
                  disabled={selectedProject === null || isMutating}
                  aria-label={
                    selectedProject !== null
                      ? `Open settings for ${selectedProject.name}`
                      : 'Project settings unavailable'
                  }
                  title={
                    selectedProject !== null
                      ? `Project settings for ${selectedProject.name}`
                      : 'Project settings unavailable'
                  }
                  onClick={openProjectSettingsDialog}
                >
                  <IconSettings />
                </button>
              </div>
            </div>
          </section>
          <section className="sidebar-section">
            <div className="section-title-row">
              <h2 className="sidebar-pages-heading">Pages</h2>
              <span className="count-badge">{pages.length}</span>
            </div>
            {selectedProject === null ? (
              <p className="empty-copy">Select a project to view pages.</p>
            ) : isLoadingPages ? (
              <p className="empty-copy">Loading pages...</p>
            ) : pages.length === 0 ? (
              <p className="empty-copy">This project has no pages yet.</p>
            ) : (
              <div className="list-stack">
                {pages.map((page) => {
                  const isDragging =
                    dragState?.kind === 'pages' && dragState.itemId === page.id;
                  const isRenaming = pageRenameTargetId === page.id;
                  const isDropBefore =
                    dropState?.kind === 'pages' &&
                    dropState.itemId === page.id &&
                    dropState.position === 'before';
                  const isDropAfter =
                    dropState?.kind === 'pages' &&
                    dropState.itemId === page.id &&
                    dropState.position === 'after';

                  return (
                    <div
                      key={page.id}
                      className={`list-entry ${isDropBefore ? 'is-drop-before' : ''} ${
                        isDropAfter ? 'is-drop-after' : ''
                      }`}
                      onDragOver={(event) =>
                        handleSidebarDragOver('pages', page.id, event)
                      }
                      onDrop={(event) =>
                        handleSidebarDrop('pages', page.id, event)
                      }
                    >
                      {isRenaming ? (
                        <div
                          className={`list-button list-button-rename is-editing ${
                            page.id === selectedPageId ? 'is-selected' : ''
                          }`}
                          onMouseDown={(event) => event.stopPropagation()}
                        >
                          <input
                            className="page-rename-input"
                            aria-label={`Rename page ${page.name}`}
                            disabled={isMutating}
                            value={pageRenameDraft}
                            placeholder="Page name"
                            autoFocus
                            onChange={(event) => setPageRenameDraft(event.target.value)}
                            onBlur={() => {
                              void handleSavePageName(page, pageRenameDraft);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void handleSavePageName(page, pageRenameDraft);
                              }

                              if (event.key === 'Escape') {
                                event.preventDefault();
                                cancelPageRename();
                              }
                            }}
                          />
                          <small>zoom {page.zoom.toFixed(1)}x</small>
                        </div>
                      ) : (
                        <button
                          className={`list-button ${
                            page.id === selectedPageId ? 'is-selected' : ''
                          } ${isDragging ? 'is-dragging' : ''} ${
                            pages.length > 1 ? 'is-sortable' : ''
                          }`}
                          draggable={!isMutating && pages.length > 1}
                          aria-label={
                            pages.length > 1
                              ? `Move page ${page.name}`
                              : undefined
                          }
                          title={
                            pages.length > 1
                              ? `Move page ${page.name}`
                              : undefined
                          }
                          onDragStart={(event) =>
                            handleSidebarDragStart('pages', page.id, event)
                          }
                          onDragEnd={clearDragState}
                          onClick={() => setSelectedPageId(page.id)}
                        >
                          <span>{page.name}</span>
                          <small>zoom {page.zoom.toFixed(1)}x</small>
                        </button>
                      )}
                      <div className="page-row-actions">
                        <button
                          type="button"
                          className={`ghost-button page-icon-button page-rename-button ${
                            isRenaming ? 'is-active' : ''
                          }`}
                          disabled={isMutating}
                          title={
                            isRenaming
                              ? `Save page name for ${page.name}`
                              : `Rename page ${page.name}`
                          }
                          aria-label={
                            isRenaming
                              ? `Save page name for ${page.name}`
                              : `Rename page ${page.name}`
                          }
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isRenaming) {
                              void handleSavePageName(page, pageRenameDraft);
                              return;
                            }

                            beginPageRename(page);
                          }}
                        >
                          <IconPencil />
                        </button>
                        <button
                          type="button"
                          className="ghost-button danger-button page-icon-button page-trash-button"
                          disabled={isMutating}
                          title={`Delete page ${page.name}`}
                          aria-label={`Delete page ${page.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeletePage(page);
                          }}
                        >
                          <IconTrash />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              className="primary-button sidebar-add-page-button"
              disabled={selectedProject === null || isMutating}
              onClick={() => void handleCreatePage()}
            >
              New page
            </button>
          </section>
        </aside>

        <section className="workspace">
          <header className="workspace-header workspace-header-compact">
            <div className="workspace-tabs" role="tablist" aria-label="Open pages">
              <span
                className="workspace-tabs-project-name"
                title={selectedProject?.name ?? 'No project'}
              >
                {selectedProject?.name ?? 'No project'}
              </span>
              {openPageIds.map((tabId) => {
                const page = pages.find((p) => p.id === tabId);
                if (!page) return null;
                const isActive = tabId === selectedPageId;
                return (
                  <div
                    key={tabId}
                    className={`workspace-tab ${isActive ? 'is-active' : ''}`}
                  >
                    <button
                      className="workspace-tab-button"
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => {
                        if (selectedProject && tabId !== selectedPageId) {
                          openProject(selectedProject.id, tabId, 'push');
                        }
                      }}
                    >
                      {page.name}
                    </button>
                    <button
                      className="workspace-tab-close"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCloseTab(tabId);
                      }}
                      aria-label={`Close ${page.name} tab`}
                      title={`Close ${page.name}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </header>
          {errorMessage !== null ? (
            <div className="error-banner">{errorMessage}</div>
          ) : null}

          {selectedProject === null ? (
            <section className="hero-panel">
              <div className="hero-copy">
                <h3>Select a project</h3>
                <p className="hero-text">Open a project from the home screen to start working on a board.</p>
                <button
                  className="primary-button"
                  disabled={isMutating}
                  onClick={() => goHome()}
                >
                  Go home
                </button>
              </div>
            </section>
          ) : selectedPage === null ? (
            <section className="hero-panel">
              <div className="hero-copy">
                <h3>{pages.length === 0 ? `Create a page in ${selectedProject.name}` : 'Select a page'}</h3>
                <p className="hero-text">
                  {pages.length === 0
                    ? 'Add a page to start arranging notes, tables, frames, and connectors.'
                    : 'Open a page from the sidebar to continue working.'}
                </p>
                <button
                  className="primary-button"
                  disabled={isMutating}
                  onClick={() => void handleCreatePage()}
                >
                  New page
                </button>
              </div>
            </section>
          ) : (
            <Canvas
              key={`${selectedPage.id}:${pageRefreshTokenById[selectedPage.id] ?? 0}`}
              page={selectedPage}
              onImportPage={handleImportPageButtonClick}
              onExportPage={handleExportPageClick}
              importExportDisabled={isMutating}
              onViewportChange={(viewport) =>
                handlePageViewportChange(selectedPage.id, viewport)
              }
            />
          )}
        </section>
      </main>
      {projectSettingsDialogOpen && selectedProject !== null ? (
        <div
          className="confirmation-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeProjectSettingsDialog();
            }
          }}
        >
          <section
            className="project-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-settings-dialog-title"
          >
            <div className="project-settings-dialog-header">
              <div>
                <div className="project-settings-dialog-kicker">Project settings</div>
                <h2 id="project-settings-dialog-title">{selectedProject.name}</h2>
              </div>
              <button
                type="button"
                className="ghost-button confirmation-dialog-close"
                disabled={isMutating}
                onClick={closeProjectSettingsDialog}
                aria-label="Close project settings dialog"
              >
                X
              </button>
            </div>
            <div className="project-settings-dialog-grid">
              <section className="project-settings-panel">
                <div className="project-settings-panel-heading">Name</div>
                <label className="sidebar-name-group" htmlFor="sidebar-project-name-input">
                  <span className="sidebar-name-label">Project name</span>
                  <div className="sidebar-name-edit-row">
                    <input
                      id="sidebar-project-name-input"
                      className="sidebar-name-input project-settings-name-input"
                      disabled={isMutating}
                      type="text"
                      value={projectNameDraft}
                      onChange={(event) => setProjectNameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void handleSaveProjectName();
                        }
                      }}
                    />
                    <button
                      className="ghost-button sidebar-inline-save"
                      disabled={
                        isMutating ||
                        normalizedProjectNameDraft.length === 0 ||
                        normalizedProjectNameDraft === selectedProject.name
                      }
                      onClick={() => void handleSaveProjectName()}
                    >
                      Save
                    </button>
                  </div>
                </label>
              </section>
              <section className="project-settings-panel">
                <div className="project-settings-panel-heading">Appearance</div>
                <label className="sidebar-project-theme-control">
                  <span className="sidebar-name-label">Theme</span>
                  <select
                    disabled={isMutating}
                    value={selectedProject.theme_color}
                    onChange={(event) =>
                      void handleChangeProjectTheme(
                        event.target.value as ProjectThemeColor,
                      )
                    }
                  >
                    {PROJECT_THEME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </section>
              <section className="project-settings-panel project-settings-panel-actions">
                <div className="project-settings-panel-heading">Actions</div>
                <p className="confirmation-dialog-copy">
                  Export the whole project or remove it from this local workspace.
                </p>
                <div className="sidebar-project-action-row">
                  <button
                    type="button"
                    className="ghost-button sidebar-project-export-button"
                    disabled={isMutating}
                    onClick={handleExportProjectClick}
                  >
                    Export project
                  </button>
                  <button
                    type="button"
                    className="ghost-button danger-button sidebar-project-delete-button"
                    disabled={isMutating}
                    onClick={openProjectDeleteDialog}
                  >
                    Delete project
                  </button>
                </div>
              </section>
            </div>
          </section>
        </div>
      ) : null}
      {projectDeleteDialogOpen && selectedProject !== null ? (
        <div
          className="confirmation-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeProjectDeleteDialog();
            }
          }}
        >
          <section
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-delete-dialog-title"
          >
            <div className="confirmation-dialog-header">
              <h2 id="project-delete-dialog-title">Delete project</h2>
              <button
                type="button"
                className="ghost-button confirmation-dialog-close"
                disabled={isMutating}
                onClick={closeProjectDeleteDialog}
                aria-label="Close delete project dialog"
              >
                X
              </button>
            </div>
            <p className="confirmation-dialog-copy">
              This will delete the project, its pages, and all board content.
            </p>
            <label
              className="confirmation-dialog-label"
              htmlFor="project-delete-confirmation-input"
            >
              Type <strong>{projectDeletePhrase}</strong> to confirm.
            </label>
            <input
              id="project-delete-confirmation-input"
              className="confirmation-dialog-input"
              disabled={isMutating}
              value={projectDeleteConfirmation}
              onChange={(event) => setProjectDeleteConfirmation(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canConfirmProjectDelete) {
                  event.preventDefault();
                  void handleDeleteProject();
                }

                if (event.key === 'Escape') {
                  event.preventDefault();
                  closeProjectDeleteDialog();
                }
              }}
              autoFocus
            />
            <div className="confirmation-dialog-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={isMutating}
                onClick={closeProjectDeleteDialog}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ghost-button danger-button"
                disabled={!canConfirmProjectDelete}
                onClick={() => void handleDeleteProject()}
              >
                Delete project
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
