# Backend Service

FastAPI local API service for Whiteboard Planner.

## Storage Layout

Project data is file based. By default the service stores projects under:

- Planvas root: `<user_home>/.planvas/`
- Project directory: `<user_home>/.planvas/<project_name>/`
- Project metadata: `<project_directory>/metadata.json`
- Page files: `<project_directory>/<page_name>.xml`
- Logs: `<backend_root>/logs/app.log`
- Logs: `<backend_root>/logs/backend.log`

Set `WHITEBOARD_PLANVAS_ROOT` if you want project files to live somewhere else.
Set `WHITEBOARD_BACKEND_ROOT` if you want logs and backend runtime files to use a
different writable directory.

Set `WHITEBOARD_FRONTEND_DIST` if the built frontend bundle is not located at
`../frontend/dist`.

## Run

```powershell
uv sync
uv run python -m uvicorn app.main:app --host 127.0.0.1 --port 18000 --reload
```

On startup the service creates any missing `.planvas` and `logs/` directories
and fails fast if the configured roots or files are not writable.

If `frontend/dist/index.html` exists, the backend also serves the built frontend
bundle from `/` so the app can run on a single local port after `npm run build`.
