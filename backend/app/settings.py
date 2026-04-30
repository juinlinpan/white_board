from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True, slots=True)
class AppSettings:
    project_root: Path
    backend_root: Path
    planvas_root: Path
    logs_dir: Path
    app_log_path: Path
    backend_log_path: Path
    frontend_dist_dir: Path
    frontend_index_path: Path


def build_settings(
    backend_root: Path | None = None,
    frontend_dist_dir: Path | None = None,
    planvas_root: Path | None = None,
) -> AppSettings:
    env_backend_root = os.environ.get("WHITEBOARD_BACKEND_ROOT")
    env_frontend_dist = os.environ.get("WHITEBOARD_FRONTEND_DIST")
    env_planvas_root = os.environ.get("WHITEBOARD_PLANVAS_ROOT")
    root = backend_root or (Path(env_backend_root) if env_backend_root else None)
    project_root = Path(__file__).resolve().parents[2]
    resolved_root = (root or Path(__file__).resolve().parents[1]).resolve()
    resolved_planvas_root = (
        planvas_root
        or (Path(env_planvas_root) if env_planvas_root else None)
        or (
            (resolved_root / ".planvas")
            if backend_root is not None
            else (Path.home() / ".planvas")
        )
    ).resolve()
    logs_dir = resolved_root / "logs"
    resolved_frontend_dist = (
        frontend_dist_dir
        or (Path(env_frontend_dist) if env_frontend_dist else None)
        or (project_root / "frontend" / "dist")
    ).resolve()

    return AppSettings(
        project_root=project_root,
        backend_root=resolved_root,
        planvas_root=resolved_planvas_root,
        logs_dir=logs_dir,
        app_log_path=logs_dir / "app.log",
        backend_log_path=logs_dir / "backend.log",
        frontend_dist_dir=resolved_frontend_dist,
        frontend_index_path=resolved_frontend_dist / "index.html",
    )


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return build_settings()
