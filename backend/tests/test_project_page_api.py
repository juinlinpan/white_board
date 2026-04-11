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
        assert missing_pages_response.json() == {
            "error": {
                "code": "not_found",
                "message": f"Project '{project['id']}' was not found.",
                "details": None,
            }
        }


def test_project_and_page_reorder_and_page_duplication(tmp_path: Path) -> None:
    client, _ = create_client(tmp_path)

    with client:
        alpha = client.post("/projects", json={"name": "Alpha"}).json()
        beta = client.post("/projects", json={"name": "Beta"}).json()
        gamma = client.post("/projects", json={"name": "Gamma"}).json()

        reorder_projects_response = client.post(
            "/projects/reorder",
            json={"ordered_ids": [gamma["id"], alpha["id"], beta["id"]]},
        )
        assert reorder_projects_response.status_code == 200
        reordered_projects = reorder_projects_response.json()["items"]
        assert [project["id"] for project in reordered_projects] == [
            gamma["id"],
            alpha["id"],
            beta["id"],
        ]
        assert [project["sort_order"] for project in reordered_projects] == [0, 1, 2]

        source_page = client.post(
            f"/projects/{gamma['id']}/pages",
            json={"name": "Sprint Board"},
        ).json()
        trailing_page = client.post(
            f"/projects/{gamma['id']}/pages",
            json={"name": "Archive"},
        ).json()

        frame = client.post(
            "/board-items",
            json={
                "page_id": source_page["id"],
                "parent_item_id": None,
                "category": "large_item",
                "type": "frame",
                "title": "Sprint Frame",
                "content": None,
                "content_format": None,
                "x": 80,
                "y": 40,
                "width": 360,
                "height": 240,
                "rotation": 0,
                "z_index": 0,
                "is_collapsed": False,
                "style_json": None,
                "data_json": None,
            },
        ).json()
        child_item = client.post(
            "/board-items",
            json={
                "page_id": source_page["id"],
                "parent_item_id": frame["id"],
                "category": "small_item",
                "type": "text_box",
                "title": None,
                "content": "Inside frame",
                "content_format": "plain_text",
                "x": 120,
                "y": 100,
                "width": 220,
                "height": 80,
                "rotation": 0,
                "z_index": 1,
                "is_collapsed": False,
                "style_json": '{"fontSize":14}',
                "data_json": None,
            },
        ).json()
        arrow_item = client.post(
            "/board-items",
            json={
                "page_id": source_page["id"],
                "parent_item_id": None,
                "category": "connector",
                "type": "arrow",
                "title": None,
                "content": None,
                "content_format": None,
                "x": 0,
                "y": 0,
                "width": 180,
                "height": 40,
                "rotation": 0,
                "z_index": 2,
                "is_collapsed": False,
                "style_json": None,
                "data_json": '{"kind":"straight"}',
            },
        ).json()
        connector_response = client.post(
            "/connectors",
            json={
                "connector_item_id": arrow_item["id"],
                "from_item_id": child_item["id"],
                "to_item_id": frame["id"],
                "from_anchor": "right",
                "to_anchor": "left",
            },
        )
        assert connector_response.status_code == 201

        duplicate_page_response = client.post(f"/pages/{source_page['id']}/duplicate")
        assert duplicate_page_response.status_code == 201
        duplicated_page = duplicate_page_response.json()
        assert duplicated_page["project_id"] == gamma["id"]
        assert duplicated_page["name"] == "Sprint Board Copy"
        assert duplicated_page["sort_order"] == 1

        pages_after_duplicate_response = client.get(f"/projects/{gamma['id']}/pages")
        assert pages_after_duplicate_response.status_code == 200
        pages_after_duplicate = pages_after_duplicate_response.json()["items"]
        assert [page["id"] for page in pages_after_duplicate] == [
            source_page["id"],
            duplicated_page["id"],
            trailing_page["id"],
        ]

        duplicated_board_response = client.get(
            f"/pages/{duplicated_page['id']}/board-data"
        )
        assert duplicated_board_response.status_code == 200
        duplicated_payload = duplicated_board_response.json()
        duplicated_items = duplicated_payload["board_items"]
        duplicated_item_ids = {item["id"] for item in duplicated_items}
        assert len(duplicated_items) == 3
        assert len(duplicated_payload["connector_links"]) == 1
        assert duplicated_payload["page"]["viewport_x"] == source_page["viewport_x"]
        assert duplicated_payload["page"]["zoom"] == source_page["zoom"]
        assert duplicated_item_ids.isdisjoint(
            {frame["id"], child_item["id"], arrow_item["id"]}
        )

        duplicated_frame = next(
            item for item in duplicated_items if item["type"] == "frame"
        )
        duplicated_text_box = next(
            item for item in duplicated_items if item["type"] == "text_box"
        )
        duplicated_arrow = next(
            item for item in duplicated_items if item["type"] == "arrow"
        )
        duplicated_connector = duplicated_payload["connector_links"][0]

        assert duplicated_text_box["parent_item_id"] == duplicated_frame["id"]
        assert duplicated_connector["connector_item_id"] == duplicated_arrow["id"]
        assert duplicated_connector["from_item_id"] == duplicated_text_box["id"]
        assert duplicated_connector["to_item_id"] == duplicated_frame["id"]
        assert duplicated_connector["from_anchor"] == "right"
        assert duplicated_connector["to_anchor"] == "left"

        reorder_pages_response = client.post(
            f"/projects/{gamma['id']}/pages/reorder",
            json={
                "ordered_ids": [
                    trailing_page["id"],
                    source_page["id"],
                    duplicated_page["id"],
                ]
            },
        )
        assert reorder_pages_response.status_code == 200
        reordered_pages = reorder_pages_response.json()["items"]
        assert [page["id"] for page in reordered_pages] == [
            trailing_page["id"],
            source_page["id"],
            duplicated_page["id"],
        ]
        assert [page["sort_order"] for page in reordered_pages] == [0, 1, 2]


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


def test_validation_errors_use_consistent_error_shape(tmp_path: Path) -> None:
    client, _ = create_client(tmp_path)

    with client:
        response = client.post("/projects", json={"name": "   "})

    assert response.status_code == 422
    payload = response.json()
    assert payload["error"]["code"] == "validation_error"
    assert payload["error"]["message"] == "Request validation failed."
    assert payload["error"]["details"][0]["loc"] == ["body", "name"]


def test_deleting_target_item_removes_connected_arrow(tmp_path: Path) -> None:
    client, _ = create_client(tmp_path)

    with client:
        project = client.post("/projects", json={"name": "Execution"}).json()
        page = client.post(
            f"/projects/{project['id']}/pages",
            json={"name": "Main Board"},
        ).json()

        from_item = client.post(
            "/board-items",
            json={
                "page_id": page["id"],
                "parent_item_id": None,
                "category": "small_item",
                "type": "text_box",
                "title": None,
                "content": "Source",
                "content_format": "plain_text",
                "x": 0,
                "y": 0,
                "width": 200,
                "height": 80,
                "rotation": 0,
                "z_index": 1,
                "is_collapsed": False,
                "style_json": None,
                "data_json": None,
            },
        ).json()
        to_item = client.post(
            "/board-items",
            json={
                "page_id": page["id"],
                "parent_item_id": None,
                "category": "large_item",
                "type": "frame",
                "title": "Frame",
                "content": None,
                "content_format": None,
                "x": 280,
                "y": 0,
                "width": 320,
                "height": 220,
                "rotation": 0,
                "z_index": 2,
                "is_collapsed": False,
                "style_json": None,
                "data_json": None,
            },
        ).json()
        arrow_item = client.post(
            "/board-items",
            json={
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
                "z_index": 3,
                "is_collapsed": False,
                "style_json": None,
                "data_json": '{"kind":"straight"}',
            },
        ).json()

        connector_response = client.post(
            "/connectors",
            json={
                "connector_item_id": arrow_item["id"],
                "from_item_id": from_item["id"],
                "to_item_id": to_item["id"],
                "from_anchor": "right",
                "to_anchor": "left",
            },
        )
        assert connector_response.status_code == 201

        delete_response = client.delete(f"/board-items/{from_item['id']}")
        assert delete_response.status_code == 204

        board_items_response = client.get(f"/pages/{page['id']}/board-items")
        assert board_items_response.status_code == 200
        assert [item["id"] for item in board_items_response.json()["items"]] == [
            to_item["id"]
        ]

        connectors_response = client.get(f"/pages/{page['id']}/connectors")
        assert connectors_response.status_code == 200
        assert connectors_response.json()["items"] == []
