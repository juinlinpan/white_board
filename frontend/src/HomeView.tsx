import { type Project } from './api';

const HERO_IMAGE_SRC = '/assets/home-whiteboard-hero.png';

function IconPlus() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function IconImport() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 1.65 5.35L19 10l-5.35 1.65L12 17l-1.65-5.35L5 10l5.35-1.65L12 3Z" />
      <path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" />
    </svg>
  );
}

type HealthState = 'loading' | 'ready' | 'error';

type Props = {
  errorMessage: string | null;
  healthMessage: string;
  healthState: HealthState;
  isBusy: boolean;
  isLoading: boolean;
  projects: Project[];
  selectedProjectId: string | null;
  onCreateProject: () => void;
  onImportProject: () => void;
  onOpenProject: (projectId: string) => void;
  onRetry: () => void;
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-TW', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function latestProject(projects: Project[]): Project | null {
  return [...projects].sort(
    (left, right) =>
      new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
  )[0] ?? null;
}

export function HomeView({
  errorMessage,
  healthMessage,
  healthState,
  isBusy,
  isLoading,
  projects,
  selectedProjectId,
  onCreateProject,
  onImportProject,
  onOpenProject,
  onRetry,
}: Props) {
  const recentProject = latestProject(projects);

  return (
    <main className="home-shell">
      <section className="home-hero-panel" aria-label="Whiteboard home">
        <div className="home-copy">
          <div className="home-brand">
            <span className="home-brand-mark" aria-hidden="true">
              <IconSpark />
            </span>
            <div>
              <span className="home-brand-name">Whiteboard</span>
              <span className="home-brand-kicker">Local-first planning</span>
            </div>
          </div>

          <div className="home-heading-group">
            <p className="home-eyebrow">Projects</p>
            <h1 className="home-title">就是一塊白板</h1>
          </div>

          <div className="home-actions">
            <button className="home-create-button" disabled={isBusy} onClick={onCreateProject}>
              <IconPlus />
              建立 Project
            </button>
            <button className="home-import-button" disabled={isBusy} onClick={onImportProject}>
              <IconImport />
              匯入 Project
            </button>
          </div>

          <div className={`home-status-strip is-${healthState}`}>
            <span className={`status-indicator status-${healthState}`} />
            <span>{healthMessage}</span>
            {healthState === 'error' ? (
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            ) : null}
          </div>
        </div>

        <div className="home-visual" aria-hidden="true">
          <img src={HERO_IMAGE_SRC} alt="" />
        </div>
      </section>

      <section className="home-project-panel" aria-label="Project list">
        <div className="home-header">
          <div>
            <p className="home-eyebrow">Workspace</p>
            <h2 className="home-list-title">你的 Projects</h2>
          </div>
          <span className="count-badge">{projects.length}</span>
        </div>

        {errorMessage !== null ? <div className="error-banner">{errorMessage}</div> : null}

        {isLoading ? (
          <div className="home-loading" aria-label="Loading projects">
            <div className="home-loading-dot" />
            <div className="home-loading-dot" />
            <div className="home-loading-dot" />
          </div>
        ) : projects.length === 0 ? (
          <div className="home-empty-state">
            <strong>還沒有 Project</strong>
            <p>先建立一個白板專案，或匯入現有 JSON snapshot。</p>
          </div>
        ) : (
          <div className="home-project-list">
            {projects.map((project) => (
              <button
                key={project.id}
                className={`home-project-card ${project.id === selectedProjectId ? 'is-selected' : ''}`}
                disabled={isBusy}
                onClick={() => onOpenProject(project.id)}
              >
                <div className="home-project-card-main">
                  <strong>{project.name}</strong>
                  <span>{formatDate(project.updated_at)}</span>
                </div>
                <span className="home-project-card-arrow">
                  <IconArrow />
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="home-panel-footer">
          <span>最近更新</span>
          <strong>{recentProject?.name ?? 'None'}</strong>
        </div>
      </section>
    </main>
  );
}
