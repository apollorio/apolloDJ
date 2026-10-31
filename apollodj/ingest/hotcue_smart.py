"""Smart HotCue placement (8 CDJ memory cues).

Top 3 Podium:
  1. structure.detect_sections + analyzer downbeats + energy peaks
     (Stack C — phrase-aware, energy-aware)
  2. onset_cues.onset_smart_cues (aubio onset+tempo analogue — librosa+scipy)
  3. legacy _superseeded/core/quantizer.py consensus +8 boost
  4. Fixed 16-bar grid (always works, last resort)
"""
from __future__ import annotations

from typing import Any, Dict, List

DEFAULT_LABELS = ["A:Intro", "B:Verse", "C:Chorus", "D:Drop",
                  "E:Bridge", "F:Outro", "G:Memory", "H:Memory"]


def smart_cues(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Given an analysis dict, return ``{"hotcues": [{"label","time"}], "source": str}``."""
    sections = analysis.get("sections") or []
    if sections:
        cues = []
        for i, s in enumerate(sections[:8]):
            cues.append({
                "label": DEFAULT_LABELS[i] if i < len(DEFAULT_LABELS) else f"X:{i}",
                "time": float(s.get("start", 0.0)),
            })
        return {"hotcues": cues, "source": "structure_sections"}

    path = analysis.get("track_path") or analysis.get("path")
    if path:
        try:
            from .onset_cues import onset_smart_cues

            times = onset_smart_cues(str(path))
            if len(times) >= 2:
                return {
                    "hotcues": [
                        {
                            "label": DEFAULT_LABELS[i] if i < len(DEFAULT_LABELS) else f"X:{i}",
                            "time": float(times[i]),
                        }
                        for i in range(min(len(times), 8))
                    ],
                    "source": "aubio_onset_analogue",
                }
        except Exception:
            pass

    beats: List[float] = list(analysis.get("beat_times") or [])
    if beats and len(beats) > 16:
        bpm = float(analysis.get("bpm") or 124.0)
        bars_per_phrase = 16
        beats_per_phrase = bars_per_phrase * 4
        cues = []
        for i in range(0, min(len(beats), 8 * beats_per_phrase), beats_per_phrase):
            cues.append({
                "label": DEFAULT_LABELS[len(cues)] if len(cues) < len(DEFAULT_LABELS) else f"X:{len(cues)}",
                "time": float(beats[i]),
            })
            if len(cues) >= 8:
                break
        return {"hotcues": cues, "source": "downbeat_quantizer"}

    duration = float(analysis.get("duration_sec") or 0.0)
    if duration <= 0:
        return {"hotcues": [], "source": "no_data"}
    step = duration / 8.0
    return {
        "hotcues": [
            {"label": DEFAULT_LABELS[i], "time": round(step * i, 2)}
            for i in range(8)
        ],
        "source": "fixed_grid",
    }
