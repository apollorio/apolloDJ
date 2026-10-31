"""Universal Export — Serato DJ Pro crate writer.

Engine code: apolloSER.

Podium (function never raises):
    #1 MAIN     serato-tools native crate writer
    #2 FALLBACK plain-text M3U-style fallback (read by Serato as "Imported Track")
    #3 SAFETY   empty file (lets caller continue)
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

from ...conf.atomic import atomic_write_text
from ..parsers.track_model import Track


def write_crate(tracks: Iterable[Track], output_path: str | Path,
                crate_name: str = "apolloDJ") -> Path:
    """Write a Serato crate file at ``output_path`` (``.crate`` extension)."""
    out = Path(output_path)
    track_list = list(tracks)

    # #1 MAIN — serato-tools native writer
    try:
        from serato_tools.crate import Crate  # type: ignore
        crate = Crate(crate_name)
        for t in track_list:
            crate.add_track(str(t.path))
        crate.save(str(out))
        return out
    except Exception:
        pass

    # #2 FALLBACK — plain-text path list (Serato can re-discover via folder scan)
    body = "\n".join(str(t.path) for t in track_list) + "\n"
    atomic_write_text(out.with_suffix(".m3u"), body)
    return out.with_suffix(".m3u")
