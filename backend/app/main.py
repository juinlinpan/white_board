from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.db import WhiteboardRepository, initialize_storage
from app.schemas import (
    BoardItem,
    BoardItemCreatePayload,
    BoardItemListResponse,
    BoardItemUpdatePayload,
    ConnectorLink,
    ConnectorLinkCreatePayload,
    ConnectorLinkListResponse,
    ConnectorLinkUpdatePayload,
    ErrorDetail,
    ErrorPayload,
    ErrorResponse,
    HealthResponse,
    Page,
    PageBoardDataResponse,
    PageCreatePayload,
    PageListResponse,
    PageUpdatePayload,
    PageViewportPayload,
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


def build_error_response(
    *,
    status_code: int,
    code: str,
    message: str,
    details: list[ErrorDetail] | None = None,
) -> JSONResponse:
    payload = ErrorResponse(
        error=ErrorPayload(code=code, message=message, details=details),
    )
    return JSONResponse(status_code=status_code, content=payload.model_dump())


def get_error_code(status_code: int) -> str:
    return {
        status.HTTP_400_BAD_REQUEST: "bad_request",
        status.HTTP_404_NOT_FOUND: "not_found",
        status.HTTP_422_UNPROCESSABLE_CONTENT: "validation_error",
    }.get(status_code, "request_error")


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

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        LOGGER.warning(
            "HTTP error %s on %s %s: %s",
            exc.status_code,
            request.method,
            request.url.path,
            message,
        )
        return build_error_response(
            status_code=exc.status_code,
            code=get_error_code(exc.status_code),
            message=message,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        LOGGER.warning(
            "Validation error on %s %s",
            request.method,
            request.url.path,
        )
        details = [
            ErrorDetail(
                loc=[str(part) if isinstance(part, str) else part for part in error["loc"]],
                msg=error["msg"],
                type=error["type"],
            )
            for error in exc.errors()
        ]
        return build_error_response(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="validation_error",
            message="Request validation failed.",
            details=details,
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(
        request: Request,
        exc: Exception,
    ) -> JSONResponse:
        LOGGER.exception(
            "Unhandled error on %s %s",
            request.method,
            request.url.path,
            exc_info=exc,
        )
        return build_error_response(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code="internal_error",
            message="Internal server error.",
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

    @app.patch("/pages/{page_id}/viewport", response_model=Page)
    def update_page_viewport(
        page_id: str,
        payload: PageViewportPayload,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> Page:
        page = repository.update_page_viewport(page_id, payload)
        LOGGER.info("Updated viewport for page %s", page.id)
        return page

    @app.get("/pages/{page_id}/board-data", response_model=PageBoardDataResponse)
    def get_page_board_data(
        page_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> PageBoardDataResponse:
        return repository.get_page_board_data(page_id)

    @app.get("/pages/{page_id}/board-items", response_model=BoardItemListResponse)
    def list_board_items(
        page_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> BoardItemListResponse:
        return BoardItemListResponse(items=repository.list_board_items(page_id))

    @app.post("/board-items", response_model=BoardItem, status_code=status.HTTP_201_CREATED)
    def create_board_item(
        payload: BoardItemCreatePayload,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> BoardItem:
        item = repository.create_board_item(payload)
        LOGGER.info("Created board item %s", item.id)
        return item

    @app.get("/board-items/{item_id}", response_model=BoardItem)
    def get_board_item(
        item_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> BoardItem:
        return repository.get_board_item(item_id)

    @app.patch("/board-items/{item_id}", response_model=BoardItem)
    def update_board_item(
        item_id: str,
        payload: BoardItemUpdatePayload,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> BoardItem:
        item = repository.update_board_item(item_id, payload)
        LOGGER.info("Updated board item %s", item.id)
        return item

    @app.delete("/board-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_board_item(
        item_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> Response:
        repository.delete_board_item(item_id)
        LOGGER.info("Deleted board item %s", item_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/pages/{page_id}/connectors", response_model=ConnectorLinkListResponse)
    def list_connectors(
        page_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> ConnectorLinkListResponse:
        return ConnectorLinkListResponse(items=repository.list_connector_links(page_id))

    @app.post("/connectors", response_model=ConnectorLink, status_code=status.HTTP_201_CREATED)
    def create_connector(
        payload: ConnectorLinkCreatePayload,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> ConnectorLink:
        connector = repository.create_connector_link(payload)
        LOGGER.info("Created connector %s", connector.id)
        return connector

    @app.get("/connectors/{connector_id}", response_model=ConnectorLink)
    def get_connector(
        connector_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> ConnectorLink:
        return repository.get_connector_link(connector_id)

    @app.patch("/connectors/{connector_id}", response_model=ConnectorLink)
    def update_connector(
        connector_id: str,
        payload: ConnectorLinkUpdatePayload,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> ConnectorLink:
        connector = repository.update_connector_link(connector_id, payload)
        LOGGER.info("Updated connector %s", connector.id)
        return connector

    @app.delete("/connectors/{connector_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_connector(
        connector_id: str,
        repository: Annotated[WhiteboardRepository, Depends(get_repository)],
    ) -> Response:
        repository.delete_connector_link(connector_id)
        LOGGER.info("Deleted connector %s", connector_id)
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return app


app = create_app()
