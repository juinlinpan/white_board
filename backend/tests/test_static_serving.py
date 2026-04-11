from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import build_settings


def write_frontend_dist(dist_dir: Path) -> None:
    assets_dir = dist_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    (dist_dir / "index.html").write_text(
        (
            "<!doctype html>"
            "<html><head><title>Whiteboard</title></head>"
            '<body><div id="root"></div><script type="module" src="/assets/app.js"></script></body>'
            "</html>"
        ),
        encoding="utf-8",
    )
    (assets_dir / "app.js").write_text("console.log('whiteboard');", encoding="utf-8")


def test_backend_serves_built_frontend_bundle(tmp_path: Path) -> None:
    frontend_dist = tmp_path / "frontend-dist"
    write_frontend_dist(frontend_dist)
    settings = build_settings(tmp_path / "backend-root", frontend_dist)

    with TestClient(create_app(settings)) as client:
        index_response = client.get("/")
        assert index_response.status_code == 200
        assert "text/html" in index_response.headers["content-type"]
        assert '<div id="root"></div>' in index_response.text

        asset_response = client.get("/assets/app.js")
        assert asset_response.status_code == 200
        assert "console.log('whiteboard');" in asset_response.text

        health_response = client.get("/healthz")
        assert health_response.status_code == 200
        assert health_response.json()["data"]["status"] == "ok"


def test_backend_root_reports_missing_frontend_bundle(tmp_path: Path) -> None:
    frontend_dist = tmp_path / "missing-dist"
    settings = build_settings(tmp_path / "backend-root", frontend_dist)

    with TestClient(create_app(settings)) as client:
        response = client.get("/")

    assert response.status_code == 503
    assert "Frontend bundle not found." in response.text
    assert "npm run build" in response.text
