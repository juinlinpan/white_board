from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True, slots=True)
class AppSettings:
    project_root: Path
    backend_root: Path
    data_dir: Path
    logs_dir: Path
    sqlite_path: Path
    app_log_path: Path
    backend_log_path: Path
    frontend_dist_dir: Path
    frontend_index_path: Path


def build_settings(
    backend_root: Path | None = None,
    frontend_dist_dir: Path | None = None,
) -> AppSettings:
    env_backend_root = os.environ.get("WHITEBOARD_BACKEND_ROOT")
    env_frontend_dist = os.environ.get("WHITEBOARD_FRONTEND_DIST")
    root = backend_root or (Path(env_backend_root) if env_backend_root else None)
    project_root = Path(__file__).resolve().parents[2]
    resolved_root = (root or Path(__file__).resolve().parents[1]).resolve()
    data_dir = resolved_root / "data"
    logs_dir = resolved_root / "logs"
    resolved_frontend_dist = (
        frontend_dist_dir
        or (Path(env_frontend_dist) if env_frontend_dist else None)
        or (project_root / "frontend" / "dist")
    ).resolve()

    return AppSettings(
        project_root=project_root,
        backend_root=resolved_root,
        data_dir=data_dir,
        logs_dir=logs_dir,
        sqlite_path=data_dir / "whiteboard.db",
        app_log_path=logs_dir / "app.log",
        backend_log_path=logs_dir / "backend.log",
        frontend_dist_dir=resolved_frontend_dist,
        frontend_index_path=resolved_frontend_dist / "index.html",
    )


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return build_settings()
