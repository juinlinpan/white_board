import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import AppSettings, build_settings


def create_client(tmp_path: Path) -> tuple[TestClient, AppSettings]:
    settings = build_settings(tmp_path)
    return TestClient(create_app(settings)), settings


def test_schema_initialization_creates_expected_tables(tmp_path: Path) -> None:
    client, settings = create_client(tmp_path)

    with client:
        response = client.get("/healthz")

    assert response.status_code == 200

    with sqlite3.connect(settings.sqlite_path) as connection:
        rows = connection.execute(
            """
            SELECT name
            FROM sqlite_master
            WHERE type = 'table'
            ORDER BY name
            """
        ).fetchall()

    assert [row[0] for row in rows] == [
        "board_items",
        "connector_links",
        "pages",
        "projects",
    ]


def test_project_and_page_crud_flow(tmp_path: Path) -> None:
    client, _ = create_client(tmp_path)

    with client:
        create_project_response = client.post("/projects", json={"name": "Roadmap"})
        assert create_project_response.status_code == 201
        project = create_project_response.json()

        list_projects_response = client.get("/projects")
        assert list_projects_response.status_code == 200
        assert list_projects_response.json()["items"] == [project]

        update_project_response = client.patch(
            f"/projects/{project['id']}",
            json={"name": "Roadmap 2026"},
        )
        assert update_project_response.status_code == 200
        updated_project = update_project_response.json()
        assert updated_project["name"] == "Roadmap 2026"

        create_page_response = client.post(
            f"/projects/{project['id']}/pages",
            json={"name": "Quarter Planning"},
        )
        assert create_page_response.status_code == 201
        page = create_page_response.json()
        assert page["project_id"] == project["id"]
        assert page["sort_order"] == 0
        assert page["zoom"] == 1

        second_page_response = client.post(
            f"/projects/{project['id']}/pages",
            json={"name": "Delivery Risks"},
        )
        assert second_page_response.status_code == 201
        second_page = second_page_response.json()
        assert second_page["sort_order"] == 1

        list_pages_response = client.get(f"/projects/{project['id']}/pages")
        assert list_pages_response.status_code == 200
        assert [item["name"] for item in list_pages_response.json()["items"]] == [
            "Quarter Planning",
            "Delivery Risks",
        ]

        update_page_response = client.patch(
            f"/pages/{page['id']}",
            json={"name": "Quarter Planning v2"},
        )
        assert update_page_response.status_code == 200
        assert update_page_response.json()["name"] == "Quarter Planning v2"

        delete_page_response = client.delete(f"/pages/{page['id']}")
        assert delete_page_response.status_code == 204

        pages_after_delete_response = client.get(f"/projects/{project['id']}/pages")
        assert pages_after_delete_response.status_code == 200
        assert [item["id"] for item in pages_after_delete_response.json()["items"]] == [
            second_page["id"]
        ]

        delete_project_response = client.delete(f"/projects/{project['id']}")
        assert delete_project_response.status_code == 204

        final_projects_response = client.get("/projects")
        assert final_projects_response.status_code == 200
        assert final_projects_response.json()["items"] == []

        missing_pages_response = client.get(f"/projects/{project['id']}/pages")
        assert missing_pages_response.status_code == 404
