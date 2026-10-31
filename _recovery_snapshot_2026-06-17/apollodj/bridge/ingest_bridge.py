"""Bridge layer exposing ingest functionality to the pywebview frontend."""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, List

from ..conf.paths import LIBRARY_ROOT, validate_library_path
from ..ingest import dj_prep_pro, library as library_mod
from ..ingest.watcher import process_file, process_folder

logger = logging.getLogger(__name__)

# Audio file extensions scanned by the library
_AUDIO_EXTS: frozenset[str] = frozenset({
    ".mp3", ".flac", ".wav", ".aif", ".aiff", ".m4a", ".aac", ".ogg",
})


class IngestBridge:
    """Methods exposed as `window.pywebview.api.ingest_*`."""

    def ingest_track(self, path: str) -> dict:
        """Analyze and rename a single dropped track."""
        p = Path(path)
        final = process_file(p)
        return {"success": True, "final_path": str(final)} if final else {"success": False}

    def ingest_folder(self, path: str) -> dict:
        """Analyze and rename all tracks in a folder."""
        results = process_folder(Path(path))
        return {"success": True, "processed": [str(r) for r in results]}

    def cancel(self) -> None:
        """Future: cooperative cancellation of current batch."""
        pass

    # ── Coletânea Library UI — COMPUTADOR bridge (registry.json → library_ui) ─

    def list_computer_folders(self) -> dict:
        """COMPUTADOR section: defaults + user folders from prefs JSON."""
        return library_mod.list_computer_folders()

    def save_computer_folders(self, prefs: dict) -> dict:
        """Mirror JS ``localStorage apollodj.computador.v1`` to Configurações/."""
        return library_mod.save_computer_folders(prefs)

    def pick_folder(self) -> dict:
        """Native folder picker (pywebview FOLDER dialog; empty dict if cancelled)."""
        try:
            import webview

            win = webview.active_window()
            if win is None:
                return {"path": "", "label": ""}
            result = win.create_file_dialog(dialog_type=20)
            if not result:
                return {"path": "", "label": ""}
            chosen = result[0] if isinstance(result, (list, tuple)) else result
            chosen_path = str(chosen)
            return {"path": chosen_path, "label": Path(chosen_path).name or chosen_path}
        except Exception as exc:
            logger.warning("pick_folder failed: %s", exc)
            return {"path": "", "label": "", "error": str(exc)}

    def add_path_to_playlist(self, path: str, playlist_view: str | None = None) -> dict:
        """Validate + enqueue ingest for a COMPUTADOR file/folder → Coletânea."""
        return library_mod.add_path_to_playlist(path, playlist_view)

    def get_ingest_state(self) -> dict:
        """Queue status + recent v2 pipeline track states for UI polling."""
        from ..ingest.queue_boot import get_ingest_state

        return get_ingest_state()

    # ── Library scan + stats (Início / Relatórios) ────────────────────────────

    def scan_folder(self, path: str) -> dict:
        """List audio files under a workspace folder (recursive, capped)."""
        try:
            return library_mod.scan_folder(str(path))
        except Exception as exc:
            logger.warning("scan_folder failed: %s", exc)
            return {"ok": False, "path": str(path), "tracks": [], "error": str(exc)}

    def list_library(self) -> dict:
        """Analyzed tracks in Coletânea (+ sidecar metadata)."""
        try:
            return library_mod.list_library()
        except Exception as exc:
            logger.warning("list_library failed: %s", exc)
            return {"ok": False, "tracks": [], "error": str(exc)}

    def get_report_stats(self, period: str = "all", module: str = "geral") -> dict:
        """Filesystem-derived counts for Início tiles + Relatórios tables."""
        try:
            return library_mod.report_stats(str(period), str(module))
        except Exception as exc:
            logger.warning("get_report_stats failed: %s", exc)
            return {"ok": False, "rows": [], "empty": True, "error": str(exc)}

    # ── Library root (hard-locked to Coletânea) ───────────────────────────────

    def get_library_root(self) -> dict:
        """Return the canonical library path so the JS can pre-fill the "+" dialog.

        Called by coletanea-lib.js on mount to populate the Computador section
        with the real ``Tracks/Coletânea`` path instead of a hard-coded string.
        """
        return {"path": str(LIBRARY_ROOT), "display": "Tracks/Coletânea"}

    def validate_drop_path(self, dropped_path: str) -> dict:
        """Gate every drop / folder-add through the hard-locked library root.

        Returns ``{"valid": True, "path": ...}`` (canonical resolved Coletânea path)
        or ``{"valid": False, "error": "..."}`` (pt-BR message for the toast).

        Called by coletanea-lib.js before any ``ingest_folder`` / ``ingest_track``
        so rogue drops from C:/Music, Downloads, etc. are rejected client-side.
        """
        return validate_library_path(dropped_path)

    def open_library_folder(self) -> dict:
        """Open the hard-locked Coletânea folder in the OS file manager.

        Used by the "+" button — since the library is locked to Coletânea, we
        don't pick an arbitrary folder; we open the locked one so the user can
        drop files straight in.
        """
        try:
            LIBRARY_ROOT.mkdir(parents=True, exist_ok=True)
            if os.name == "nt":
                os.startfile(str(LIBRARY_ROOT))  # noqa: S606 — trusted constant path
            else:
                import subprocess
                subprocess.Popen(["xdg-open", str(LIBRARY_ROOT)])
            return {"ok": True, "path": str(LIBRARY_ROOT)}
        except Exception as exc:
            logger.warning("open_library_folder failed: %s", exc)
            return {"ok": False, "error": str(exc)}

    # ── Recursive library scan (hard-locked to Coletânea) ────────────────────

    def scan_library_recursive(self) -> dict:
        """Recursive scan of the hard-locked Coletânea root.

        Returns every audio file found inside ``~/apolloDJ/Tracks/Coletânea``
        with its relative sub-folder path.  Called by ``coletanea-lib.js`` on
        mount and after any ingest operation to keep the Computador section live.

        Result shape::

            {"tracks": [{"path": str, "name": str, "folder": str}, ...],
             "count": int}
        """
        tracks: list[dict] = []
        try:
            for root_str, _dirs, files in os.walk(str(LIBRARY_ROOT)):
                root_p = Path(root_str)
                for f in sorted(files):
                    if Path(f).suffix.lower() in _AUDIO_EXTS:
                        full = str(root_p / f)
                        rel_folder = str(root_p.relative_to(LIBRARY_ROOT)) if root_p != LIBRARY_ROOT else "."
                        tracks.append({"path": full, "name": f, "folder": rel_folder})
        except Exception as exc:
            logger.warning("scan_library_recursive failed: %s", exc)
        return {"tracks": tracks, "count": len(tracks)}

    # ── Advanced metadata extraction + standardised tag save ─────────────────

    def extract_advanced_metadata(self, path: str | None = None) -> dict:
        """PRO metadata read from a single file or a full Coletânea recursive scan.

        When ``path`` is given, reads the file's tags + audio info, then calls
        :meth:`save_standardized_tags` to write BPM/Key/Title/Artist back.
        When ``path`` is ``None`` (or empty), recursively scans Coletânea and
        returns metadata for every track found.

        Result shape (single file)::

            {"title": str, "artist": str, "album": str, "year": str,
             "genre": str, "bpm": str, "key": str,
             "duration": float, "bitrate": int, "samplerate": int,
             "channels": int}

        Result shape (full scan)::

            {"tracks": [{"path": str, ...meta...}, ...], "count": int}
        """
        if path:
            return self._read_single_metadata(path, save_tags=True)
        # Full scan of Coletânea
        results: list[dict] = []
        try:
            for root_str, _dirs, files in os.walk(str(LIBRARY_ROOT)):
                root_p = Path(root_str)
                for f in sorted(files):
                    if Path(f).suffix.lower() in _AUDIO_EXTS:
                        full = str(root_p / f)
                        meta = self._read_single_metadata(full, save_tags=False)
                        results.append({"path": full, **meta})
        except Exception as exc:
            logger.warning("extract_advanced_metadata scan failed: %s", exc)
        return {"tracks": results, "count": len(results)}

    def _read_single_metadata(self, filepath: str, save_tags: bool = False) -> dict:
        """Internal: read + optionally save tags for one file."""
        try:
            import mutagen
            audio = mutagen.File(filepath, easy=True)
            if audio is None:
                return {"error": "unsupported_format"}

            def _tag(key: str) -> str:
                v = audio.get(key)
                return str(v[0]) if v else ""

            info = getattr(audio, "info", None)
            meta = {
                "title":      _tag("title"),
                "artist":     _tag("artist"),
                "album":      _tag("album"),
                "year":       _tag("date"),
                "genre":      _tag("genre"),
                "bpm":        _tag("bpm"),
                "key":        _tag("initialkey") or _tag("key"),
                "duration":   float(getattr(info, "length", 0) or 0),
                "bitrate":    int(getattr(info, "bitrate", 0) or 0) // 1000,
                "samplerate": int(getattr(info, "sample_rate", 0) or 0),
                "channels":   int(getattr(info, "channels", 0) or 0),
            }
            if save_tags:
                self.save_standardized_tags(filepath, meta)
            return meta
        except Exception as exc:
            logger.warning("_read_single_metadata %s: %s", filepath, exc)
            return {"error": str(exc)}

    def save_standardized_tags(self, filepath: str, meta: dict) -> dict:
        """Write BPM / Key / Title / Artist back to the file after analysis.

        Uses :class:`mutagen.easyid3.EasyID3` for MP3 and
        :class:`mutagen.flac.FLAC` for FLAC.  WAV/AIFF are skipped
        (mutagen tag-write support is limited; they still benefit from the
        sidecar JSON written by ``sidecar.py``).  Never raises to the caller.
        """
        try:
            ext = Path(filepath).suffix.lower()
            if ext == ".mp3":
                from mutagen.easyid3 import EasyID3
                try:
                    audio = EasyID3(filepath)
                except Exception:
                    from mutagen.id3 import ID3NoHeaderError
                    audio = EasyID3()  # create fresh
                for key in ("bpm", "key", "title", "artist"):
                    val = str(meta.get(key) or "")
                    if val:
                        audio[key] = val
                audio.save(filepath)
                return {"saved": True, "format": "mp3"}
            elif ext == ".flac":
                from mutagen.flac import FLAC
                audio = FLAC(filepath)
                tag_map = {
                    "bpm": "BPM", "key": "KEY", "title": "TITLE",
                    "artist": "ARTIST", "album": "ALBUM", "genre": "GENRE",
                    "year": "DATE",
                }
                for k, tag_name in tag_map.items():
                    val = str(meta.get(k) or "")
                    if val:
                        audio[tag_name] = val
                audio.save()
                return {"saved": True, "format": "flac"}
            return {"saved": False, "reason": "format_not_writable"}
        except Exception as exc:
            logger.warning("save_standardized_tags %s: %s", filepath, exc)
            return {"saved": False, "error": str(exc)}

    def dj_prep_pro(self, path: str, weak: bool = False, commit: bool = False) -> dict:
        """One-click DJ Prep Pro chain: silence_trim → headroom → loudness
        (dual-pass) → BPM/Key → hotcues → smart rename."""
        report = dj_prep_pro.prep(path, weak=weak, commit=commit)
        return {"success": report.get("verdict") == "PASS", "report": report}

    def dj_prep_pro_folder(self, path: str, weak: bool = False, commit: bool = False) -> dict:
        """Batch One-click DJ Prep Pro across every audio file in a folder."""
        folder = Path(path)
        if not folder.is_dir():
            return {"success": False, "error": "not_a_folder"}
        exts = {".wav", ".flac", ".aif", ".aiff", ".mp3", ".m4a", ".aac", ".ogg"}
        reports: List[dict] = []
        for f in folder.iterdir():
            if f.is_file() and f.suffix.lower() in exts:
                reports.append(dj_prep_pro.prep(f, weak=weak, commit=commit))
        return {"success": True, "processed": len(reports), "reports": reports}