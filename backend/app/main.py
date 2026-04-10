from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware

from app.db import WhiteboardRepository, initialize_storage
from app.schemas import (
    HealthResponse,
    Page,
    PageCreatePayload,
    PageListResponse,
    PageUpdatePayload,
    Project,
    ProjectCreatePayload,
    ProjectListResponse,
    ProjectUpdatePayload,
)
from app.settings import AppSettings, get_settings

DEV_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]

LOGGER = logging.getLogger("whiteboard.app")


def configure_logging(settings: AppSettings) -> None:
    if any(
        getattr(handler, "baseFilename", None) == str(settings.app_log_path)
        for handler in LOGGER.handlers
    ):
        return

    LOGGER.setLevel(logging.INFO)
    LOGGER.propagate = False

    formatter = logging.Formatter(
        "%(asctime)s %(levelname)s [%(name)s] %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    file_handler = logging.FileHandler(settings.app_log_path, encoding="utf-8")
    file_handler.setFormatter(formatter)
    LOGGER.addHandler(file_handler)


def get_repository(request: Request) -> WhiteboardRepository:
    settings = request.app.state.settings
    return WhiteboardRepository(settings)


def create_app(settings: AppSettings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        initialize_storage(resolved_settings)
        configure_logging(resolved_settings)
        LOGGER.info("Backend started with root %s", resolved_settings.backend_root)
        yield

    app = FastAPI(title="Whiteboard Planner Backend", lifespan=lifespan)
    app.state.settings = resolved_settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=DEV_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz", response_model=HealthResponse)
    def healthz() -> HealthResponse:
        return HealthResponse(service="whiteboard-backend", status="ok")

    @app.get("/projects", response_model=ProjectListResponse)
    def list_projects(
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> ProjectListResponse:
        return ProjectListResponse(items=repository.list_projects())

    @app.post("/projects", response_model=Project, status_code=status.HTTP_201_CREATED)
    def create_project(
        payload: ProjectCreatePayload,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> Project:
        project = repository.create_project(payload)
        LOGGER.info("Created project %s", project.id)
        return project

    @app.get("/projects/{project_id}", response_model=Project)
    def get_project(
        project_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> Project:
        return repository.get_project(project_id)

    @app.patch("/projects/{project_id}", response_model=Project)
    def update_project(
        project_id: str,
        payload: ProjectUpdatePayload,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> Project:
        project = repository.update_project(project_id, payload)
        LOGGER.info("Updated project %s", project.id)
        return project

    @app.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_project(
        project_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> Response:
        repository.delete_project(project_id)
        LOGGER.info("Deleted project %s", project_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/projects/{project_id}/pages", response_model=PageListResponse)
    def list_pages(
        project_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> PageListResponse:
        return PageListResponse(items=repository.list_pages(project_id))

    @app.post(
        "/projects/{project_id}/pages",
        response_model=Page,
        status_code=status.HTTP_201_CREATED,
    )
    def create_page(
        project_id: str,
        payload: PageCreatePayload,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> Page:
        page = repository.create_page(project_id, payload)
        LOGGER.info("Created page %s under project %s", page.id, project_id)
        return page

    @app.get("/pages/{page_id}", response_model=Page)
    def get_page(
        page_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> Page:
        return repository.get_page(page_id)

    @app.patch("/pages/{page_id}", response_model=Page)
    def update_page(
        page_id: str,
        payload: PageUpdatePayload,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> Page:
        page = repository.update_page(page_id, payload)
        LOGGER.info("Updated page %s", page.id)
        return page

    @app.delete("/pages/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_page(
        page_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> Response:
        repository.delete_page(page_id)
        LOGGER.info("Deleted page %s", page_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return app


app = create_app()
