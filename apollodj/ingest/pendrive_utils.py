"""f3 (Fight Flash Fraud) native integration for apolloDJ — pendrive testing.

Single focused module (no separate bridge file) that powers USB pendrive
health testing: **fake-capacity detection**, **real read/write speed**, and
**bad-block / data-loss** analysis, with **live progress streaming** and a
weighted **health score** feeding the export quality gate.

Design (Advanced Pro Roadmap, "No Bridge" architecture)
───────────────────────────────────────────────────────
  · Core logic    → this file (Windows-native drive detect + f3 streaming)
  · Called from   → ``ingest.usb_exporter`` + ``ingest.quality_gate``
  · Exposed to UI → directly via ``bridge.usb_bridge.UsbBridge`` (pywebview.api.usb.*)
  · Data          → ``Pendrives/pendrives-registrados.csv`` + ``Pendrives/drives.json``
  · Streaming     → ``subprocess.Popen`` + callback pattern (no heavy deps)

Podium (graceful step-down — never crash on a missing optional tool)
  #1 f3probe (quick health) / f3write + f3read (full) — real fake-fraud detection
  #2 ``usb_exporter.usb_health_check`` speed benchmark — already shipped fallback

f3 is detected via ``APOLLODJ_F3_BIN`` (dir or file) → ``shutil.which`` → known
winget/install locations.  When absent every entry point degrades gracefully
(``available=False``) so the base install stays lean (priority C).

Usage example
─────────────
    from apollodj.ingest import pendrive_utils as pu

    def on_progress(p):   # {"speed_mbs": 17.4, "phase": "write", ...}
        print("speed", p.get("speed_mbs"))

    result = pu.run_f3_test_streaming("F:", on_progress, quick=False)
    pu.log_pendrive_test(result)             # → CSV + drives.json (last-5 history)
    print(result["recommendation"])          # "Excellent" | "Usable" | "Risky" | "Do not use"
"""
from __future__ import annotations

import csv
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

from ..conf import paths
from ..conf.atomic import atomic_write_text

logger = logging.getLogger(__name__)

#: Env override pointing either at the f3 install directory or a specific binary.
F3_ENV_OVERRIDE = "APOLLODJ_F3_BIN"

#: Valid pendrive filesystems for CDJ/XDJ playback.
_VALID_FS = {"FAT32", "EXFAT"}

#: CSV columns (history log) — timestamp + health + speed + quality.
CSV_COLUMNS = [
    "timestamp", "drive", "label", "size_gb",
    "fake_detected", "write_speed_mbs", "read_speed_mbs",
    "bad_blocks_count", "health_score", "health_status", "recommendation",
]

#: Keep at most this many historical tests per drive in drives.json.
HISTORY_LIMIT = 5

# Known Windows install locations for an f3 port (winget / scoop / manual).
_KNOWN_DIRS = [
    Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Links",
    Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "f3",
    Path("C:/f3"),
    Path("C:/tools/f3"),
]


# ══════════════════════════════════════════════════════════════════════════
# Phase 1.1 — Windows-native drive detection
# ══════════════════════════════════════════════════════════════════════════

def is_valid_pendrive(drive: dict) -> bool:
    """True when *drive* is a removable FAT32/exFAT volume larger than 1 GB.

    *drive* is one entry produced by :func:`get_removable_drives`.
    ``removable`` defaults to True (those drives already passed removable
    detection); an explicit ``removable=False`` rejects the drive.
    """
    fs = str(drive.get("filesystem") or "").upper()
    is_fat = bool(drive.get("is_fat32")) or fs in _VALID_FS
    if not is_fat:
        return False
    if drive.get("removable", True) is False:
        return False
    try:
        if float(drive.get("size_gb", 0) or 0) <= 1.0:
            return False
    except (TypeError, ValueError):
        return False
    return True


def _drive_meta_windows(letter: str) -> dict:
    """Best-effort label + filesystem for ``X:`` via Win32 GetVolumeInformation."""
    meta = {"label": "", "filesystem": ""}
    if os.name != "nt":
        return meta
    try:
        import ctypes

        root = f"{letter}\\" if letter.endswith(":") else f"{letter}:\\"
        name_buf = ctypes.create_unicode_buffer(261)
        fs_buf = ctypes.create_unicode_buffer(261)
        serial = ctypes.c_ulong(0)
        max_len = ctypes.c_ulong(0)
        flags = ctypes.c_ulong(0)
        ok = ctypes.windll.kernel32.GetVolumeInformationW(
            ctypes.c_wchar_p(root), name_buf, ctypes.sizeof(name_buf),
            ctypes.byref(serial), ctypes.byref(max_len), ctypes.byref(flags),
            fs_buf, ctypes.sizeof(fs_buf),
        )
        if ok:
            meta["label"] = name_buf.value
            meta["filesystem"] = fs_buf.value
    except Exception:  # noqa: BLE001
        pass
    return meta


def get_removable_drives() -> list[dict]:
    """Return structured removable drives: ``[{letter,label,size_gb,filesystem,is_fat32,removable}]``.

    Primary path: Win32 ``GetLogicalDrives`` + ``GetDriveTypeW`` (DRIVE_REMOVABLE)
    with ``GetVolumeInformationW`` for label/filesystem. Falls back to ``psutil``
    partitions on non-Windows or if the Win32 calls raise.
    """
    drives: list[dict] = []
    if os.name == "nt":
        try:
            import ctypes
            import string

            bitmask = ctypes.windll.kernel32.GetLogicalDrives()
            for i, ch in enumerate(string.ascii_uppercase):
                if not (bitmask & (1 << i)):
                    continue
                root = f"{ch}:\\"
                try:
                    dtype = ctypes.windll.kernel32.GetDriveTypeW(ctypes.c_wchar_p(root))
                    if dtype != 2:  # 2 = DRIVE_REMOVABLE
                        continue
                    usage = shutil.disk_usage(root)
                    meta = _drive_meta_windows(f"{ch}:")
                    fs = meta["filesystem"]
                    drives.append({
                        "letter": f"{ch}:",
                        "label": meta["label"],
                        "size_gb": round(usage.total / 1024 ** 3, 2),
                        "free_gb": round(usage.free / 1024 ** 3, 2),
                        "filesystem": fs,
                        "is_fat32": fs.upper() in _VALID_FS,
                        "removable": True,
                    })
                except Exception:  # noqa: BLE001
                    continue
            return drives
        except Exception:  # noqa: BLE001
            pass

    # Fallback — psutil (covers non-Windows dev + any Win32 failure).
    try:
        import psutil  # type: ignore

        for part in psutil.disk_partitions(all=False):
            opts = (part.opts or "").lower()
            if "removable" not in opts and os.name == "nt":
                continue
            try:
                usage = psutil.disk_usage(part.mountpoint)
                size_gb = round(usage.total / 1024 ** 3, 2)
            except Exception:  # noqa: BLE001
                size_gb = 0.0
            fs = part.fstype or ""
            drives.append({
                "letter": part.device.rstrip("\\"),
                "label": "",
                "size_gb": size_gb,
                "filesystem": fs,
                "is_fat32": fs.upper() in _VALID_FS,
                "removable": "removable" in opts,
            })
    except Exception:  # noqa: BLE001
        pass
    return drives


# ══════════════════════════════════════════════════════════════════════════
# Phase 1.1.2 — f3 binary discovery
# ══════════════════════════════════════════════════════════════════════════

def _candidate_names(tool: str) -> list[str]:
    return [tool, f"{tool}.exe", f"{tool}.bat", f"{tool}.cmd"] if os.name == "nt" else [tool]


def get_f3_binary_path(tool: str = "f3probe") -> Optional[str]:
    """Locate an f3 tool (``f3probe`` / ``f3write`` / ``f3read``).

    Resolution order:
      1. ``APOLLODJ_F3_BIN`` env — a directory (look for *tool* inside) or a file.
      2. ``shutil.which(tool)`` (and ``tool.exe`` on Windows).
      3. Known winget / install directories.

    Returns the absolute path string, or ``None`` when not installed.
    """
    override = os.environ.get(F3_ENV_OVERRIDE, "").strip()
    if override:
        p = Path(override)
        if p.is_file():
            return str(p)
        if p.is_dir():
            for name in _candidate_names(tool):
                cand = p / name
                if cand.is_file():
                    return str(cand)

    for name in _candidate_names(tool):
        found = shutil.which(name)
        if found:
            return found

    for d in _KNOWN_DIRS:
        for name in _candidate_names(tool):
            cand = d / name
            try:
                if cand.is_file():
                    return str(cand)
            except OSError:
                continue
    return None


def f3_available(quick: bool = False) -> bool:
    """True when the tools needed for the requested mode are present."""
    if quick:
        return get_f3_binary_path("f3probe") is not None
    return (get_f3_binary_path("f3write") is not None
            and get_f3_binary_path("f3read") is not None)


# ══════════════════════════════════════════════════════════════════════════
# Phase 2.2 — result parsing + scoring
# ══════════════════════════════════════════════════════════════════════════

_RE_WRITE_SPEED = re.compile(r"writing speed:\s*([\d.]+)\s*MB/s", re.IGNORECASE)
_RE_READ_SPEED = re.compile(r"reading speed:\s*([\d.]+)\s*MB/s", re.IGNORECASE)
_RE_ANY_SPEED = re.compile(r"([\d.]+)\s*MB/s", re.IGNORECASE)
_RE_DATA_LOST = re.compile(r"Data LOST:.*?\((\d+)\s*sectors?\)", re.IGNORECASE)
_RE_CORRUPTED = re.compile(r"Corrupted:.*?\((\d+)\s*sectors?\)", re.IGNORECASE)
_RE_USABLE = re.compile(r"\*?Usable\*?\s*size:\s*([\d.]+)\s*(\w+)", re.IGNORECASE)
_RE_ANNOUNCED = re.compile(r"Announced\s*size:\s*([\d.]+)\s*(\w+)", re.IGNORECASE)
_RE_PERCENT = re.compile(r"(\d{1,3})%")


def _detect_fake(text: str) -> bool:
    """Detect counterfeit / damaged flash from f3probe (or f3read data-loss)."""
    low = text.lower()
    if "is the real thing" in low:
        return False
    if "damaged" in low or "bad news" in low or "counterfeit" in low:
        return True
    # Announced capacity materially larger than usable → fake.
    um = _RE_USABLE.search(text)
    am = _RE_ANNOUNCED.search(text)
    if um and am:
        try:
            usable = float(um.group(1))
            announced = float(am.group(1))
            uunit = um.group(2).upper()
            aunit = am.group(2).upper()
            if uunit == aunit and announced > usable * 1.05:
                return True
        except (TypeError, ValueError):
            pass
    return False


def compute_health_score(
    *,
    fake_detected: bool,
    write_speed_mbs: float,
    read_speed_mbs: float,
    bad_blocks_count: int,
) -> int:
    """Roadmap weighted health score in ``[0, 100]`` (higher = healthier).

        capacity  : 40 if not fake          else 0
        write     : 25 if write > 15 MB/s    else 10
        read      : 20 if read  > 20 MB/s    else 10
        integrity : 15 if bad_blocks == 0    else 0
    """
    score = 0
    score += 0 if fake_detected else 40
    score += 25 if (write_speed_mbs or 0) > 15 else 10
    score += 20 if (read_speed_mbs or 0) > 20 else 10
    score += 15 if (bad_blocks_count or 0) == 0 else 0
    return int(score)


def recommend(score: int, fake_detected: bool, bad_blocks: int = 0) -> str:
    """English verdict enum: Excellent | Usable | Risky | Do not use.

    Counterfeit capacity is always "Do not use". Any real data loss
    (``bad_blocks > 0``) caps the verdict at "Risky" regardless of raw speed —
    a drive that loses data is never "Usable" or "Excellent".
    """
    if fake_detected:
        return "Do not use"
    if (bad_blocks or 0) > 0:
        return "Risky" if score >= 40 else "Do not use"
    if score >= 85:
        return "Excellent"
    if score >= 65:
        return "Usable"
    if score >= 40:
        return "Risky"
    return "Do not use"


def health_badge(score: int, fake_detected: bool) -> str:
    """Traffic-light badge for the UI drive card: green | yellow | red."""
    if fake_detected:
        return "red"
    if score >= 85:
        return "green"
    if score >= 50:
        return "yellow"
    return "red"


def cdj_note(*, fake_detected: bool, write_speed_mbs: float, read_speed_mbs: float) -> str:
    """Premium human-readable CDJ guidance (roadmap 5.2.1)."""
    if fake_detected:
        return "Capacidade falsa — não use neste pendrive"
    if (write_speed_mbs or 0) >= 15 and (read_speed_mbs or 0) >= 20:
        return "Good for CDJ use"
    if (write_speed_mbs or 0) < 8 or (read_speed_mbs or 0) < 20:
        return "Too slow for live sets"
    return "Usável, mas confira antes do set"


def _parse_f3_result(text: str, *, quick: bool = False) -> dict:
    """Parse raw f3 stdout (probe, or write+read concatenated) → structured dict.

    Keys: ``fake_detected``, ``write_speed_mbs``, ``read_speed_mbs``,
    ``bad_blocks_count``, ``health_score``, ``health_status``, ``recommendation``,
    ``cdj_note``.
    """
    fake = _detect_fake(text)

    wm = _RE_WRITE_SPEED.search(text)
    rm = _RE_READ_SPEED.search(text)
    write_speed = float(wm.group(1)) if wm else 0.0
    read_speed = float(rm.group(1)) if rm else 0.0

    bad_blocks = 0
    for rx in (_RE_DATA_LOST, _RE_CORRUPTED):
        m = rx.search(text)
        if m:
            bad_blocks += int(m.group(1))
    # Note: data loss is an integrity failure, not proof of counterfeit capacity,
    # so it lowers the score / recommendation but does not set fake_detected.

    score = compute_health_score(
        fake_detected=fake,
        write_speed_mbs=write_speed,
        read_speed_mbs=read_speed,
        bad_blocks_count=bad_blocks,
    )
    return {
        "fake_detected": fake,
        "write_speed_mbs": round(write_speed, 2),
        "read_speed_mbs": round(read_speed, 2),
        "bad_blocks_count": bad_blocks,
        "health_score": score,
        "health_status": health_badge(score, fake),
        "recommendation": recommend(score, fake, bad_blocks),
        "cdj_note": cdj_note(fake_detected=fake, write_speed_mbs=write_speed, read_speed_mbs=read_speed),
        "quick": quick,
    }


def _parse_progress_line(line: str, phase: str) -> Optional[dict]:
    """Extract a live progress event from a single f3 stdout line."""
    out: dict = {}
    sm = _RE_ANY_SPEED.search(line)
    if sm:
        out["speed_mbs"] = float(sm.group(1))
    pm = _RE_PERCENT.search(line)
    if pm:
        pct = int(pm.group(1))
        if 0 <= pct <= 100:
            out["percent"] = pct
    if "damaged" in line.lower() or "bad news" in line.lower():
        out["fake"] = True
    if not out:
        return None
    out["phase"] = phase
    return out


# ══════════════════════════════════════════════════════════════════════════
# Phase 2.1 — streaming f3 engine
# ══════════════════════════════════════════════════════════════════════════

def _stream_subprocess(
    cmd: list[str],
    on_line: Optional[Callable[[str], None]],
    on_progress: Optional[Callable[[dict], None]],
    phase: str,
    timeout: Optional[float],
) -> str:
    """Run *cmd*, stream stdout line-by-line through the callbacks, return full text.

    Raises ``FileNotFoundError`` if the binary is missing and
    ``subprocess.TimeoutExpired`` (after killing) on timeout.
    """
    collected: list[str] = []
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        encoding="utf-8",
        errors="replace",
    )
    start = time.monotonic()
    try:
        assert proc.stdout is not None
        for raw in proc.stdout:
            line = raw.rstrip("\r\n")
            collected.append(line)
            if on_line:
                try:
                    on_line(line)
                except Exception:  # noqa: BLE001 — never let a UI callback kill the test
                    pass
            if on_progress:
                ev = _parse_progress_line(line, phase)
                if ev:
                    try:
                        on_progress(ev)
                    except Exception:  # noqa: BLE001
                        pass
            if timeout is not None and (time.monotonic() - start) > timeout:
                proc.kill()
                raise subprocess.TimeoutExpired(cmd, timeout)
        proc.wait(timeout=5)
    finally:
        if proc.poll() is None:
            proc.kill()
    return "\n".join(collected)


def _probe_target(drive_letter: str) -> str:
    """Device argument for f3probe (best effort on Windows)."""
    return drive_letter


def _mount_target(drive_letter: str) -> str:
    """Mount/directory argument for f3write / f3read."""
    if drive_letter.endswith(":"):
        return f"{drive_letter}\\" if os.name == "nt" else f"{drive_letter}/"
    return drive_letter


def run_f3_test_streaming(
    drive_letter: str,
    on_progress: Callable[[dict], None],
    on_line: Optional[Callable[[str], None]] = None,
    quick: bool = False,
    *,
    f3probe_bin: Optional[str] = None,
    f3write_bin: Optional[str] = None,
    f3read_bin: Optional[str] = None,
    timeout: Optional[float] = None,
) -> dict:
    """Run an f3 test on *drive_letter*, streaming live progress to *on_progress*.

    ``quick=True``  → ``f3probe`` only (fast fake-capacity health check).
    ``quick=False`` → ``f3write`` then ``f3read`` (full speed + integrity).

    Binaries can be injected (testing / explicit path); otherwise discovered via
    :func:`get_f3_binary_path`. The returned dict is the parsed result merged with
    ``{drive, mode, available, started_at, finished_at, duration_s}`` and, on a
    missing tool, ``{available: False, error: ...}``.
    """
    started = datetime.now(timezone.utc).isoformat()
    t0 = time.monotonic()

    if quick:
        probe = f3probe_bin or get_f3_binary_path("f3probe")
        if not probe:
            return _unavailable(drive_letter, "quick", "f3probe não encontrado", started)
        try:
            text = _stream_subprocess([probe, _probe_target(drive_letter)], on_line, on_progress, "probe", timeout)
        except FileNotFoundError:
            return _unavailable(drive_letter, "quick", "f3probe não executável", started)
        except subprocess.TimeoutExpired:
            return _unavailable(drive_letter, "quick", "timeout", started)
        result = _parse_f3_result(text, quick=True)
        mode = "quick"
    else:
        writer = f3write_bin or get_f3_binary_path("f3write")
        reader = f3read_bin or get_f3_binary_path("f3read")
        if not writer or not reader:
            return _unavailable(drive_letter, "full", "f3write/f3read não encontrados", started)
        mount = _mount_target(drive_letter)
        try:
            wtext = _stream_subprocess([writer, mount], on_line, on_progress, "write", timeout)
            rtext = _stream_subprocess([reader, mount], on_line, on_progress, "read", timeout)
        except FileNotFoundError:
            return _unavailable(drive_letter, "full", "f3write/f3read não executáveis", started)
        except subprocess.TimeoutExpired:
            return _unavailable(drive_letter, "full", "timeout", started)
        result = _parse_f3_result(wtext + "\n" + rtext, quick=False)
        mode = "full"

    result.update({
        "drive": drive_letter,
        "mode": mode,
        "available": True,
        "started_at": started,
        "finished_at": datetime.now(timezone.utc).isoformat(),
        "duration_s": round(time.monotonic() - t0, 2),
    })
    return result


def _unavailable(drive: str, mode: str, error: str, started: str) -> dict:
    logger.info("f3 unavailable for %s (%s): %s", drive, mode, error)
    return {
        "drive": drive, "mode": mode, "available": False, "error": error,
        "fake_detected": False, "write_speed_mbs": 0.0, "read_speed_mbs": 0.0,
        "bad_blocks_count": 0, "health_score": 0, "health_status": "red",
        "recommendation": "Do not use", "started_at": started,
        "finished_at": datetime.now(timezone.utc).isoformat(),
    }


# ══════════════════════════════════════════════════════════════════════════
# Phase 3.2 / 5.2.2 / 5.3 — registry logging + history
# ══════════════════════════════════════════════════════════════════════════

def ensure_csv_header(*, csv_path: Optional[Path] = None) -> None:
    """Create the pendrive history CSV with its header row if it does not exist."""
    path = Path(csv_path) if csv_path else paths.PENDRIVES_CSV
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 0:
        return
    with path.open("w", newline="", encoding="utf-8") as fh:
        csv.writer(fh).writerow(CSV_COLUMNS)


def _row_from_result(result: dict) -> list:
    return [
        result.get("finished_at") or datetime.now(timezone.utc).isoformat(),
        result.get("drive", ""),
        result.get("label", ""),
        result.get("size_gb", ""),
        result.get("fake_detected", ""),
        result.get("write_speed_mbs", ""),
        result.get("read_speed_mbs", ""),
        result.get("bad_blocks_count", ""),
        result.get("health_score", ""),
        result.get("health_status", ""),
        result.get("recommendation", ""),
    ]


def log_pendrive_test(
    result: dict,
    *,
    csv_path: Optional[Path] = None,
    json_path: Optional[Path] = None,
) -> dict:
    """Append *result* to the history CSV and update the drives.json snapshot.

    drives.json shape (keyed by drive letter)::

        { "F:": { "last": {...}, "history": [<=5 newest first], "updated_at": iso } }
    """
    csvp = Path(csv_path) if csv_path else paths.PENDRIVES_CSV
    jsonp = Path(json_path) if json_path else paths.PENDRIVES_JSON
    drive = str(result.get("drive") or "?")
    now = datetime.now(timezone.utc).isoformat()
    result = {**result}
    result.setdefault("finished_at", now)

    # ── CSV append (header auto-created) ────────────────────────────────────
    ensure_csv_header(csv_path=csvp)
    with csvp.open("a", newline="", encoding="utf-8") as fh:
        csv.writer(fh).writerow(_row_from_result(result))

    # ── JSON snapshot + bounded history (atomic) ────────────────────────────
    snap: dict = {}
    if jsonp.exists():
        try:
            snap = json.loads(jsonp.read_text(encoding="utf-8")) or {}
        except (ValueError, OSError):
            snap = {}
    entry = snap.get(drive) or {}
    history = list(entry.get("history") or [])
    history.insert(0, result)
    history = history[:HISTORY_LIMIT]
    snap[drive] = {"last": result, "history": history, "updated_at": now}
    jsonp.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(jsonp, json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"ok": True, "drive": drive, "csv": str(csvp), "json": str(jsonp)}


def _load_snapshot(json_path: Optional[Path]) -> dict:
    jsonp = Path(json_path) if json_path else paths.PENDRIVES_JSON
    if not jsonp.exists():
        return {}
    try:
        return json.loads(jsonp.read_text(encoding="utf-8")) or {}
    except (ValueError, OSError):
        return {}


def get_last_test(drive_letter: str, *, json_path: Optional[Path] = None) -> Optional[dict]:
    """Return the most recent test snapshot for *drive_letter*, or ``None``."""
    entry = _load_snapshot(json_path).get(str(drive_letter))
    if not entry:
        return None
    return entry.get("last")


def get_drive_history(drive_letter: str, *, json_path: Optional[Path] = None) -> list[dict]:
    """Return the bounded (<=5) test history for *drive_letter*, newest first."""
    entry = _load_snapshot(json_path).get(str(drive_letter))
    if not entry:
        return []
    return list(entry.get("history") or [])
