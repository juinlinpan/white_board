import { type Project } from './api';

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconArrow() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" />
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

export function HomeView({
  errorMessage,
  isBusy,
  isLoading,
  projects,
  selectedProjectId,
  onCreateProject,
  onImportProject,
  onOpenProject,
}: Props) {
  return (
    <main className="home-shell">
      <div className="home-center">

        <div className="home-header">
          <h1 className="home-title">你的 Projects</h1>
          <span className="count-badge">{projects.length}</span>
        </div>

        {errorMessage !== null ? (
          <div className="error-banner">{errorMessage}</div>
        ) : null}

        {isLoading ? (
          <div className="home-loading">
            <div className="home-loading-dot" />
            <div className="home-loading-dot" />
            <div className="home-loading-dot" />
          </div>
        ) : projects.length === 0 ? (
          <p className="home-empty-hint">還沒有 Project，從下方建立或匯入一個吧。</p>
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
                <span className="home-project-card-arrow"><IconArrow /></span>
              </button>
            ))}
          </div>
        )}

        <div className="home-actions">
          <button className="home-create-button" disabled={isBusy} onClick={onCreateProject}>
            <IconPlus />
            建立 Project
          </button>
          <button className="home-import-button" disabled={isBusy} onClick={onImportProject}>
            匯入 Project
          </button>
        </div>

      </div>
    </main>
  );
}