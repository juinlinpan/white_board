import { useEffect, useMemo, useState } from 'react';
import {
  apiBaseUrl,
  createPage,
  createProject,
  deletePage,
  deleteProject,
  getHealth,
  listPages,
  listProjects,
  updatePage,
  updateProject,
  type Page,
  type Project,
} from './api';
import { Canvas } from './Canvas';

type LoadState = 'loading' | 'ready' | 'error';
type HealthState = 'loading' | 'ready' | 'error';

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
      setSelectedProjectId((current) => selectFallbackId(nextProjects, current));
      setLoadState('ready');
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      setHealthState('error');
      setHealthMessage(`Backend health check failed: ${getErrorMessage(error)}`);
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
        current.map((page) => (page.id === updatedPage.id ? updatedPage : page)),
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

  if (loadState === 'error') {
    return (
      <main className="app-shell app-shell-single">
        <section className="hero-panel">
          <span className={`status-indicator status-${healthState}`} />
          <div className="hero-copy">
            <p className="eyebrow">Whiteboard Planner</p>
            <h1>本機後端目前不可用</h1>
            <p className="hero-text">{healthMessage}</p>
            <p className="hero-meta">API base URL: {apiBaseUrl}</p>
            <button className="primary-button" onClick={() => void loadWorkspace()}>
              重新嘗試
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
          <p className="eyebrow">Whiteboard Planner</p>
          <h1>Local-first planning workspace</h1>
          <p className="sidebar-copy">
            先把 Project 與 Page 管理打通，白板畫布下一步再往物件互動延伸。
          </p>
          <button
            className="primary-button"
            disabled={isMutating}
            onClick={() => void handleCreateProject()}
          >
            新增 Project
          </button>
        </section>

        <section className="sidebar-section">
          <div className="section-title-row">
            <h2>Projects</h2>
            <span className="count-badge">{projects.length}</span>
          </div>
          {projects.length === 0 ? (
            <p className="empty-copy">目前還沒有 Project，先建立一個規劃空間。</p>
          ) : (
            <div className="list-stack">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={`list-button ${
                    project.id === selectedProjectId ? 'is-selected' : ''
                  }`}
                  onClick={() => {
                    setSelectedPageId(null);
                    setSelectedProjectId(project.id);
                  }}
                >
                  <span>{project.name}</span>
                  <small>{formatDate(project.updated_at)}</small>
                </button>
              ))}
            </div>
          )}
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
              {pages.map((page) => (
                <button
                  key={page.id}
                  className={`list-button ${
                    page.id === selectedPageId ? 'is-selected' : ''
                  }`}
                  onClick={() => setSelectedPageId(page.id)}
                >
                  <span>{page.name}</span>
                  <small>zoom {page.zoom.toFixed(1)}x</small>
                </button>
              ))}
            </div>
          )}
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
            <p className="eyebrow">Workspace</p>
            <h2>{selectedProject?.name ?? 'Select or create a project'}</h2>
            <p className="workspace-copy">
              {selectedPage !== null
                ? `目前 Page：${selectedPage.name}`
                : '這一區會接上白板畫布與物件工具列。'}
            </p>
          </div>
          <div className={`status-pill status-${healthState}`}>
            <span className={`status-indicator status-${healthState}`} />
            <span>{healthMessage}</span>
          </div>
        </header>

        {errorMessage !== null ? (
          <div className="error-banner">{errorMessage}</div>
        ) : null}

        {selectedProject === null ? (
          <section className="hero-panel">
            <div className="hero-copy">
              <p className="eyebrow">Step 1</p>
              <h3>先建立你的第一個 Project</h3>
              <p className="hero-text">
                這輪先完成 Project / Page 資料流與本機 SQLite 持久化，讓後面的白板互動有穩定基礎。
              </p>
              <button
                className="primary-button"
                disabled={isMutating}
                onClick={() => void handleCreateProject()}
              >
                建立第一個 Project
              </button>
            </div>
          </section>
        ) : selectedPage === null ? (
          <section className="hero-panel">
            <div className="hero-copy">
              <p className="eyebrow">Step 2</p>
              <h3>幫「{selectedProject.name}」新增一個 Page</h3>
              <p className="hero-text">
                Page 是白板的承載單位。現在可先建立、切換、重新命名與刪除，後續再接上 item canvas。
              </p>
              <button
                className="primary-button"
                disabled={isMutating}
                onClick={() => void handleCreatePage()}
              >
                新增第一個 Page
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
