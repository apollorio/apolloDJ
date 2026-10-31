"""Downbeat detection — librosa-only ApolloDJ reimplementation.

Studied from BeatNet/madmom logic only — our version.
Replaces madmom RNNDownBeatProcessor + DBNDownBeatTrackingProcessor
without BLSTM weights or madmom runtime.
"""
from __future__ import annotations

from pathlib import Path
from typing import List

import numpy as np

_FPS = 100.0
_MIN_BPM = 55.0
_MAX_BPM = 215.0
_NUM_TEMPI = 48
_THRESHOLD = 0.05
_BEATS_PER_BAR_CANDIDATES = (2, 3, 4)


def downbeat_detection(track_path: str) -> List[float]:
    """Return downbeat times in seconds for a track.

    Studied from BeatNet/madmom logic only — our version.

    Podium (never raises):
      1. Synthetic beat/downbeat activations + bar-phase Viterbi (DBN analogue)
      2. librosa beat_track + bass-onset phase pick
      3. Uniform 4/4 grid from estimated BPM

    Args:
        track_path: Audio file path (Windows or POSIX).

    Returns:
        Sorted list of downbeat timestamps in seconds (may be empty).
    """
    path = Path(track_path).expanduser().resolve()
    if not path.is_file():
        return []

    try:
        result = _tier_activation_viterbi(path)
        if len(result) >= 2:
            return result
    except Exception:
        pass

    try:
        result = _tier_phase_pick(path)
        if len(result) >= 2:
            return result
    except Exception:
        pass

    try:
        return _tier_bpm_grid(path)
    except Exception:
        return []


def _resolve_audio(path: Path) -> tuple[np.ndarray, float]:
    import librosa

    y, sr = librosa.load(str(path), sr=44100, mono=True)
    return y, float(sr)


def _normalize01(x: np.ndarray) -> np.ndarray:
    lo, hi = float(x.min()), float(x.max())
    if hi - lo < 1e-9:
        return np.zeros_like(x)
    return (x - lo) / (hi - lo)


def _build_activations(y: np.ndarray, sr: float) -> np.ndarray:
    """Build (T, 2) beat/downbeat activation matrix at ``_FPS``."""
    import librosa
    from scipy import ndimage
    from scipy.interpolate import interp1d

    hop = max(1, int(round(sr / _FPS)))
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop, aggregate=np.median)
    n_frames = int(max(1, np.ceil(len(y) / hop)))
    t_src = np.arange(len(onset)) * hop / sr
    t_dst = np.arange(n_frames) / _FPS
    if len(t_src) < 2:
        beat_act = np.zeros(n_frames, dtype=np.float64)
    else:
        beat_act = interp1d(t_src, onset, kind="linear", fill_value=0.0, bounds_error=False)(t_dst)
    beat_act = ndimage.maximum_filter1d(beat_act.astype(np.float64), size=3)
    beat_act = _normalize01(beat_act)

    y_perc = librosa.effects.percussive(y, margin=2.0)
    stft = np.abs(librosa.stft(y_perc, n_fft=2048, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    bass = stft[freqs <= 250.0].mean(axis=0) if stft.size else np.zeros(len(onset))
    if len(bass) != len(onset):
        bass = np.resize(bass, len(onset))
    if len(t_src) < 2:
        down_act = np.zeros(n_frames, dtype=np.float64)
    else:
        down_act = interp1d(t_src, bass, kind="linear", fill_value=0.0, bounds_error=False)(t_dst)
    down_act = ndimage.maximum_filter1d(down_act, size=5)
    down_act = _normalize01(down_act)

    return np.stack([beat_act, down_act], axis=1).astype(np.float64)


def _threshold_activations(act: np.ndarray) -> tuple[np.ndarray, int]:
    mask = (act[:, 0] >= _THRESHOLD) | (act[:, 1] >= _THRESHOLD)
    if not mask.any():
        return act, 0
    idx = np.flatnonzero(mask)
    return act[int(idx[0]) : int(idx[-1]) + 1], int(idx[0])


def _tempo_periods() -> np.ndarray:
    min_iv = _FPS * 60.0 / _MAX_BPM
    max_iv = _FPS * 60.0 / _MIN_BPM
    periods = np.unique(
        np.round(np.logspace(np.log2(min_iv), np.log2(max_iv), _NUM_TEMPI, base=2))
    )
    return periods.astype(int)


def _viterbi_bar_path(
    act: np.ndarray,
    beats_per_bar: int,
    period: int,
) -> tuple[float, np.ndarray]:
    """Viterbi over cyclic bar positions with fixed beat period (frames)."""
    t_len = act.shape[0]
    if period < 1 or t_len < period:
        return -np.inf, np.array([], dtype=np.int32)

    n_states = beats_per_bar
    beat_idx = np.arange(t_len) % period
    is_pulse = beat_idx == 0

    log_emit = np.full((t_len, n_states), -20.0)
    for pos in range(beats_per_bar):
        ch = 1 if pos == 0 else 0
        pulse_vals = np.where(is_pulse, act[:, ch], 1e-6)
        log_emit[:, pos] = np.log(np.clip(pulse_vals, 1e-9, None))

    trans = np.full((n_states, n_states), -20.0)
    for i in range(n_states):
        trans[i, (i + 1) % beats_per_bar] = 0.0

    delta = np.full((t_len, n_states), -np.inf)
    psi = np.zeros((t_len, n_states), dtype=np.int32)
    delta[0] = log_emit[0]
    for t in range(1, t_len):
        for j in range(n_states):
            prev = delta[t - 1] + trans[:, j]
            k = int(np.argmax(prev))
            delta[t, j] = prev[k] + log_emit[t, j]
            psi[t, j] = k

    path = np.zeros(t_len, dtype=np.int32)
    path[-1] = int(np.argmax(delta[-1]))
    for t in range(t_len - 2, -1, -1):
        path[t] = psi[t + 1, path[t + 1]]
    return float(np.max(delta[-1])), path


def _downbeats_from_path(
    act: np.ndarray,
    path: np.ndarray,
    period: int,
    offset: int,
) -> List[float]:
    """Peak-correct downbeat frames where bar position is 0."""
    changes = np.flatnonzero(np.diff(path) != 0) + 1
    pulse_frames = np.unique(np.r_[0, changes])
    down_frames: List[int] = []
    half = max(1, period // 2)
    for frame in pulse_frames:
        if path[frame] != 0:
            continue
        left = max(0, frame - half)
        right = min(len(act), frame + half + 1)
        window = act[left:right]
        peak = int(np.argmax(window[:, 0] + window[:, 1])) + left
        down_frames.append(peak)
    return sorted({round((f + offset) / _FPS, 4) for f in down_frames})


def _tier_activation_viterbi(path: Path) -> List[float]:
    y, sr = _resolve_audio(path)
    act = _build_activations(y, sr)
    act, offset = _threshold_activations(act)
    if act.size == 0:
        return []

    best: List[float] = []
    best_score = -np.inf
    for bpb in _BEATS_PER_BAR_CANDIDATES:
        for period in _tempo_periods():
            score, path_arr = _viterbi_bar_path(act, bpb, int(period))
            if score <= best_score or path_arr.size == 0:
                continue
            candidates = _downbeats_from_path(act, path_arr, int(period), offset)
            if len(candidates) >= 2:
                best_score = score
                best = candidates
    return best


def _tier_phase_pick(path: Path) -> List[float]:
    import librosa

    y, sr = _resolve_audio(path)
    tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    beat_times = librosa.frames_to_time(beat_frames, sr=sr)
    if len(beat_times) < 8:
        return []

    act = _build_activations(y, sr)
    beat_idx = np.clip((beat_times * _FPS).astype(int), 0, act.shape[0] - 1)
    best_phase = 0
    best_score = -np.inf
    for phase in range(4):
        idx = beat_idx[phase::4]
        score = float(act[idx, 1].sum() + 0.25 * act[idx, 0].sum())
        if score > best_score:
            best_score = score
            best_phase = phase
    return sorted(
        {round(float(t), 4) for i, t in enumerate(beat_times) if i % 4 == best_phase}
    )


def _tier_bpm_grid(path: Path) -> List[float]:
    import librosa

    y, sr = _resolve_audio(path)
    duration = len(y) / sr
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    bpm = float(tempo) if tempo > 0 else 124.0
    bar_sec = 4.0 * 60.0 / bpm
    if bar_sec <= 0:
        return []
    times = [round(i * bar_sec, 4) for i in range(int(duration / bar_sec) + 1)]
    return [t for t in times if 0.0 <= t <= duration]
