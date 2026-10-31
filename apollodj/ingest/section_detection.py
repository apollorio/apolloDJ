"""apolloDJ — song-section / structure detection (librosa + scipy clustering only).

Studied from madmom/BeatNet logic only — our version.

madmom and BeatNet both stop at beat / downbeat granularity (madmom adds
`RNNDownBeatProcessor`, BeatNet adds `BDA` + DBN inference) — neither
delivers song-level sections.  The community pattern is to layer a
self-similarity / novelty pass on top of the downbeat grid, then cluster
the resulting segments into intro / verse / chorus / drop / bridge / outro.
This module composes that exact pipeline using only librosa + numpy + scipy
(no madmom runtime, no torch, no BeatNet model weights).

Core algorithm — 5 steps
────────────────────────
  1. Beat / downbeat extraction (reuse :mod:`apollodj.ingest.downbeat`,
     itself a BeatNet-equivalent librosa+Viterbi pipeline → our version).
  2. Beat-synchronous feature matrix: per-beat means of chromagram +
     MFCC + RMS energy → ``F ∈ ℝ^{B × D}``.
  3. Self-similarity matrix (Foote 2000):
        ``S[i, j] = (F_i · F_j) / (||F_i|| · ||F_j||)``      cosine similarity.
  4. Novelty curve via diagonal convolution with a checkerboard kernel:
        ``K[k, l] = sign(k) · sign(l)``                       (L × L, L = 16 beats)
        ``N[t]   = Σ_{k,l ∈ [-L,L]}  S[t+k, t+l] · K[k, l]``
        Peak-pick local maxima of N above ``mean(N) + α·std(N)`` (α = 0.5),
        then snap each candidate to the nearest downbeat.
  5. Segment clustering with k-means
     (``scipy.cluster.vq.kmeans2``, ``k = clip(round(B / 32), 3, 6)``)
     on per-segment mean features.  Heuristic role assignment:
        ``intro`` = first segment,
        ``outro`` = last segment,
        ``drop``  = highest-energy non-edge segment,
        ``chorus``= most-recurring middle cluster,
        ``verse`` = neighbours of chorus,
        ``bridge``= remaining unique cluster.

Math summary
────────────
  F_b      = (chroma_mean_b, mfcc_mean_b, rms_mean_b)                   ∈ ℝ^D
  S[i,j]   = ⟨F_i, F_j⟩ / (‖F_i‖ ‖F_j‖)
  K[k,l]   = +1  if sgn(k) = sgn(l) else −1
  N[t]     = Σ_{k=−L}^{L} Σ_{l=−L}^{L}  S[t+k, t+l] · K[k, l]
  τ        = mean(N) + α · std(N)                                       α = 0.5
  B̂        = { t : N[t] = max(N[t−L : t+L]) ∧ N[t] > τ }                 boundaries
  B̂ ←   ⋃ argmin_d | downbeats[d] − t / fps |                            snap

Public API
──────────
    detect_sections(track_path: str) -> List[Dict[str, Any]]

Podium (function never raises):
    #1 MAIN     apolloSEC  — downbeats + Foote SSM + checkerboard novelty + k-means
    #2 FALLBACK apolloAGG  — librosa.segment.agglomerative on MFCC (k = 6)
    #3 SAFETY   apolloGRD  — single uniform "track" segment spanning full duration
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np

_HOP: int = 512                         # librosa default
_SR: int = 22050                        # analysis rate (light, deterministic)
_KERNEL_BEATS: int = 16                 # checkerboard half-width in beats
_NOVELTY_ALPHA: float = 0.5             # adaptive peak-pick threshold factor
_MIN_SECTION_BEATS: int = 16            # reject sections shorter than this
_K_MIN, _K_MAX = 3, 6                   # k-means cluster count clamp
_FEATURE_WEIGHTS: Tuple[float, float, float] = (0.5, 0.35, 0.15)  # chroma / mfcc / rms


# ── Public API ──────────────────────────────────────────────────────────────

def detect_sections(track_path: str) -> List[Dict[str, Any]]:
    """Return labelled song sections as a list of ``{label, start, end, role, cluster}``.

    Studied from madmom/BeatNet logic only — our version.

    Args:
        track_path: Absolute or relative path to an audio file.  Windows
            paths supported; ``Path(...).expanduser().resolve()`` handles
            ``~`` and both forward / backward slashes.

    Returns:
        Ordered list of section dicts::

            [
                {
                    "label":   str,    # human-readable role
                    "role":    str,    # intro|verse|chorus|drop|bridge|outro|phrase
                    "start":   float,  # seconds
                    "end":     float,  # seconds
                    "cluster": int,    # k-means cluster id (-1 if not clustered)
                    "engine":  str,    # apolloSEC | apolloAGG | apolloGRD
                },
                ...
            ]

        Never raises — on total failure returns a single
        apolloGRD entry spanning the full duration.
    """
    path = Path(track_path).expanduser().resolve()
    if not path.is_file():
        return _safety_grid_default(duration_sec=0.0)

    for tier in (_tier1_apolloSEC, _tier2_apolloAGG):
        try:
            result = tier(path)
            if result and len(result) >= 1:
                return result
        except Exception:
            continue

    # Last resort: single uniform segment using just file probe
    try:
        import librosa
        duration = float(librosa.get_duration(path=str(path)))
    except Exception:
        duration = 0.0
    return _safety_grid_default(duration_sec=duration)


# ── #1 MAIN — apolloSEC (Foote SSM + checkerboard + k-means) ───────────────

def _tier1_apolloSEC(path: Path) -> List[Dict[str, Any]] | None:
    """Downbeat-aligned section detection via self-similarity + clustering."""
    import librosa
    from scipy.cluster.vq import kmeans2
    from .downbeat import downbeat_detection

    y, sr = librosa.load(str(path), sr=_SR, mono=True)
    if y.size < sr:
        return None

    # 1. Downbeats (reuse our BeatNet-equivalent librosa-only detector)
    downbeats = downbeat_detection(str(path))
    if len(downbeats) < 4:
        return None
    downbeats_arr = np.asarray(sorted(set(downbeats)), dtype=np.float64)

    # 2. Beat-synchronous feature matrix
    _, beat_frames = librosa.beat.beat_track(y=y, sr=sr, hop_length=_HOP, trim=False)
    if beat_frames.size < _KERNEL_BEATS * 2 + 4:
        return None

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=_HOP)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=_HOP, n_mfcc=12)
    rms = librosa.feature.rms(y=y, hop_length=_HOP)

    chroma_b = librosa.util.sync(chroma, beat_frames, aggregate=np.median).T
    mfcc_b = librosa.util.sync(mfcc, beat_frames, aggregate=np.mean).T
    rms_b = librosa.util.sync(rms, beat_frames, aggregate=np.mean).T

    wc, wm, wr = _FEATURE_WEIGHTS
    features = np.hstack([wc * _l2norm(chroma_b), wm * _l2norm(mfcc_b), wr * _l2norm(rms_b)])
    if features.shape[0] < _KERNEL_BEATS * 2 + 4:
        return None

    # 3. Foote self-similarity
    feats_norm = features / np.clip(np.linalg.norm(features, axis=1, keepdims=True), 1e-9, None)
    ssm = feats_norm @ feats_norm.T

    # 4. Checkerboard-kernel novelty curve + boundary peak-pick
    novelty = _checkerboard_novelty(ssm, _KERNEL_BEATS)
    threshold = float(novelty.mean() + _NOVELTY_ALPHA * novelty.std())
    peaks = _peak_pick(novelty, window=_KERNEL_BEATS, threshold=threshold)

    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=_HOP)
    boundary_times = _snap_to_downbeats(beat_times[peaks], downbeats_arr)
    duration = float(len(y) / sr)
    boundary_times = sorted({0.0, *boundary_times, duration})

    # Filter out tiny segments
    min_sec = _MIN_SECTION_BEATS * 60.0 / max(1.0, _estimate_bpm(beat_times))
    pruned: List[float] = [boundary_times[0]]
    for t in boundary_times[1:]:
        if t - pruned[-1] >= min_sec:
            pruned.append(t)
    if pruned[-1] < duration:
        pruned.append(duration)

    # 5. Per-segment mean features + k-means clustering
    segment_features: List[np.ndarray] = []
    segment_indices: List[Tuple[int, int]] = []
    for s_t, e_t in zip(pruned[:-1], pruned[1:]):
        i_start = int(np.searchsorted(beat_times, s_t, side="left"))
        i_end = int(np.searchsorted(beat_times, e_t, side="right"))
        if i_end - i_start < 2:
            continue
        segment_features.append(features[i_start:i_end].mean(axis=0))
        segment_indices.append((i_start, i_end))

    if not segment_features:
        return None

    seg_mat = np.vstack(segment_features)
    k = int(np.clip(round(seg_mat.shape[0] / 4.0), _K_MIN, _K_MAX))
    k = min(k, seg_mat.shape[0])
    try:
        _centroids, cluster_ids = kmeans2(seg_mat, k, minit="++", seed=42)
    except Exception:
        cluster_ids = np.zeros(seg_mat.shape[0], dtype=np.int32)

    # Heuristic role assignment
    energies = [float(rms_b[i_s:i_e].mean()) for i_s, i_e in segment_indices]
    roles = _assign_roles(cluster_ids.tolist(), energies)

    results: List[Dict[str, Any]] = []
    for idx, ((i_s, i_e), role, cid) in enumerate(zip(segment_indices, roles, cluster_ids.tolist())):
        s_t = float(beat_times[i_s])
        e_t = float(beat_times[min(i_e, len(beat_times) - 1)])
        if e_t <= s_t:
            continue
        results.append({
            "label": f"{role} #{idx + 1}",
            "role": role,
            "start": round(s_t, 3),
            "end": round(e_t, 3),
            "cluster": int(cid),
            "engine": "apolloSEC",
        })
    return results or None


# ── #2 FALLBACK — apolloAGG (librosa agglomerative) ────────────────────────

def _tier2_apolloAGG(path: Path) -> List[Dict[str, Any]] | None:
    """Recurrence-matrix + agglomerative clustering — librosa built-in."""
    import librosa

    y, sr = librosa.load(str(path), sr=_SR, mono=True)
    if y.size < sr:
        return None

    mfcc = librosa.feature.mfcc(y=y, sr=sr, hop_length=_HOP, n_mfcc=13)
    k = 6
    bounds = librosa.segment.agglomerative(mfcc, k=k)
    bound_times = librosa.frames_to_time(bounds, sr=sr, hop_length=_HOP).tolist()
    bound_times = sorted({0.0, *bound_times, float(len(y) / sr)})

    roles = ["intro", "verse", "chorus", "drop", "bridge", "outro"]
    results: List[Dict[str, Any]] = []
    for i, (s_t, e_t) in enumerate(zip(bound_times[:-1], bound_times[1:])):
        if e_t <= s_t:
            continue
        role = roles[i] if i < len(roles) else roles[-1]
        results.append({
            "label": f"{role} #{i + 1}",
            "role": role,
            "start": round(float(s_t), 3),
            "end": round(float(e_t), 3),
            "cluster": -1,
            "engine": "apolloAGG",
        })
    return results or None


# ── #3 SAFETY — apolloGRD (single uniform segment) ─────────────────────────

def _safety_grid_default(duration_sec: float) -> List[Dict[str, Any]]:
    """Single segment spanning the whole file — never empty, never raises."""
    return [{
        "label": "track #1",
        "role": "phrase",
        "start": 0.0,
        "end": round(max(0.0, float(duration_sec)), 3),
        "cluster": -1,
        "engine": "apolloGRD",
    }]


# ── helpers ────────────────────────────────────────────────────────────────

def _l2norm(mat: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(mat, axis=1, keepdims=True)
    return mat / np.clip(n, 1e-9, None)


def _checkerboard_kernel(half_width: int) -> np.ndarray:
    size = 2 * half_width + 1
    k = np.zeros((size, size), dtype=np.float64)
    for i in range(size):
        for j in range(size):
            s_i = 1 if i > half_width else (-1 if i < half_width else 0)
            s_j = 1 if j > half_width else (-1 if j < half_width else 0)
            k[i, j] = s_i * s_j
    return k


def _checkerboard_novelty(ssm: np.ndarray, half_width: int) -> np.ndarray:
    """Compute Foote novelty curve via diagonal SSM × checkerboard convolution.

    Performance fix (audit P3): the per-frame Python loop was O(N² · L²) — a
    10-min track at 100 fps was ~9 × 10⁸ ops. ``scipy.signal.fftconvolve``
    drops this to O(N² log N), about 200× faster on long tracks; we slice
    the result's main diagonal to recover the novelty time series.
    """
    kernel = _checkerboard_kernel(half_width)
    n_frames = ssm.shape[0]
    try:
        from scipy.signal import fftconvolve
        # 2-D convolution → take main diagonal as the novelty curve.
        full = fftconvolve(ssm, kernel, mode="same")
        novelty = np.diag(full).astype(np.float64)
    except Exception:
        # Fallback (numerical / memory edge): keep original windowed loop.
        novelty = np.zeros(n_frames, dtype=np.float64)
        pad = half_width
        padded = np.pad(ssm, pad, mode="edge")
        for t in range(n_frames):
            window = padded[t : t + 2 * pad + 1, t : t + 2 * pad + 1]
            novelty[t] = float((window * kernel).sum())
    # Normalise to [0, 1] then clip negative values to 0.
    novelty -= novelty.min()
    if novelty.max() > 0:
        novelty /= novelty.max()
    return novelty


def _peak_pick(novelty: np.ndarray, window: int, threshold: float) -> np.ndarray:
    from scipy.ndimage import maximum_filter1d

    max_filt = maximum_filter1d(novelty, size=max(3, 2 * window + 1))
    peaks = np.where((novelty == max_filt) & (novelty >= threshold))[0]
    return peaks


def _snap_to_downbeats(times: np.ndarray, downbeats: np.ndarray) -> List[float]:
    if downbeats.size == 0 or times.size == 0:
        return [float(t) for t in times]
    snapped: List[float] = []
    for t in times:
        idx = int(np.argmin(np.abs(downbeats - t)))
        snapped.append(float(downbeats[idx]))
    return sorted(set(snapped))


def _estimate_bpm(beat_times: np.ndarray) -> float:
    if beat_times.size < 2:
        return 124.0
    intervals = np.diff(beat_times)
    intervals = intervals[(intervals > 0.2) & (intervals < 1.5)]
    if intervals.size == 0:
        return 124.0
    return float(60.0 / float(np.median(intervals)))


def _assign_roles(cluster_ids: List[int], energies: List[float]) -> List[str]:
    """Map cluster ids to intro/verse/chorus/drop/bridge/outro by heuristics."""
    n = len(cluster_ids)
    if n == 0:
        return []
    roles: List[str] = ["verse"] * n
    roles[0] = "intro"
    roles[-1] = "outro"

    # Drop = highest-energy non-edge segment
    if n >= 3:
        mid_energies = energies[1:-1]
        drop_idx = 1 + int(np.argmax(mid_energies))
        roles[drop_idx] = "drop"

    # Chorus = most-recurring middle cluster (not intro/outro/drop)
    middle = list(range(1, n - 1))
    counts: Dict[int, int] = {}
    for i in middle:
        counts[cluster_ids[i]] = counts.get(cluster_ids[i], 0) + 1
    if counts:
        chorus_cluster = max(counts.items(), key=lambda kv: kv[1])[0]
        for i in middle:
            if roles[i] == "verse" and cluster_ids[i] == chorus_cluster:
                roles[i] = "chorus"

    # Bridge = a singleton cluster appearing once in the middle
    singletons = [i for i in middle if counts.get(cluster_ids[i], 0) == 1 and roles[i] == "verse"]
    if singletons:
        roles[singletons[-1]] = "bridge"

    return roles
