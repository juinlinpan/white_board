from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class NamedPayload(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Name cannot be blank.")
        return normalized


class ProjectCreatePayload(NamedPayload):
    pass


class ProjectUpdatePayload(NamedPayload):
    pass


class PageCreatePayload(NamedPayload):
    pass


class PageUpdatePayload(NamedPayload):
    pass


class PageViewportPayload(BaseModel):
    viewport_x: float
    viewport_y: float
    zoom: float = Field(gt=0)


class OrderedIdsPayload(BaseModel):
    ordered_ids: list[str] = Field(min_length=1)

    @field_validator("ordered_ids")
    @classmethod
    def validate_ordered_ids(cls, value: list[str]) -> list[str]:
        normalized = [item.strip() for item in value]
        if any(item == "" for item in normalized):
            raise ValueError("Ordered ids cannot contain blank values.")
        if len(set(normalized)) != len(normalized):
            raise ValueError("Ordered ids must be unique.")
        return normalized


class Project(BaseModel):
    id: str
    name: str
    sort_order: int
    created_at: str
    updated_at: str


class Page(BaseModel):
    id: str
    project_id: str
    name: str
    sort_order: int
    viewport_x: float
    viewport_y: float
    zoom: float
    created_at: str
    updated_at: str


class BoardItemBase(BaseModel):
    page_id: str
    parent_item_id: str | None = None
    category: str = Field(min_length=1, max_length=50)
    type: str = Field(min_length=1, max_length=50)
    title: str | None = None
    content: str | None = None
    content_format: str | None = None
    x: float = 0
    y: float = 0
    width: float = 0
    height: float = 0
    rotation: float = 0
    z_index: int = 0
    is_collapsed: bool = False
    style_json: str | None = None
    data_json: str | None = None


class BoardItemCreatePayload(BoardItemBase):
    pass


class BoardItemUpdatePayload(BoardItemBase):
    pass


class BoardItem(BoardItemBase):
    id: str
    created_at: str
    updated_at: str


class ConnectorLinkBase(BaseModel):
    connector_item_id: str
    from_item_id: str | None = None
    to_item_id: str | None = None
    from_anchor: str | None = None
    to_anchor: str | None = None


class ConnectorLinkCreatePayload(ConnectorLinkBase):
    pass


class ConnectorLinkUpdatePayload(ConnectorLinkBase):
    pass


class ConnectorLink(ConnectorLinkBase):
    id: str


class ErrorDetail(BaseModel):
    loc: list[str | int]
    msg: str
    type: str


class ErrorPayload(BaseModel):
    code: str
    message: str
    details: list[ErrorDetail] | None = None


class ErrorResponse(BaseModel):
    error: ErrorPayload


class SuccessResponse[T](BaseModel):
    data: T


class PageBoardData(BaseModel):
    page: Page
    board_items: list[BoardItem]
    connector_links: list[ConnectorLink]


class HealthResponse(BaseModel):
    service: str
    status: str
