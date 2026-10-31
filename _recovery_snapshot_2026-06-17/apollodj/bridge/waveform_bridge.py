"""Waveform bridge — DJ Tools Pro analysis + cue/annotation persistence.

Exposed to the pywebview shell as ``window.pywebview.api.waveform.*``.

JS usage (pywebview desktop shell)::

    const wf = window.pywebview.api.waveform;
    const analysis = await wf.get_track_analysis(trackPath);
    await wf.save_cue_points(trackPath, { hotcues, memcues, loops });
    await wf.save_notes(trackPath, notes);
    await wf.render_waveform_png(trackPath);

Sidecar schema (``.apollodj.json`` → ``analysis`` object)::

    hotcues   — [{ n?, bar?, time, label|name, note?, color?, type? }]
    smart_hotcues — pipeline-generated (read-only fallback when hotcues empty)
    memcues   — [{ bar, name, time? }]
    loops     — [{ bar, bars|length, name, active? }]
    notes     — [{ time, text, cat }]   cat ∈ NOTA|MIX|FX|VOCAL|WARN
"""
from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

from ..conf.paths import ANALYSIS_CACHE_DIR, SPECTROGRAM_DIR
from ..ingest import sidecar

logger = logging.getLogger(__name__)

_AUDIO_EXTS = frozenset({
    ".mp3", ".flac", ".wav", ".aif", ".aiff", ".m4a", ".aac", ".ogg",
})


def _cache_path(track: Path) -> Path:
    digest = hashlib.sha256(str(track.resolve()).encode("utf-8")).hexdigest()[:16]
    return ANALYSIS_CACHE_DIR / f"{digest}.json"


def _read_analysis_cache(track: Path) -> dict[str, Any] | None:
    path = _cache_path(track)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _write_analysis_cache(track: Path, analysis: dict[str, Any]) -> None:
    ANALYSIS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    payload = {**analysis, "track_path": str(track)}
    path = _cache_path(track)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def _load_sidecar_analysis(track: Path) -> dict[str, Any]:
    raw = sidecar.read(track)
    if not raw:
        return {}
    analysis = raw.get("analysis")
    return dict(analysis) if isinstance(analysis, dict) else {}


def _bar_from_time(time_sec: float, bpm: float) -> float:
    if bpm <= 0:
        return 0.0
    return time_sec * bpm / 60.0 / 4.0


def _time_from_bar(bar: float, bpm: float) -> float:
    if bpm <= 0:
        return 0.0
    return bar * 4.0 * 60.0 / bpm


def _normalize_hotcue(raw: dict[str, Any], index: int, bpm: float) -> dict[str, Any]:
    bpm_f = float(bpm or 128.0)
    time_sec = raw.get("time")
    bar = raw.get("bar")
    if bar is None and time_sec is not None:
        bar = _bar_from_time(float(time_sec), bpm_f)
    if time_sec is None and bar is not None:
        time_sec = _time_from_bar(float(bar), bpm_f)
    name = raw.get("name") or raw.get("label") or raw.get("type") or f"CUE {index + 1}"
    return {
        "n": int(raw.get("n") or index + 1),
        "bar": float(bar or 0.0),
        "time": round(float(time_sec or 0.0), 4),
        "name": str(name),
        "label": str(name),
        "note": str(raw.get("note") or ""),
        "color": str(raw.get("color") or ""),
    }


def _normalize_memcue(raw: dict[str, Any], bpm: float) -> dict[str, Any]:
    bpm_f = float(bpm or 128.0)
    bar = raw.get("bar")
    time_sec = raw.get("time")
    if bar is None and time_sec is not None:
        bar = _bar_from_time(float(time_sec), bpm_f)
    if time_sec is None and bar is not None:
        time_sec = _time_from_bar(float(bar), bpm_f)
    return {
        "bar": float(bar or 0.0),
        "time": round(float(time_sec or 0.0), 4),
        "name": str(raw.get("name") or "M"),
    }


def _normalize_loop(raw: dict[str, Any]) -> dict[str, Any]:
    bars = raw.get("bars")
    if bars is None:
        bars = raw.get("length") or 4
    return {
        "bar": float(raw.get("bar") or 0.0),
        "bars": int(bars),
        "name": str(raw.get("name") or "Loop"),
        "active": bool(raw.get("active", False)),
    }


def _normalize_note(raw: dict[str, Any]) -> dict[str, Any]:
    cat = str(raw.get("cat") or "NOTA").upper()
    if cat not in {"NOTA", "MIX", "FX", "VOCAL", "WARN"}:
        cat = "NOTA"
    return {
        "time": round(float(raw.get("time") or 0.0), 4),
        "text": str(raw.get("text") or ""),
        "cat": cat,
    }


def _resolve_waveform_path(track: Path, analysis: dict[str, Any]) -> str:
    wf = analysis.get("waveform_path")
    if wf and Path(wf).is_file():
        return str(wf)
    if SPECTROGRAM_DIR.is_dir():
        matches = sorted(SPECTROGRAM_DIR.glob(f"{track.stem}_*.png"))
        if matches:
            return str(matches[-1])
    return str(wf or "")


def _tags_fallback(track: Path) -> dict[str, Any]:
    try:
        import mutagen

        audio = mutagen.File(str(track), easy=True)
        if audio is None:
            return {}
        bpm_raw = audio.get("bpm")
        key_raw = audio.get("initialkey") or audio.get("key")
        info = getattr(audio, "info", None)
        out: dict[str, Any] = {}
        if bpm_raw:
            out["bpm"] = float(bpm_raw[0])
        if key_raw:
            out["key"] = str(key_raw[0])
        if info is not None and getattr(info, "length", None):
            out["duration_sec"] = float(info.length)
        return out
    except Exception:
        return {}


class WaveformBridge:
    """Methods exposed as ``window.pywebview.api.waveform``."""

    def get_track_analysis(self, path: str) -> dict[str, Any]:
        """Load BPM, key, cues, loops, notes, waveform path/energy for a track."""
        track = Path(path)
        if not track.is_file() or track.suffix.lower() not in _AUDIO_EXTS:
            return {"ok": False, "path": str(path), "error": "not_a_track"}

        source = "empty"
        analysis = _load_sidecar_analysis(track)
        if analysis:
            source = "sidecar"
        else:
            cached = _read_analysis_cache(track)
            if cached:
                analysis = cached
                source = "cache"
            else:
                tag_meta = _tags_fallback(track)
                if tag_meta:
                    analysis = tag_meta
                    source = "tags"

        bpm = float(analysis.get("bpm") or 128.0)
        hot_raw = analysis.get("hotcues") or analysis.get("smart_hotcues") or []
        hotcues = [
            _normalize_hotcue(hc if isinstance(hc, dict) else {}, i, bpm)
            for i, hc in enumerate(hot_raw[:8])
        ]
        memcues = [
            _normalize_memcue(mc, bpm)
            for mc in (analysis.get("memcues") or analysis.get("memory_cues") or [])
            if isinstance(mc, dict)
        ]
        loops = [
            _normalize_loop(lp)
            for lp in (analysis.get("loops") or analysis.get("memory_loops") or [])
            if isinstance(lp, dict)
        ]
        notes = [
            _normalize_note(n)
            for n in (analysis.get("notes") or [])
            if isinstance(n, dict)
        ]

        energy = analysis.get("energy")
        if energy is None:
            energy = analysis.get("energy_score")

        return {
            "ok": True,
            "path": str(track),
            "source": source,
            "bpm": analysis.get("bpm"),
            "key": analysis.get("key") or analysis.get("key_note") or analysis.get("camelot"),
            "duration_sec": analysis.get("duration_sec"),
            "energy": energy,
            "energy_curve": analysis.get("energy_curve") or analysis.get("energy"),
            "waveform_path": _resolve_waveform_path(track, analysis),
            "waveform_engine": analysis.get("waveform_engine"),
            "hotcues": hotcues,
            "memcues": memcues,
            "loops": loops,
            "notes": notes,
            "sections": analysis.get("sections") or [],
        }

    def save_cue_points(self, path: str, cues: list | dict) -> dict[str, Any]:
        """Persist hot cues, memory cues, and loops into the track sidecar."""
        track = Path(path)
        if not track.is_file() or track.suffix.lower() not in _AUDIO_EXTS:
            return {"ok": False, "path": str(path), "error": "not_a_track"}

        payload: dict[str, Any]
        if isinstance(cues, dict):
            payload = cues
        elif isinstance(cues, list) and cues and isinstance(cues[0], dict) and (
            "hotcues" in cues[0] or "memcues" in cues[0] or "loops" in cues[0]
        ):
            payload = cues[0]
        elif isinstance(cues, list):
            payload = {"hotcues": cues}
        else:
            return {"ok": False, "error": "invalid_cues_payload"}

        analysis = _load_sidecar_analysis(track) or _read_analysis_cache(track) or {}
        bpm = float(analysis.get("bpm") or 128.0)

        if "hotcues" in payload:
            hot = [
                _normalize_hotcue(hc, i, bpm)
                for i, hc in enumerate(payload.get("hotcues") or [])
                if isinstance(hc, dict)
            ][:8]
            analysis["hotcues"] = hot
        if "memcues" in payload:
            analysis["memcues"] = [
                _normalize_memcue(mc, bpm)
                for mc in (payload.get("memcues") or [])
                if isinstance(mc, dict)
            ]
        if "loops" in payload:
            analysis["loops"] = [
                _normalize_loop(lp)
                for lp in (payload.get("loops") or [])
                if isinstance(lp, dict)
            ]

        try:
            sidecar.write(track, analysis)
            _write_analysis_cache(track, analysis)
            return {
                "ok": True,
                "path": str(track),
                "saved": {
                    "hotcues": len(analysis.get("hotcues") or []),
                    "memcues": len(analysis.get("memcues") or []),
                    "loops": len(analysis.get("loops") or []),
                },
            }
        except Exception as exc:
            logger.warning("save_cue_points failed for %s: %s", track, exc)
            return {"ok": False, "path": str(track), "error": str(exc)}

    def save_notes(self, path: str, notes: list) -> dict[str, Any]:
        """Persist annotation notes into the track sidecar."""
        track = Path(path)
        if not track.is_file() or track.suffix.lower() not in _AUDIO_EXTS:
            return {"ok": False, "path": str(path), "error": "not_a_track"}

        normalized = [
            _normalize_note(n)
            for n in (notes or [])
            if isinstance(n, dict)
        ]
        normalized.sort(key=lambda n: n["time"])

        analysis = _load_sidecar_analysis(track) or _read_analysis_cache(track) or {}
        analysis["notes"] = normalized
        try:
            sidecar.write(track, analysis)
            _write_analysis_cache(track, analysis)
            return {"ok": True, "path": str(track), "count": len(normalized)}
        except Exception as exc:
            logger.warning("save_notes failed for %s: %s", track, exc)
            return {"ok": False, "path": str(track), "error": str(exc)}

    def render_waveform_png(self, path: str, width: int = 2500, height: int = 300) -> dict[str, Any]:
        """Render waveform PNG via ``ui.waveform.render`` and persist path in sidecar."""
        track = Path(path)
        if not track.is_file() or track.suffix.lower() not in _AUDIO_EXTS:
            return {"ok": False, "path": str(path), "error": "not_a_track"}

        try:
            from ..ui import waveform as wf_mod

            result = wf_mod.render(track, width=int(width), height=int(height))
        except Exception as exc:
            logger.warning("render_waveform_png failed for %s: %s", track, exc)
            return {"ok": False, "path": str(track), "error": str(exc)}

        png_path = result.get("path")
        if not png_path:
            return {"ok": False, "path": str(track), "error": "render_failed"}

        analysis = _load_sidecar_analysis(track) or _read_analysis_cache(track) or {}
        analysis["waveform_path"] = png_path
        analysis["waveform_engine"] = result.get("engine")
        try:
            sidecar.write(track, analysis)
            _write_analysis_cache(track, analysis)
        except Exception as exc:
            logger.debug("sidecar update after waveform render skipped: %s", exc)

        return {
            "ok": True,
            "path": str(track),
            "waveform_path": png_path,
            "engine": result.get("engine"),
        }
