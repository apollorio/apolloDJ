"""Universal Export — read existing Rekordbox 6 DB + ANLZ files.

Podium (function never raises):
    #1 MAIN     pyrekordbox.Rekordbox6Database (full DB + ANLZ)
    #2 FALLBACK pyrekordbox.RekordboxXml (XML export, no DB lock)
    #3 SAFETY   empty list (lets caller continue with new tracks only)
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from .track_model import Track


def read_rekordbox_library(db_or_xml_path: Optional[str] = None) -> List[Track]:
    """Return a list of Track entries from a Rekordbox 6 DB or XML export."""
    # #1 MAIN
    try:
        from pyrekordbox import Rekordbox6Database  # type: ignore
        db = Rekordbox6Database(str(db_or_xml_path)) if db_or_xml_path else Rekordbox6Database()
        out: List[Track] = []
        for rb_track in db.get_tracks():
            out.append(Track(
                fingerprint=str(getattr(rb_track, "ID", "") or ""),
                path=Path(getattr(rb_track, "FolderPath", "") or ""),
                artist=str(getattr(rb_track, "ArtistName", "") or "Unknown"),
                title=str(getattr(rb_track, "Title", "") or ""),
                bpm=getattr(rb_track, "BPM", None),
                key=str(getattr(rb_track, "Tonality", "") or "") or None,
                duration_sec=float(getattr(rb_track, "Length", 0) or 0),
                bitrate_kbps=int(getattr(rb_track, "BitRate", 0) or 0),
            ))
        return out
    except Exception:
        pass

    # #2 FALLBACK
    try:
        from pyrekordbox import RekordboxXml  # type: ignore
        if not db_or_xml_path:
            return []
        xml = RekordboxXml(str(db_or_xml_path))
        out = []
        for t in xml.get_tracks():
            out.append(Track(
                fingerprint=str(getattr(t, "TrackID", "") or ""),
                path=Path(getattr(t, "Location", "") or ""),
                artist=str(getattr(t, "Artist", "") or "Unknown"),
                title=str(getattr(t, "Name", "") or ""),
                bpm=getattr(t, "AverageBpm", None),
                key=str(getattr(t, "Tonality", "") or "") or None,
            ))
        return out
    except Exception:
        pass

    # #3 SAFETY
    return []
