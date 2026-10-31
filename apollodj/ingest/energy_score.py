"""Stage 03 — Apollo proprietary Energy Score (1-10).

Computed from: RMS, spectral centroid, transient density, loudness, tempo.

Top 3 Podium:
  1. legacy _superseeded/apolloDJ-exe/core/energy_analyzer.py
     (madmom + librosa + RMS + spectral + transients — most accurate)
  2. bpm-detector groove module (groove + RMS proxy)
  3. pydub RMS-only quick score (always available, lowest precision)
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any, Dict, Optional


def _load_legacy_energy() -> Optional[type]:
    root = Path(__file__).resolve().parents[3]
    for candidate in (
        root / "_superseeded" / "apolloDJ-exe" / "core" / "energy_analyzer.py",
        root / "_superseeded" / "core" / "energy_analyzer.py",
    ):
        if candidate.exists():
            spec = importlib.util.spec_from_file_location("legacy_energy", candidate)
            if spec and spec.loader:
                mod = importlib.util.module_from_spec(spec)
                try:
                    spec.loader.exec_module(mod)
                    return getattr(mod, "EnergyAnalyzer", None)
                except Exception:
                    continue
    return None


def _bpm_detector_energy(path: str) -> Optional[float]:
    try:
        from bpm_detector import analyze_track
        res = analyze_track(path)
        return float(getattr(res, "energy", None) or res.get("energy"))
    except Exception:
        return None


def _pydub_rms_energy(path: str) -> float:
    from pydub import AudioSegment
    seg = AudioSegment.from_file(path)
    rms = seg.rms or 1
    norm = min(1.0, rms / 32768.0)
    return max(1.0, min(10.0, 1.0 + norm * 9.0))


def score(path: str | Path) -> Dict[str, Any]:
    """Return ``{"energy": float 1-10, "source": "..."}``"""
    path_s = str(path)

    EnergyCls = _load_legacy_energy()
    if EnergyCls is not None:
        try:
            res = EnergyCls().analyze(path_s)
            value = res.get("energy") if isinstance(res, dict) else getattr(res, "energy", None)
            if value is not None:
                return {"energy": float(value), "source": "legacy_energy_analyzer"}
        except Exception:
            pass

    val = _bpm_detector_energy(path_s)
    if val is not None:
        return {"energy": float(val), "source": "bpm_detector"}

    return {"energy": _pydub_rms_energy(path_s), "source": "pydub_rms"}
