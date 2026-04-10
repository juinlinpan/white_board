from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


@dataclass(frozen=True, slots=True)
class AppSettings:
    backend_root: Path
    data_dir: Path
    logs_dir: Path
    sqlite_path: Path
    app_log_path: Path
    backend_log_path: Path


def build_settings(backend_root: Path | None = None) -> AppSettings:
    env_backend_root = os.environ.get("WHITEBOARD_BACKEND_ROOT")
    root = backend_root or (Path(env_backend_root) if env_backend_root else None)
    resolved_root = (root or Path(__file__).resolve().parents[1]).resolve()
    data_dir = resolved_root / "data"
    logs_dir = resolved_root / "logs"

    return AppSettings(
        backend_root=resolved_root,
        data_dir=data_dir,
        logs_dir=logs_dir,
        sqlite_path=data_dir / "whiteboard.db",
        app_log_path=logs_dir / "app.log",
        backend_log_path=logs_dir / "backend.log",
    )


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    return build_settings()
