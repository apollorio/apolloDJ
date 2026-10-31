"""USB Exporter — CDJ Universal workflow.

Health-check gate
─────────────────
Every time a USB folder is opened OR an export is requested, a quick
write+read speed benchmark runs first.  The benchmark is intentionally
lightweight (16 MB sample write) and is cached for 60 s so rapid
re-opens don't re-run it.

CDJ-3000 minimum thresholds (Pioneer recommended):
  write ≥  8 MB/s  (10 MB/s ideal)
  read  ≥ 20 MB/s  (30 MB/s ideal)

Device inspection ladder:
  #1 MAIN     : pyudev + usbdeviceforensics (Linux/WSL)
  #2 FALLBACK : pyusb libusb backend
  #3 SAFETY   : shutil.disk_usage (size + free only)
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import time
from html import escape as html_escape
from pathlib import Path
from typing import Iterable
from xml.sax.saxutils import quoteattr

from ..conf.atomic import atomic_write_text
from ..conf.paths import PLAYLISTS_DIR, TRACKS_COLETANEA_DIR

logger = logging.getLogger(__name__)

# Cache: {drive_str: (timestamp, health_dict)}
_HEALTH_CACHE: dict[str, tuple[float, dict]] = {}
_HEALTH_CACHE_TTL = 60.0  # seconds


def _safe_playlist_name(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip().rstrip(".")
    return cleaned or "apolloDJ-playlist"


def _drive_anchor(path: Path) -> Path:
    try:
        return Path(path.anchor) if path.anchor else path
    except Exception:
        return path


def _is_fixed_drive(path: Path) -> bool:
    if os.name != "nt":
        return False
    try:
        import ctypes
        anchor = _drive_anchor(path)
        return ctypes.windll.kernel32.GetDriveTypeW(str(anchor)) == 3
    except Exception:
        return False

# ── USB Device Inspection ────────────────────────────────────────────────────

def _inspect_device_udev(usb_root: Path) -> dict:
    """#1 MAIN: pyudev + usbdeviceforensics — richest device metadata."""
    try:
        import pyudev  # type: ignore
        ctx = pyudev.Context()
        for dev in ctx.list_devices(subsystem="block", DEVTYPE="partition"):
            mount = dev.get("DEVLINKS", "")
            if str(usb_root) in mount or dev.get("ID_FS_LABEL", "") in str(usb_root):
                return {
                    "vendor":  dev.get("ID_VENDOR", "unknown"),
                    "model":   dev.get("ID_MODEL", "unknown"),
                    "fs_type": dev.get("ID_FS_TYPE", "unknown"),
                    "serial":  dev.get("ID_SERIAL_SHORT", ""),
                    "source":  "pyudev",
                }
    except Exception:
        pass
    return {}


def _inspect_device_pyusb(usb_root: Path) -> dict:
    """#2 FALLBACK: pyusb libusb — works cross-platform."""
    try:
        import usb.core  # type: ignore
        devices = list(usb.core.find(find_all=True) or [])
        if devices:
            dev = devices[0]
            return {
                "vendor":  hex(dev.idVendor),
                "model":   hex(dev.idProduct),
                "fs_type": "unknown",
                "serial":  "",
                "source":  "pyusb",
            }
    except Exception:
        pass
    return {}


def inspect_usb_device(usb_root: Path) -> dict:
    """Return device metadata using the best available backend."""
    info = _inspect_device_udev(usb_root)
    if not info:
        info = _inspect_device_pyusb(usb_root)
    if not info:
        # #3 SAFETY: shutil only
        info = {"vendor": "unknown", "model": "unknown", "fs_type": "unknown",
                "serial": "", "source": "shutil"}
    return info


# ── Speed Benchmark ──────────────────────────────────────────────────────────

def _benchmark_write(usb_root: Path, sample_mb: float = 16.0) -> tuple[float, float]:
    """Return (write_mbps, read_mbps).  Writes then reads a temp file."""
    sample_bytes = int(sample_mb * 1024 * 1024)
    block = os.urandom(min(sample_bytes, 4 * 1024 * 1024))  # 4 MB blocks
    # Write inside the passed directory (works for both USB roots and test dirs).
    # Falls back to drive anchor only if usb_root is not a writable directory.
    if usb_root.is_dir() and os.access(usb_root, os.W_OK):
        tmp = usb_root / ".apollodj_speedtest.tmp"
    else:
        tmp = _drive_anchor(usb_root) / ".apollodj_speedtest.tmp"
    try:
        # ── write ─────────────────────────────────────────────────────────
        written = 0
        t0 = time.perf_counter()
        with tmp.open("wb") as fh:
            while written < sample_bytes:
                fh.write(block)
                written += len(block)
            fh.flush()
            os.fsync(fh.fileno())
        write_secs = max(time.perf_counter() - t0, 1e-6)

        # ── read back ──────────────────────────────────────────────────────
        t1 = time.perf_counter()
        with tmp.open("rb") as fh:
            while fh.read(1024 * 1024):
                pass
        read_secs = max(time.perf_counter() - t1, 1e-6)

        write_mbps = round((sample_bytes / 1024 / 1024) / write_secs, 1)
        read_mbps = round((sample_bytes / 1024 / 1024) / read_secs, 1)
        return write_mbps, read_mbps
    except Exception as exc:
        logger.warning("Speed benchmark falhou: %s", exc)
        return 0.0, 0.0
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except Exception:
            pass


def usb_health_check(usb_root: Path, force: bool = False) -> dict:
    """Run a health check on the USB drive at *usb_root*.

    Returns a dict with keys:
      healthy       : bool   — True if thresholds met
      write_mbps    : float
      read_mbps     : float
      free_gb       : float
      device        : dict   — vendor/model/fs/serial/source
      verdict       : str    — "ok" | "slow_write" | "slow_read" | "low_space" | "error"
      cached        : bool
      checked_at    : float  — unix timestamp
    """
    drive_key = str(usb_root)
    now = time.time()
    allow_fixed = os.environ.get("APOLLODJ_ALLOW_FIXED_EXPORT", "").lower() in {"1", "true", "yes"}

    if not force and drive_key in _HEALTH_CACHE:
        ts, cached = _HEALTH_CACHE[drive_key]
        if now - ts < _HEALTH_CACHE_TTL:
            return {**cached, "cached": True}

    if not usb_root.exists():
        result = {
            "healthy": False, "write_mbps": 0.0, "read_mbps": 0.0,
            "free_gb": 0.0, "device": {}, "verdict": "error",
            "error": "drive_not_found", "cached": False, "checked_at": now,
        }
        return result

    if _is_fixed_drive(usb_root) and not allow_fixed:
        return {
            "healthy": False,
            "write_mbps": 0.0,
            "read_mbps": 0.0,
            "free_gb": 0.0,
            "device": {},
            "verdict": "unsupported_target",
            "error": "fixed_drive_blocked",
            "cached": False,
            "checked_at": now,
        }

    # Disk free space
    try:
        usage = shutil.disk_usage(usb_root)
        free_gb = round(usage.free / 1024 ** 3, 2)
    except Exception:
        free_gb = 0.0

    # Device info (best effort)
    device = inspect_usb_device(usb_root)

    # Speed benchmark (16 MB sample)
    write_mbps, read_mbps = _benchmark_write(usb_root)

    # Verdict
    MIN_WRITE = 8.0   # MB/s — CDJ-3000 absolute minimum
    MIN_READ = 20.0   # MB/s
    MIN_FREE = 0.5    # GB
    if write_mbps < MIN_WRITE:
        verdict = "slow_write"
    elif read_mbps < MIN_READ:
        verdict = "slow_read"
    elif free_gb < MIN_FREE:
        verdict = "low_space"
    else:
        verdict = "ok"

    result = {
        "healthy": verdict == "ok",
        "write_mbps": write_mbps,
        "read_mbps": read_mbps,
        "free_gb": free_gb,
        "device": device,
        "verdict": verdict,
        "thresholds": {"min_write_mbps": MIN_WRITE, "min_read_mbps": MIN_READ, "min_free_gb": MIN_FREE},
        "cached": False,
        "checked_at": now,
    }
    _HEALTH_CACHE[drive_key] = (now, result)
    logger.info(
        "USB health [%s]: write=%.1f MB/s read=%.1f MB/s free=%.2f GB → %s",
        usb_root, write_mbps, read_mbps, free_gb, verdict,
    )
    return result


# ── Playlist / Export ────────────────────────────────────────────────────────

def generate_unified_playlist_xml(name: str, tracks: Iterable[Path]) -> Path:
    """Create the canonical apolloDJ XML playlist."""
    PLAYLISTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = PLAYLISTS_DIR / f"{_safe_playlist_name(name)}.xml"
    track_list = list(tracks)
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<apolloDJPlaylist schema="1.0" profile="cdj-universal">',
        f"  <playlistName>{html_escape(name)}</playlistName>",
        f'  <trackCount>{len(track_list)}</trackCount>',
        '  <tracks>',
    ]
    for t in track_list:
        lines.append(
            f"    <track path={quoteattr(str(t))} rb6_db_col=\"Location\" "
            f'serato_col="FilePath" traktor_col="LOCATION" />'
        )
    lines += ['  </tracks>', '</apolloDJPlaylist>']
    atomic_write_text(out_path, "\n".join(lines), encoding="utf-8")
    return out_path


def _drive_letter(usb_root: Path) -> str:
    """Return the drive key (e.g. ``"F:"``) for *usb_root*, or ``""`` if none."""
    try:
        drv = Path(usb_root).resolve().drive  # "F:" on Windows, "" on posix
        return drv.rstrip("\\")
    except Exception:  # noqa: BLE001
        return ""


def _f3_export_guard(usb_root: Path, *, require: bool | None = None) -> dict:
    """f3 pre-export guard (roadmap 4.1.1).

    Looks up the most recent f3 test for the target drive and asks
    :func:`quality_gate.check_usb_health`:

      · failed test (fake / low health)  → ``{"allow": False, ...}``.
      · no test on record                → allowed, but ``warning`` set —
        unless *require* (or ``APOLLODJ_REQUIRE_F3_TEST=1``) forces a test first.
    """
    from . import pendrive_utils as pu
    from . import quality_gate as qg

    if require is None:
        require = os.environ.get("APOLLODJ_REQUIRE_F3_TEST", "").lower() in {"1", "true", "yes"}

    drive = _drive_letter(usb_root)
    last = pu.get_last_test(drive) if drive else None

    if last is None:
        if require:
            return {"allow": False, "reason": "f3_test_required", "tested": False, "drive": drive}
        return {"allow": True, "tested": False, "drive": drive,
                "warning": "pendrive ainda não testado (f3) — recomendado testar antes de exportar"}

    check = qg.check_usb_health(last)
    if not check["export_allowed"]:
        return {"allow": False, "reason": "f3_health_block", "tested": True,
                "drive": drive, "check": check, "last": last}
    return {"allow": True, "tested": True, "drive": drive, "check": check}


def _resolve_export_tracks(
    playlist_name: str, tracks: Iterable[Path] | None
) -> tuple[list[Path], str]:
    """Resolve the export track list, preferring the Master XML heart (Phase 2.2).

    When the master XML holds *playlist_name*, its references are the source of
    truth and are used for export; otherwise the caller-supplied list is used.
    BEST-EFFORT: any master-XML error falls back to the caller list (logged).

    Returns ``(track_list, source)`` where ``source`` is ``"master_xml"`` or
    ``"caller"`` (surfaced in the export result for transparency).
    """
    explicit = [Path(t) for t in (tracks or [])]
    try:
        from . import master_xml as _mx

        rows = _mx.library_tracks_for_export()
        from_master = [Path(p) for p, pls in rows if p and playlist_name in pls]
        if from_master:
            logger.info(
                "USB export sourcing %d track(s) from master XML for '%s'",
                len(from_master), playlist_name,
            )
            return from_master, "master_xml"
    except Exception as exc:  # noqa: BLE001 — never block export on the heart
        logger.warning("master XML export source unavailable (%s) — using caller list", exc)
    return explicit, "caller"


def export_to_usb(playlist_name: str, tracks: Iterable[Path] | None = None,
                  usb_root: Path | None = None) -> dict:
    """Full CDJ Universal export.

    Runs the f3 health guard and the speed-benchmark gate first — refuses
    export if either fails. The track list is sourced from the Master XML heart
    when that playlist exists there (Phase 2.2), else from *tracks*.
    """
    if usb_root is None:
        return {"success": False, "reason": "no_usb_root"}
    # ── f3 guard (fake capacity / bad blocks / low health) ─────────────────
    f3 = _f3_export_guard(usb_root)
    if not f3.get("allow", True):
        return {
            "success": False,
            "reason": f3.get("reason", "f3_health_block"),
            "f3": f3,
        }

    # ── Speed-benchmark health gate ────────────────────────────────────────
    health = usb_health_check(usb_root)
    if not health["healthy"]:
        return {
            "success": False,
            "reason": f"usb_health_{health['verdict']}",
            "health": health,
        }

    usb_root.mkdir(parents=True, exist_ok=True)
    track_list, track_source = _resolve_export_tracks(playlist_name, tracks)
    safe_name = _safe_playlist_name(playlist_name)
    xml_path = generate_unified_playlist_xml(playlist_name, track_list)

    export_music_dir = usb_root / "DJ Music" / safe_name
    export_music_dir.mkdir(parents=True, exist_ok=True)

    copied: list[str] = []
    for track in track_list:
        src = Path(track)
        if not src.exists():
            src = TRACKS_COLETANEA_DIR / src.name
        if src.exists():
            dst = export_music_dir / src.name
            shutil.copy2(src, dst)
            copied.append(str(dst))

    atomic_write_text(
        usb_root / f"{safe_name}.rekordbox.nml",
        f"<!-- translated from {xml_path.name} -->\n",
        encoding="utf-8",
    )
    atomic_write_text(
        usb_root / f"{safe_name}.traktor.nml",
        f"<!-- translated from {xml_path.name} -->\n",
        encoding="utf-8",
    )
    atomic_write_text(
        usb_root / f"{safe_name}.serato.crate.json",
        json.dumps({"source_xml": xml_path.name, "tracks": copied}, indent=2),
        encoding="utf-8",
    )

    return {
        "success": True,
        "playlist_xml": str(xml_path),
        "tracks_copied": copied,
        "track_source": track_source,
        "usb_root": str(usb_root),
        "health": health,
        "f3": f3,
    }
