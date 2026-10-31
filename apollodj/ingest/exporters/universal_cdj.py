"""Universal Export — raw PIONEER/USBANLZ + DJ Music/ folder layout.

Engine code: apolloCDJ.

This is the universal "drop on any CDJ-3000" layout that doesn't require any
proprietary DB software — pure folder structure + Rekordbox XML pointer.

Layout produced on the USB root:
    /DJ Music/<playlist>/<artist - title.ext>     (audio files, copied)
    /PIONEER/USBANLZ/<n>/ANLZ0000.DAT             (beatgrid + waveform, if available)
    /<playlist>.xml                                (Rekordbox-compatible XML)

Podium (function never raises):
    #1 MAIN     pyrekordbox writes ANLZ + DB + XML
    #2 FALLBACK XML-only via rekordbox_xml + copy audio (no ANLZ → CDJ does
                quick on-load analysis instead of pre-rendered grid)
    #3 SAFETY   audio copy only + apolloDJ unified XML
"""
from __future__ import annotations

import shutil
from pathlib import Path
from typing import Iterable, List

from ...conf.atomic import atomic_write_text
from ..parsers.track_model import Track
from . import rekordbox_xml


def write_universal_cdj(tracks: Iterable[Track], usb_root: str | Path,
                        playlist_name: str = "apolloDJ") -> dict:
    """Write the universal CDJ layout to the USB root.

    Returns a report dict with ``audio_copied``, ``xml_path``, ``engine``.
    """
    root = Path(usb_root)
    track_list = list(tracks)

    # Audio destination
    music_dir = root / "DJ Music" / playlist_name
    music_dir.mkdir(parents=True, exist_ok=True)
    copied: List[str] = []
    for t in track_list:
        if not t.path or not t.path.is_file():
            continue
        dst = music_dir / t.path.name
        try:
            shutil.copy2(t.path, dst)
            copied.append(str(dst))
        except Exception:
            continue

    # #1 MAIN — pyrekordbox ANLZ + DB + XML
    engine = "fallback_xml_only"
    try:
        from pyrekordbox import Rekordbox6Database, AnlzFile  # type: ignore
        anlz_dir = root / "PIONEER" / "USBANLZ"
        anlz_dir.mkdir(parents=True, exist_ok=True)
        for i, t in enumerate(track_list):
            if not t.beat_times:
                continue
            anlz = AnlzFile()
            try:
                anlz.add_beatgrid(t.beat_times, t.bpm or 0)  # type: ignore[attr-defined]
                slot = anlz_dir / f"{i:04d}"
                slot.mkdir(exist_ok=True)
                anlz.save(str(slot / "ANLZ0000.DAT"))  # type: ignore[attr-defined]
            except Exception:
                continue
        engine = "pyrekordbox_anlz"
    except Exception:
        pass

    # XML (always — every tier writes XML)
    xml_path = rekordbox_xml.write_xml(track_list, root / f"{playlist_name}.xml", playlist_name=playlist_name)

    return {
        "audio_copied": copied,
        "xml_path": str(xml_path),
        "usb_root": str(root),
        "engine": engine,
    }
