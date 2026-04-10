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


class ProjectListResponse(BaseModel):
    items: list[Project]


class PageListResponse(BaseModel):
    items: list[Page]


class HealthResponse(BaseModel):
    service: str
    status: str
