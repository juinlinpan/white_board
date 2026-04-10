from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.settings import build_settings


def test_healthz(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)

    with TestClient(create_app(settings)) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {
        "service": "whiteboard-backend",
        "status": "ok",
    }
    assert settings.data_dir.is_dir()
    assert settings.logs_dir.is_dir()
    assert settings.sqlite_path.is_file()
    assert settings.app_log_path.is_file()
    assert settings.backend_log_path.is_file()
