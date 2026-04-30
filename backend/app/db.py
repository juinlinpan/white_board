from __future__ import annotations

import json
import logging
import re
import shutil
import tempfile
from collections.abc import Mapping
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4
from xml.etree import ElementTree

from fastapi import HTTPException, status

from app.schemas import (
    PROJECT_THEME_COLORS,
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
METADATA_FILENAME = "metadata.json"


class StorageInitializationError(RuntimeError):
    pass


def initialize_storage(settings: AppSettings) -> None:
    _ensure_directory(settings.backend_root, "Backend root")
    _ensure_writable_directory(settings.backend_root, "Backend root")
    _ensure_directory(settings.planvas_root, "Planvas root")
    _ensure_writable_directory(settings.planvas_root, "Planvas root")
    _ensure_directory(settings.logs_dir, "Logs directory")
    _ensure_writable_directory(settings.logs_dir, "Logs directory")
    _ensure_writable_file(settings.app_log_path, "App log")
    _ensure_writable_file(settings.backend_log_path, "Backend log")
    LOGGER.info("Storage initialized at %s", settings.planvas_root)


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
    probe_path = path / f".planvas-write-test-{uuid4().hex}"
    try:
        probe_path.write_text("", encoding="utf-8")
    except OSError as exc:
        raise StorageInitializationError(f"{label} '{path}' is not writable: {exc}") from exc
    finally:
        probe_path.unlink(missing_ok=True)


def _ensure_writable_file(path: Path, label: str) -> None:
    try:
        path.touch(exist_ok=True)
        with path.open("a", encoding="utf-8"):
            pass
    except OSError as exc:
        raise StorageInitializationError(f"{label} '{path}' is not writable: {exc}") from exc


def utc_timestamp() -> str:
    return datetime.now(tz=UTC).replace(microsecond=0).isoformat()


def _slugify(value: str, *, fallback: str = "untitled") -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip()).strip(".-_")
    return normalized[:80] or fallback


def _unique_path(parent: Path, stem: str, suffix: str = "") -> Path:
    candidate = parent / f"{stem}{suffix}"
    index = 2
    while candidate.exists():
        candidate = parent / f"{stem}-{index}{suffix}"
        index += 1
    return candidate


def _write_json_atomic(path: Path, payload: Mapping[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=path.parent,
        delete=False,
        newline="\n",
    ) as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        temp_path = Path(handle.name)
    temp_path.replace(path)


def _read_json(path: Path) -> dict[str, object]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Project metadata '{path}' could not be read.",
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Project metadata '{path}' is invalid.",
        )
    return payload


class WhiteboardRepository:
    def __init__(self, settings: AppSettings) -> None:
        self.settings = settings

    def list_projects(self) -> list[Project]:
        projects = [
            self._project_from_metadata(metadata)
            for _, metadata in self._iter_project_metadata()
        ]
        return sorted(projects, key=lambda project: (project.sort_order, project.created_at))

    def get_project(self, project_id: str) -> Project:
        _, metadata = self._find_project_metadata(project_id)
        return self._project_from_metadata(metadata)

    def create_project(self, payload: ProjectCreatePayload) -> Project:
        timestamp = utc_timestamp()
        project = Project(
            id=str(uuid4()),
            name=payload.name,
            theme_color=payload.theme_color,
            sort_order=len(self.list_projects()),
            created_at=timestamp,
            updated_at=timestamp,
        )
        project_dir = _unique_path(self.settings.planvas_root, _slugify(payload.name))
        metadata: dict[str, object] = {"project": project.model_dump(), "pages": []}
        project_dir.mkdir(parents=True, exist_ok=False)
        _write_json_atomic(project_dir / METADATA_FILENAME, metadata)
        return project

    def update_project(self, project_id: str, payload: ProjectUpdatePayload) -> Project:
        project_dir, metadata = self._find_project_metadata(project_id)
        project = self._project_from_metadata(metadata)
        next_name = payload.name if payload.name is not None else project.name
        next_theme_color = (
            payload.theme_color if payload.theme_color is not None else project.theme_color
        )
        next_project = project.model_copy(
            update={
                "name": next_name,
                "theme_color": next_theme_color,
                "updated_at": utc_timestamp(),
            }
        )
        metadata["project"] = next_project.model_dump()
        next_dir = project_dir
        if next_name != project.name:
            next_dir = _unique_path(self.settings.planvas_root, _slugify(next_name))
            project_dir.rename(next_dir)
        _write_json_atomic(next_dir / METADATA_FILENAME, metadata)
        return next_project

    def delete_project(self, project_id: str) -> None:
        project_dir, _ = self._find_project_metadata(project_id)
        shutil.rmtree(project_dir)

    def reorder_projects(self, ordered_ids: list[str]) -> list[Project]:
        entries = list(self._iter_project_metadata())
        existing_ids = [
            self._project_from_metadata(metadata).id for _, metadata in entries
        ]
        self._validate_reorder_ids(
            existing_ids=existing_ids,
            ordered_ids=ordered_ids,
            entity_label="Project",
        )
        timestamp = utc_timestamp()
        order_by_id = {project_id: sort_order for sort_order, project_id in enumerate(ordered_ids)}
        projects: list[Project] = []
        for project_dir, metadata in entries:
            project = self._project_from_metadata(metadata)
            next_project = project.model_copy(
                update={"sort_order": order_by_id[project.id], "updated_at": timestamp}
            )
            metadata["project"] = next_project.model_dump()
            _write_json_atomic(project_dir / METADATA_FILENAME, metadata)
            projects.append(next_project)
        return sorted(projects, key=lambda project: project.sort_order)

    def list_pages(self, project_id: str) -> list[Page]:
        _, metadata = self._find_project_metadata(project_id)
        return self._pages_from_metadata(metadata)

    def get_page(self, page_id: str) -> Page:
        _, _, page = self._find_page_metadata(page_id)
        return page

    def create_page(self, project_id: str, payload: PageCreatePayload) -> Page:
        project_dir, metadata = self._find_project_metadata(project_id)
        timestamp = utc_timestamp()
        pages = self._pages_from_metadata(metadata)
        page = Page(
            id=str(uuid4()),
            project_id=project_id,
            name=payload.name,
            sort_order=len(pages),
            viewport_x=NEW_PAGE_VIEWPORT_X,
            viewport_y=NEW_PAGE_VIEWPORT_Y,
            zoom=NEW_PAGE_DEFAULT_ZOOM,
            created_at=timestamp,
            updated_at=timestamp,
        )
        page_file = _unique_path(project_dir, _slugify(payload.name, fallback="page"), ".xml")
        page_entries = self._page_entries(metadata)
        page_entries.append({**page.model_dump(), "file": page_file.name})
        self._touch_project(metadata, timestamp)
        _write_json_atomic(project_dir / METADATA_FILENAME, metadata)
        self._write_page_xml(page_file, page, [], [])
        return page

    def update_page(self, page_id: str, payload: PageUpdatePayload) -> Page:
        project_dir, metadata, page = self._find_page_metadata(page_id)
        timestamp = utc_timestamp()
        next_page = page.model_copy(update={"name": payload.name, "updated_at": timestamp})
        self._replace_page_entry(metadata, next_page)
        self._touch_project(metadata, timestamp)
        _write_json_atomic(project_dir / METADATA_FILENAME, metadata)
        board = self.get_page_board_data(page_id)
        self._write_page_xml(
            self._page_path(project_dir, metadata, page_id),
            next_page,
            board.board_items,
            board.connector_links,
        )
        return next_page

    def delete_page(self, page_id: str) -> None:
        project_dir, metadata, _ = self._find_page_metadata(page_id)
        page_path = self._page_path(project_dir, metadata, page_id)
        metadata["pages"] = [
            entry for entry in self._page_entries(metadata) if entry.get("id") != page_id
        ]
        self._renumber_pages(metadata)
        self._touch_project(metadata, utc_timestamp())
        _write_json_atomic(project_dir / METADATA_FILENAME, metadata)
        page_path.unlink(missing_ok=True)

    def reorder_pages(self, project_id: str, ordered_ids: list[str]) -> list[Page]:
        project_dir, metadata = self._find_project_metadata(project_id)
        pages = self._pages_from_metadata(metadata)
        self._validate_reorder_ids(
            existing_ids=[page.id for page in pages],
            ordered_ids=ordered_ids,
            entity_label="Page",
        )
        timestamp = utc_timestamp()
        order_by_id = {page_id: sort_order for sort_order, page_id in enumerate(ordered_ids)}
        next_pages = [
            page.model_copy(
                update={"sort_order": order_by_id[page.id], "updated_at": timestamp}
            )
            for page in pages
        ]
        for page in next_pages:
            self._replace_page_entry(metadata, page)
        self._touch_project(metadata, timestamp)
        _write_json_atomic(project_dir / METADATA_FILENAME, metadata)
        return sorted(next_pages, key=lambda page: page.sort_order)

    def duplicate_page(self, page_id: str) -> Page:
        project_dir, metadata, source_page = self._find_page_metadata(page_id)
        source_board = self.get_page_board_data(page_id)
        timestamp = utc_timestamp()
        existing_names = {page.name for page in self._pages_from_metadata(metadata)}
        duplicated_name = self._build_duplicate_page_name(existing_names, source_page.name)
        duplicated_page = source_page.model_copy(
            update={
                "id": str(uuid4()),
                "name": duplicated_name,
                "sort_order": source_page.sort_order + 1,
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        )

        page_entries = self._page_entries(metadata)
        for entry in page_entries:
            sort_order = int(str(entry["sort_order"]))
            if sort_order > source_page.sort_order:
                entry["sort_order"] = sort_order + 1
                entry["updated_at"] = timestamp

        duplicated_item_id_by_source_id = {
            item.id: str(uuid4()) for item in source_board.board_items
        }
        duplicated_items = [
            item.model_copy(
                update={
                    "id": duplicated_item_id_by_source_id[item.id],
                    "page_id": duplicated_page.id,
                    "parent_item_id": self._get_duplicated_item_reference(
                        duplicated_item_id_by_source_id,
                        item.parent_item_id,
                    ),
                    "created_at": timestamp,
                    "updated_at": timestamp,
                }
            )
            for item in source_board.board_items
        ]
        duplicated_connectors = [
            connector.model_copy(
                update={
                    "id": str(uuid4()),
                    "connector_item_id": self._get_duplicated_item_reference(
                        duplicated_item_id_by_source_id,
                        connector.connector_item_id,
                        required=True,
                    ),
                    "from_item_id": self._get_duplicated_item_reference(
                        duplicated_item_id_by_source_id,
                        connector.from_item_id,
                    ),
                    "to_item_id": self._get_duplicated_item_reference(
                        duplicated_item_id_by_source_id,
                        connector.to_item_id,
                    ),
                }
            )
            for connector in source_board.connector_links
        ]

        page_file = _unique_path(project_dir, _slugify(duplicated_name, fallback="page"), ".xml")
        page_entries.append({**duplicated_page.model_dump(), "file": page_file.name})
        self._touch_project(metadata, timestamp)
        _write_json_atomic(project_dir / METADATA_FILENAME, metadata)
        self._write_page_xml(page_file, duplicated_page, duplicated_items, duplicated_connectors)
        return duplicated_page

    def update_page_viewport(self, page_id: str, payload: PageViewportPayload) -> Page:
        project_dir, metadata, page = self._find_page_metadata(page_id)
        timestamp = utc_timestamp()
        next_page = page.model_copy(
            update={
                "viewport_x": payload.viewport_x,
                "viewport_y": payload.viewport_y,
                "zoom": payload.zoom,
                "updated_at": timestamp,
            }
        )
        board = self.get_page_board_data(page_id)
        self._replace_page_entry(metadata, next_page)
        self._touch_project(metadata, timestamp)
        _write_json_atomic(project_dir / METADATA_FILENAME, metadata)
        self._write_page_xml(
            self._page_path(project_dir, metadata, page_id),
            next_page,
            board.board_items,
            board.connector_links,
        )
        return next_page

    def list_board_items(self, page_id: str) -> list[BoardItem]:
        return self._read_page_xml(page_id)[0]

    def get_board_item(self, item_id: str) -> BoardItem:
        for page in self._all_pages():
            items, _ = self._read_page_xml(page.id)
            for item in items:
                if item.id == item_id:
                    return item
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Board item '{item_id}' was not found.",
        )

    def create_board_item(self, payload: BoardItemCreatePayload) -> BoardItem:
        page = self.get_page(payload.page_id)
        if payload.parent_item_id is not None:
            parent = self.get_board_item(payload.parent_item_id)
            if parent.page_id != payload.page_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Board item parent must belong to the same page.",
                )
        item = BoardItem(
            **payload.model_dump(),
            id=str(uuid4()),
            created_at=utc_timestamp(),
            updated_at=utc_timestamp(),
        )
        items, connectors = self._read_page_xml(page.id)
        items.append(item)
        self._persist_page_board(page, items, connectors)
        return item

    def update_board_item(self, item_id: str, payload: BoardItemUpdatePayload) -> BoardItem:
        page = self.get_page(payload.page_id)
        if payload.parent_item_id is not None:
            parent = self.get_board_item(payload.parent_item_id)
            if parent.page_id != payload.page_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Board item parent must belong to the same page.",
                )
        items, connectors = self._read_page_xml(payload.page_id)
        for index, item in enumerate(items):
            if item.id == item_id:
                next_item = BoardItem(
                    **payload.model_dump(),
                    id=item_id,
                    created_at=item.created_at,
                    updated_at=utc_timestamp(),
                )
                items[index] = next_item
                self._persist_page_board(page, items, connectors)
                return next_item
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Board item '{item_id}' was not found.",
        )

    def delete_board_item(self, item_id: str) -> None:
        page = self._find_page_for_board_item(item_id)
        items, connectors = self._read_page_xml(page.id)
        item_ids = {item.id for item in items}
        if item_id not in item_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Board item '{item_id}' was not found.",
            )
        related_arrow_ids = {
            connector.connector_item_id
            for connector in connectors
            if item_id in {connector.from_item_id, connector.to_item_id}
            and connector.connector_item_id != item_id
        }
        delete_ids = {item_id, *related_arrow_ids}
        items = [
            item
            for item in items
            if item.id not in delete_ids and item.parent_item_id not in delete_ids
        ]
        remaining_ids = {item.id for item in items}
        connectors = [
            connector
            for connector in connectors
            if connector.connector_item_id in remaining_ids
            and (connector.from_item_id is None or connector.from_item_id in remaining_ids)
            and (connector.to_item_id is None or connector.to_item_id in remaining_ids)
        ]
        self._persist_page_board(page, items, connectors)

    def list_connector_links(self, page_id: str) -> list[ConnectorLink]:
        return self._read_page_xml(page_id)[1]

    def get_connector_link(self, connector_id: str) -> ConnectorLink:
        for page in self._all_pages():
            _, connectors = self._read_page_xml(page.id)
            for connector in connectors:
                if connector.id == connector_id:
                    return connector
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connector '{connector_id}' was not found.",
        )

    def create_connector_link(self, payload: ConnectorLinkCreatePayload) -> ConnectorLink:
        connector_item = self._validate_connector_payload(payload)
        connector = ConnectorLink(**payload.model_dump(), id=str(uuid4()))
        items, connectors = self._read_page_xml(connector_item.page_id)
        connectors.append(connector)
        self._persist_page_board(self.get_page(connector_item.page_id), items, connectors)
        return connector

    def update_connector_link(
        self,
        connector_id: str,
        payload: ConnectorLinkUpdatePayload,
    ) -> ConnectorLink:
        connector_item = self._validate_connector_payload(payload)
        items, connectors = self._read_page_xml(connector_item.page_id)
        for index, connector in enumerate(connectors):
            if connector.id == connector_id:
                next_connector = ConnectorLink(**payload.model_dump(), id=connector_id)
                connectors[index] = next_connector
                self._persist_page_board(
                    self.get_page(connector_item.page_id),
                    items,
                    connectors,
                )
                return next_connector
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connector '{connector_id}' was not found.",
        )

    def delete_connector_link(self, connector_id: str) -> None:
        page = self._find_page_for_connector(connector_id)
        items, connectors = self._read_page_xml(page.id)
        next_connectors = [
            connector for connector in connectors if connector.id != connector_id
        ]
        if len(next_connectors) == len(connectors):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Connector '{connector_id}' was not found.",
            )
        self._persist_page_board(page, items, next_connectors)

    def replace_page_board_state(
        self,
        page_id: str,
        board_items: list[BoardItem],
        connector_links: list[ConnectorLink],
    ) -> PageBoardData:
        page = self.get_page(page_id)
        self._validate_board_state_payload(
            page_id=page_id,
            board_items=board_items,
            connector_links=connector_links,
        )
        self._persist_page_board(page, board_items, connector_links)
        return self.get_page_board_data(page_id)

    def get_page_board_data(self, page_id: str) -> PageBoardData:
        page = self.get_page(page_id)
        board_items, connector_links = self._read_page_xml(page_id)
        return PageBoardData(
            page=page,
            board_items=board_items,
            connector_links=connector_links,
        )

    def _iter_project_metadata(self) -> list[tuple[Path, dict[str, object]]]:
        if not self.settings.planvas_root.exists():
            return []
        entries: list[tuple[Path, dict[str, object]]] = []
        for child in self.settings.planvas_root.iterdir():
            metadata_path = child / METADATA_FILENAME
            if child.is_dir() and metadata_path.is_file():
                entries.append((child, _read_json(metadata_path)))
        return entries

    def _find_project_metadata(self, project_id: str) -> tuple[Path, dict[str, object]]:
        for project_dir, metadata in self._iter_project_metadata():
            if self._project_from_metadata(metadata).id == project_id:
                return project_dir, metadata
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' was not found.",
        )

    def _find_page_metadata(self, page_id: str) -> tuple[Path, dict[str, object], Page]:
        for project_dir, metadata in self._iter_project_metadata():
            for page in self._pages_from_metadata(metadata):
                if page.id == page_id:
                    return project_dir, metadata, page
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Page '{page_id}' was not found.",
        )

    def _all_pages(self) -> list[Page]:
        pages: list[Page] = []
        for _, metadata in self._iter_project_metadata():
            pages.extend(self._pages_from_metadata(metadata))
        return pages

    def _project_from_metadata(self, metadata: dict[str, object]) -> Project:
        project_payload = metadata.get("project")
        if not isinstance(project_payload, dict):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Project metadata is missing project data.",
            )
        if project_payload.get("theme_color") not in PROJECT_THEME_COLORS:
            project_payload["theme_color"] = "default"
        return Project.model_validate(project_payload)

    def _page_entries(self, metadata: dict[str, object]) -> list[dict[str, object]]:
        pages_payload = metadata.setdefault("pages", [])
        if not isinstance(pages_payload, list):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Project metadata pages data is invalid.",
            )
        return pages_payload

    def _pages_from_metadata(self, metadata: dict[str, object]) -> list[Page]:
        pages = [Page.model_validate(entry) for entry in self._page_entries(metadata)]
        return sorted(pages, key=lambda page: (page.sort_order, page.created_at))

    def _replace_page_entry(self, metadata: dict[str, object], page: Page) -> None:
        for entry in self._page_entries(metadata):
            if entry.get("id") == page.id:
                file_name = entry.get("file")
                entry.clear()
                entry.update(page.model_dump())
                entry["file"] = file_name
                return
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Page '{page.id}' was not found.",
        )

    def _page_path(self, project_dir: Path, metadata: dict[str, object], page_id: str) -> Path:
        for entry in self._page_entries(metadata):
            if entry.get("id") == page_id:
                file_name = entry.get("file")
                if isinstance(file_name, str) and file_name:
                    return project_dir / file_name
                return project_dir / f"{page_id}.xml"
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Page '{page_id}' was not found.",
        )

    def _touch_project(self, metadata: dict[str, object], timestamp: str) -> None:
        project = self._project_from_metadata(metadata)
        metadata["project"] = project.model_copy(update={"updated_at": timestamp}).model_dump()

    def _renumber_pages(self, metadata: dict[str, object]) -> None:
        timestamp = utc_timestamp()
        for sort_order, page in enumerate(self._pages_from_metadata(metadata)):
            self._replace_page_entry(
                metadata,
                page.model_copy(update={"sort_order": sort_order, "updated_at": timestamp}),
            )

    def _persist_page_board(
        self,
        page: Page,
        board_items: list[BoardItem],
        connector_links: list[ConnectorLink],
    ) -> None:
        project_dir, metadata, current_page = self._find_page_metadata(page.id)
        next_page = current_page.model_copy(update={"updated_at": utc_timestamp()})
        self._replace_page_entry(metadata, next_page)
        self._touch_project(metadata, next_page.updated_at)
        _write_json_atomic(project_dir / METADATA_FILENAME, metadata)
        self._write_page_xml(
            self._page_path(project_dir, metadata, page.id),
            next_page,
            board_items,
            connector_links,
        )

    def _read_page_xml(self, page_id: str) -> tuple[list[BoardItem], list[ConnectorLink]]:
        project_dir, metadata, page = self._find_page_metadata(page_id)
        page_path = self._page_path(project_dir, metadata, page_id)
        if not page_path.exists():
            return [], []
        try:
            root = ElementTree.parse(page_path).getroot()
        except (ElementTree.ParseError, OSError) as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Page XML '{page_path}' could not be read.",
            ) from exc
        board_items = [
            self._board_item_from_element(element, page.id)
            for element in root.findall("./board_items/board_item")
        ]
        connectors = [
            ConnectorLink.model_validate(
                {
                    "id": element.attrib["id"],
                    "connector_item_id": element.attrib["connector_item_id"],
                    "from_item_id": _blank_to_none(element.attrib.get("from_item_id")),
                    "to_item_id": _blank_to_none(element.attrib.get("to_item_id")),
                    "from_anchor": _blank_to_none(element.attrib.get("from_anchor")),
                    "to_anchor": _blank_to_none(element.attrib.get("to_anchor")),
                }
            )
            for element in root.findall("./connector_links/connector_link")
        ]
        return (
            sorted(board_items, key=lambda item: (item.z_index, item.created_at)),
            sorted(connectors, key=lambda connector: connector.id),
        )

    def _write_page_xml(
        self,
        path: Path,
        page: Page,
        board_items: list[BoardItem],
        connector_links: list[ConnectorLink],
    ) -> None:
        root = ElementTree.Element(
            "page",
            {
                "id": page.id,
                "project_id": page.project_id,
                "name": page.name,
                "sort_order": str(page.sort_order),
                "viewport_x": str(page.viewport_x),
                "viewport_y": str(page.viewport_y),
                "zoom": str(page.zoom),
                "created_at": page.created_at,
                "updated_at": page.updated_at,
            },
        )
        items_element = ElementTree.SubElement(root, "board_items")
        for item in sorted(board_items, key=lambda value: (value.z_index, value.created_at)):
            item_element = ElementTree.SubElement(
                items_element,
                "board_item",
                {
                    "id": item.id,
                    "page_id": item.page_id,
                    "parent_item_id": item.parent_item_id or "",
                    "category": item.category,
                    "type": item.type,
                    "x": str(item.x),
                    "y": str(item.y),
                    "width": str(item.width),
                    "height": str(item.height),
                    "rotation": str(item.rotation),
                    "z_index": str(item.z_index),
                    "is_collapsed": "true" if item.is_collapsed else "false",
                    "created_at": item.created_at,
                    "updated_at": item.updated_at,
                },
            )
            for field_name in (
                "title",
                "content",
                "content_format",
                "style_json",
                "data_json",
            ):
                field = ElementTree.SubElement(item_element, field_name)
                value = getattr(item, field_name)
                if value is not None:
                    field.text = value
        connectors_element = ElementTree.SubElement(root, "connector_links")
        for connector in sorted(connector_links, key=lambda value: value.id):
            ElementTree.SubElement(
                connectors_element,
                "connector_link",
                {
                    "id": connector.id,
                    "connector_item_id": connector.connector_item_id,
                    "from_item_id": connector.from_item_id or "",
                    "to_item_id": connector.to_item_id or "",
                    "from_anchor": connector.from_anchor or "",
                    "to_anchor": connector.to_anchor or "",
                },
            )
        ElementTree.indent(root, space="  ")
        tree = ElementTree.ElementTree(root)
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(
            "wb",
            dir=path.parent,
            delete=False,
        ) as handle:
            tree.write(handle, encoding="utf-8", xml_declaration=True)
            temp_path = Path(handle.name)
        temp_path.replace(path)

    def _board_item_from_element(self, element: ElementTree.Element, page_id: str) -> BoardItem:
        payload = {
            "id": element.attrib["id"],
            "page_id": element.attrib.get("page_id", page_id),
            "parent_item_id": _blank_to_none(element.attrib.get("parent_item_id")),
            "category": element.attrib["category"],
            "type": element.attrib["type"],
            "title": self._child_text(element, "title"),
            "content": self._child_text(element, "content"),
            "content_format": self._child_text(element, "content_format"),
            "x": float(element.attrib.get("x", "0")),
            "y": float(element.attrib.get("y", "0")),
            "width": float(element.attrib.get("width", "0")),
            "height": float(element.attrib.get("height", "0")),
            "rotation": float(element.attrib.get("rotation", "0")),
            "z_index": int(element.attrib.get("z_index", "0")),
            "is_collapsed": element.attrib.get("is_collapsed", "false") == "true",
            "style_json": self._child_text(element, "style_json"),
            "data_json": self._child_text(element, "data_json"),
            "created_at": element.attrib["created_at"],
            "updated_at": element.attrib["updated_at"],
        }
        return BoardItem.model_validate(payload)

    def _child_text(self, element: ElementTree.Element, tag_name: str) -> str | None:
        child = element.find(tag_name)
        if child is None:
            return None
        return child.text

    def _find_page_for_board_item(self, item_id: str) -> Page:
        for page in self._all_pages():
            items, _ = self._read_page_xml(page.id)
            if any(item.id == item_id for item in items):
                return page
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Board item '{item_id}' was not found.",
        )

    def _find_page_for_connector(self, connector_id: str) -> Page:
        for page in self._all_pages():
            _, connectors = self._read_page_xml(page.id)
            if any(connector.id == connector_id for connector in connectors):
                return page
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Connector '{connector_id}' was not found.",
        )

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
            for role, item_id in (("from", connector.from_item_id), ("to", connector.to_item_id)):
                if item_id is not None and item_id not in item_by_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=(
                            f"Board state connector {role} item references must exist "
                            "in the payload."
                        ),
                    )
        return item_by_id

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

    def _build_duplicate_page_name(self, existing_names: set[str], source_name: str) -> str:
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
    ) -> BoardItem:
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
        return connector_item

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


def _blank_to_none(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    return value
