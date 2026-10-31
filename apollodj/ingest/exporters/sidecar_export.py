"""Universal Export — sidecar writer (thin wrapper around ingest/sidecar.py).

Engine code: apolloSCR.

Mirrors the per-track ``.apollodj.json`` sidecar to the export destination so
the canonical analysis travels with the audio file even outside Rekordbox /
Serato.
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, List

from ..parsers.track_model import Track
from .. import sidecar as sidecar_mod


def export_sidecars(tracks: Iterable[Track], destination_dir: str | Path) -> List[Path]:
    """Write a sidecar .apollodj.json for every track next to its destination."""
    dest = Path(destination_dir)
    dest.mkdir(parents=True, exist_ok=True)
    written: List[Path] = []
    for t in tracks:
        if not t.path:
            continue
        target = dest / t.path.name
        analysis = {
            "fingerprint": t.fingerprint,
            "artist": t.artist,
            "title": t.title,
            "bpm": t.bpm,
            "key": t.key,
            "energy": t.energy,
            "duration_sec": t.duration_sec,
            "quality_score": t.quality_score,
            "beat_times": t.beat_times,
            "downbeat_cues": t.downbeat_cues,
            "hotcues": t.hotcues,
            "playlists": t.playlists,
        }
        try:
            written.append(sidecar_mod.write(target, analysis))
        except Exception:
            continue
    return written
