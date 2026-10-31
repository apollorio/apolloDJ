"""Universal Export — Serato ↔ Rekordbox cross-translation helpers.

Hot-cue colour mapping, key notation (Open Key vs Camelot), and Serato
``cue_loaded`` boolean → Rekordbox memory-cue flag.
"""
from __future__ import annotations

from typing import Any, Dict

# Serato hex colour → Rekordbox 0..7 colour slot.
_SERATO_TO_REKORDBOX_COLOR = {
    "FF0000": 0,  # red
    "FF8800": 1,  # orange
    "FFFF00": 2,  # yellow
    "00FF00": 3,  # green
    "00FFFF": 4,  # cyan
    "0000FF": 5,  # blue
    "FF00FF": 6,  # magenta
    "FFFFFF": 7,  # white
}

# Open Key (1d..12d, 1m..12m) → Camelot (1B..12B, 1A..12A).
_OPENKEY_TO_CAMELOT = {f"{n}d": f"{n}B" for n in range(1, 13)} | {f"{n}m": f"{n}A" for n in range(1, 13)}


def serato_color_to_rekordbox(hex_color: str) -> int:
    return _SERATO_TO_REKORDBOX_COLOR.get((hex_color or "").upper().lstrip("#")[:6], 0)


def openkey_to_camelot(open_key: str) -> str:
    return _OPENKEY_TO_CAMELOT.get(str(open_key).strip().lower(), open_key)


def serato_cue_to_rekordbox(serato_cue: Dict[str, Any]) -> Dict[str, Any]:
    """Translate one Serato cue dict to Rekordbox memory-cue dict."""
    return {
        "name": serato_cue.get("name", ""),
        "position_ms": int(serato_cue.get("position", 0)),
        "color_slot": serato_color_to_rekordbox(serato_cue.get("color", "")),
        "is_memory_cue": bool(serato_cue.get("cue_loaded", False)),
    }
