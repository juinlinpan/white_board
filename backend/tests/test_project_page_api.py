import sqlite3
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import AppSettings, build_settings


def create_client(tmp_path: Path) -> tuple[TestClient, AppSettings]:
    settings = build_settings(tmp_path)
    return TestClient(create_app(settings)), settings


def response_data(response: Any) -> Any:
    payload = response.json()
    assert "data" in payload
    return payload["data"]


def test_schema_initialization_creates_expected_tables(tmp_path: Path) -> None:
    client, settings = create_client(tmp_path)

    with client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response_data(response)["status"] == "ok"

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
        project = response_data(create_project_response)
        assert project["theme_color"] == "default"

        list_projects_response = client.get("/projects")
        assert list_projects_response.status_code == 200
        assert response_data(list_projects_response) == [project]

        update_project_response = client.patch(
            f"/projects/{project['id']}",
            json={"name": "Roadmap 2026"},
        )
        assert update_project_response.status_code == 200
        updated_project = response_data(update_project_response)
        assert updated_project["name"] == "Roadmap 2026"
        assert updated_project["theme_color"] == "default"

        update_theme_response = client.patch(
            f"/projects/{project['id']}",
            json={"theme_color": "sunset"},
        )
        assert update_theme_response.status_code == 200
        themed_project = response_data(update_theme_response)
        assert themed_project["name"] == "Roadmap 2026"
        assert themed_project["theme_color"] == "sunset"

        create_page_response = client.post(
            f"/projects/{project['id']}/pages",
            json={"name": "Quarter Planning"},
        )
        assert create_page_response.status_code == 201
        page = response_data(create_page_response)
        assert page["project_id"] == project["id"]
        assert page["sort_order"] == 0
        assert page["zoom"] == 1
        assert page["viewport_x"] == 240
        assert page["viewport_y"] == 160

        second_page_response = client.post(
            f"/projects/{project['id']}/pages",
            json={"name": "Delivery Risks"},
        )
        assert second_page_response.status_code == 201
        second_page = response_data(second_page_response)
        assert second_page["sort_order"] == 1

        list_pages_response = client.get(f"/projects/{project['id']}/pages")
        assert list_pages_response.status_code == 200
        assert [item["name"] for item in response_data(list_pages_response)] == [
            "Quarter Planning",
            "Delivery Risks",
        ]

        update_page_response = client.patch(
            f"/pages/{page['id']}",
            json={"name": "Quarter Planning v2"},
        )
        assert update_page_response.status_code == 200
        assert response_data(update_page_response)["name"] == "Quarter Planning v2"

        delete_page_response = client.delete(f"/pages/{page['id']}")
        assert delete_page_response.status_code == 204

        pages_after_delete_response = client.get(f"/projects/{project['id']}/pages")
        assert pages_after_delete_response.status_code == 200
        assert [item["id"] for item in response_data(pages_after_delete_response)] == [
            second_page["id"]
        ]

        delete_project_response = client.delete(f"/projects/{project['id']}")
        assert delete_project_response.status_code == 204

        final_projects_response = client.get("/projects")
        assert final_projects_response.status_code == 200
        assert response_data(final_projects_response) == []

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
        alpha = response_data(client.post("/projects", json={"name": "Alpha"}))
        beta = response_data(client.post("/projects", json={"name": "Beta"}))
        gamma = response_data(client.post("/projects", json={"name": "Gamma"}))

        reorder_projects_response = client.post(
            "/projects/reorder",
            json={"ordered_ids": [gamma["id"], alpha["id"], beta["id"]]},
        )
        assert reorder_projects_response.status_code == 200
        reordered_projects = response_data(reorder_projects_response)
        assert [project["id"] for project in reordered_projects] == [
            gamma["id"],
            alpha["id"],
            beta["id"],
        ]
        assert [project["sort_order"] for project in reordered_projects] == [0, 1, 2]

        source_page_response = client.post(
            f"/projects/{gamma['id']}/pages",
            json={"name": "Sprint Board"},
        )
        source_page = response_data(source_page_response)
        trailing_page_response = client.post(
            f"/projects/{gamma['id']}/pages",
            json={"name": "Archive"},
        )
        trailing_page = response_data(trailing_page_response)

        frame_response = client.post(
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
        )
        frame = response_data(frame_response)
        child_item_response = client.post(
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
        )
        child_item = response_data(child_item_response)
        arrow_item_response = client.post(
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
        )
        arrow_item = response_data(arrow_item_response)
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
        duplicated_page = response_data(duplicate_page_response)
        assert duplicated_page["project_id"] == gamma["id"]
        assert duplicated_page["name"] == "Sprint Board Copy"
        assert duplicated_page["sort_order"] == 1

        pages_after_duplicate_response = client.get(f"/projects/{gamma['id']}/pages")
        assert pages_after_duplicate_response.status_code == 200
        pages_after_duplicate = response_data(pages_after_duplicate_response)
        assert [page["id"] for page in pages_after_duplicate] == [
            source_page["id"],
            duplicated_page["id"],
            trailing_page["id"],
        ]

        duplicated_board_response = client.get(
            f"/pages/{duplicated_page['id']}/board-data"
        )
        assert duplicated_board_response.status_code == 200
        duplicated_payload = response_data(duplicated_board_response)
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
        reordered_pages = response_data(reorder_pages_response)
        assert [page["id"] for page in reordered_pages] == [
            trailing_page["id"],
            source_page["id"],
            duplicated_page["id"],
        ]
        assert [page["sort_order"] for page in reordered_pages] == [0, 1, 2]


def test_board_item_connector_and_board_data_flow(tmp_path: Path) -> None:
    client, _ = create_client(tmp_path)

    with client:
        project = response_data(client.post("/projects", json={"name": "Execution"}))
        page_response = client.post(
            f"/projects/{project['id']}/pages",
            json={"name": "Main Board"},
        )
        page = response_data(page_response)

        update_viewport_response = client.patch(
            f"/pages/{page['id']}/viewport",
            json={"viewport_x": 120, "viewport_y": 80, "zoom": 1.25},
        )
        assert update_viewport_response.status_code == 200
        assert response_data(update_viewport_response)["zoom"] == 1.25

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
        text_box = response_data(create_item_response)

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
        arrow_item = response_data(create_arrow_response)

        connector_payload = {
            "connector_item_id": arrow_item["id"],
            "from_item_id": text_box["id"],
            "to_item_id": text_box["id"],
            "from_anchor": "right",
            "to_anchor": "left",
        }
        create_connector_response = client.post("/connectors", json=connector_payload)
        assert create_connector_response.status_code == 201
        connector = response_data(create_connector_response)

        list_items_response = client.get(f"/pages/{page['id']}/board-items")
        assert list_items_response.status_code == 200
        assert len(response_data(list_items_response)) == 2

        update_item_response = client.patch(
            f"/board-items/{text_box['id']}",
            json={**text_box_payload, "content": "Updated launch checklist"},
        )
        assert update_item_response.status_code == 200
        assert response_data(update_item_response)["content"] == "Updated launch checklist"

        list_connectors_response = client.get(f"/pages/{page['id']}/connectors")
        assert list_connectors_response.status_code == 200
        assert response_data(list_connectors_response)[0]["id"] == connector["id"]

        update_connector_response = client.patch(
            f"/connectors/{connector['id']}",
            json={**connector_payload, "to_anchor": "top"},
        )
        assert update_connector_response.status_code == 200
        assert response_data(update_connector_response)["to_anchor"] == "top"

        board_data_response = client.get(f"/pages/{page['id']}/board-data")
        assert board_data_response.status_code == 200
        payload = response_data(board_data_response)
        assert payload["page"]["id"] == page["id"]
        assert len(payload["board_items"]) == 2
        assert len(payload["connector_links"]) == 1

        delete_connector_response = client.delete(f"/connectors/{connector['id']}")
        assert delete_connector_response.status_code == 204

        delete_item_response = client.delete(f"/board-items/{text_box['id']}")
        assert delete_item_response.status_code == 204


def test_replace_page_board_state_restores_snapshot(tmp_path: Path) -> None:
    client, _ = create_client(tmp_path)

    with client:
        project = response_data(client.post("/projects", json={"name": "History"}))
        page = response_data(
            client.post(
                f"/projects/{project['id']}/pages",
                json={"name": "Undo Board"},
            )
        )

        frame = response_data(
            client.post(
                "/board-items",
                json={
                    "page_id": page["id"],
                    "parent_item_id": None,
                    "category": "large_item",
                    "type": "frame",
                    "title": "Review Frame",
                    "content": None,
                    "content_format": None,
                    "x": 120,
                    "y": 80,
                    "width": 360,
                    "height": 240,
                    "rotation": 0,
                    "z_index": 0,
                    "is_collapsed": False,
                    "style_json": None,
                    "data_json": None,
                },
            )
        )
        note = response_data(
            client.post(
                "/board-items",
                json={
                    "page_id": page["id"],
                    "parent_item_id": frame["id"],
                    "category": "small_item",
                    "type": "sticky_note",
                    "title": None,
                    "content": "Initial note",
                    "content_format": "plain_text",
                    "x": 160,
                    "y": 132,
                    "width": 160,
                    "height": 160,
                    "rotation": 0,
                    "z_index": 1,
                    "is_collapsed": False,
                    "style_json": '{"backgroundColor":"#fef08a"}',
                    "data_json": None,
                },
            )
        )
        arrow_item = response_data(
            client.post(
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
                    "width": 200,
                    "height": 60,
                    "rotation": 0,
                    "z_index": 2,
                    "is_collapsed": False,
                    "style_json": None,
                    "data_json": '{"kind":"straight"}',
                },
            )
        )
        connector = response_data(
            client.post(
                "/connectors",
                json={
                    "connector_item_id": arrow_item["id"],
                    "from_item_id": note["id"],
                    "to_item_id": frame["id"],
                    "from_anchor": "right",
                    "to_anchor": "left",
                },
            )
        )

        original_snapshot = response_data(client.get(f"/pages/{page['id']}/board-data"))

        stray_note = response_data(
            client.post(
                "/board-items",
                json={
                    "page_id": page["id"],
                    "parent_item_id": None,
                    "category": "small_item",
                    "type": "text_box",
                    "title": None,
                    "content": "Temporary item",
                    "content_format": "plain_text",
                    "x": 520,
                    "y": 120,
                    "width": 220,
                    "height": 80,
                    "rotation": 0,
                    "z_index": 3,
                    "is_collapsed": False,
                    "style_json": None,
                    "data_json": None,
                },
            )
        )
        delete_response = client.delete(f"/board-items/{note['id']}")
        assert delete_response.status_code == 204

        replace_response = client.put(
            f"/pages/{page['id']}/board-state",
            json={
                "board_items": original_snapshot["board_items"],
                "connector_links": original_snapshot["connector_links"],
            },
        )
        assert replace_response.status_code == 200
        replaced_payload = response_data(replace_response)

        assert {item["id"] for item in replaced_payload["board_items"]} == {
            frame["id"],
            note["id"],
            arrow_item["id"],
        }
        assert all(item["id"] != stray_note["id"] for item in replaced_payload["board_items"])
        assert replaced_payload["connector_links"] == [connector]

        restored_note = next(
            item for item in replaced_payload["board_items"] if item["id"] == note["id"]
        )
        assert restored_note["parent_item_id"] == frame["id"]
        assert restored_note["content"] == "Initial note"
        assert restored_note["style_json"] == '{"backgroundColor":"#fef08a"}'


def test_line_board_item_round_trips_rotation_and_style(tmp_path: Path) -> None:
    client, _ = create_client(tmp_path)

    with client:
        project = response_data(client.post("/projects", json={"name": "Shapes"}))
        page = response_data(
            client.post(
                f"/projects/{project['id']}/pages",
                json={"name": "Line Board"},
            )
        )

        create_line_response = client.post(
            "/board-items",
            json={
                "page_id": page["id"],
                "parent_item_id": None,
                "category": "shape",
                "type": "line",
                "title": None,
                "content": None,
                "content_format": None,
                "x": 48,
                "y": 96,
                "width": 240,
                "height": 40,
                "rotation": 15,
                "z_index": 0,
                "is_collapsed": False,
                "style_json": '{"strokeColor":"#0f172a","strokeWidth":4}',
                "data_json": None,
            },
        )
        assert create_line_response.status_code == 201
        line_item = response_data(create_line_response)
        assert line_item["type"] == "line"
        assert line_item["rotation"] == 15

        update_line_response = client.patch(
            f"/board-items/{line_item['id']}",
            json={
                "page_id": page["id"],
                "parent_item_id": None,
                "category": "shape",
                "type": "line",
                "title": None,
                "content": None,
                "content_format": None,
                "x": 72,
                "y": 112,
                "width": 320,
                "height": 48,
                "rotation": -35,
                "z_index": 1,
                "is_collapsed": False,
                "style_json": (
                    '{"strokeColor":"#1d4ed8","strokeWidth":6,'
                    '"strokeStyle":"dashed"}'
                ),
                "data_json": None,
            },
        )
        assert update_line_response.status_code == 200
        updated_line = response_data(update_line_response)
        assert updated_line["rotation"] == -35
        assert '"strokeStyle":"dashed"' in updated_line["style_json"]

        board_data_response = client.get(f"/pages/{page['id']}/board-data")
        assert board_data_response.status_code == 200
        board_payload = response_data(board_data_response)
        assert board_payload["connector_links"] == []

        persisted_line = board_payload["board_items"][0]
        assert persisted_line["id"] == line_item["id"]
        assert persisted_line["rotation"] == -35
        assert persisted_line["width"] == 320
        assert persisted_line["height"] == 48
        assert '"strokeColor":"#1d4ed8"' in persisted_line["style_json"]


def test_table_board_item_round_trips_data_and_style(tmp_path: Path) -> None:
    client, _ = create_client(tmp_path)

    with client:
        project = response_data(client.post("/projects", json={"name": "Tables"}))
        page = response_data(
            client.post(
                f"/projects/{project['id']}/pages",
                json={"name": "Table Board"},
            )
        )

        create_table_response = client.post(
            "/board-items",
            json={
                "page_id": page["id"],
                "parent_item_id": None,
                "category": "shape",
                "type": "table",
                "title": None,
                "content": "",
                "content_format": None,
                "x": 96,
                "y": 144,
                "width": 360,
                "height": 220,
                "rotation": 0,
                "z_index": 0,
                "is_collapsed": False,
                "style_json": '{"backgroundColor":"#f8fafc","textColor":"#0f172a"}',
                "data_json": (
                    '{"rows":2,"cols":3,"cells":'
                    '[["Owner","Task","Status"],["Amy","MVP","In Progress"]]}'
                ),
            },
        )
        assert create_table_response.status_code == 201
        table_item = response_data(create_table_response)
        assert table_item["type"] == "table"
        assert '"rows":2' in table_item["data_json"]
        assert '"Task"' in table_item["data_json"]

        update_table_response = client.patch(
            f"/board-items/{table_item['id']}",
            json={
                "page_id": page["id"],
                "parent_item_id": None,
                "category": "shape",
                "type": "table",
                "title": None,
                "content": "",
                "content_format": None,
                "x": 120,
                "y": 180,
                "width": 420,
                "height": 240,
                "rotation": 0,
                "z_index": 1,
                "is_collapsed": False,
                "style_json": (
                    '{"backgroundColor":"#ecfeff","textColor":"#164e63","fontSize":15}'
                ),
                "data_json": (
                    '{"rows":3,"cols":2,"cells":'
                    '[["Workstream","Owner"],["API","Noah"],["UI","Mia"]]}'
                ),
            },
        )
        assert update_table_response.status_code == 200
        updated_table = response_data(update_table_response)
        assert '"rows":3' in updated_table["data_json"]
        assert '"UI"' in updated_table["data_json"]
        assert '"fontSize":15' in updated_table["style_json"]

        board_data_response = client.get(f"/pages/{page['id']}/board-data")
        assert board_data_response.status_code == 200
        board_payload = response_data(board_data_response)
        assert board_payload["connector_links"] == []

        persisted_table = board_payload["board_items"][0]
        assert persisted_table["id"] == table_item["id"]
        assert persisted_table["width"] == 420
        assert persisted_table["height"] == 240
        assert '"Workstream"' in persisted_table["data_json"]
        assert '"Owner"' in persisted_table["data_json"]
        assert '"backgroundColor":"#ecfeff"' in persisted_table["style_json"]


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
        project = response_data(client.post("/projects", json={"name": "Execution"}))
        page_response = client.post(
            f"/projects/{project['id']}/pages",
            json={"name": "Main Board"},
        )
        page = response_data(page_response)

        from_item_response = client.post(
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
        )
        from_item = response_data(from_item_response)
        to_item_response = client.post(
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
        )
        to_item = response_data(to_item_response)
        arrow_item_response = client.post(
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
        )
        arrow_item = response_data(arrow_item_response)

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
        assert [item["id"] for item in response_data(board_items_response)] == [
            to_item["id"]
        ]

        connectors_response = client.get(f"/pages/{page['id']}/connectors")
        assert connectors_response.status_code == 200
        assert response_data(connectors_response) == []


def test_board_data_persists_across_app_restart(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)

    with TestClient(create_app(settings)) as client:
        project = response_data(client.post("/projects", json={"name": "Persistence"}))
        page = response_data(
            client.post(
                f"/projects/{project['id']}/pages",
                json={"name": "Saved Board"},
            )
        )

        viewport_response = client.patch(
            f"/pages/{page['id']}/viewport",
            json={"viewport_x": 180, "viewport_y": 96, "zoom": 1.4},
        )
        assert viewport_response.status_code == 200

        frame = response_data(
            client.post(
                "/board-items",
                json={
                    "page_id": page["id"],
                    "parent_item_id": None,
                    "category": "large_item",
                    "type": "frame",
                    "title": "Persisted Frame",
                    "content": None,
                    "content_format": None,
                    "x": 64,
                    "y": 48,
                    "width": 360,
                    "height": 240,
                    "rotation": 0,
                    "z_index": 0,
                    "is_collapsed": True,
                    "style_json": '{"backgroundColor":"#eff6ff"}',
                    "data_json": None,
                },
            )
        )
        note = response_data(
            client.post(
                "/board-items",
                json={
                    "page_id": page["id"],
                    "parent_item_id": frame["id"],
                    "category": "small_item",
                    "type": "note_paper",
                    "title": None,
                    "content": "# Persisted heading\n\nKeep this note.",
                    "content_format": "markdown",
                    "x": 96,
                    "y": 132,
                    "width": 240,
                    "height": 180,
                    "rotation": 0,
                    "z_index": 1,
                    "is_collapsed": False,
                    "style_json": None,
                    "data_json": None,
                },
            )
        )
        arrow_item = response_data(
            client.post(
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
                    "width": 220,
                    "height": 80,
                    "rotation": 0,
                    "z_index": 2,
                    "is_collapsed": False,
                    "style_json": None,
                    "data_json": '{"kind":"straight"}',
                },
            )
        )
        connector = response_data(
            client.post(
                "/connectors",
                json={
                    "connector_item_id": arrow_item["id"],
                    "from_item_id": note["id"],
                    "to_item_id": frame["id"],
                    "from_anchor": "right",
                    "to_anchor": "left",
                },
            )
        )

    with TestClient(create_app(settings)) as restarted_client:
        projects_response = restarted_client.get("/projects")
        assert projects_response.status_code == 200
        assert [item["id"] for item in response_data(projects_response)] == [project["id"]]

        pages_response = restarted_client.get(f"/projects/{project['id']}/pages")
        assert pages_response.status_code == 200
        reloaded_page = response_data(pages_response)[0]
        assert reloaded_page["id"] == page["id"]
        assert reloaded_page["viewport_x"] == 180
        assert reloaded_page["viewport_y"] == 96
        assert reloaded_page["zoom"] == 1.4

        board_data_response = restarted_client.get(f"/pages/{page['id']}/board-data")
        assert board_data_response.status_code == 200
        board_data = response_data(board_data_response)

        assert {item["id"] for item in board_data["board_items"]} == {
            frame["id"],
            note["id"],
            arrow_item["id"],
        }
        assert board_data["connector_links"] == [connector]

        persisted_frame = next(
            item for item in board_data["board_items"] if item["id"] == frame["id"]
        )
        persisted_note = next(
            item for item in board_data["board_items"] if item["id"] == note["id"]
        )

        assert persisted_frame["is_collapsed"] is True
        assert persisted_frame["style_json"] == '{"backgroundColor":"#eff6ff"}'
        assert persisted_note["parent_item_id"] == frame["id"]
        assert persisted_note["content"] == "# Persisted heading\n\nKeep this note."
