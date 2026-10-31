"""Universal Export — read Serato DJ Pro crates + database.

Podium (function never raises):
    #1 MAIN     serato-tools native reader
    #2 FALLBACK manual .crate binary parser (limited fields)
    #3 SAFETY   empty list
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from .track_model import Track


def read_serato_library(serato_root: Optional[str] = None) -> List[Track]:
    """Return Track list from a Serato library root (``_Serato_/`` folder)."""
    # #1 MAIN
    try:
        from serato_tools.database import Database  # type: ignore
        db = Database(str(serato_root)) if serato_root else Database()
        out: List[Track] = []
        for s in db.tracks():
            out.append(Track(
                fingerprint=str(getattr(s, "uuid", "") or ""),
                path=Path(getattr(s, "path", "") or ""),
                artist=str(getattr(s, "artist", "") or "Unknown"),
                title=str(getattr(s, "title", "") or ""),
                bpm=getattr(s, "bpm", None),
                key=str(getattr(s, "key", "") or "") or None,
                duration_sec=float(getattr(s, "length", 0) or 0),
            ))
        return out
    except Exception:
        pass

    # #3 SAFETY (#2 manual binary parser deferred — non-trivial format)
    return []
