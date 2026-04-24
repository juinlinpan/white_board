from __future__ import annotations

import logging
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, status

from app.schemas import (
    BoardItem,
    BoardItemCreatePayload,
    BoardItemUpdatePayload,
    ConnectorLink,
    ConnectorLinkCreatePayload,
    ConnectorLinkUpdatePayload,
    Page,
    PageBoardData,
    PageCreatePayload,
    PageUpdatePayload,
    PageViewportPayload,
    Project,
    ProjectCreatePayload,
    ProjectUpdatePayload,
)
from app.settings import AppSettings

LOGGER = logging.getLogger("whiteboard.app")
CONNECTABLE_ITEM_TYPES = {"text_box", "sticky_note", "note_paper", "frame"}
NEW_PAGE_VIEWPORT_X = 240.0
NEW_PAGE_VIEWPORT_Y = 160.0
NEW_PAGE_DEFAULT_ZOOM = 1.0


class StorageInitializationError(RuntimeError):
    pass

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
    _ensure_directory(settings.backend_root, "Backend root")
    _ensure_writable_directory(settings.backend_root, "Backend root")
    _ensure_directory(settings.data_dir, "Data directory")
    _ensure_writable_directory(settings.data_dir, "Data directory")
    _ensure_directory(settings.logs_dir, "Logs directory")
    _ensure_writable_directory(settings.logs_dir, "Logs directory")
    _ensure_writable_file(settings.sqlite_path, "SQLite database")
    _ensure_writable_file(settings.app_log_path, "App log")
    _ensure_writable_file(settings.backend_log_path, "Backend log")

    try:
        with sqlite3.connect(settings.sqlite_path) as connection:
            connection.execute("PRAGMA foreign_keys = ON")
            for statement in SCHEMA_STATEMENTS:
                connection.execute(statement)
            connection.commit()
    except sqlite3.Error as exc:
        raise StorageInitializationError(
            f"Failed to initialize SQLite at '{settings.sqlite_path}': {exc}"
        ) from exc

    LOGGER.info("Storage initialized at %s", settings.sqlite_path)


def _ensure_directory(path: Path, label: str) -> None:
    if path.exists() and not path.is_dir():
        raise StorageInitializationError(f"{label} '{path}' must be a directory.")

    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise StorageInitializationError(
            f"Failed to create {label.lower()} '{path}': {exc}"
        ) from exc


def _ensure_writable_directory(path: Path, label: str) -> None:
    probe_path = path / f".whiteboard-write-test-{uuid4().hex}"
    try:
        probe_path.write_text("", encoding="utf-8")
    except OSError as exc:
        raise StorageInitializationError(
            f"{label} '{path}' is not writable: {exc}"
        ) from exc
    finally:
        if probe_path.exists():
            probe_path.unlink(missing_ok=True)


def _ensure_writable_file(path: Path, label: str) -> None:
    try:
        path.touch(exist_ok=True)
        with path.open("a", encoding="utf-8"):
            pass
    except OSError as exc:
        raise StorageInitializationError(
            f"{label} '{path}' is not writable: {exc}"
        ) from exc


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

    def reorder_projects(self, ordered_ids: list[str]) -> list[Project]:
        timestamp = utc_timestamp()
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, sort_order
                FROM projects
                ORDER BY sort_order ASC, created_at ASC
                """
            ).fetchall()
            self._validate_reorder_ids(
                existing_ids=[row["id"] for row in rows],
                ordered_ids=ordered_ids,
                entity_label="Project",
            )
            self._apply_sort_order_updates(
                connection=connection,
                table_name="projects",
                ordered_ids=ordered_ids,
                current_sort_order_by_id={
                    row["id"]: int(row["sort_order"]) for row in rows
                },
                timestamp=timestamp,
            )
            reordered_rows = connection.execute(
                """
                SELECT id, name, sort_order, created_at, updated_at
                FROM projects
                ORDER BY sort_order ASC, created_at ASC
                """
            ).fetchall()

        return [self._project_from_row(row) for row in reordered_rows]

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
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    page_id,
                    project_id,
                    payload.name,
                    sort_order,
                    NEW_PAGE_VIEWPORT_X,
                    NEW_PAGE_VIEWPORT_Y,
                    NEW_PAGE_DEFAULT_ZOOM,
                    timestamp,
                    timestamp,
                ),
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

    def reorder_pages(self, project_id: str, ordered_ids: list[str]) -> list[Page]:
        self.get_project(project_id)
        timestamp = utc_timestamp()
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, sort_order
                FROM pages
                WHERE project_id = ?
                ORDER BY sort_order ASC, created_at ASC
                """,
                (project_id,),
            ).fetchall()
            self._validate_reorder_ids(
                existing_ids=[row["id"] for row in rows],
                ordered_ids=ordered_ids,
                entity_label="Page",
            )
            self._apply_sort_order_updates(
                connection=connection,
                table_name="pages",
                ordered_ids=ordered_ids,
                current_sort_order_by_id={
                    row["id"]: int(row["sort_order"]) for row in rows
                },
                timestamp=timestamp,
            )
            reordered_rows = connection.execute(
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

        return [self._page_from_row(row) for row in reordered_rows]

    def duplicate_page(self, page_id: str) -> Page:
        source_page = self.get_page(page_id)
        timestamp = utc_timestamp()
        duplicated_page_id = str(uuid4())
        duplicated_name: str | None = None

        with self._connect() as connection:
            duplicated_name = self._build_duplicate_page_name(
                connection=connection,
                project_id=source_page.project_id,
                source_name=source_page.name,
            )
            connection.execute(
                """
                UPDATE pages
                SET sort_order = sort_order + 1, updated_at = ?
                WHERE project_id = ? AND sort_order > ?
                """,
                (timestamp, source_page.project_id, source_page.sort_order),
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
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    duplicated_page_id,
                    source_page.project_id,
                    duplicated_name,
                    source_page.sort_order + 1,
                    source_page.viewport_x,
                    source_page.viewport_y,
                    source_page.zoom,
                    timestamp,
                    timestamp,
                ),
            )

            source_items = connection.execute(
                """
                SELECT *
                FROM board_items
                WHERE page_id = ?
                ORDER BY z_index ASC, created_at ASC
                """,
                (page_id,),
            ).fetchall()
            duplicated_item_id_by_source_id = {
                row["id"]: str(uuid4()) for row in source_items
            }
            for row in source_items:
                connection.execute(
                    """
                    INSERT INTO board_items (
                        id,
                        page_id,
                        parent_item_id,
                        category,
                        type,
                        title,
                        content,
                        content_format,
                        x,
                        y,
                        width,
                        height,
                        rotation,
                        z_index,
                        is_collapsed,
                        style_json,
                        data_json,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        duplicated_item_id_by_source_id[row["id"]],
                        duplicated_page_id,
                        self._get_duplicated_item_reference(
                            duplicated_item_id_by_source_id,
                            row["parent_item_id"],
                        ),
                        row["category"],
                        row["type"],
                        row["title"],
                        row["content"],
                        row["content_format"],
                        row["x"],
                        row["y"],
                        row["width"],
                        row["height"],
                        row["rotation"],
                        row["z_index"],
                        row["is_collapsed"],
                        row["style_json"],
                        row["data_json"],
                        timestamp,
                        timestamp,
                    ),
                )

            source_connectors = connection.execute(
                """
                SELECT cl.*
                FROM connector_links cl
                INNER JOIN board_items bi ON bi.id = cl.connector_item_id
                WHERE bi.page_id = ?
                ORDER BY cl.id ASC
                """,
                (page_id,),
            ).fetchall()
            for row in source_connectors:
                connection.execute(
                    """
                    INSERT INTO connector_links (
                        id,
                        connector_item_id,
                        from_item_id,
                        to_item_id,
                        from_anchor,
                        to_anchor
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        str(uuid4()),
                        self._get_duplicated_item_reference(
                            duplicated_item_id_by_source_id,
                            row["connector_item_id"],
                            required=True,
                        ),
                        self._get_duplicated_item_reference(
                            duplicated_item_id_by_source_id,
                            row["from_item_id"],
                        ),
                        self._get_duplicated_item_reference(
                            duplicated_item_id_by_source_id,
                            row["to_item_id"],
                        ),
                        row["from_anchor"],
                        row["to_anchor"],
                    ),
                )

            duplicated_row = connection.execute(
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
                (duplicated_page_id,),
            ).fetchone()

        if duplicated_row is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Page duplication did not persist correctly.",
            )

        return self._page_from_row(duplicated_row)

    def update_page_viewport(self, page_id: str, payload: PageViewportPayload) -> Page:
        timestamp = utc_timestamp()
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE pages
                SET viewport_x = ?, viewport_y = ?, zoom = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    payload.viewport_x,
                    payload.viewport_y,
                    payload.zoom,
                    timestamp,
                    page_id,
                ),
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
                detail="Page viewport update did not persist correctly.",
            )

        return self._page_from_row(row)

    def list_board_items(self, page_id: str) -> list[BoardItem]:
        self.get_page(page_id)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    id,
                    page_id,
                    parent_item_id,
                    category,
                    type,
                    title,
                    content,
                    content_format,
                    x,
                    y,
                    width,
                    height,
                    rotation,
                    z_index,
                    is_collapsed,
                    style_json,
                    data_json,
                    created_at,
                    updated_at
                FROM board_items
                WHERE page_id = ?
                ORDER BY z_index ASC, created_at ASC
                """,
                (page_id,),
            ).fetchall()
        return [self._board_item_from_row(row) for row in rows]

    def get_board_item(self, item_id: str) -> BoardItem:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    page_id,
                    parent_item_id,
                    category,
                    type,
                    title,
                    content,
                    content_format,
                    x,
                    y,
                    width,
                    height,
                    rotation,
                    z_index,
                    is_collapsed,
                    style_json,
                    data_json,
                    created_at,
                    updated_at
                FROM board_items
                WHERE id = ?
                """,
                (item_id,),
            ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Board item '{item_id}' was not found.",
            )

        return self._board_item_from_row(row)

    def create_board_item(self, payload: BoardItemCreatePayload) -> BoardItem:
        self.get_page(payload.page_id)
        if payload.parent_item_id is not None:
            self.get_board_item(payload.parent_item_id)
        item_id = str(uuid4())
        timestamp = utc_timestamp()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO board_items (
                    id,
                    page_id,
                    parent_item_id,
                    category,
                    type,
                    title,
                    content,
                    content_format,
                    x,
                    y,
                    width,
                    height,
                    rotation,
                    z_index,
                    is_collapsed,
                    style_json,
                    data_json,
                    created_at,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_id,
                    payload.page_id,
                    payload.parent_item_id,
                    payload.category,
                    payload.type,
                    payload.title,
                    payload.content,
                    payload.content_format,
                    payload.x,
                    payload.y,
                    payload.width,
                    payload.height,
                    payload.rotation,
                    payload.z_index,
                    int(payload.is_collapsed),
                    payload.style_json,
                    payload.data_json,
                    timestamp,
                    timestamp,
                ),
            )
            row = connection.execute(
                "SELECT * FROM board_items WHERE id = ?",
                (item_id,),
            ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Board item creation did not persist correctly.",
            )
        return self._board_item_from_row(row)

    def update_board_item(self, item_id: str, payload: BoardItemUpdatePayload) -> BoardItem:
        self.get_page(payload.page_id)
        if payload.parent_item_id is not None:
            self.get_board_item(payload.parent_item_id)
        timestamp = utc_timestamp()
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE board_items
                SET
                    page_id = ?,
                    parent_item_id = ?,
                    category = ?,
                    type = ?,
                    title = ?,
                    content = ?,
                    content_format = ?,
                    x = ?,
                    y = ?,
                    width = ?,
                    height = ?,
                    rotation = ?,
                    z_index = ?,
                    is_collapsed = ?,
                    style_json = ?,
                    data_json = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    payload.page_id,
                    payload.parent_item_id,
                    payload.category,
                    payload.type,
                    payload.title,
                    payload.content,
                    payload.content_format,
                    payload.x,
                    payload.y,
                    payload.width,
                    payload.height,
                    payload.rotation,
                    payload.z_index,
                    int(payload.is_collapsed),
                    payload.style_json,
                    payload.data_json,
                    timestamp,
                    item_id,
                ),
            )
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Board item '{item_id}' was not found.",
                )
            row = connection.execute(
                "SELECT * FROM board_items WHERE id = ?",
                (item_id,),
            ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Board item update did not persist correctly.",
            )
        return self._board_item_from_row(row)

    def delete_board_item(self, item_id: str) -> None:
        with self._connect() as connection:
            related_arrow_ids = [
                row["connector_item_id"]
                for row in connection.execute(
                    """
                    SELECT DISTINCT connector_item_id
                    FROM connector_links
                    WHERE from_item_id = ? OR to_item_id = ?
                    """,
                    (item_id, item_id),
                ).fetchall()
                if row["connector_item_id"] != item_id
            ]

            if related_arrow_ids:
                placeholders = ", ".join("?" for _ in related_arrow_ids)
                connection.execute(
                    f"DELETE FROM board_items WHERE id IN ({placeholders})",
                    tuple(related_arrow_ids),
                )

            cursor = connection.execute("DELETE FROM board_items WHERE id = ?", (item_id,))
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Board item '{item_id}' was not found.",
                )

    def list_connector_links(self, page_id: str) -> list[ConnectorLink]:
        self.get_page(page_id)
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    cl.id,
                    cl.connector_item_id,
                    cl.from_item_id,
                    cl.to_item_id,
                    cl.from_anchor,
                    cl.to_anchor
                FROM connector_links cl
                INNER JOIN board_items bi ON bi.id = cl.connector_item_id
                WHERE bi.page_id = ?
                ORDER BY cl.id ASC
                """,
                (page_id,),
            ).fetchall()
        return [self._connector_from_row(row) for row in rows]

    def get_connector_link(self, connector_id: str) -> ConnectorLink:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    id,
                    connector_item_id,
                    from_item_id,
                    to_item_id,
                    from_anchor,
                    to_anchor
                FROM connector_links
                WHERE id = ?
                """,
                (connector_id,),
            ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Connector '{connector_id}' was not found.",
            )
        return self._connector_from_row(row)

    def create_connector_link(self, payload: ConnectorLinkCreatePayload) -> ConnectorLink:
        self._validate_connector_payload(payload)
        connector_id = str(uuid4())
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO connector_links (
                    id,
                    connector_item_id,
                    from_item_id,
                    to_item_id,
                    from_anchor,
                    to_anchor
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    connector_id,
                    payload.connector_item_id,
                    payload.from_item_id,
                    payload.to_item_id,
                    payload.from_anchor,
                    payload.to_anchor,
                ),
            )
            row = connection.execute(
                "SELECT * FROM connector_links WHERE id = ?",
                (connector_id,),
            ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Connector creation did not persist correctly.",
            )
        return self._connector_from_row(row)

    def update_connector_link(
        self,
        connector_id: str,
        payload: ConnectorLinkUpdatePayload,
    ) -> ConnectorLink:
        self._validate_connector_payload(payload)
        with self._connect() as connection:
            cursor = connection.execute(
                """
                UPDATE connector_links
                SET
                    connector_item_id = ?,
                    from_item_id = ?,
                    to_item_id = ?,
                    from_anchor = ?,
                    to_anchor = ?
                WHERE id = ?
                """,
                (
                    payload.connector_item_id,
                    payload.from_item_id,
                    payload.to_item_id,
                    payload.from_anchor,
                    payload.to_anchor,
                    connector_id,
                ),
            )
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Connector '{connector_id}' was not found.",
                )
            row = connection.execute(
                "SELECT * FROM connector_links WHERE id = ?",
                (connector_id,),
            ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Connector update did not persist correctly.",
            )
        return self._connector_from_row(row)

    def delete_connector_link(self, connector_id: str) -> None:
        with self._connect() as connection:
            cursor = connection.execute("DELETE FROM connector_links WHERE id = ?", (connector_id,))
            if cursor.rowcount == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Connector '{connector_id}' was not found.",
                )

    def replace_page_board_state(
        self,
        page_id: str,
        board_items: list[BoardItem],
        connector_links: list[ConnectorLink],
    ) -> PageBoardData:
        self.get_page(page_id)
        item_by_id = self._validate_board_state_payload(
            page_id=page_id,
            board_items=board_items,
            connector_links=connector_links,
        )

        with self._connect() as connection:
            connection.execute("DELETE FROM board_items WHERE page_id = ?", (page_id,))
            self._insert_board_state_items(connection, board_items)
            self._insert_board_state_connectors(
                connection,
                connector_links,
                item_by_id=item_by_id,
            )

        return self.get_page_board_data(page_id)

    def get_page_board_data(self, page_id: str) -> PageBoardData:
        page = self.get_page(page_id)
        return PageBoardData(
            page=page,
            board_items=self.list_board_items(page_id),
            connector_links=self.list_connector_links(page_id),
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

    def _board_item_from_row(self, row: sqlite3.Row) -> BoardItem:
        payload = dict(row)
        payload["is_collapsed"] = bool(payload["is_collapsed"])
        return BoardItem.model_validate(payload)

    def _connector_from_row(self, row: sqlite3.Row) -> ConnectorLink:
        return ConnectorLink.model_validate(dict(row))

    def _validate_board_state_payload(
        self,
        *,
        page_id: str,
        board_items: list[BoardItem],
        connector_links: list[ConnectorLink],
    ) -> dict[str, BoardItem]:
        item_ids = [item.id for item in board_items]
        if len(set(item_ids)) != len(item_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Board state contains duplicate board item ids.",
            )

        connector_ids = [connector.id for connector in connector_links]
        if len(set(connector_ids)) != len(connector_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Board state contains duplicate connector ids.",
            )

        item_by_id = {item.id: item for item in board_items}
        for item in board_items:
            if item.page_id != page_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Board state items must belong to the target page.",
                )

            if item.parent_item_id is not None and item.parent_item_id not in item_by_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Board state item parent references must exist in the payload.",
                )

        for connector in connector_links:
            connector_item = item_by_id.get(connector.connector_item_id)
            if connector_item is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Board state connector item references must exist in the payload.",
                )

            self._validate_connector_targets(
                connector_item=connector_item,
                from_item=item_by_id.get(connector.from_item_id)
                if connector.from_item_id is not None
                else None,
                to_item=item_by_id.get(connector.to_item_id)
                if connector.to_item_id is not None
                else None,
            )

            for role, item_id in (
                ("from", connector.from_item_id),
                ("to", connector.to_item_id),
            ):
                if item_id is None:
                    continue
                if item_id not in item_by_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Board state connector {role} item references must exist "
                            "in the payload."
                        ),
                    )

        return item_by_id

    def _insert_board_state_items(
        self,
        connection: sqlite3.Connection,
        board_items: list[BoardItem],
    ) -> None:
        pending_items = {item.id: item for item in board_items}
        inserted_ids: set[str] = set()

        while pending_items:
            inserted_this_round = False

            for item_id, item in list(pending_items.items()):
                if item.parent_item_id is not None and item.parent_item_id not in inserted_ids:
                    continue

                connection.execute(
                    """
                    INSERT INTO board_items (
                        id,
                        page_id,
                        parent_item_id,
                        category,
                        type,
                        title,
                        content,
                        content_format,
                        x,
                        y,
                        width,
                        height,
                        rotation,
                        z_index,
                        is_collapsed,
                        style_json,
                        data_json,
                        created_at,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        item.id,
                        item.page_id,
                        item.parent_item_id,
                        item.category,
                        item.type,
                        item.title,
                        item.content,
                        item.content_format,
                        item.x,
                        item.y,
                        item.width,
                        item.height,
                        item.rotation,
                        item.z_index,
                        int(item.is_collapsed),
                        item.style_json,
                        item.data_json,
                        item.created_at,
                        item.updated_at,
                    ),
                )
                inserted_ids.add(item_id)
                del pending_items[item_id]
                inserted_this_round = True

            if inserted_this_round:
                continue

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Board state contains invalid or cyclic parent references.",
            )

    def _insert_board_state_connectors(
        self,
        connection: sqlite3.Connection,
        connector_links: list[ConnectorLink],
        *,
        item_by_id: dict[str, BoardItem],
    ) -> None:
        for connector in connector_links:
            connector_item = item_by_id[connector.connector_item_id]
            from_item = (
                item_by_id[connector.from_item_id]
                if connector.from_item_id is not None
                else None
            )
            to_item = (
                item_by_id[connector.to_item_id]
                if connector.to_item_id is not None
                else None
            )
            self._validate_connector_targets(
                connector_item=connector_item,
                from_item=from_item,
                to_item=to_item,
            )
            connection.execute(
                """
                INSERT INTO connector_links (
                    id,
                    connector_item_id,
                    from_item_id,
                    to_item_id,
                    from_anchor,
                    to_anchor
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    connector.id,
                    connector.connector_item_id,
                    connector.from_item_id,
                    connector.to_item_id,
                    connector.from_anchor,
                    connector.to_anchor,
                ),
            )

    def _validate_reorder_ids(
        self,
        *,
        existing_ids: list[str],
        ordered_ids: list[str],
        entity_label: str,
    ) -> None:
        if len(existing_ids) != len(ordered_ids) or set(existing_ids) != set(ordered_ids):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"{entity_label} reorder payload must contain every existing "
                    "id exactly once."
                ),
            )

    def _apply_sort_order_updates(
        self,
        *,
        connection: sqlite3.Connection,
        table_name: str,
        ordered_ids: list[str],
        current_sort_order_by_id: dict[str, int],
        timestamp: str,
    ) -> None:
        for sort_order, entity_id in enumerate(ordered_ids):
            current_sort_order = current_sort_order_by_id[entity_id]
            if current_sort_order == sort_order:
                continue

            connection.execute(
                f"""
                UPDATE {table_name}
                SET sort_order = ?, updated_at = ?
                WHERE id = ?
                """,
                (sort_order, timestamp, entity_id),
            )

    def _build_duplicate_page_name(
        self,
        *,
        connection: sqlite3.Connection,
        project_id: str,
        source_name: str,
    ) -> str:
        existing_names = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM pages WHERE project_id = ?",
                (project_id,),
            ).fetchall()
        }
        candidate = f"{source_name} Copy"
        copy_index = 2
        while candidate in existing_names:
            candidate = f"{source_name} Copy {copy_index}"
            copy_index += 1
        return candidate

    def _get_duplicated_item_reference(
        self,
        duplicated_item_id_by_source_id: dict[str, str],
        source_item_id: str | None,
        *,
        required: bool = False,
    ) -> str | None:
        if source_item_id is None:
            return None

        duplicated_item_id = duplicated_item_id_by_source_id.get(source_item_id)
        if duplicated_item_id is None and required:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Duplicated page data is missing a required board item reference.",
            )
        return duplicated_item_id

    def _validate_connector_payload(
        self,
        payload: ConnectorLinkCreatePayload | ConnectorLinkUpdatePayload,
    ) -> None:
        connector_item = self.get_board_item(payload.connector_item_id)
        from_item = (
            self.get_board_item(payload.from_item_id)
            if payload.from_item_id is not None
            else None
        )
        to_item = (
            self.get_board_item(payload.to_item_id)
            if payload.to_item_id is not None
            else None
        )
        self._validate_connector_targets(
            connector_item=connector_item,
            from_item=from_item,
            to_item=to_item,
        )

    def _validate_connector_targets(
        self,
        *,
        connector_item: BoardItem,
        from_item: BoardItem | None,
        to_item: BoardItem | None,
    ) -> None:
        if connector_item.type != "arrow" or connector_item.category != "connector":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Connector item must be an arrow board item.",
            )

        for role, target_item in (("from", from_item), ("to", to_item)):
            if target_item is None:
                continue

            if target_item.page_id != connector_item.page_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Connector {role} item must be on the same page as the arrow.",
                )

            if target_item.type not in CONNECTABLE_ITEM_TYPES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "Arrow endpoints can only connect to text_box, sticky_note, "
                        "note_paper, or frame items."
                    ),
                )


def utc_timestamp() -> str:
    return datetime.now(tz=UTC).replace(microsecond=0).isoformat()
