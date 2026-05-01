# Whiteboard Planner

Local-first whiteboard planning app built with React, FastAPI, and file-based project storage.

## Navigation Notes

- Opening a `Project` from the home screen now writes a dedicated browser history entry and enters the workspace on a real `Page` immediately. If a current page is already known for that project, the app keeps it; otherwise it falls back to the first page in the project.
- The workspace left sidebar no longer shows project controls. Project renaming now happens directly in the top workspace header.
- The `Home` button now lives in the workspace sidebar header, to the right of the `Whiteboard` title.

## Workspace Layout

- `frontend/`: React + TypeScript + Vite web UI
- `backend/`: Python 3.12 + FastAPI local API service
- `scripts/`: Windows preflight and bootstrap helpers

## Prerequisites

Run the Windows preflight check first:

```powershell
./scripts/preflight.ps1
```

If Python 3.12 is missing, bootstrap it:

```powershell
./scripts/bootstrap.ps1 -InstallPython
```

`node`、`npm`、`uv` 仍需先在本機可用。

## Development

Install JavaScript dependencies:

```powershell
npm install
```

Sync the Python environment:

```powershell
uv sync --project backend
```

Start frontend and backend together:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173` in your browser.

This mode keeps Vite on `5173` and the FastAPI backend on `18000`.

## Project Home

The app now opens on a dedicated home page. From there you can:

- create a new `Project`
- open an existing `Project` folder with the native folder picker
- refresh common projects to re-check whether registered paths still exist
- remove missing registered projects from the common project list

New projects are created under `<user_home>/.planvas/project_store/`. Opened
external folders are initialized as Planvas projects when needed, then registered
in `<user_home>/.planvas/project.json`. The home list shows `project_store`
projects first, then registered projects from other paths.

## Page JSON Export / Import

Inside the workspace top header, the current `Page` now supports:

- `Export JSON`: dump the current page viewport + board items + connectors to a
  local `.whiteboard-page.json` file
- `Export PNG`: export a `.png` snapshot automatically cropped to the area that
  contains visible board items
- `Export PPTX`: export a `.pptx` deck with the current page rendered as a
  single slide, keeping the page name plus a page-level raster snapshot fallback
- `Import JSON`: import that page snapshot into the currently opened page

Import behavior is additive: if the current page is empty it fills from the
file, and if the current page already has content the imported items are layered
on top with regenerated local ids.

Page export payloads now also include `page.item_hierarchy.roots` so downstream
tools (including MCP/agent workflows) can directly read containment trees
without rebuilding them from `parent_item_id`.

## Single-Port Local Run

Build the frontend bundle first:

```powershell
npm run build
```

Then start the backend-only server:

```powershell
npm run serve
```

Open `http://127.0.0.1:18000` in your browser. FastAPI will serve the built
frontend bundle from `frontend/dist` and continue exposing the API on the same
port.

## Backend Storage

Project content is stored as regular files. By default the backend creates:

- `<user_home>/.planvas/project.json`
- `<user_home>/.planvas/project_store/<project_name>/.pv_project/`
- `<user_home>/.planvas/project_store/<project_name>/.pv_project/metadata.json`
- `<user_home>/.planvas/project_store/<project_name>/.pv_project/<page_name>.xml`
- `backend/logs/app.log`
- `backend/logs/backend.log`

Projects opened from other folders use the same `.pv_project/` data directory
inside the selected folder, with metadata and page XML files under it. Their paths are tracked in
`project.json`.

You can override the project storage root with `WHITEBOARD_PLANVAS_ROOT`:

```powershell
$env:WHITEBOARD_PLANVAS_ROOT = "D:\planvas-projects"
npm run dev:backend
```

You can override the backend root for logs and runtime files with
`WHITEBOARD_BACKEND_ROOT`:

```powershell
$env:WHITEBOARD_BACKEND_ROOT = "C:\whiteboard-runtime"
npm run dev:backend
```

Startup validates that the backend root, Planvas root, `logs/`, and required log
files are writable. If a configured path is invalid, the backend exits with a
clear initialization error instead of failing later during runtime.

If the frontend build output lives somewhere else, override it with
`WHITEBOARD_FRONTEND_DIST` before running `npm run serve`:

```powershell
$env:WHITEBOARD_FRONTEND_DIST = "C:\whiteboard-build\dist"
npm run serve
```

## Smoke Test

Run a basic local smoke pass that builds the frontend bundle and verifies backend
startup plus static asset serving:

```powershell
npm run smoke
```

Use `./scripts/smoke.ps1 -SkipBuild` if you already have a fresh `frontend/dist`.

## Backup

Create a timestamped local backup of the Planvas project files and log files:

```powershell
npm run backup
```

By default backups land in `./backups/whiteboard-backup-<timestamp>/`. You can
override the Planvas root, backend root, or output directory:

```powershell
./scripts/backup.ps1 -PlanvasRoot D:\planvas-projects -BackendRoot C:\whiteboard-runtime -OutputDir D:\whiteboard-backups
```

## Validation

```powershell
npm run lint
npm run typecheck
npm run format -- --check
npm run build
uv run --project backend pytest
npm run smoke
```

Backend health endpoint:

`GET http://127.0.0.1:18000/healthz`
