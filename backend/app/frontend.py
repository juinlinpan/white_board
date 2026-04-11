from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import FileResponse, PlainTextResponse
from starlette.staticfiles import StaticFiles

from app.settings import AppSettings


def configure_frontend(app: FastAPI, settings: AppSettings) -> None:
    if settings.frontend_index_path.is_file():
        assets_dir = settings.frontend_dist_dir / "assets"
        if assets_dir.is_dir():
            app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

        @app.get("/", include_in_schema=False)
        def serve_frontend_index() -> FileResponse:
            return FileResponse(settings.frontend_index_path)

        return

    @app.get("/", include_in_schema=False)
    def frontend_not_built() -> PlainTextResponse:
        return PlainTextResponse(
            (
                "Frontend bundle not found. Run `npm run build` and then "
                "`npm run serve`, or keep using `npm run dev` for split frontend/backend "
                "development."
            ),
            status_code=503,
        )
