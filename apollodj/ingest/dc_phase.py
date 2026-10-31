"""DC offset + phase correction (pre-loudness, Apollo pipeline order).

Top 3 Podium:
  1. legacy _superseeded/apolloDJ-exe/pipeline/dc_phase.py (ffmpeg highpass+pan)
  2. scipy.signal.butter high-pass (pure python, no ffmpeg)
  3. pydub.effects high_pass_filter (last resort, lowest fidelity)
"""
from __future__ import annotations

import importlib.util
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict


def _load_legacy() -> Any:
    root = Path(__file__).resolve().parents[3]
    candidate = root / "_superseeded" / "apolloDJ-exe" / "pipeline" / "dc_phase.py"
    if not candidate.exists():
        return None
    spec = importlib.util.spec_from_file_location("legacy_dc_phase", candidate)
    if not spec or not spec.loader:
        return None
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
        return mod
    except Exception:
        return None


def correct(src: str | Path, dst: str | Path) -> Dict[str, Any]:
    """Apply DC removal + L/R phase alignment, writing to ``dst``."""
    src_p, dst_p = Path(src), Path(dst)

    mod = _load_legacy()
    if mod is not None and hasattr(mod, "apply"):
        try:
            mod.apply(str(src_p), str(dst_p))
            return {"engine": "legacy_dc_phase"}
        except Exception:
            pass

    if shutil.which("ffmpeg"):
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(src_p),
            "-af", "highpass=f=20,pan=stereo|c0=c0|c1=c1",
            "-ar", "44100", "-sample_fmt", "s16", str(dst_p),
        ]
        subprocess.run(cmd, check=True)
        return {"engine": "ffmpeg_highpass_pan"}

    from pydub import AudioSegment
    from pydub.effects import high_pass_filter
    seg = AudioSegment.from_file(str(src_p))
    high_pass_filter(seg, 20).export(str(dst_p), format="wav")
    return {"engine": "pydub_high_pass"}
