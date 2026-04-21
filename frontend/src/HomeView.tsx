import { type Project } from './api';

/* ── Logo ── */
function WhiteboardLogo() {
  return (
    <div className="home-logo" aria-label="Whiteboard">
      <svg
        className="home-logo-icon"
        width="68"
        height="68"
        viewBox="0 0 52 52"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* board */}
        <rect x="4" y="6" width="44" height="36" rx="6" fill="url(#board-grad)" />
        <rect x="4" y="6" width="44" height="36" rx="6" stroke="url(#border-grad)" strokeWidth="1.5" fill="none" />
        {/* decorative marks on the board */}
        <rect x="12" y="16" width="18" height="3" rx="1.5" fill="#7dd3fc" opacity="0.85" />
        <rect x="12" y="23" width="12" height="3" rx="1.5" fill="#a78bfa" opacity="0.7" />
        <rect x="12" y="30" width="22" height="3" rx="1.5" fill="#34d399" opacity="0.65" />
        {/* sticky note accent */}
        <rect x="36" y="14" width="8" height="8" rx="1.5" fill="#fbbf24" opacity="0.9" />
        {/* pen */}
        <g transform="translate(32, 30) rotate(-35)">
          <rect x="0" y="0" width="4" height="18" rx="2" fill="url(#pen-grad)" />
          <polygon points="1,18 3,18 2,22" fill="#374151" />
        </g>
        {/* gradients */}
        <defs>
          <linearGradient id="board-grad" x1="4" y1="6" x2="48" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" />
            <stop offset="1" stopColor="#eef2ff" />
          </linearGradient>
          <linearGradient id="border-grad" x1="4" y1="6" x2="48" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c7d2fe" />
            <stop offset="1" stopColor="#93c5fd" />
          </linearGradient>
          <linearGradient id="pen-grad" x1="2" y1="0" x2="2" y2="18" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" />
            <stop offset="1" stopColor="#2563eb" />
          </linearGradient>
        </defs>
      </svg>
      <div className="home-logo-text">
        <span className="home-logo-wordmark">Whiteboard</span>
        <span className="home-logo-tagline">Think visually, plan freely</span>
      </div>
    </div>
  );
}

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

        <WhiteboardLogo />

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
        ) : projects.length === 0 ? null : (
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
