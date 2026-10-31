"""Rekordbox-style headroom (peak ceiling for CDJ playback) — STRICT podium.

Top-3 Podium (Rekordbox Auto Gain accuracy first):
  1. M-Igashi/headroom Rust binary  — bakes lossless gain (mp3rgain integrated),
                                       no limiter, dynamics preserved, Rekordbox
                                       Auto Gain exact simulation
  2. legacy _superseeded/apolloDJ-exe/pipeline/headroom.py  (true-peak aware)
  3. ffmpeg alimiter (in-place re-encode to peak ceiling)
  4. pydub apply_gain to peak ceiling (lowest fidelity safety net)

The M-Igashi binary writes in place — we copy the source into a working folder
first so the caller's ``dst`` semantics remain identical to the other tiers.
"""
from __future__ import annotations

import importlib.util
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

# Known install paths for the winget-shipped M-Igashi/headroom binary.
_KNOWN_HEADROOM_PATHS = (
    Path(os.environ.get("APOLLODJ_HEADROOM_BIN", "")),
    Path.home() / "AppData" / "Local" / "Microsoft" / "WinGet" / "Packages"
        / "M-Igashi.headroom_Microsoft.Winget.Source_8wekyb3d8bbwe" / "headroom.exe",
)


def _find_headroom_binary() -> Optional[Path]:
    """Locate the M-Igashi/headroom Rust binary on disk."""
    which = shutil.which("headroom")
    if which:
        return Path(which)
    for candidate in _KNOWN_HEADROOM_PATHS:
        try:
            if candidate and candidate.exists():
                return candidate
        except OSError:
            continue
    return None


def _run_igashi_headroom(src: Path, dst: Path) -> Optional[Dict[str, Any]]:
    """Apply M-Igashi/headroom on a copy of ``src`` written to ``dst``."""
    bin_path = _find_headroom_binary()
    if bin_path is None:
        return None

    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(src), str(dst))

    cmd = [
        str(bin_path),
        "--lossless",
        "--reencode",
        "--no-report",
        str(dst),
    ]
    try:
        proc = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180
        )
    except (subprocess.TimeoutExpired, OSError) as exc:
        return {"engine": "m_igashi_headroom", "error": repr(exc), "skipped": True}

    return {
        "engine": "m_igashi_headroom",
        "binary": str(bin_path),
        "stdout": proc.stdout[-2048:] if proc.stdout else "",
        "stderr": proc.stderr[-2048:] if proc.stderr else "",
        "returncode": proc.returncode,
    }


def _load_legacy() -> Any:
    root = Path(__file__).resolve().parents[3]
    candidate = root / "_superseeded" / "apolloDJ-exe" / "pipeline" / "headroom.py"
    if not candidate.exists():
        return None
    spec = importlib.util.spec_from_file_location("legacy_headroom", candidate)
    if not spec or not spec.loader:
        return None
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
        return mod
    except Exception:
        return None


def apply_headroom(src: str | Path, dst: str | Path,
                   ceiling_db: float = -1.0) -> Dict[str, Any]:
    """Apply Rekordbox-style headroom gain. Strict podium order."""
    src_p, dst_p = Path(src), Path(dst)

    # Tier 1: M-Igashi/headroom Rust binary
    igashi = _run_igashi_headroom(src_p, dst_p)
    if igashi is not None and not igashi.get("skipped") and igashi.get("returncode") == 0:
        igashi["ceiling_db"] = ceiling_db
        return igashi

    # Tier 2: legacy pipeline/headroom.py
    mod = _load_legacy()
    if mod is not None and hasattr(mod, "apply"):
        try:
            mod.apply(str(src_p), str(dst_p), ceiling_db=ceiling_db)
            return {"engine": "legacy_headroom", "ceiling_db": ceiling_db}
        except Exception:
            pass

    # Tier 3: ffmpeg alimiter
    if shutil.which("ffmpeg"):
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(src_p),
            "-af", f"alimiter=limit={10 ** (ceiling_db / 20):.4f}",
            "-ar", "44100", "-ac", "2", "-sample_fmt", "s16", str(dst_p),
        ]
        subprocess.run(cmd, check=True)
        return {"engine": "ffmpeg_alimiter", "ceiling_db": ceiling_db}

    # Tier 4: pydub last resort
    from pydub import AudioSegment
    seg = AudioSegment.from_file(str(src_p))
    gain = ceiling_db - seg.max_dBFS
    seg.apply_gain(gain).export(str(dst_p), format="wav")
    return {"engine": "pydub_apply_gain", "ceiling_db": ceiling_db}
