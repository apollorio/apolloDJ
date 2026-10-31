"""Analysis facade for apolloDJ PRO — STRICT podium order.

Top-3 Podium for BPM + Key (precision first, then degraded fallbacks):
  1. libraz/bpm-detector   — `BPMDetector` + `NewKeyDetector` (Python, MIT)
  2. apolloBPK             — BeatNet-equivalent CRNN→DBN, librosa-only
                              (`apollodj.ingest.bpm_key_detection`; our version)
  3. Legacy hybrid_bpm     — madmom + beat_this + wavebeat consensus (subprocess)

Extra safety-net tiers (never removed):
  4. librosa beat_track + harmonic.detect_key()
  5. pydub deterministic constant (always returns)

Returns a normalized dict compatible with the ingest pipeline.
"""
from __future__ import annotations

import contextlib
import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional


def _legacy_root() -> Path:
    root = Path(__file__).resolve().parents[3]
    return root / "_superseeded" / "apolloDJ-exe"


@contextlib.contextmanager
def _legacy_sys_path():
    """Temporarily expose legacy package roots for intra-module imports."""
    legacy = _legacy_root()
    injected = [str(legacy), str(legacy / "core"), str(legacy / "utils")]
    original = list(sys.path)
    for p in injected:
        if p not in sys.path:
            sys.path.insert(0, p)
    try:
        yield
    finally:
        sys.path[:] = original


def _load_legacy_class(rel_file: str, class_name: str) -> type:
    full_path = _legacy_root() / "core" / rel_file
    with _legacy_sys_path():
        spec = importlib.util.spec_from_file_location(f"legacy_{class_name.lower()}", full_path)
        if spec is None or spec.loader is None:
            raise ImportError(f"Cannot load {class_name} from {full_path}")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return getattr(module, class_name)


# ── Tier 1: libraz/bpm-detector ─────────────────────────────────────────────


def _bpm_detector_run(path: str) -> Optional[Dict[str, Any]]:
    """Run libraz/bpm-detector BPMDetector + NewKeyDetector."""
    try:
        import librosa
        from bpm_detector.music_analyzer import BPMDetector, NewKeyDetector
    except Exception:
        return None

    try:
        y, sr = librosa.load(path, sr=None, mono=True)
    except Exception:
        return None

    try:
        det = BPMDetector()
        bpm_result = det.detect(y, sr)
    except Exception:
        return None

    if isinstance(bpm_result, dict):
        bpm = bpm_result.get("bpm") or bpm_result.get("tempo")
        bpm_conf = bpm_result.get("confidence", 0.9)
    elif isinstance(bpm_result, (list, tuple)) and bpm_result:
        bpm = float(bpm_result[0])
        bpm_conf = float(bpm_result[1]) if len(bpm_result) > 1 else 0.9
    else:
        try:
            bpm = float(bpm_result)
            bpm_conf = 0.9
        except Exception:
            return None

    key_data: Dict[str, Any] = {}
    try:
        kd = NewKeyDetector()
        key_data = kd.detect_key(y, sr) if hasattr(kd, "detect_key") else kd.detect(y, sr)
    except Exception:
        key_data = {}

    return {
        "bpm": float(bpm) if bpm is not None else None,
        "bpm_confidence": float(bpm_conf),
        "beat_times": [],
        "downbeat_cues": [],
        "hotcues": [],
        "energy": None,
        "key": (key_data or {}).get("camelot") or (key_data or {}).get("key"),
        "key_note": (key_data or {}).get("note") or (key_data or {}).get("tonic"),
        "key_mode": (key_data or {}).get("mode"),
        "key_confidence": float((key_data or {}).get("confidence", 0.85)),
        "source": "bpm_detector_libraz",
    }


# ── Tier 2: apolloBPK (BeatNet-equivalent, librosa-only — our reimplementation) ─


def _apollobpk_run(path: str) -> Optional[Dict[str, Any]]:
    """Run our standalone BeatNet-equivalent (no torch / no madmom dep).

    Delegates to :func:`apollodj.ingest.bpm_key_detection.bpm_key_detection`
    which encapsulates the full apolloBPK podium internally
    (apolloBPK → apolloLBR → apolloSAF). We accept only ``apolloBPK`` /
    ``apolloLBR`` results here; ``apolloSAF`` is a deterministic safety
    net that should engage at the outer tier-5 level only.
    """
    try:
        from .bpm_key_detection import bpm_key_detection
    except Exception:
        return None

    try:
        result = bpm_key_detection(path)
    except Exception:
        return None

    if not result or not result.get("bpm"):
        return None
    if result.get("engine") == "apolloSAF":
        return None
    # Normalise to the analyzer's canonical shape (add hotcues/energy keys).
    result.setdefault("hotcues", [])
    result.setdefault("energy", None)
    result["source"] = result.get("source", "apolloBPK")
    return result


# ── Tier 3: Legacy hybrid_bpm (bounded subprocess) ──────────────────────────


def _run_legacy_subprocess(path: str, timeout_sec: float) -> Optional[Dict[str, Any]]:
    """Run legacy analyzers in a bounded subprocess to avoid hangs."""
    root = Path(__file__).resolve().parents[3]
    script = (
        "import importlib.util, json, sys; "
        "from pathlib import Path; "
        "track=Path(sys.argv[1]); root=Path(sys.argv[2]); legacy=root/'_superseeded'/'apolloDJ-exe'; "
        "sys.path.insert(0,str(legacy)); sys.path.insert(0,str(legacy/'core')); sys.path.insert(0,str(legacy/'utils')); "
        "def load(rel, cls): "
        " p=legacy/'core'/rel; s=importlib.util.spec_from_file_location('legacy_'+cls.lower(), p); "
        " m=importlib.util.module_from_spec(s); s.loader.exec_module(m); return getattr(m, cls); "
        "Hybrid=load('hybrid_bpm.py','HybridBPMAnalyzer'); "
        "Key=load('key_analyzer.py','KeyAnalyzer'); "
        "b=Hybrid().analyze_beatgrid(str(track)); "
        "k=Key().analyze(str(track)); "
        "print(json.dumps({'bpm': b.get('bpm'), 'bpm_confidence': b.get('confidence'), "
        "'beat_times': b.get('beat_times', []), 'downbeat_cues': b.get('downbeat_cues', []), "
        "'hotcues': b.get('hotcues', []), 'energy': b.get('energy', []), "
        "'key': k.get('camelot'), 'key_note': k.get('note'), 'key_mode': k.get('mode'), "
        "'key_confidence': k.get('confidence'), 'source': 'legacy_hybrid_bpm_key'}))"
    )
    try:
        proc = subprocess.run(
            [sys.executable, "-c", script, str(path), str(root)],
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            check=False,
        )
    except (subprocess.TimeoutExpired, OSError):
        return None
    if proc.returncode != 0:
        return None
    lines = [ln.strip() for ln in proc.stdout.splitlines() if ln.strip()]
    if not lines:
        return None
    try:
        return json.loads(lines[-1])
    except json.JSONDecodeError:
        return None


# ── Tier 4: librosa quick ────────────────────────────────────────────────────


def _librosa_bpm(path: str) -> Dict[str, Any]:
    import librosa

    y, sr = librosa.load(path, sr=22050, mono=True)
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, trim=False)
    beat_times = librosa.frames_to_time(beats, sr=sr).tolist()
    return {
        "bpm": float(tempo),
        "bpm_confidence": 0.6,
        "beat_times": beat_times,
        "downbeat_cues": [],
        "hotcues": [],
    }


# ── Tier 5: pydub deterministic ──────────────────────────────────────────────


def _pydub_quick(path: str) -> Dict[str, Any]:
    from pydub import AudioSegment

    seg = AudioSegment.from_file(path)
    duration = len(seg) / 1000.0
    return {
        "bpm": 124.0,
        "bpm_confidence": 0.2,
        "beat_times": [0.0, max(0.0, duration / 2.0)],
        "downbeat_cues": [],
        "hotcues": [],
    }


# ── Public API ───────────────────────────────────────────────────────────────


def analyze(path: str) -> Dict[str, Any]:
    """Run full BPM + Key + energy analysis on a track.

    Strict mode: tries bpm-detector → BeatNet → legacy hybrid (subprocess) →
    librosa+harmonic → pydub constant. Never raises.
    """
    skip = os.environ.get("APOLLODJ_DISABLE_TIERS", "").split(",")

    if "bpm_detector" not in skip:
        try:
            tier1 = _bpm_detector_run(path)
            if tier1 and tier1.get("bpm"):
                return tier1
        except Exception:
            pass

    if "apollobpk" not in skip and "beatnet" not in skip:
        # `beatnet` kept as an alias of `apollobpk` for backward-compat env vars.
        try:
            tier2 = _apollobpk_run(path)
            if tier2 and tier2.get("bpm"):
                return tier2
        except Exception:
            pass

    timeout_sec = float(os.environ.get("APOLLODJ_LEGACY_ANALYZER_TIMEOUT_SEC", "25"))
    if "legacy" not in skip:
        try:
            tier3 = _run_legacy_subprocess(path, timeout_sec=timeout_sec)
            if tier3 is not None:
                return tier3
        except Exception:
            pass

    try:
        from . import harmonic, energy_score

        bpm_data = _librosa_bpm(path)
        key_data = harmonic.detect_key(path)
        energy_data = energy_score.score(path)
        downbeats: List[float] = []
        try:
            from .downbeat import downbeat_detection

            downbeats = downbeat_detection(path)
        except Exception:
            pass
        return {
            "bpm": bpm_data.get("bpm"),
            "bpm_confidence": bpm_data.get("bpm_confidence"),
            "beat_times": bpm_data.get("beat_times", []),
            "downbeat_cues": downbeats or bpm_data.get("downbeat_cues", []),
            "hotcues": bpm_data.get("hotcues", []),
            "energy": energy_data.get("energy"),
            "key": key_data.get("camelot"),
            "key_note": key_data.get("note"),
            "key_mode": key_data.get("mode"),
            "key_confidence": key_data.get("confidence"),
            "source": "librosa_plus_harmonic",
        }
    except Exception:
        pass

    quick = _pydub_quick(path)
    return {
        "bpm": quick.get("bpm"),
        "bpm_confidence": quick.get("bpm_confidence"),
        "beat_times": quick.get("beat_times", []),
        "downbeat_cues": quick.get("downbeat_cues", []),
        "hotcues": quick.get("hotcues", []),
        "energy": 5.0,
        "key": "8A",
        "key_note": "A",
        "key_mode": "minor",
        "key_confidence": 0.0,
        "source": "pydub_quick",
    }
