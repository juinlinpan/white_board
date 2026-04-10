from __future__ import annotations

import logging
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException, status

from app.schemas import (
    Page,
    PageCreatePayload,
    PageUpdatePayload,
    Project,
    ProjectCreatePayload,
    ProjectUpdatePayload,
)
from app.settings import AppSettings

LOGGER = logging.getLogger("whiteboard.app")

SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        viewport_x REAL NOT NULL DEFAULT 0,
        viewport_y REAL NOT NULL DEFAULT 0,
        zoom REAL NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS board_items (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL,
        parent_item_id TEXT,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT,
        content TEXT,
        content_format TEXT,
        x REAL NOT NULL DEFAULT 0,
        y REAL NOT NULL DEFAULT 0,
        width REAL NOT NULL DEFAULT 0,
        height REAL NOT NULL DEFAULT 0,
        rotation REAL NOT NULL DEFAULT 0,
        z_index INTEGER NOT NULL DEFAULT 0,
        is_collapsed INTEGER NOT NULL DEFAULT 0,
        style_json TEXT,
        data_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(page_id) REFERENCES pages(id) ON DELETE CASCADE,
        FOREIGN KEY(parent_item_id) REFERENCES board_items(id) ON DELETE SET NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS connector_links (
        id TEXT PRIMARY KEY,
        connector_item_id TEXT NOT NULL,
        from_item_id TEXT,
        to_item_id TEXT,
        from_anchor TEXT,
        to_anchor TEXT,
        FOREIGN KEY(connector_item_id) REFERENCES board_items(id) ON DELETE CASCADE,
        FOREIGN KEY(from_item_id) REFERENCES board_items(id) ON DELETE CASCADE,
        FOREIGN KEY(to_item_id) REFERENCES board_items(id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_pages_project_id ON pages(project_id)",
    "CREATE INDEX IF NOT EXISTS idx_board_items_page_id ON board_items(page_id)",
    "CREATE INDEX IF NOT EXISTS idx_board_items_parent_item_id ON board_items(parent_item_id)",
    """
    CREATE INDEX IF NOT EXISTS idx_connector_links_connector_item_id
    ON connector_links(connector_item_id)
    """,
    "CREATE INDEX IF NOT EXISTS idx_connector_links_from_item_id ON connector_links(from_item_id)",
    "CREATE INDEX IF NOT EXISTS idx_connector_links_to_item_id ON connector_links(to_item_id)",
)


def initialize_storage(settings: AppSettings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.logs_dir.mkdir(parents=True, exist_ok=True)
    settings.app_log_path.touch(exist_ok=True)
    settings.backend_log_path.touch(exist_ok=True)

    with sqlite3.connect(settings.sqlite_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        for statement in SCHEMA_STATEMENTS:
            connection.execute(statement)
        connection.commit()

    LOGGER.info("Storage initialized at %s", settings.sqlite_path)


class WhiteboardRepository:
    def __init__(self, settings: AppSettings) -> None:
        self.settings = settings

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.settings.sqlite_path)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def list_projects(self) -> list[Project]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, name, sort_order, created_at, updated_at
                FROM projects
                ORDER BY sort_order ASC, created_at ASC
                """
            ).fetchall()
        return [self._project_from_row(row) for row in rows]

    def get_project(self, project_id: str) -> Project:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT id, name, sort_order, created_at, updated_at
                FROM projects
                WHERE id = ?
                """,
                (project_id,),
            ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project '{project_id}' was not found.",
            )

        return self._project_from_row(row)

    def create_project(self, payload: ProjectCreatePayload) -> Project:
        timestamp = utc_timestamp()
        project_id = str(uuid4())
        with self._connect() as connection:
            sort_order = self._next_sort_order(connection, "projects")
            connection.execute(
                """
                INSERT INTO projects (id, name, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (project_id, payload.name, sort_order, timestamp, timestamp),
            )
            row = connection.execute(
                """
                SELECT id, name, sort_order, created_at, updated_at
                FROM projects
                WHERE id = ?
                """,
                (project_id,),
            ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Project creation did not persist correctly.",
            )

        return self._project_from_row(row)

    def update_project(self, project_id: str, payload: ProjectUpdatePayload) -> Project:
        timestamp = utc_timestamp()
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE projects
                SET name = ?, updated_at = ?
                WHERE id = ?
                """,
                (payload.name, timestamp, project_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Project '{project_id}' was not found.",
                )

            row = connection.execute(
                """
                SELECT id, name, sort_order, created_at, updated_at
                FROM projects
                WHERE id = ?
                """,
                (project_id,),
            ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Project update did not persist correctly.",
            )

        return self._project_from_row(row)

    def delete_project(self, project_id: str) -> None:
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Project '{project_id}' was not found.",
                )

    def list_pages(self, project_id: str) -> list[Page]:
        self.get_project(project_id)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    project_id,
                    name,
                    sort_order,
                    viewport_x,
                    viewport_y,
                    zoom,
                    created_at,
                    updated_at
                FROM pages
                WHERE project_id = ?
                ORDER BY sort_order ASC, created_at ASC
                """,
                (project_id,),
            ).fetchall()

        return [self._page_from_row(row) for row in rows]

    def get_page(self, page_id: str) -> Page:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    project_id,
                    name,
                    sort_order,
                    viewport_x,
                    viewport_y,
                    zoom,
                    created_at,
                    updated_at
                FROM pages
                WHERE id = ?
                """,
                (page_id,),
            ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Page '{page_id}' was not found.",
            )

        return self._page_from_row(row)

    def create_page(self, project_id: str, payload: PageCreatePayload) -> Page:
        self.get_project(project_id)
        timestamp = utc_timestamp()
        page_id = str(uuid4())
        with self._connect() as connection:
            sort_order = self._next_sort_order(
                connection,
                "pages",
                where_clause="project_id = ?",
                parameters=(project_id,),
            )
            connection.execute(
                """
                INSERT INTO pages (
                    id,
                    project_id,
                    name,
                    sort_order,
                    viewport_x,
                    viewport_y,
                    zoom,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, 0, 0, 1, ?, ?)
                """,
                (page_id, project_id, payload.name, sort_order, timestamp, timestamp),
            )
            row = connection.execute(
                """
                SELECT
                    id,
                    project_id,
                    name,
                    sort_order,
                    viewport_x,
                    viewport_y,
                    zoom,
                    created_at,
                    updated_at
                FROM pages
                WHERE id = ?
                """,
                (page_id,),
            ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Page creation did not persist correctly.",
            )

        return self._page_from_row(row)

    def update_page(self, page_id: str, payload: PageUpdatePayload) -> Page:
        timestamp = utc_timestamp()
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE pages
                SET name = ?, updated_at = ?
                WHERE id = ?
                """,
                (payload.name, timestamp, page_id),
            )
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Page '{page_id}' was not found.",
                )

            row = connection.execute(
                """
                SELECT
                    id,
                    project_id,
                    name,
                    sort_order,
                    viewport_x,
                    viewport_y,
                    zoom,
                    created_at,
                    updated_at
                FROM pages
                WHERE id = ?
                """,
                (page_id,),
            ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Page update did not persist correctly.",
            )

        return self._page_from_row(row)

    def delete_page(self, page_id: str) -> None:
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM pages WHERE id = ?", (page_id,))
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Page '{page_id}' was not found.",
                )

    def _next_sort_order(
        self,
        connection: sqlite3.Connection,
        table_name: str,
        where_clause: str | None = None,
        parameters: tuple[object, ...] = (),
    ) -> int:
        query = f"SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort_order FROM {table_name}"
        if where_clause is not None:
            query = f"{query} WHERE {where_clause}"

        row = connection.execute(query, parameters).fetchone()
        if row is None:
            return 0
        return int(row["next_sort_order"])

    def _project_from_row(self, row: sqlite3.Row) -> Project:
        return Project.model_validate(dict(row))

    def _page_from_row(self, row: sqlite3.Row) -> Page:
        return Page.model_validate(dict(row))


def utc_timestamp() -> str:
    return datetime.now(tz=UTC).replace(microsecond=0).isoformat()
