import {
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
} from 'react';
import {
  apiBaseUrl,
  createPage,
  createProject,
  deletePage,
  deleteProject,
  duplicatePage,
  getHealth,
  listPages,
  listProjects,
  reorderPages,
  reorderProjects,
  updatePage,
  updateProject,
  type Page,
  type Project,
} from './api';
import { Canvas } from './Canvas';

type LoadState = 'loading' | 'ready' | 'error';
type HealthState = 'loading' | 'ready' | 'error';
type SidebarListKind = 'projects' | 'pages';
type DropPosition = 'before' | 'after';
type SidebarDragState = {
  kind: SidebarListKind;
  itemId: string;
};
type SidebarDropState = SidebarDragState & {
  position: DropPosition;
};

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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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

export function App() {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [healthState, setHealthState] = useState<HealthState>('loading');
  const [healthMessage, setHealthMessage] = useState(
    'Checking local backend health...',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [dragState, setDragState] = useState<SidebarDragState | null>(null);
  const [dropState, setDropState] = useState<SidebarDropState | null>(null);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const selectedPage = useMemo(
    () => pages.find((page) => page.id === selectedPageId) ?? null,
    [pages, selectedPageId],
  );

  async function loadWorkspace(signal?: AbortSignal): Promise<void> {
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
        selectFallbackId(nextProjects, current),
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
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkspace(controller.signal);
    return () => controller.abort();
  }, []);

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
      setSelectedPageId(null);
      setSelectedProjectId(project.id);
    });
  }

  async function handleRenameProject(): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    const name = askForName('重新命名 Project', selectedProject.name);
    if (name === null || name === selectedProject.name) {
      return;
    }

    await runMutation(async () => {
      const updatedProject = await updateProject(selectedProject.id, name);
      setProjects((current) =>
        current.map((project) =>
          project.id === updatedProject.id ? updatedProject : project,
        ),
      );
    });
  }

  async function handleDeleteProject(): Promise<void> {
    if (selectedProject === null) {
      return;
    }

    const confirmed = window.confirm(
      `刪除 Project「${selectedProject.name}」？這會一併刪除底下的 Page。`,
    );
    if (!confirmed) {
      return;
    }

    const remainingProjects = projects.filter(
      (project) => project.id !== selectedProject.id,
    );

    await runMutation(async () => {
      await deleteProject(selectedProject.id);
      setProjects(remainingProjects);
      setPages([]);
      setSelectedPageId(null);
      setSelectedProjectId(remainingProjects[0]?.id ?? null);
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

  async function handleRenamePage(): Promise<void> {
    if (selectedPage === null) {
      return;
    }

    const name = askForName('重新命名 Page', selectedPage.name);
    if (name === null || name === selectedPage.name) {
      return;
    }

    await runMutation(async () => {
      const updatedPage = await updatePage(selectedPage.id, name);
      setPages((current) =>
        current.map((page) =>
          page.id === updatedPage.id ? updatedPage : page,
        ),
      );
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

  async function handleDuplicatePage(): Promise<void> {
    if (selectedProject === null || selectedPage === null) {
      return;
    }

    await runMutation(async () => {
      const duplicatedPage = await duplicatePage(selectedPage.id);
      const nextPages = await listPages(selectedProject.id);
      setPages(nextPages);
      setSelectedPageId(duplicatedPage.id);
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

  async function handleProjectDrop(
    draggedId: string,
    targetId: string,
    position: DropPosition,
  ): Promise<void> {
    const orderedIds = buildDraggedOrder(
      projects,
      draggedId,
      targetId,
      position,
    );
    if (orderedIds === null) {
      return;
    }

    const previousProjects = projects;
    setProjects(reorderItemsByIds(projects, orderedIds));
    setIsMutating(true);
    setErrorMessage(null);

    try {
      const nextProjects = await reorderProjects(orderedIds);
      setProjects(nextProjects);
    } catch (error) {
      setProjects(previousProjects);
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsMutating(false);
    }
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

    if (kind === 'projects') {
      void handleProjectDrop(currentDragState.itemId, targetId, position);
      return;
    }

    void handlePageDrop(currentDragState.itemId, targetId, position);
  }

  if (loadState === 'error') {
    return (
      <main className="app-shell app-shell-single">
        <section className="hero-panel">
          <div className="hero-copy">
            <span className={`status-indicator status-${healthState}`} />
            <h3>後端連線失敗</h3>
            <p className="hero-text">{healthMessage}</p>
            <p className="hero-meta">API: {apiBaseUrl}</p>
            <button
              className="primary-button"
              onClick={() => void loadWorkspace()}
            >
              重試
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <section className="sidebar-header">
          <div className="section-title-row">
            <h1>Whiteboard</h1>
            <button
              className="primary-button"
              disabled={isMutating}
              onClick={() => void handleCreateProject()}
            >
              + Project
            </button>
          </div>
        </section>

        <section className="sidebar-section">
          <div className="section-title-row">
            <h2>Projects</h2>
            <span className="count-badge">{projects.length}</span>
          </div>
          {projects.length === 0 ? (
            <p className="empty-copy">
              目前還沒有 Project，先建立一個規劃空間。
            </p>
          ) : (
            <div className="list-stack">
              {projects.map((project) => {
                const isDragging =
                  dragState?.kind === 'projects' &&
                  dragState.itemId === project.id;
                const isDropBefore =
                  dropState?.kind === 'projects' &&
                  dropState.itemId === project.id &&
                  dropState.position === 'before';
                const isDropAfter =
                  dropState?.kind === 'projects' &&
                  dropState.itemId === project.id &&
                  dropState.position === 'after';

                return (
                  <div
                    key={project.id}
                    className={`list-entry ${isDropBefore ? 'is-drop-before' : ''} ${
                      isDropAfter ? 'is-drop-after' : ''
                    }`}
                    onDragOver={(event) =>
                      handleSidebarDragOver('projects', project.id, event)
                    }
                    onDrop={(event) =>
                      handleSidebarDrop('projects', project.id, event)
                    }
                  >
                    <button
                      className={`list-button ${
                        project.id === selectedProjectId ? 'is-selected' : ''
                      } ${isDragging ? 'is-dragging' : ''} ${
                        projects.length > 1 ? 'is-sortable' : ''
                      }`}
                      draggable={!isMutating && projects.length > 1}
                      aria-label={
                        projects.length > 1
                          ? `按住拖拉排序 Project ${project.name}`
                          : undefined
                      }
                      title={
                        projects.length > 1
                          ? `按住拖拉排序 Project ${project.name}`
                          : undefined
                      }
                      onDragStart={(event) =>
                        handleSidebarDragStart('projects', project.id, event)
                      }
                      onDragEnd={clearDragState}
                      onClick={() => {
                        setSelectedPageId(null);
                        setSelectedProjectId(project.id);
                      }}
                    >
                      <span>{project.name}</span>
                      <small>{formatDate(project.updated_at)}</small>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {projects.length > 1 ? (
            <p className="sort-hint">按住 Project 項目直接拖拉即可調整順序。</p>
          ) : null}
          <div className="action-row">
            <button
              className="ghost-button"
              disabled={selectedProject === null || isMutating}
              onClick={() => void handleRenameProject()}
            >
              重新命名
            </button>
            <button
              className="ghost-button danger-button"
              disabled={selectedProject === null || isMutating}
              onClick={() => void handleDeleteProject()}
            >
              刪除
            </button>
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
          {pages.length > 1 ? (
            <p className="sort-hint">按住 Page 項目直接拖拉即可調整順序。</p>
          ) : null}
          <div className="action-row">
            <button
              className="ghost-button"
              disabled={selectedProject === null || isMutating}
              onClick={() => void handleCreatePage()}
            >
              新增 Page
            </button>
            <button
              className="ghost-button"
              disabled={selectedPage === null || isMutating}
              onClick={() => void handleDuplicatePage()}
            >
              複製
            </button>
            <button
              className="ghost-button"
              disabled={selectedPage === null || isMutating}
              onClick={() => void handleRenamePage()}
            >
              重新命名
            </button>
            <button
              className="ghost-button danger-button"
              disabled={selectedPage === null || isMutating}
              onClick={() => void handleDeletePage()}
            >
              刪除
            </button>
          </div>
        </section>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <h2>{selectedProject?.name ?? 'Select a project'}</h2>
            {selectedPage !== null ? (
              <p className="workspace-copy">{selectedPage.name}</p>
            ) : null}
          </div>
          <div className="status-pill">
            <span className={`status-indicator status-${healthState}`} />
          </div>
        </header>

        {errorMessage !== null ? (
          <div className="error-banner">{errorMessage}</div>
        ) : null}

        {selectedProject === null ? (
          <section className="hero-panel">
            <div className="hero-copy">
              <h3>建立你的第一個 Project</h3>
              <p className="hero-text">從左側新增 Project 開始規劃。</p>
              <button
                className="primary-button"
                disabled={isMutating}
                onClick={() => void handleCreateProject()}
              >
                新增 Project
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
          <Canvas key={selectedPage.id} page={selectedPage} />
        )}
      </section>
    </main>
  );
}
