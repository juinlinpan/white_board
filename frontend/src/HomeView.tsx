import { useMemo, useState } from 'react';
import { type Project } from './api';

const HERO_IMAGE_SRC = '/assets/home-whiteboard-hero.png';

type GalleryLinkedLocation = {
  projectId: string;
  projectName: string;
  pageId: string;
  pageName: string;
};

type GalleryNote = {
  id: string;
  title: string;
  preview: string;
  folder: string;
  linkedLocations: GalleryLinkedLocation[];
};

type Props = {
  errorMessage: string | null;
  isBusy: boolean;
  isLoading: boolean;
  projects: Project[];
  selectedProjectId: string | null;
  notes: GalleryNote[];
  onCreateProject: () => void;
  onImportProject: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenGalleryLink: (projectId: string, pageId: string) => void;
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
  isBusy,
  isLoading,
  projects,
  selectedProjectId,
  notes,
  onCreateProject,
  onImportProject,
  onOpenProject,
  onOpenGalleryLink,
}: Props) {
  const recentProject = latestProject(projects);
  const [tab, setTab] = useState<'projects' | 'gallery'>('projects');
  const folders = useMemo(() => [...new Set(notes.map((note) => note.folder))], [notes]);

  return (
    <main className="home-shell">
      <section className="home-hero-panel" aria-label="Planvas home">
        <div className="home-copy">
          <div className="home-heading-group">
            <p className="home-eyebrow">Projects</p>
            <h1 className="home-title">就是一塊白板</h1>
          </div>
          <div className="home-actions">
            <button className="home-create-button" disabled={isBusy} onClick={onCreateProject}>建立 Project</button>
            <button className="home-import-button" disabled={isBusy} onClick={onImportProject}>匯入 Project</button>
          </div>
        </div>
        <div className="home-visual" aria-hidden="true"><img src={HERO_IMAGE_SRC} alt="" /></div>
      </section>

      <section className="home-project-panel" aria-label="Workspace list">
        <div className="home-header"><h2 className="home-list-title">你的 Workspace</h2></div>
        <div className="home-tabs">
          <button className={`home-tab ${tab === 'projects' ? 'is-active' : ''}`} onClick={() => setTab('projects')}>你的 Projects</button>
          <button className={`home-tab ${tab === 'gallery' ? 'is-active' : ''}`} onClick={() => setTab('gallery')}>Gallery</button>
        </div>

        {tab === 'projects' ? (
          <>
            {errorMessage !== null ? <div className="error-banner">{errorMessage}</div> : null}
            {isLoading ? <div className="home-loading"><div className="home-loading-dot" /><div className="home-loading-dot" /><div className="home-loading-dot" /></div> : (
              <div className="home-project-list">
                {projects.map((project) => (
                  <button key={project.id} className={`home-project-card ${project.id === selectedProjectId ? 'is-selected' : ''}`} disabled={isBusy} onClick={() => onOpenProject(project.id)}>
                    <div className="home-project-card-main"><strong>{project.name}</strong><span>{formatDate(project.updated_at)}</span></div>
                  </button>
                ))}
              </div>
            )}
            <div className="home-panel-footer"><span>最近更新</span><strong>{recentProject?.name ?? 'None'}</strong></div>
          </>
        ) : (
          <div className="gallery-shell">
            <p className="gallery-hint">Folder（floder）可放多份 Markdown，並且同一份筆記可連到多個 page。</p>
            <div className="gallery-folder-row">{folders.map((folder) => <span key={folder} className="gallery-folder-chip">{folder}</span>)}</div>
            <div className="gallery-note-list">
              {notes.map((note) => (
                <article key={note.id} className="gallery-note-card">
                  <header><strong>{note.title}</strong><span>{note.folder}</span></header>
                  <p>{note.preview}</p>
                  <div className="gallery-links">
                    {note.linkedLocations.map((location) => (
                      <button key={`${location.projectId}:${location.pageId}`} onClick={() => onOpenGalleryLink(location.projectId, location.pageId)}>
                        {location.projectName} / {location.pageName}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
