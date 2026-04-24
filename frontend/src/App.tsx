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
  getPageBoardData,
  getHealth,
  listPages,
  listProjects,
  replacePageBoardState,
  reorderPages,
  updatePage,
  updateProject,
  type Page,
  type Project,
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
type HealthState = 'loading' | 'ready' | 'error';
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

  const fileHandle = await pickerWindow.showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: 'Whiteboard Page JSON',
        accept: {
          'application/json': ['.json', '.whiteboard-page'],
        },
      },
    ],
  });
  const writable = await fileHandle.createWritable();
  await writable.write(payload);
  await writable.close();
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

function askForName(label: string, initialValue: string): string | null {
  const value = window.prompt(label, initialValue);
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
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
  const [healthState, setHealthState] = useState<HealthState>('loading');
  const [healthMessage, setHealthMessage] = useState(
    'Checking local backend health...',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialRoute.view === 'workspace' ? initialRoute.projectId : null,
  );
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    initialRoute.view === 'workspace' ? initialRoute.pageId : null,
  );
  const [projectNameDraft, setProjectNameDraft] = useState('');
  const [pageNameDraft, setPageNameDraft] = useState('');
  const [isMutating, setIsMutating] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [dragState, setDragState] = useState<SidebarDragState | null>(null);
  const [dropState, setDropState] = useState<SidebarDropState | null>(null);
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
  const normalizedPageNameDraft = pageNameDraft.trim();

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
    setHealthState('loading');
    setHealthMessage('Checking local backend health...');

    try {
      const [health, nextProjects] = await Promise.all([
        getHealth(signal),
        listProjects(signal),
      ]);

      setHealthState('ready');
      setHealthMessage(`${health.service} is ${health.status}`);
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

      setHealthState('error');
      setHealthMessage(
        `Backend health check failed: ${getErrorMessage(error)}`,
      );
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
  }, [selectedProject]);

  useEffect(() => {
    setPageNameDraft(selectedPage?.name ?? '');
  }, [selectedPage]);

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
      const updatedProject = await updateProject(
        selectedProject.id,
        normalizedProjectNameDraft,
      );
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

    const name = askForName('新增 Page 名稱', 'Untitled Page');
    if (name === null) {
      return;
    }

    await runMutation(async () => {
      const page = await createPage(selectedProject.id, name);
      setPages((current) => [...current, page]);
      setSelectedPageId(page.id);
    });
  }

  async function handleSavePageName(): Promise<void> {
    if (selectedPage === null) {
      return;
    }

    if (
      normalizedPageNameDraft.length === 0 ||
      normalizedPageNameDraft === selectedPage.name
    ) {
      return;
    }

    await runMutation(async () => {
      const updatedPage = await updatePage(selectedPage.id, normalizedPageNameDraft);
      setPages((current) =>
        current.map((page) =>
          page.id === updatedPage.id ? updatedPage : page,
        ),
      );
      setPageNameDraft(updatedPage.name);
    });
  }

  async function handleDeletePage(): Promise<void> {
    if (selectedPage === null) {
      return;
    }

    const confirmed = window.confirm(`刪除 Page「${selectedPage.name}」？`);
    if (!confirmed) {
      return;
    }

    const remainingPages = pages.filter((page) => page.id !== selectedPage.id);

    await runMutation(async () => {
      await deletePage(selectedPage.id);
      setPages(remainingPages);
      setSelectedPageId(remainingPages[0]?.id ?? null);
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
        const fileName =
          askForName('請輸入匯出檔名', suggestedFileName) ?? suggestedFileName;
        await savePageSnapshotWithPicker(
          payload,
          fileName,
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
          healthMessage={healthMessage}
          healthState={healthState}
          isBusy={isMutating}
          isLoading={loadState === 'loading'}
          projects={projects}
          selectedProjectId={selectedProjectId}
          onCreateProject={() => void handleCreateProject()}
          onImportProject={handleImportButtonClick}
          onOpenProject={(projectId) => openProject(projectId, null)}
          onRetry={() => void loadWorkspace()}
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
            <div className="section-title-row sidebar-title-row">
              <div>
                <h1>Whiteboard</h1>
                <p className="sidebar-copy">
                  {selectedProject !== null
                    ? `目前 Project：${selectedProject.name}`
                    : '回到首頁或建立新的規劃空間'}
                </p>
              <button
                  className="ghost-button sidebar-home-button"
                aria-label="首頁"
                disabled={isMutating}
                onClick={() => goHome()}
                title="首頁"
              >
                首頁
                </button>
              </div>
            </div>
          </section>
          <section className="sidebar-section">
            <div className="section-title-row">
              <h2>Pages</h2>
              <span className="count-badge">{pages.length}</span>
            </div>
            {selectedProject === null ? (
              <p className="empty-copy">先選擇一個 Project 才能管理 Page。</p>
            ) : isLoadingPages ? (
              <p className="empty-copy">正在載入 Page...</p>
            ) : pages.length === 0 ? (
              <p className="empty-copy">這個 Project 還沒有 Page。</p>
            ) : (
              <div className="list-stack">
                {pages.map((page) => {
                  const isDragging =
                    dragState?.kind === 'pages' && dragState.itemId === page.id;
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
                      <button
                        className={`list-button ${
                          page.id === selectedPageId ? 'is-selected' : ''
                        } ${isDragging ? 'is-dragging' : ''} ${
                          pages.length > 1 ? 'is-sortable' : ''
                        }`}
                        draggable={!isMutating && pages.length > 1}
                        aria-label={
                          pages.length > 1
                            ? `按住拖拉排序 Page ${page.name}`
                            : undefined
                        }
                        title={
                          pages.length > 1
                            ? `按住拖拉排序 Page ${page.name}`
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
              ＋ 新增 Page
            </button>
          </section>
        </aside>

        <section className="workspace">
          <header className="workspace-header">
            <div className="workspace-project-block">
              {selectedProject !== null ? (
                <div className="workspace-project-name-row">
                  <label
                    className="workspace-field-label"
                    htmlFor="project-name-input"
                  >
                    project name:
                  </label>
                  <input
                    id="project-name-input"
                    className="workspace-project-name-input"
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
                    className="ghost-button"
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
              ) : (
                <h2>Select a project</h2>
              )}
              {selectedPage !== null ? (
                <div className="workspace-page-name-row">
                  <label className="workspace-field-label" htmlFor="page-name-input">
                    page name:
                  </label>
                  <input
                    id="page-name-input"
                    className="workspace-page-name-input"
                    disabled={isMutating}
                    type="text"
                    value={pageNameDraft}
                    onChange={(event) => setPageNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleSavePageName();
                      }
                    }}
                  />
                  <button
                    className="ghost-button"
                    disabled={
                      isMutating ||
                      normalizedPageNameDraft.length === 0 ||
                      normalizedPageNameDraft === selectedPage.name
                    }
                    onClick={() => void handleSavePageName()}
                  >
                    Save
                  </button>
                </div>
              ) : null}
            </div>
            <div className="workspace-header-actions">
              <button
                className="ghost-button danger-button trash-button"
                disabled={selectedPage === null || isMutating}
                onClick={() => void handleDeletePage()}
                title={selectedPage !== null ? `刪除 Page「${selectedPage.name}」` : '刪除 Page'}
                aria-label={selectedPage !== null ? `刪除 Page「${selectedPage.name}」` : '刪除 Page'}
              >
                🗑
              </button>
              <div className="status-pill">
                <span className={`status-indicator status-${healthState}`} />
              </div>
            </div>
          </header>

          {errorMessage !== null ? (
            <div className="error-banner">{errorMessage}</div>
          ) : null}

          {selectedProject === null ? (
            <section className="hero-panel">
              <div className="hero-copy">
                <h3>建立你的第一個 Project</h3>
                <p className="hero-text">回到首頁建立或匯入新的規劃空間。</p>
                <button
                  className="primary-button"
                  disabled={isMutating}
                  onClick={() => goHome()}
                >
                  回到首頁
                </button>
              </div>
            </section>
          ) : selectedPage === null ? (
            <section className="hero-panel">
              <div className="hero-copy">
                <h3>新增 Page 到「{selectedProject.name}」</h3>
                <p className="hero-text">
                  Page 是白板的承載單位，建立後即可開始規劃。
                </p>
                <button
                  className="primary-button"
                  disabled={isMutating}
                  onClick={() => void handleCreatePage()}
                >
                  新增 Page
                </button>
              </div>
            </section>
          ) : (
            <Canvas
              key={selectedPage.id}
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
    </>
  );
}
