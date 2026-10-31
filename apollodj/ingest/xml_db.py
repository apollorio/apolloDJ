"""Pipeline v2 — coletanea.aprio.xml in-RAM cache with atomic save.

The XML serves as the master track database: one ``<track>`` per audio file
(keyed by fingerprint), many ``<playlistRef>`` pointing at it. Parsing the
file on every drop would be slow on libraries of 50 k+ tracks, so we keep
the parsed tree in memory and debounce-save on a 3 s timer.

Atomicity: every save goes through ``conf.atomic.atomic_write_text`` so a
crash mid-write never corrupts the master DB.
"""
from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from xml.sax.saxutils import escape as xml_escape

from ..conf.atomic import atomic_write_text
from ..conf.paths import DB_DIR

_XML_PATH = DB_DIR / "coletanea.aprio.xml"
_DEBOUNCE_SEC = 3.0

_lock = threading.RLock()
_dirty = False
_save_timer: Optional[threading.Timer] = None

# In-RAM model (kept tiny — single dict-of-dict; lxml parsing happens only on first load).
# Schema:
#   {"tracks": {fingerprint: {path, bpm, key, energy, quality, playlists: set[str]}},
#    "playlists": {name: set[fingerprint]}}
_db: Dict[str, Any] = {"tracks": {}, "playlists": {}}
_loaded = False


def _ensure_loaded() -> None:
    global _loaded
    if _loaded:
        return
    with _lock:
        if _loaded:
            return
        _loaded = True
        if not _XML_PATH.is_file():
            return
        try:
            from xml.etree import ElementTree as ET
            root = ET.parse(str(_XML_PATH)).getroot()
            for tnode in root.findall("track"):
                fp = tnode.get("fingerprint", "")
                if not fp:
                    continue
                _db["tracks"][fp] = {
                    "path": tnode.get("path", ""),
                    "bpm": tnode.get("bpm"),
                    "key": tnode.get("key"),
                    "energy": tnode.get("energy"),
                    "quality": tnode.get("quality"),
                    "playlists": set(p.text or "" for p in tnode.findall("playlist")),
                }
            for pnode in root.findall("playlist"):
                name = pnode.get("name", "")
                _db["playlists"][name] = set(r.get("fingerprint", "") for r in pnode.findall("trackRef"))
        except Exception:
            pass  # corrupt XML → start fresh; backup file remains on disk


def lookup(fingerprint: str) -> Optional[Dict[str, Any]]:
    """Return the existing track entry, or None if this audio is new."""
    _ensure_loaded()
    with _lock:
        entry = _db["tracks"].get(fingerprint)
        return dict(entry) if entry else None


def upsert_track(fingerprint: str, fields: Dict[str, Any]) -> None:
    """Insert or update a track entry. Playlists are merged, not replaced."""
    _ensure_loaded()
    with _lock:
        current = _db["tracks"].setdefault(fingerprint, {"playlists": set()})
        merged_playlists = set(current.get("playlists", set())) | set(fields.get("playlists", set()))
        current.update(fields)
        current["playlists"] = merged_playlists
        _mark_dirty()


def attach_playlist(fingerprint: str, playlist: str) -> None:
    """Add ``playlist`` to a track's playlist set without re-analysis."""
    _ensure_loaded()
    with _lock:
        entry = _db["tracks"].setdefault(fingerprint, {"playlists": set()})
        entry.setdefault("playlists", set()).add(playlist)
        _db["playlists"].setdefault(playlist, set()).add(fingerprint)
        _mark_dirty()


def all_tracks() -> List[Dict[str, Any]]:
    _ensure_loaded()
    with _lock:
        return [{"fingerprint": fp, **dict(t)} for fp, t in _db["tracks"].items()]


def _mark_dirty() -> None:
    global _dirty, _save_timer
    with _lock:
        _dirty = True
        if _save_timer is None or not _save_timer.is_alive():
            _save_timer = threading.Timer(_DEBOUNCE_SEC, flush)
            _save_timer.daemon = True
            _save_timer.start()


def flush() -> Path:
    """Force an immediate atomic save to disk."""
    global _dirty
    with _lock:
        _dirty = False
        DB_DIR.mkdir(parents=True, exist_ok=True)
        lines = ['<?xml version="1.0" encoding="UTF-8"?>', "<coletanea>", "  <tracks>"]
        for fp, t in _db["tracks"].items():
            attrs = f'fingerprint="{xml_escape(fp)}" path="{xml_escape(str(t.get("path","")))}"'
            for k in ("bpm", "key", "energy", "quality"):
                v = t.get(k)
                if v is not None:
                    attrs += f' {k}="{xml_escape(str(v))}"'
            lines.append(f"    <track {attrs}>")
            for pl in sorted(t.get("playlists", set())):
                lines.append(f"      <playlist>{xml_escape(pl)}</playlist>")
            lines.append("    </track>")
        lines.append("  </tracks>")
        lines.append("  <playlists>")
        for name, fps in _db["playlists"].items():
            lines.append(f'    <playlist name="{xml_escape(name)}">')
            for fp in sorted(fps):
                lines.append(f'      <trackRef fingerprint="{xml_escape(fp)}" />')
            lines.append("    </playlist>")
        lines.append("  </playlists>")
        lines.append("</coletanea>")
        atomic_write_text(_XML_PATH, "\n".join(lines))
        return _XML_PATH
