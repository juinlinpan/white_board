from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.db import StorageInitializationError, initialize_storage
from app.main import create_app
from app.settings import build_settings


def test_healthz(tmp_path: Path) -> None:
    settings = build_settings(tmp_path)

    with TestClient(create_app(settings)) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {
        "data": {
            "service": "whiteboard-backend",
            "status": "ok",
        }
    }
    assert settings.planvas_root.is_dir()
    assert settings.logs_dir.is_dir()
    assert settings.app_log_path.is_file()
    assert settings.backend_log_path.is_file()


def test_initialize_storage_rejects_file_backend_root(tmp_path: Path) -> None:
    backend_root = tmp_path / "backend-root.txt"
    backend_root.write_text("not-a-directory", encoding="utf-8")

    settings = build_settings(backend_root)

    with pytest.raises(StorageInitializationError, match="Backend root") as exc_info:
        initialize_storage(settings)

    assert str(backend_root) in str(exc_info.value)
