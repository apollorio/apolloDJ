"""MusicBrainz metadata enrichment (artist, title, year, cover art).

Top 3 Podium:
  1. musicbrainzngs API (canonical, official, free)
  2. AcoustID fingerprint lookup (when artist/title missing)
  3. filename parser (always available, lowest precision)
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, Optional

from ..conf.constants import APP_VERSION


_FILENAME_RE = re.compile(
    r"^\s*(?P<artist>[^-\[]+?)\s*-\s*(?P<title>[^\[\(]+?)\s*(?:\[|\(|$)"
)


def lookup(path: str | Path, hints: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    """Resolve metadata for the given audio path."""
    hints = hints or {}
    artist = hints.get("artist")
    title = hints.get("title")
    if not artist or not title:
        parsed = _parse_filename(Path(path).stem)
        artist = artist or parsed.get("artist")
        title = title or parsed.get("title")

    if artist and title:
        mb = _musicbrainz_search(artist, title)
        if mb:
            return {"source": "musicbrainzngs", **mb}

    fp = _acoustid_lookup(str(path))
    if fp:
        return {"source": "acoustid", **fp}

    return {
        "source": "filename_parser",
        "artist": artist or "Unknown",
        "title": title or Path(path).stem,
        "year": None,
        "cover_path": None,
    }


def _parse_filename(stem: str) -> Dict[str, str]:
    m = _FILENAME_RE.match(stem)
    if not m:
        return {}
    return {"artist": m.group("artist").strip(), "title": m.group("title").strip()}


def _musicbrainz_search(artist: str, title: str) -> Optional[Dict[str, Any]]:
    try:
        import musicbrainzngs
        musicbrainzngs.set_useragent("apolloDJ", APP_VERSION, "https://apollo.rio.br")
        res = musicbrainzngs.search_recordings(artist=artist, recording=title, limit=1)
        items = res.get("recording-list") or []
        if not items:
            return None
        top = items[0]
        release = (top.get("release-list") or [{}])[0]
        return {
            "artist": (top.get("artist-credit") or [{}])[0].get("name", artist),
            "title": top.get("title", title),
            "year": (release.get("date") or "").split("-")[0] or None,
            "release_id": release.get("id"),
            "mbid": top.get("id"),
            "cover_path": None,
        }
    except Exception:
        return None


def _acoustid_lookup(path: str) -> Optional[Dict[str, Any]]:
    try:
        import acoustid
        for score, rid, title, artist in acoustid.match("apolloDJ", path):
            return {"artist": artist, "title": title, "year": None,
                    "release_id": rid, "score": score, "cover_path": None}
    except Exception:
        pass
    return None
