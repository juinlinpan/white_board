# Backend Service

FastAPI local API service for Whiteboard Planner.

## Storage Layout

The backend root is `backend/` by default.

- SQLite: `<backend_root>/data/whiteboard.db`
- Logs: `<backend_root>/logs/app.log`
- Logs: `<backend_root>/logs/backend.log`

Set `WHITEBOARD_BACKEND_ROOT` if you want the service to use a different writable directory.

## Run

```powershell
uv sync
uv run python -m uvicorn app.main:app --host 127.0.0.1 --port 18000 --reload
```

On startup the service creates any missing `data/` and `logs/` directories and fails fast if the configured backend root or files are not writable.
