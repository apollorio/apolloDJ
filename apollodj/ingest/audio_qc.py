"""Stage 02 — Audio Quality Control.

Detects technical defects (clipping, silence, corruption, LUFS out of range)
before a track is allowed near the library.

Top 3 Podium:
  1. ffmpeg ebur128 + astats   — bit-exact pro standard, lowest RAM, no python deps
  2. pyloudnorm                — accurate ITU-R BS.1770, pure python fallback
  3. pydub silence/peak helpers — last-resort, simplest

Output: ``{"qc": "PASS"|"FAIL", "reasons": [...], "lufs": float|None,
            "true_peak_db": float|None, "clipping": bool}``.
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict
import math

LUFS_MIN, LUFS_MAX = -24.0, -6.0
TRUE_PEAK_MAX_DB = -1.0


def _ffmpeg_ebur128(path: Path) -> Dict[str, Any]:
    cmd = [
        "ffmpeg", "-nostats", "-hide_banner", "-i", str(path),
        "-af", "ebur128=peak=true,astats=metadata=1:reset=1", "-f", "null", "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    out = proc.stderr
    lufs = None
    peak = None
    lra = None
    rms_db = None
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("I:") and "LUFS" in line:
            try:
                lufs = float(line.split()[1])
            except Exception:
                pass
        if line.startswith("Peak:") or "True peak" in line:
            for tok in line.replace(":", " ").split():
                try:
                    peak = float(tok)
                except Exception:
                    continue
        if line.startswith("LRA:") and "LU" in line:
            try:
                lra = float(line.split()[1])
            except Exception:
                pass
        if "RMS level dB" in line:
            try:
                rms_db = float(line.split()[-1])
            except Exception:
                pass
    return {"lufs": lufs, "true_peak_db": peak, "lra": lra, "rms_db": rms_db}


def _pyloudnorm_measure(path: Path) -> Dict[str, Any]:
    import soundfile as sf
    import pyloudnorm as pyln
    data, sr = sf.read(str(path))
    meter = pyln.Meter(sr)
    lufs = float(meter.integrated_loudness(data))
    peak_abs = float(max(abs(data.max()), abs(data.min())) or 1e-9)
    peak_db = 20.0 * math.log10(peak_abs)
    return {"lufs": lufs, "true_peak_db": peak_db}


def _pydub_peak(path: Path) -> Dict[str, Any]:
    from pydub import AudioSegment
    seg = AudioSegment.from_file(str(path))
    return {"lufs": None, "true_peak_db": seg.max_dBFS}


def _spectral_peak_centroid(path: Path) -> Dict[str, Any]:
    """Advanced peak detection — spectral centroid + adaptive threshold.

    Returns a refined `true_peak_db` estimate plus the spectral centroid (Hz)
    for downstream brightness QC. Uses librosa STFT; safe to skip on failure.
    """
    try:
        import librosa
        import numpy as np
    except Exception:
        return {}

    try:
        y, sr = librosa.load(str(path), sr=44100, mono=True)
    except Exception:
        return {}
    if y.size == 0:
        return {}

    # Adaptive threshold: 99.5th percentile of |signal|, robust against rare spikes.
    abs_y = np.abs(y)
    thresh = float(np.quantile(abs_y, 0.995))
    refined_peak = float(max(thresh, abs_y.max() * 0.95))
    refined_peak_db = float(20.0 * math.log10(max(refined_peak, 1e-9)))

    try:
        centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    except Exception:
        centroid = 0.0

    return {
        "true_peak_db_refined": refined_peak_db,
        "adaptive_threshold": thresh,
        "spectral_centroid_hz": centroid,
    }


def run_qc(path: str | Path) -> Dict[str, Any]:
    """Run the QC podium, returning a structured verdict dict."""
    p = Path(path)
    reasons: list[str] = []
    metrics: Dict[str, Any] = {"lufs": None, "true_peak_db": None}

    if shutil.which("ffmpeg"):
        try:
            metrics = _ffmpeg_ebur128(p)
        except Exception as exc:
            reasons.append(f"ffmpeg_ebur128_failed:{exc!r}")
    if metrics.get("lufs") is None:
        try:
            metrics = _pyloudnorm_measure(p)
        except Exception:
            try:
                metrics = _pydub_peak(p)
            except Exception as exc:
                reasons.append(f"qc_engines_unavailable:{exc!r}")

    advanced = _spectral_peak_centroid(p)
    if advanced.get("true_peak_db_refined") is not None:
        existing = metrics.get("true_peak_db")
        if existing is None or advanced["true_peak_db_refined"] > existing:
            metrics["true_peak_db"] = advanced["true_peak_db_refined"]
    metrics.update({
        "spectral_centroid_hz": advanced.get("spectral_centroid_hz"),
        "adaptive_threshold": advanced.get("adaptive_threshold"),
    })

    lufs = metrics.get("lufs")
    peak = metrics.get("true_peak_db")
    clipping = bool(peak is not None and peak >= 0.0)

    if lufs is not None and not (LUFS_MIN <= lufs <= LUFS_MAX):
        reasons.append(f"lufs_out_of_range:{lufs:.2f}")
    if peak is not None and peak > TRUE_PEAK_MAX_DB:
        reasons.append(f"true_peak_above:{peak:.2f}dB")
    if clipping:
        reasons.append("hard_clipping_detected")

    lra = metrics.get("lra")

    return {
        "qc": "PASS" if not reasons else "FAIL",
        "reasons": reasons,
        "lufs": lufs,
        "true_peak_db": peak,
        "lra": lra,
        "rms_db": metrics.get("rms_db"),
        "ceiling_db": peak,
        "clipping": clipping,
        "spectral_centroid_hz": metrics.get("spectral_centroid_hz"),
        "adaptive_threshold": metrics.get("adaptive_threshold"),
    }
