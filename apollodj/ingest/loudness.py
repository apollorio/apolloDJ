"""Loudness normalization — EBU R128 LUFS, STRICT dual-pass mode.

Strict workflow (matches CDJ-grade Rekordbox export):
  1. First pass: ffmpeg `loudnorm=print_format=json` MEASURES I / TP / LRA / thresh.
  2. Second pass: ffmpeg `loudnorm=linear=true:I=-14:TP=-1:LRA=<measured>` APPLIES
     the gain with the measured values (avoids dynamic mode, preserves dynamics).
  3. CDJ specs are forced: -ar 44100 -ac 2 -sample_fmt s16.
  4. True Peak ceiling is locked at -1.0 dBTP.
  5. Optional `dynaudnorm=gausssize=3` is added only on flagged weak tracks
     (set via `weak=True`).

Podium fallbacks (lightweight tier — never deleted):
  1. ffmpeg DUAL-PASS loudnorm (strict 1st choice)
  2. ffmpeg-normalize Python API (two-pass EBU R128, batch friendly)
  3. ffmpeg CLI single-pass loudnorm
  4. pyloudnorm measure-only (no normalization)
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

TARGET_LUFS = -14.0
TRUE_PEAK_CEILING = -1.0
LRA_TARGET = 7.0
LRA_MIN = 1.0
LRA_MAX = 50.0
CDJ_SAMPLE_RATE = 44100
CDJ_CHANNELS = 2
CDJ_SAMPLE_FMT = "s16"

_SUBPROC_TEXT = {"text": True, "encoding": "utf-8", "errors": "replace"}


def _clamp_lra(value: Any) -> float:
    """ffmpeg loudnorm requires LRA in [1, 50]; synthetic tones can measure 0."""
    try:
        lra = float(value)
    except (TypeError, ValueError):
        return LRA_TARGET
    if lra < LRA_MIN or lra > LRA_MAX:
        return LRA_TARGET
    return lra


def _ffmpeg_loudnorm_measure(src: Path) -> Optional[Dict[str, Any]]:
    """Pass 1 — measure I / TP / LRA / thresh via loudnorm=print_format=json."""
    if not shutil.which("ffmpeg"):
        return None
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-nostats",
        "-i", str(src),
        "-af",
        f"loudnorm=I={TARGET_LUFS}:TP={TRUE_PEAK_CEILING}:LRA={LRA_TARGET}:print_format=json",
        "-f", "null", "-",
    ]
    proc = subprocess.run(cmd, capture_output=True, **_SUBPROC_TEXT)
    stderr = proc.stderr or ""
    match = re.search(r"\{[\s\S]*\}", stderr)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def _ffmpeg_loudnorm_apply(src: Path, dst: Path, measured: Dict[str, Any],
                           target_lufs: float, true_peak: float,
                           weak: bool) -> Dict[str, Any]:
    """Pass 2 — apply loudnorm with measured values + linear=true."""
    # Pass-2: use the measured LRA from pass-1 as the output LRA target (strict spec).
    measured_lra = _clamp_lra(measured.get("input_lra") or LRA_TARGET)
    af = (
        f"loudnorm=linear=true:I={target_lufs}:TP={true_peak}:LRA={measured_lra}"
        f":measured_I={measured.get('input_i', target_lufs)}"
        f":measured_TP={measured.get('input_tp', true_peak)}"
        f":measured_LRA={measured_lra}"
        f":measured_thresh={measured.get('input_thresh', -34.0)}"
        f":offset={measured.get('target_offset', 0.0)}"
        f":print_format=summary"
    )
    if weak:
        af += ",dynaudnorm=gausssize=3"

    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(src),
        "-af", af,
        "-ar", str(CDJ_SAMPLE_RATE),
        "-ac", str(CDJ_CHANNELS),
        "-sample_fmt", CDJ_SAMPLE_FMT,
        str(dst),
    ]
    subprocess.run(cmd, check=True)
    return {
        "engine": "ffmpeg_loudnorm_dual_pass",
        "lufs_target": target_lufs,
        "true_peak_target": true_peak,
        "measured": measured,
        "weak_track_dynaudnorm": weak,
        "cdj_specs": {"sr": CDJ_SAMPLE_RATE, "ch": CDJ_CHANNELS, "fmt": CDJ_SAMPLE_FMT},
    }


def normalize(src: str | Path, dst: str | Path, target_lufs: float = TARGET_LUFS,
              true_peak: float = TRUE_PEAK_CEILING, *, weak: bool = False) -> Dict[str, Any]:
    """Normalize ``src`` to ``dst`` honoring CDJ specs and -1 dBTP ceiling.

    ``weak`` enables `dynaudnorm=gausssize=3` for ultra-clean ride on weak tracks.
    """
    src_p, dst_p = Path(src), Path(dst)

    # Tier 1: strict ffmpeg dual-pass loudnorm
    measured = _ffmpeg_loudnorm_measure(src_p)
    if measured is not None:
        try:
            return _ffmpeg_loudnorm_apply(src_p, dst_p, measured, target_lufs, true_peak, weak)
        except subprocess.CalledProcessError:
            pass

    # Tier 2: ffmpeg-normalize Python API
    try:
        from ffmpeg_normalize import FFmpegNormalize
        norm = FFmpegNormalize(
            normalization_type="ebu",
            target_level=target_lufs,
            true_peak=true_peak,
            loudness_range_target=LRA_TARGET,
            audio_codec="pcm_s16le",
            sample_rate=CDJ_SAMPLE_RATE,
            keep_loudness_range_target=True,
        )
        norm.add_media_file(str(src_p), str(dst_p))
        norm.run_normalization()
        return {"engine": "ffmpeg_normalize", "lufs_target": target_lufs}
    except Exception:
        pass

    # Tier 3: ffmpeg single-pass loudnorm
    if shutil.which("ffmpeg"):
        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
            "-i", str(src_p),
            "-af", f"loudnorm=I={target_lufs}:TP={true_peak}:LRA={LRA_TARGET}",
            "-ar", str(CDJ_SAMPLE_RATE),
            "-ac", str(CDJ_CHANNELS),
            "-sample_fmt", CDJ_SAMPLE_FMT,
            str(dst_p),
        ]
        subprocess.run(cmd, check=True)
        return {"engine": "ffmpeg_cli_loudnorm", "lufs_target": target_lufs}

    # Tier 4: pyloudnorm measure-only
    import soundfile as sf
    import pyloudnorm as pyln
    data, sr = sf.read(str(src_p))
    meter = pyln.Meter(sr)
    measured_lufs = float(meter.integrated_loudness(data))
    return {
        "engine": "pyloudnorm_measure_only",
        "lufs_target": target_lufs,
        "lufs_measured": measured_lufs,
        "delta_db": target_lufs - measured_lufs,
        "warning": "no_write_capability",
    }


def measure(src: str | Path) -> Optional[Dict[str, Any]]:
    """Return only the loudnorm measurement (Pass 1) for QC / orchestrators."""
    return _ffmpeg_loudnorm_measure(Path(src))
