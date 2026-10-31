"""Pyrekordbox DB6 / ANLZ writer (CDJ-native export).

Top 3 Podium:
  1. pyrekordbox Rekordbox6Database + AnlzFile  (Pioneer native — best precision)
  2. pyrekordbox RekordboxXml export (no DB6 — wide compatibility)
  3. Plain XML stub via usb_exporter.generate_unified_playlist_xml
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping

from .usb_exporter import generate_unified_playlist_xml


def export_anlz_for_track(track_path: str | Path, beats: List[float],
                          bpm: float, hotcues: List[Mapping[str, Any]],
                          dst: str | Path) -> Dict[str, Any]:
    """Write an ANLZ0001.DAT-style sidecar with full beatgrid + hotcues."""
    try:
        from pyrekordbox import AnlzFile
        anlz = AnlzFile()
        anlz.add_beatgrid(beats, bpm)
        anlz.add_hotcues([dict(c) for c in hotcues])
        Path(dst).parent.mkdir(parents=True, exist_ok=True)
        anlz.save(str(dst))
        return {"engine": "pyrekordbox_anlz", "path": str(dst)}
    except Exception as exc:
        return {"engine": "pyrekordbox_anlz", "error": repr(exc), "skipped": True}


def export_playlist_db6(name: str, tracks: Iterable[Path],
                        usb_root: str | Path) -> Dict[str, Any]:
    """Top-priority path: write a full Rekordbox6 USB structure."""
    usb_p = Path(usb_root)

    try:
        from pyrekordbox import Rekordbox6Database
        db = Rekordbox6Database()
        playlist = db.create_playlist(name)
        for t in tracks:
            db.add_content(str(t), playlist=playlist)
        db.export_to_usb(str(usb_p))
        return {"engine": "pyrekordbox_db6", "usb_root": str(usb_p)}
    except Exception:
        pass

    try:
        from pyrekordbox import RekordboxXml
        xml_out = usb_p / f"{name}.xml"
        usb_p.mkdir(parents=True, exist_ok=True)
        rx = RekordboxXml()
        for t in tracks:
            rx.add_track(str(t))
        rx.add_playlist(name, [str(t) for t in tracks])
        rx.save(str(xml_out))
        return {"engine": "pyrekordbox_xml", "xml": str(xml_out)}
    except Exception:
        pass

    return {
        "engine": "apollodj_xml_stub",
        "xml": str(generate_unified_playlist_xml(name, list(tracks))),
    }
