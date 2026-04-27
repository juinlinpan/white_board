# Whiteboard Planner

Local-first whiteboard planning app built with React, FastAPI, and SQLite.

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

- open an existing `Project`
- create a new `Project`
- import a `Project` from a local JSON snapshot

Import always creates a new local project in SQLite and regenerates page / item /
connector ids to avoid collisions with existing data.

## Page JSON Export / Import

Inside the workspace top header, the current `Page` now supports:

- `Export JSON`: dump the current page viewport + board items + connectors to a
  local `.whiteboard-page.json` file
- `Export PNG`: export a `.png` snapshot automatically cropped to the area that
  contains visible board items
- `Import JSON`: import that page snapshot into the currently opened page

Import behavior is additive: if the current page is empty it fills from the
file, and if the current page already has content the imported items are layered
on top with regenerated local ids.

Page export payloads now also include `page.item_hierarchy.roots` so downstream
tools (including MCP/agent workflows) can directly read containment trees
without rebuilding them from `parent_item_id`.

## Project Import

The home page accepts `.json` or `.whiteboard-project.json` files with a v1
project snapshot payload. Supported top-level shapes are either:

```json
{
  "version": 1,
  "project": {
    "name": "Roadmap",
    "pages": []
  }
}
```

or:

```json
{
  "name": "Roadmap",
  "pages": []
}
```

Each page entry can include either flat viewport fields or a nested `viewport`
object:

```json
{
  "name": "Sprint Planning",
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "board_items": [
    {
      "id": "note-1",
      "category": "small_item",
      "type": "sticky_note",
      "x": 120,
      "y": 140,
      "width": 180,
      "height": 120
    }
  ],
  "connector_links": []
}
```

`board_items[].id` is required inside the import file so parent relations and
connector references can be rebuilt correctly during import.
When present, `page.item_hierarchy` must stay consistent with
`board_items[].parent_item_id`.

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

By default the backend uses `backend/` as its writable root and creates:

- `backend/data/whiteboard.db`
- `backend/logs/app.log`
- `backend/logs/backend.log`

You can override the backend root with `WHITEBOARD_BACKEND_ROOT`:

```powershell
$env:WHITEBOARD_BACKEND_ROOT = "C:\whiteboard-data"
npm run dev:backend
```

Startup now validates that the backend root, `data/`, `logs/`, and the required files are writable. If a configured path is invalid, the backend exits with a clear initialization error instead of failing later during runtime.

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

Create a timestamped local backup of the SQLite database and log files:

```powershell
npm run backup
```

By default backups land in `./backups/whiteboard-backup-<timestamp>/`. You can
override the backend root or output directory:

```powershell
./scripts/backup.ps1 -BackendRoot C:\whiteboard-data -OutputDir D:\whiteboard-backups
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
