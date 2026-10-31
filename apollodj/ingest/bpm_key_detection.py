"""apolloDJ — joint BPM + Key detection (librosa-only).

Studied from BeatNet logic only — our version.

Reimplements BeatNet's CRNN+DBN beat tracker (offline mode) using a
deterministic onset-strength + bar-state-Viterbi pipeline. No torch,
no madmom, no model weights. Krumhansl-Schmuckler chroma key is layered
on top (BeatNet itself does not detect key).

Engine code: apolloBPK  —  apollo + B(eatnet)P(itch)K(ey)

Public API
──────────
    bpm_key_detection(track_path: str) -> Dict[str, Any]

Podium (function never raises):
    #1 MAIN     apolloBPK  — BeatNet-equivalent activations + Viterbi + KS key
    #2 FALLBACK apolloLBR  — librosa.beat.beat_track + chroma_cqt KS template
    #3 SAFETY   apolloSAF  — deterministic BPM=124 / key=8A
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np

_BPB_CANDIDATES: Tuple[int, ...] = (2, 3, 4)
_MIN_BPM: float = 55.0
_MAX_BPM: float = 215.0
_INTERNAL_FPS: float = 100.0  # matches downbeat.py's activation framerate


# ── Public API ──────────────────────────────────────────────────────────────

def bpm_key_detection(track_path: str) -> Dict[str, Any]:
    """Joint BPM + Camelot key detection.

    Studied from BeatNet logic only — our version.

    Args:
        track_path: Absolute or relative path to an audio file (Windows
            paths supported; ``Path.expanduser().resolve()`` handles ``~``
            and both forward / backward slashes).

    Returns:
        Canonical analysis dict with the following keys::

            {
                "bpm":             float,   # rounded to 0.1
                "bpm_confidence":  float,   # 0.0..1.0
                "beat_times":      list[float],
                "downbeat_cues":   list[float],
                "beats_per_bar":   int,
                "key":             str,     # Camelot, e.g. "8A"
                "key_note":        str,     # tonic
                "key_mode":        str,     # "major" | "minor"
                "key_confidence":  float,
                "engine":          str,     # apolloBPK | apolloLBR | apolloSAF
                "source":          str,     # human-readable engine name
            }

        Never raises — on total failure returns the apolloSAF default.
    """
    path = Path(track_path).expanduser().resolve()
    if not path.is_file():
        return _safety_default(str(path), reason="file_not_found")

    for tier in (_tier1_apolloBPK, _tier2_apolloLBR):
        try:
            result = tier(path)
            if result is not None and result.get("bpm"):
                return result
        except Exception:
            continue

    return _safety_default(str(path), reason="all_tiers_failed")


# ── #1 MAIN — apolloBPK (BeatNet-equivalent, librosa-only) ─────────────────

def _tier1_apolloBPK(path: Path) -> Dict[str, Any] | None:
    """log-Mel + diff onsets → Viterbi over bar states + KS chroma key.

    Reuses primitives from :mod:`apollodj.ingest.downbeat` so we don't
    duplicate the activation/Viterbi math:

      * ``_build_activations``  — CRNN-equivalent (T, 2) activation matrix
      * ``_tempo_periods``      — discrete beat-period grid in frames
      * ``_threshold_activations`` — trim leading/trailing silence
      * ``_viterbi_bar_path``   — DBN-equivalent bar-pointer Viterbi
    """
    import librosa
    from .downbeat import (
        _build_activations,
        _tempo_periods,
        _threshold_activations,
        _viterbi_bar_path,
    )

    y, sr = librosa.load(str(path), sr=44100, mono=True)
    if y.size < sr // 2:
        return None

    # CRNN-equivalent: per-frame beat + downbeat activations
    activations = _build_activations(y, float(sr))
    activations, offset = _threshold_activations(activations)
    if activations.size == 0:
        return None

    # DBN-equivalent: search (beats_per_bar, beat_period) combinations
    best_score: float = -np.inf
    best_bpb: int = 4
    best_period: int = 0
    best_path: np.ndarray = np.array([], dtype=np.int32)
    for bpb in _BPB_CANDIDATES:
        for period in _tempo_periods():
            score, decoded = _viterbi_bar_path(activations, bpb, int(period))
            if score > best_score and decoded.size > 0:
                best_score = score
                best_bpb = bpb
                best_period = int(period)
                best_path = decoded

    if best_period == 0:
        return None

    bpm = round(60.0 * _INTERNAL_FPS / best_period, 1)
    if not (_MIN_BPM <= bpm <= _MAX_BPM):
        return None

    # Decode beat/downbeat times from the Viterbi path
    beat_frames = np.where(np.diff(best_path, prepend=-1) != 0)[0]
    beat_times = sorted(
        round(float(f + offset) / _INTERNAL_FPS, 4) for f in beat_frames
    )
    downbeat_times = sorted(
        round(float(f + offset) / _INTERNAL_FPS, 4)
        for f in beat_frames
        if best_path[f] == 0
    )

    # Confidence: normalised Viterbi log-likelihood per frame
    bpm_conf = float(
        np.clip(0.5 + best_score / (activations.size * 5.0), 0.5, 0.98)
    )

    # Layered KS key detection (BeatNet has no key — we add it)
    from .harmonic import _librosa_ks_fallback
    key_data = _librosa_ks_fallback(str(path))

    return {
        "bpm": bpm,
        "bpm_confidence": round(bpm_conf, 3),
        "beat_times": beat_times,
        "downbeat_cues": downbeat_times,
        "beats_per_bar": best_bpb,
        "key": key_data.get("camelot"),
        "key_note": key_data.get("note"),
        "key_mode": key_data.get("mode"),
        "key_confidence": float(key_data.get("confidence", 0.0)),
        "engine": "apolloBPK",
        "source": "apolloBPK (BeatNet-equivalent CRNN→DBN, librosa-only)",
    }


# ── #2 FALLBACK — apolloLBR (pure librosa) ─────────────────────────────────

def _tier2_apolloLBR(path: Path) -> Dict[str, Any] | None:
    """librosa.beat.beat_track + chroma_cqt KS template."""
    import librosa
    from .harmonic import _librosa_ks_fallback

    y, sr = librosa.load(str(path), sr=22050, mono=True)
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    bpm = float(np.atleast_1d(tempo)[0])
    if not (_MIN_BPM <= bpm <= _MAX_BPM):
        return None

    beat_times: List[float] = [
        round(float(t), 4) for t in librosa.frames_to_time(beat_frames, sr=sr)
    ]
    downbeats: List[float] = beat_times[::4]  # naive 4/4 picking

    key_data = _librosa_ks_fallback(str(path))

    return {
        "bpm": round(bpm, 1),
        "bpm_confidence": 0.65,
        "beat_times": beat_times,
        "downbeat_cues": downbeats,
        "beats_per_bar": 4,
        "key": key_data.get("camelot"),
        "key_note": key_data.get("note"),
        "key_mode": key_data.get("mode"),
        "key_confidence": float(key_data.get("confidence", 0.0)),
        "engine": "apolloLBR",
        "source": "apolloLBR (librosa beat_track + chroma KS)",
    }


# ── #3 SAFETY — apolloSAF (deterministic) ──────────────────────────────────

def _safety_default(path_str: str, *, reason: str) -> Dict[str, Any]:
    """Last-resort answer; the public function never raises."""
    return {
        "bpm": 124.0,
        "bpm_confidence": 0.05,
        "beat_times": [],
        "downbeat_cues": [],
        "beats_per_bar": 4,
        "key": "8A",
        "key_note": "A",
        "key_mode": "minor",
        "key_confidence": 0.0,
        "engine": "apolloSAF",
        "source": f"apolloSAF (deterministic safety; reason={reason})",
    }
