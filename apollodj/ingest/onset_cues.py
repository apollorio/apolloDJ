"""Onset + tempo smart hotcue times — librosa.onset + scipy ApolloDJ reimplementation.

Studied from aubio logic only — our version.
Replaces aubio onset + tempo for CDJ memory cue placement
without the aubio C library.
"""
from __future__ import annotations

from pathlib import Path
from typing import List

import numpy as np

_SR = 44100
_HOP = 512
_MAX_CUES = 8
_MIN_IOI_SEC = 0.18
_PEAK_THRESHOLD = 0.033
_MEDIAN_WIN = 9


def onset_smart_cues(track_path: str) -> List[float]:
    """Return up to 8 hotcue times (seconds) from onset + tempo logic.

    Studied from aubio logic only — our version.

    Podium (never raises):
      1. librosa onset strength + scipy adaptive peaks + beat_track merge
      2. librosa.onset_detect + min-spacing selection
      3. Uniform grid from BPM

    Args:
        track_path: Audio file path (Windows or POSIX).

    Returns:
        Sorted cue times in seconds (may be empty).
    """
    path = Path(track_path).expanduser().resolve()
    if not path.is_file():
        return []

    try:
        result = _tier_onset_beat_merge(path)
        if len(result) >= 2:
            return result
    except Exception:
        pass

    try:
        result = _tier_onset_detect(path)
        if len(result) >= 2:
            return result
    except Exception:
        pass

    try:
        return _tier_bpm_grid(path)
    except Exception:
        return []


def _load_mono(path: Path) -> tuple[np.ndarray, float]:
    import librosa

    y, sr = librosa.load(str(path), sr=_SR, mono=True)
    return y, float(sr)


def _hfc_onset_strength(y: np.ndarray, sr: float) -> np.ndarray:
    """Aubio HFC analogue: sum (k+1)*|X[k]| per frame."""
    import librosa

    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=_HOP))
    freqs = np.arange(S.shape[0], dtype=np.float64)
    odf = (freqs[:, None] * S).sum(axis=0)
    if odf.size >= 4 and float(np.max(odf)) > 1e-9:
        return odf
    return librosa.onset.onset_strength(y=y, sr=sr, hop_length=_HOP)


def _adaptive_peaks(odf: np.ndarray, sr: float) -> np.ndarray:
    """Median-threshold peak pick (Aubio peakpicker analogue)."""
    from scipy import ndimage
    from scipy.signal import find_peaks

    if odf.size < _MEDIAN_WIN:
        return np.array([], dtype=int)
    med = ndimage.median_filter(odf, size=_MEDIAN_WIN, mode="nearest")
    thr = odf - med
    min_dist = max(1, int(_MIN_IOI_SEC * sr / _HOP))
    peaks, _props = find_peaks(thr, height=_PEAK_THRESHOLD, distance=min_dist)
    return peaks


def _frames_to_times(frames: np.ndarray, sr: float) -> List[float]:
    import librosa

    return [round(float(t), 4) for t in librosa.frames_to_time(frames, sr=sr, hop_length=_HOP)]


def _pick_spaced(times: List[float], scores: List[float], min_gap: float, limit: int) -> List[float]:
    if not times:
        return []
    order = np.argsort(scores)[::-1]
    chosen: List[float] = []
    for idx in order:
        t = times[int(idx)]
        if all(abs(t - c) >= min_gap for c in chosen):
            chosen.append(t)
        if len(chosen) >= limit:
            break
    return sorted(chosen)


def _tier_onset_beat_merge(path: Path) -> List[float]:
    import librosa

    y, sr = _load_mono(path)
    odf = _hfc_onset_strength(y, sr)

    peak_frames = _adaptive_peaks(odf, sr)
    onset_times = _frames_to_times(peak_frames, sr)
    onset_scores = [float(odf[f]) for f in peak_frames]

    tempo, beat_frames = librosa.beat.beat_track(
        y=y, sr=sr, hop_length=_HOP, onset_envelope=odf, trim=False,
    )
    beat_times = _frames_to_times(np.asarray(beat_frames, dtype=int), sr)
    bpm = float(tempo) if tempo and tempo > 0 else 124.0
    beat_gap = max(2.0, 4.0 * 60.0 / bpm)

    candidates = list(onset_times)
    scores = list(onset_scores)
    for bt in beat_times:
        if bt not in candidates:
            candidates.append(bt)
            idx = min(int(bt * sr / _HOP), len(odf) - 1)
            scores.append(float(odf[max(0, idx)]))

    return _pick_spaced(candidates, scores, beat_gap, _MAX_CUES)


def _tier_onset_detect(path: Path) -> List[float]:
    import librosa

    y, sr = _load_mono(path)
    frames = librosa.onset.onset_detect(
        y=y, sr=sr, hop_length=_HOP, backtrack=True, units="frames",
    )
    times = _frames_to_times(np.asarray(frames, dtype=int), sr)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr, hop_length=_HOP, trim=False)
    bpm = float(tempo) if tempo and tempo > 0 else 124.0
    min_gap = max(2.0, 4.0 * 60.0 / bpm)
    scores = list(range(len(times), 0, -1))
    return _pick_spaced(times, scores, min_gap, _MAX_CUES)


def _tier_bpm_grid(path: Path) -> List[float]:
    import librosa

    y, sr = _load_mono(path)
    duration = len(y) / sr
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr, hop_length=_HOP, trim=False)
    bpm = float(tempo) if tempo and tempo > 0 else 124.0
    bar_sec = 4.0 * 60.0 / bpm
    if bar_sec <= 0 or duration <= 0:
        return []
    times = [round(i * bar_sec, 4) for i in range(_MAX_CUES)]
    return [t for t in times if t <= duration]
