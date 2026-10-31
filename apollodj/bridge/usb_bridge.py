"""USB Bridge — exposes USB operations to the pywebview JS frontend.

Triggered from:
  · pendrive-dj tab   → window.pywebview.api.usb.*
  · usb-pro tab       → window.pywebview.api.usb.*

Health check runs automatically on every open_folder call and before
every export, so the user always sees drive health before data is written.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any
import os


class UsbBridge:
    """Methods exposed as ``window.pywebview.api.usb_*``."""

    # ── Drive discovery ────────────────────────────────────────────────────

    def list_drives(self) -> list[dict]:
        """Return a list of removable drives (Windows: checks drive letters)."""
        drives: list[dict] = []
        include_fixed = os.environ.get("APOLLODJ_INCLUDE_FIXED_DRIVES", "").lower() in {"1", "true", "yes"}
        if os.name == "nt":
            import string
            import ctypes
            bitmask = ctypes.windll.kernel32.GetLogicalDrives()
            for i, letter in enumerate(string.ascii_uppercase):
                if bitmask & (1 << i):
                    root = Path(f"{letter}:/")
                    try:
                        dtype = ctypes.windll.kernel32.GetDriveTypeW(str(root))
                        # 2 = DRIVE_REMOVABLE, 3 = DRIVE_FIXED
                        if dtype == 2 or (include_fixed and dtype == 3):
                            usage = __import__("shutil").disk_usage(root)
                            drives.append({
                                "letter": f"{letter}:",
                                "root": str(root),
                                "free_gb": round(usage.free / 1024 ** 3, 2),
                                "total_gb": round(usage.total / 1024 ** 3, 2),
                                "removable": dtype == 2,
                            })
                    except Exception:
                        continue
        return drives

    # ── Health check (triggered on open) ──────────────────────────────────

    def open_folder(self, drive_path: str) -> dict:
        """Called every time the user opens a USB subfolder.

        Runs usb_health_check (cached 60 s) and returns health data so the
        UI can show a warning badge before the user tries to export.
        """
        from ..ingest.usb_exporter import usb_health_check
        root = Path(drive_path)
        health = usb_health_check(root)
        return {
            "success": True,
            "drive": drive_path,
            "health": health,
        }

    def force_health_check(self, drive_path: str) -> dict:
        """Bypass cache and re-run the speed benchmark immediately."""
        from ..ingest.usb_exporter import usb_health_check
        return usb_health_check(Path(drive_path), force=True)

    # ── Export ─────────────────────────────────────────────────────────────

    def export_playlist(
        self,
        playlist_name: str,
        track_paths: list[str],
        usb_root: str,
    ) -> dict:
        """CDJ Universal export: health check gate → copy → write all formats."""
        from ..ingest.usb_exporter import export_to_usb
        result = export_to_usb(
            playlist_name,
            [Path(t) for t in track_paths],
            Path(usb_root),
        )
        return result

    # ── f3 pendrive testing (fake capacity + speed + bad blocks) ───────────

    def test_pendrive(self, drive_letter: str, quick: bool = True) -> dict:
        """Run an f3 test on *drive_letter* and persist the result.

        ``quick=True`` → f3probe fast health check (default; no data written).
        ``quick=False`` → full f3write + f3read (writes data — confirm first).

        Live progress is forwarded to the JS shell via ``ApolloPendrive.onProgress``
        when a pywebview window is available; otherwise it is simply collected.
        Returns the final result dict (``available=False`` when f3 is not
        installed — the call never raises).
        """
        from ..ingest import pendrive_utils as pu

        progress: list[dict] = []

        def on_progress(ev: dict) -> None:
            progress.append(ev)
            self._emit_progress(drive_letter, ev)

        result = pu.run_f3_test_streaming(drive_letter, on_progress=on_progress, quick=bool(quick))
        result["progress_events"] = len(progress)
        if result.get("available"):
            try:
                pu.log_pendrive_test(result)
            except Exception:  # noqa: BLE001 — logging must never break the UI call
                pass
        return result

    def get_pendrive_status(self, drive_letter: str) -> dict:
        """Return the last persisted f3 test + bounded history for *drive_letter*."""
        from ..ingest import pendrive_utils as pu

        last = pu.get_last_test(drive_letter)
        if not last:
            return {"tested": False, "drive": drive_letter}
        return {
            "tested": True,
            "drive": drive_letter,
            "last": last,
            "history": pu.get_drive_history(drive_letter),
        }

    def list_pendrives(self) -> list[dict]:
        """Removable drives annotated with validity + last f3 status (UI cards)."""
        from ..ingest import pendrive_utils as pu

        out: list[dict] = []
        for drv in pu.get_removable_drives():
            letter = drv.get("letter", "")
            status = self.get_pendrive_status(letter) if letter else {"tested": False}
            out.append({**drv, "valid_pendrive": pu.is_valid_pendrive(drv), "status": status})
        return out

    def _emit_progress(self, drive_letter: str, ev: dict) -> None:
        """Push a live progress event to the JS shell if a window is present."""
        try:
            import webview  # type: ignore
            import json as _json

            windows = getattr(webview, "windows", None) or []
            if windows:
                payload = _json.dumps({"drive": drive_letter, **ev})
                windows[0].evaluate_js(f"window.ApolloPendrive&&ApolloPendrive.onProgress({payload})")
        except Exception:  # noqa: BLE001 — progress is best-effort
            pass

    # ── Playlist reading (from existing Rekordbox USB) ─────────────────────

    def read_usb_playlists(self, drive_path: str) -> dict:
        """Read playlists from an existing Rekordbox USB using universal-dj-usb.

        #1 MAIN : universal-dj-usb USBParser
        #2 FALLBACK: pyrekordbox RekordboxXml
        """
        root = Path(drive_path)
        try:
            from universal_dj_usb import USBParser  # type: ignore
            parser = USBParser(str(root))
            playlists = parser.get_playlists()
            return {
                "success": True,
                "source": "universal-dj-usb",
                "playlists": [
                    {"name": pl.name, "track_count": len(list(pl))}
                    for pl in playlists
                ],
            }
        except Exception:
            pass

        try:
            from pyrekordbox import RekordboxXml  # type: ignore
            xml_candidates = list(root.glob("**/*.xml"))
            if xml_candidates:
                xml = RekordboxXml(str(xml_candidates[0]))
                return {
                    "success": True,
                    "source": "pyrekordbox",
                    "playlists": [
                        {"name": pl.Name, "track_count": len(list(pl))}
                        for pl in xml.get_playlists()
                    ],
                }
        except Exception:
            pass

        return {"success": False, "reason": "no_readable_library"}
