"""Local user preferences persisted under Configurações/."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .atomic import atomic_write_text
from .paths import CONFIG_DIR

PREFERENCES_FILE = CONFIG_DIR / "preferences.json"


def load_preferences() -> dict[str, Any]:
    if not PREFERENCES_FILE.is_file():
        return {}
    try:
        data = json.loads(PREFERENCES_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_preferences(data: dict[str, Any]) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    atomic_write_text(
        PREFERENCES_FILE,
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
