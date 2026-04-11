# Whiteboard Planner

Local-first whiteboard planning app built with React, FastAPI, and SQLite.

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

## Validation

```powershell
npm run lint
npm run typecheck
npm run format -- --check
npm run build
uv run --project backend pytest
```

Backend health endpoint:

`GET http://127.0.0.1:18000/healthz`
