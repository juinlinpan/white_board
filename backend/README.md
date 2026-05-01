# Backend Service

FastAPI local API service for Whiteboard Planner.

## Storage Layout

Project data is file based. By default the service stores projects under:

- Planvas root: `<user_home>/.planvas/`
- Project index: `<user_home>/.planvas/project.json`
- Default project store: `<user_home>/.planvas/project_store/`
- New project directory: `<user_home>/.planvas/project_store/<project_name>/`
- External project directory: any user-selected writable folder registered in `project.json`
- Project data directory: `<project_directory>/.pv_project/`
- Project metadata: `<project_directory>/.pv_project/metadata.json`
- Page files: `<project_directory>/.pv_project/<page_name>.xml`
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

On startup the service creates any missing `.planvas`, `project_store`, and
`logs/` directories and fails fast if the configured roots or files are not
writable.

`POST /projects` creates new projects under `project_store`. `POST
/projects/open-dialog` opens a native folder picker and registers the selected
path, creating `.pv_project/` and `.pv_project/metadata.json` only when they are missing.
`GET /projects` refreshes path existence and returns `project_store` projects
before other registered paths.
`DELETE /projects/{project_id}` removes a missing registered path from
`project.json`; existing external project folders are not deleted.

If `frontend/dist/index.html` exists, the backend also serves the built frontend
bundle from `/` so the app can run on a single local port after `npm run build`.
