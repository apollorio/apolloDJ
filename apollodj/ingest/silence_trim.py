"""Silence trim (dead intros/outros).

Top 3 Podium:
  1. legacy _superseeded/core/silence_trimmer.py (auditok + asyncio batch)
  2. pydub.silence.detect_leading_silence (simple, accurate enough)
  3. ffmpeg silenceremove filter (one-shot subprocess)
"""
from __future__ import annotations

import importlib.util
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict


def _load_legacy() -> Any:
    root = Path(__file__).resolve().parents[3]
    candidate = root / "_superseeded" / "core" / "silence_trimmer.py"
    if not candidate.exists():
        return None
    spec = importlib.util.spec_from_file_location("legacy_silence", candidate)
    if not spec or not spec.loader:
        return None
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
        return mod
    except Exception:
        return None


def trim(src: str | Path, dst: str | Path,
         silence_thresh_db: float = -50.0) -> Dict[str, Any]:
    src_p, dst_p = Path(src), Path(dst)

    mod = _load_legacy()
    if mod is not None and hasattr(mod, "trim_silence"):
        try:
            mod.trim_silence(str(src_p), str(dst_p))
            return {"engine": "legacy_silence_trimmer"}
        except Exception:
            pass

    try:
        from pydub import AudioSegment
        from pydub.silence import detect_leading_silence
        audio = AudioSegment.from_file(str(src_p))
        start = detect_leading_silence(audio, silence_threshold=silence_thresh_db)
        end = detect_leading_silence(audio.reverse(), silence_threshold=silence_thresh_db)
        trimmed = audio[start: len(audio) - end] if end else audio[start:]
        trimmed.export(str(dst_p), format="wav")
        return {"engine": "pydub_detect_silence",
                "start_ms": start, "end_trim_ms": end}
    except Exception:
        pass

    if shutil.which("ffmpeg"):
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(src_p),
            "-af", f"silenceremove=start_periods=1:start_threshold={silence_thresh_db}dB:"
                   f"start_silence=0.5:stop_periods=1:stop_threshold={silence_thresh_db}dB:"
                   f"stop_silence=0.5",
            str(dst_p),
        ]
        subprocess.run(cmd, check=True)
        return {"engine": "ffmpeg_silenceremove"}

    raise RuntimeError("No silence-trim engine available")
