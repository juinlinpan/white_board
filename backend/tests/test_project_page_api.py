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


def test_board_item_connector_and_board_data_flow(tmp_path: Path) -> None:
    client, _ = create_client(tmp_path)

    with client:
        project = client.post("/projects", json={"name": "Execution"}).json()
        page = client.post(
            f"/projects/{project['id']}/pages",
            json={"name": "Main Board"},
        ).json()

        update_viewport_response = client.patch(
            f"/pages/{page['id']}/viewport",
            json={"viewport_x": 120, "viewport_y": 80, "zoom": 1.25},
        )
        assert update_viewport_response.status_code == 200
        assert update_viewport_response.json()["zoom"] == 1.25

        text_box_payload = {
            "page_id": page["id"],
            "parent_item_id": None,
            "category": "small_item",
            "type": "text_box",
            "title": "Idea",
            "content": "Launch checklist",
            "content_format": "plain_text",
            "x": 20,
            "y": 40,
            "width": 220,
            "height": 80,
            "rotation": 0,
            "z_index": 1,
            "is_collapsed": False,
            "style_json": '{"fontSize":14}',
            "data_json": None,
        }
        create_item_response = client.post("/board-items", json=text_box_payload)
        assert create_item_response.status_code == 201
        text_box = create_item_response.json()

        arrow_payload = {
            "page_id": page["id"],
            "parent_item_id": None,
            "category": "connector",
            "type": "arrow",
            "title": None,
            "content": None,
            "content_format": None,
            "x": 0,
            "y": 0,
            "width": 150,
            "height": 30,
            "rotation": 0,
            "z_index": 2,
            "is_collapsed": False,
            "style_json": None,
            "data_json": '{"kind":"straight"}',
        }
        create_arrow_response = client.post("/board-items", json=arrow_payload)
        assert create_arrow_response.status_code == 201
        arrow_item = create_arrow_response.json()

        connector_payload = {
            "connector_item_id": arrow_item["id"],
            "from_item_id": text_box["id"],
            "to_item_id": text_box["id"],
            "from_anchor": "right",
            "to_anchor": "left",
        }
        create_connector_response = client.post("/connectors", json=connector_payload)
        assert create_connector_response.status_code == 201
        connector = create_connector_response.json()

        list_items_response = client.get(f"/pages/{page['id']}/board-items")
        assert list_items_response.status_code == 200
        assert len(list_items_response.json()["items"]) == 2

        update_item_response = client.patch(
            f"/board-items/{text_box['id']}",
            json={**text_box_payload, "content": "Updated launch checklist"},
        )
        assert update_item_response.status_code == 200
        assert update_item_response.json()["content"] == "Updated launch checklist"

        list_connectors_response = client.get(f"/pages/{page['id']}/connectors")
        assert list_connectors_response.status_code == 200
        assert list_connectors_response.json()["items"][0]["id"] == connector["id"]

        update_connector_response = client.patch(
            f"/connectors/{connector['id']}",
            json={**connector_payload, "to_anchor": "top"},
        )
        assert update_connector_response.status_code == 200
        assert update_connector_response.json()["to_anchor"] == "top"

        board_data_response = client.get(f"/pages/{page['id']}/board-data")
        assert board_data_response.status_code == 200
        payload = board_data_response.json()
        assert payload["page"]["id"] == page["id"]
        assert len(payload["board_items"]) == 2
        assert len(payload["connector_links"]) == 1

        delete_connector_response = client.delete(f"/connectors/{connector['id']}")
        assert delete_connector_response.status_code == 204

        delete_item_response = client.delete(f"/board-items/{text_box['id']}")
        assert delete_item_response.status_code == 204
