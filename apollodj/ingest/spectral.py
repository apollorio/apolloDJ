"""Spectral MIR features — librosa + pyAudioAnalysis ApolloDJ reimplementation.

Studied from essentia logic only — our version.
Replaces Essentia MusicExtractor low-level spectral / danceability
without the essentia C++ runtime.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np

_SR = 44100
_FRAME = 2048
_HOP = 1024
_BANDS: Tuple[Tuple[str, float, float], ...] = (
    ("low", 20.0, 150.0),
    ("mid_low", 150.0, 800.0),
    ("mid_high", 800.0, 4000.0),
    ("high", 4000.0, 20000.0),
)
_DFA_MIN_TAU_MS = 310.0
_DFA_MAX_TAU_MS = 8800.0
_DFA_TAU_MULT = 1.1


def spectral_features(track_path: str) -> Dict[str, Any]:
    """Extract multi-band energy, timbre, and danceability for a track.

    Studied from essentia logic only — our version.

    Podium (never raises):
      1. librosa STFT bands + timbre + DFA danceability
      2. pyAudioAnalysis mid-term feature means
      3. librosa RMS + spectral centroid minimal fallback

    Args:
        track_path: Audio file path (Windows or POSIX).

    Returns:
        Feature dict with keys ``source``, ``duration_sec``, ``danceability``,
        ``multi_band_energy``, ``timbre``, optional ``pyaudio_mid_means``.
    """
    path = Path(track_path).expanduser().resolve()
    if not path.is_file():
        return _empty_result("invalid_path")

    try:
        out = _tier_librosa_essentia(path)
        if out.get("danceability", 0.0) > 0 or out["multi_band_energy"]["total"] > 0:
            return out
    except Exception:
        pass

    try:
        out = _tier_pyaudioanalysis(path)
        if out["multi_band_energy"]["total"] > 0:
            return out
    except Exception:
        pass

    try:
        return _tier_librosa_minimal(path)
    except Exception:
        return _empty_result("fallback_failed")


def _empty_result(source: str) -> Dict[str, Any]:
    return {
        "source": source,
        "duration_sec": 0.0,
        "danceability": 0.0,
        "multi_band_energy": {
            "low": 0.0,
            "mid_low": 0.0,
            "mid_high": 0.0,
            "high": 0.0,
            "total": 0.0,
        },
        "timbre": {
            "spectral_centroid_hz": 0.0,
            "spectral_bandwidth_hz": 0.0,
            "spectral_rolloff_hz": 0.0,
            "spectral_flatness": 0.0,
            "zcr": 0.0,
            "mfcc_mean": [],
        },
        "pyaudio_mid_means": None,
    }


def _load_mono(path: Path) -> Tuple[np.ndarray, float]:
    import librosa

    y, sr = librosa.load(str(path), sr=_SR, mono=True)
    return y, float(sr)


def _band_energies_from_stft(
    S: np.ndarray,
    freqs: np.ndarray,
) -> Dict[str, float]:
    power = np.abs(S) ** 2
    out: Dict[str, float] = {}
    for name, f_lo, f_hi in _BANDS:
        mask = (freqs >= f_lo) & (freqs < f_hi)
        out[name] = float(power[mask].sum()) if mask.any() else 0.0
    out["total"] = float(power.sum())
    return out


def _frame_std_series(y: np.ndarray, sr: float, frame_ms: float = 10.0) -> np.ndarray:
    frame = max(1, int(round(sr * frame_ms / 1000.0)))
    n_frames = len(y) // frame
    if n_frames < 4:
        return np.zeros(0, dtype=np.float64)
    trimmed = y[: n_frames * frame].reshape(n_frames, frame)
    return trimmed.std(axis=1, ddof=1)


def _residual_error(segment: np.ndarray) -> float:
    n = len(segment)
    if n < 2:
        return 0.0
    x = np.arange(n, dtype=np.float64)
    mean_x = (n - 1) * 0.5
    mean_y = float(segment.mean())
    dx = x - mean_x
    dy = segment - mean_y
    ssxx = float(np.dot(dx, dx))
    ssxy = float(np.dot(dx, dy))
    if ssxx < 1e-12:
        return float(np.dot(dy, dy))
    slope = ssxy / ssxx
    intercept = mean_y - slope * mean_x
    fit = slope * x + intercept
    return float(np.sum((segment - fit) ** 2))


def _danceability_dfa(y: np.ndarray, sr: float) -> float:
    s = _frame_std_series(y, sr)
    if len(s) < 16:
        return 0.0
    s = s - s.mean()
    s = np.cumsum(s)
    taus: List[int] = []
    tau_ms = _DFA_MIN_TAU_MS
    while tau_ms <= _DFA_MAX_TAU_MS:
        taus.append(max(1, int(tau_ms / 10.0)))
        tau_ms *= _DFA_TAU_MULT
    F: List[float] = []
    n_frames = len(s)
    for tau in taus:
        if n_frames < tau:
            break
        jump = max(tau // 50, 1)
        residual_sum = 0.0
        count = 0
        for k in range(0, n_frames - tau, jump):
            residual_sum += _residual_error(s[k : k + tau])
            count += 1
        if count == 0:
            continue
        F.append(float(np.sqrt(residual_sum / count)))
    if len(F) < 2:
        return 0.0
    alphas: List[float] = []
    for i in range(len(F) - 1):
        if F[i] <= 0 or F[i + 1] <= 0:
            continue
        num = np.log10(F[i + 1] / F[i])
        den = np.log10((taus[i + 1] + 3.0) / (taus[i] + 3.0))
        if abs(den) > 1e-12:
            alphas.append(float(num / den))
    if not alphas:
        return 0.0
    mean_alpha = float(np.mean(alphas))
    if mean_alpha <= 0:
        return 0.0
    return float(1.0 / mean_alpha)


def _timbre_librosa(y: np.ndarray, sr: float) -> Dict[str, Any]:
    import librosa

    centroid = librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=_FRAME, hop_length=_HOP)
    bandwidth = librosa.feature.spectral_bandwidth(y=y, sr=sr, n_fft=_FRAME, hop_length=_HOP)
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr, n_fft=_FRAME, hop_length=_HOP)
    flatness = librosa.feature.spectral_flatness(y=y, n_fft=_FRAME, hop_length=_HOP)
    zcr = librosa.feature.zero_crossing_rate(y, hop_length=_HOP)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13, n_fft=_FRAME, hop_length=_HOP)
    return {
        "spectral_centroid_hz": float(np.mean(centroid)),
        "spectral_bandwidth_hz": float(np.mean(bandwidth)),
        "spectral_rolloff_hz": float(np.mean(rolloff)),
        "spectral_flatness": float(np.mean(flatness)),
        "zcr": float(np.mean(zcr)),
        "mfcc_mean": [float(v) for v in mfcc.mean(axis=1)],
    }


def _tier_librosa_essentia(path: Path) -> Dict[str, Any]:
    import librosa

    y, sr = _load_mono(path)
    duration = len(y) / sr
    S = np.abs(librosa.stft(y, n_fft=_FRAME, hop_length=_HOP)) ** 2
    freqs = librosa.fft_frequencies(sr=sr, n_fft=_FRAME)
    bands = _band_energies_from_stft(S, freqs)
    return {
        "source": "librosa_essentia_analogue",
        "duration_sec": round(duration, 3),
        "danceability": round(_danceability_dfa(y, sr), 4),
        "multi_band_energy": bands,
        "timbre": _timbre_librosa(y, sr),
        "pyaudio_mid_means": None,
    }


def _tier_pyaudioanalysis(path: Path) -> Dict[str, Any]:
    from pyAudioAnalysis import MidTermFeatures as mtf

    y, sr = _load_mono(path)
    duration = len(y) / sr
    mt_win = 1.0 * sr
    mt_step = 1.0 * sr
    st_win = 0.050 * sr
    st_step = 0.050 * sr
    mt_feats, _, _names = mtf.mid_feature_extraction(y, sr, mt_win, mt_step, st_win, st_step)
    row_means = mt_feats.mean(axis=1) if mt_feats.size else np.zeros(0)
    energy_proxy = float(np.mean(row_means)) if row_means.size else 0.0
    bands = {
        "low": energy_proxy * 0.35,
        "mid_low": energy_proxy * 0.25,
        "mid_high": energy_proxy * 0.25,
        "high": energy_proxy * 0.15,
        "total": energy_proxy,
    }
    return {
        "source": "pyaudioanalysis_midterm",
        "duration_sec": round(duration, 3),
        "danceability": 0.0,
        "multi_band_energy": bands,
        "timbre": _timbre_librosa(y, sr),
        "pyaudio_mid_means": [float(v) for v in row_means],
    }


def _tier_librosa_minimal(path: Path) -> Dict[str, Any]:
    import librosa

    y, sr = _load_mono(path)
    duration = len(y) / sr
    rms = float(np.sqrt(np.mean(y ** 2)))
    centroid = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=sr)))
    bands = {"low": rms, "mid_low": rms, "mid_high": rms, "high": rms, "total": rms * 4.0}
    return {
        "source": "librosa_minimal",
        "duration_sec": round(duration, 3),
        "danceability": 0.0,
        "multi_band_energy": bands,
        "timbre": {
            "spectral_centroid_hz": centroid,
            "spectral_bandwidth_hz": 0.0,
            "spectral_rolloff_hz": 0.0,
            "spectral_flatness": 0.0,
            "zcr": 0.0,
            "mfcc_mean": [],
        },
        "pyaudio_mid_means": None,
    }
