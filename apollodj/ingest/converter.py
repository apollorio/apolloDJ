"""Stage 01 — Format Detection & Conversion.

Decodes any supported input format into a 44.1 kHz 16-bit WAV under
``Dados/temp_wav`` for downstream analysis. Source files are never modified.

Top 3 Podium (most precise + accurate first):
  1. ffmpeg subprocess        — bit-exact decode, widest codec support, lowest RAM
  2. pydub.AudioSegment       — same ffmpeg backend, simpler API (light fallback)
  3. librosa.load             — slow but pure-python last resort
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Optional
from uuid import uuid4

from ..conf.paths import TEMP_WAV_DIR

SUPPORTED_INPUT_EXTS = {".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a"}


def needs_decode(src: Path) -> bool:
    """Return True when analysis requires a temporary WAV decode."""
    return src.suffix.lower() in {".flac", ".m4a", ".aiff", ".aif"}


def decode_to_wav(src: Path, dst: Optional[Path] = None) -> Path:
    """Decode ``src`` to 44.1 kHz s16le WAV. Returns the temp WAV path."""
    src = Path(src)
    if src.suffix.lower() not in SUPPORTED_INPUT_EXTS:
        raise ValueError(f"Unsupported audio format: {src.suffix}")

    TEMP_WAV_DIR.mkdir(parents=True, exist_ok=True)
    dst = Path(dst) if dst else TEMP_WAV_DIR / f"{src.stem}_{uuid4().hex[:10]}.wav"

    if shutil.which("ffmpeg"):
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(src), "-ar", "44100", "-ac", "2",
            "-sample_fmt", "s16", str(dst),
        ]
        subprocess.run(cmd, check=True)
        return dst

    try:
        from pydub import AudioSegment
        AudioSegment.from_file(str(src)).set_frame_rate(44100).set_sample_width(2).export(
            str(dst), format="wav"
        )
        return dst
    except Exception:
        pass

    import soundfile as sf
    import librosa
    y, sr = librosa.load(str(src), sr=44100, mono=False)
    sf.write(str(dst), y.T if y.ndim > 1 else y, sr, subtype="PCM_16")
    return dst
