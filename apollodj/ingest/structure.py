"""Song structure / section detection (intro / verse / chorus / drop / outro).

Top 3 Podium:
  1. bpm-detector structure.py (purpose-built, returns labelled sections)
  2. apolloSEC (apollodj.ingest.section_detection.detect_sections)
     — Studied from madmom/BeatNet logic only — our version.
     Foote SSM + checkerboard novelty + k-means, librosa+scipy only.
  3. librosa segmentation (recurrence + agglomerative clustering)
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List


def detect_sections(path: str | Path) -> Dict[str, Any]:
    """Return ``{"sections": [{"label","start","end"}], "source": str}``."""

    try:
        from bpm_detector import analyze_track
        res = analyze_track(str(path))
        sections = []
        for item in getattr(res, "song_sections", None) or res.get("song_sections", []):
            label, start, end = item
            sections.append({"label": str(label), "start": float(start), "end": float(end)})
        if sections:
            return {"sections": sections, "source": "bpm_detector_structure"}
    except Exception:
        pass

    # Tier 2: apolloSEC — librosa-only BeatNet/madmom-inspired pipeline
    try:
        from .section_detection import detect_sections as apollosec_detect
        sec_list = apollosec_detect(str(path))
        if sec_list and sec_list[0].get("engine") != "apolloGRD":
            return {
                "sections": [
                    {"label": s["label"], "start": s["start"], "end": s["end"], "role": s["role"]}
                    for s in sec_list
                ],
                "source": f"apolloSEC ({sec_list[0].get('engine', 'apolloSEC')})",
            }
    except Exception:
        pass

    try:
        return _librosa_downbeat_phrases(str(path))
    except Exception:
        pass

    return _librosa_segments(str(path))


def _librosa_downbeat_phrases(path: str) -> Dict[str, Any]:
    from .downbeat import downbeat_detection

    bars: List[float] = downbeat_detection(path)
    sections: List[Dict[str, Any]] = []
    phrase = 16
    for i in range(0, len(bars) - phrase, phrase):
        sections.append({
            "label": f"phrase_{i // phrase + 1}",
            "start": bars[i],
            "end": bars[i + phrase],
        })
    return {"sections": sections, "source": "librosa_downbeats"}


def _librosa_segments(path: str) -> Dict[str, Any]:
    import numpy as np
    import librosa
    y, sr = librosa.load(path, sr=22050, mono=True)
    bounds = librosa.segment.agglomerative(librosa.feature.mfcc(y=y, sr=sr), k=6)
    times = librosa.frames_to_time(bounds, sr=sr)
    sections = []
    labels = ["intro", "verse", "chorus", "drop", "bridge", "outro"]
    for i, (s, e) in enumerate(zip(times[:-1], times[1:])):
        sections.append({"label": labels[i % len(labels)], "start": float(s), "end": float(e)})
    return {"sections": sections, "source": "librosa_segments"}
