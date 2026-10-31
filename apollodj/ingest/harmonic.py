"""Camelot harmonic mixing helpers.

Top 3 Podium:
  1. legacy _superseeded/core/harmonic_mixer.py
     (HPSS + CQT + Krumhansl-Schmuckler + Camelot — Mixed-In-Key grade)
  2. bpm-detector key.py (Krumhansl-Schmuckler stand-alone)
  3. librosa chroma_cqt + KS template match (manual fallback)
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Dict, List, Optional

CAMELOT_WHEEL: List[str] = [
    "1A", "1B", "2A", "2B", "3A", "3B", "4A", "4B", "5A", "5B", "6A", "6B",
    "7A", "7B", "8A", "8B", "9A", "9B", "10A", "10B", "11A", "11B", "12A", "12B",
]


def _load_legacy_mixer() -> Optional[type]:
    root = Path(__file__).resolve().parents[3]
    for cand in (
        root / "_superseeded" / "core" / "harmonic_mixer.py",
        root / "_superseeded" / "apolloDJ-exe" / "core" / "harmonic_mixer.py",
    ):
        if not cand.exists():
            continue
        spec = importlib.util.spec_from_file_location("legacy_harmonic", cand)
        if not spec or not spec.loader:
            continue
        mod = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(mod)
            return getattr(mod, "HarmonicMixer", None)
        except Exception:
            continue
    return None


def detect_key(path: str | Path) -> Dict[str, Any]:
    """Return ``{"camelot": str, "note": str, "mode": str, "confidence": float, "source": str}``."""
    Mixer = _load_legacy_mixer()
    if Mixer is not None:
        try:
            res = Mixer().analyze(str(path))
            return {
                "camelot": res.get("camelot"),
                "note": res.get("note"),
                "mode": res.get("mode"),
                "confidence": res.get("confidence", 0.0),
                "source": "legacy_harmonic_mixer",
            }
        except Exception:
            pass

    try:
        from bpm_detector.key import detect_key as bd_detect_key
        res = bd_detect_key(str(path))
        return {
            "camelot": res.get("camelot"),
            "note": res.get("key"),
            "mode": res.get("mode"),
            "confidence": res.get("confidence", 0.0),
            "source": "bpm_detector_key",
        }
    except Exception:
        pass

    return _librosa_ks_fallback(str(path))


def _librosa_ks_fallback(path: str) -> Dict[str, Any]:
    import numpy as np
    import librosa
    y, sr = librosa.load(path, sr=22050, mono=True)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr).mean(axis=1)
    major = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
    minor = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
    scores = []
    for i in range(12):
        scores.append(("maj", i, float(np.corrcoef(chroma, np.roll(major, i))[0, 1])))
        scores.append(("min", i, float(np.corrcoef(chroma, np.roll(minor, i))[0, 1])))
    scores.sort(key=lambda s: s[2], reverse=True)
    mode, root, conf = scores[0]
    notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    camelot_map_major = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"]
    camelot_map_minor = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"]
    camelot = (camelot_map_major if mode == "maj" else camelot_map_minor)[root]
    return {
        "camelot": camelot,
        "note": notes[root],
        "mode": "major" if mode == "maj" else "minor",
        "confidence": conf,
        "source": "librosa_ks_fallback",
    }


def compatible(camelot_a: str, camelot_b: str) -> bool:
    """Return True when two Camelot keys are harmonically compatible."""
    if camelot_a == camelot_b:
        return True
    try:
        n_a, l_a = int(camelot_a[:-1]), camelot_a[-1]
        n_b, l_b = int(camelot_b[:-1]), camelot_b[-1]
    except Exception:
        return False
    if l_a == l_b and abs(n_a - n_b) in (0, 1, 11):
        return True
    if l_a != l_b and n_a == n_b:
        return True
    return False
