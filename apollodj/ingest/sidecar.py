"""Sidecar metadata writer for analyzed tracks.

Writes a companion .apollodj.json next to the canonical file.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from ..conf.atomic import atomic_write_text


def write(track_path: Path, analysis: Dict[str, Any]) -> Path:
    """Write <track>.apollodj.json next to the track file."""
    sidecar = track_path.with_suffix(track_path.suffix + ".apollodj.json")
    payload = {
        "version": "1.0",
        "track": track_path.name,
        "analysis": analysis,
    }
    atomic_write_text(sidecar, json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return sidecar


def read(track_path: Path) -> Dict[str, Any] | None:
    """Read the sidecar if it exists."""
    sidecar = track_path.with_suffix(track_path.suffix + ".apollodj.json")
    if sidecar.exists():
        try:
            return json.loads(sidecar.read_text(encoding="utf-8"))
        except Exception:
            return None
    return None