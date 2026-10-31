"""One-click DJ Prep Pro — audio prep orchestrator.

Chain (registry ``one_click_dj_prep_pro`` + ``_references/map.md`` Stack A):
  01 silence_trim → 02 headroom → 03 loudness (dual-pass) →
  04 BPM/Key analysis → 05 smart hotcues → 06 canonical rename.

Delegates every step to existing ingest modules (Top-3 Podium tiers).
Uses a single working WAV under ``~/apolloDJ/Dados/temp_wav/`` (resolved via
``conf.paths.TEMP_WAV_DIR``) to avoid re-decoding the source between ffmpeg passes.

``commit=False`` (default): returns processed path without rename/tags.
``commit=True``: writes tags + sidecar and renames in the source folder.
"""
from __future__ import annotations

import logging
import os
import shutil
from pathlib import Path
from typing import Any, Callable, Dict
from uuid import uuid4

from ..conf.paths import TEMP_WAV_DIR, ensure_paths
from . import canonical_name, harmonic, hotcue_smart, mix_edit_parser, musicbrainz, sidecar
from .loudness import TARGET_LUFS, TRUE_PEAK_CEILING

logger = logging.getLogger(__name__)

_PREP_OUT_EXT = ".wav"


def _step_path(work_stem: Path, label: str) -> Path:
    return work_stem.parent / f"{work_stem.name}.{label}{_PREP_OUT_EXT}"


def _run_step(
    report: Dict[str, Any],
    key: str,
    fn: Callable[[], Dict[str, Any]],
) -> None:
    """Run one chain step; keep ``report['_current']`` on failure."""
    try:
        step = fn()
        report["steps"][key] = step
        out = step.get("output")
        if out:
            path_out = Path(out)
            if path_out.is_file():
                report["_current"] = path_out
    except Exception as exc:
        logger.warning("DJ Prep Pro step %s skipped: %s", key, exc)
        report["steps"][key] = {"skipped": True, "error": repr(exc)}


def _cleanup_intermediates(*paths: Path, keep: Path) -> None:
    keep_resolved = keep.resolve()
    for p in paths:
        try:
            if p.is_file() and p.resolve() != keep_resolved:
                p.unlink(missing_ok=True)
        except OSError:
            pass


def prep(
    track_path: str | Path,
    *,
    weak: bool = False,
    target_lufs: float = TARGET_LUFS,
    true_peak: float = TRUE_PEAK_CEILING,
    commit: bool = False,
) -> Dict[str, Any]:
    """Run the full DJ Prep Pro chain on ``track_path``.

    Returns a structured report with ``verdict`` (``PASS``|``FAIL``),
    ``final_path``, ``steps``, and ``analysis``.
    """
    src = Path(track_path)
    report: Dict[str, Any] = {
        "input": str(src),
        "steps": {},
        "analysis": {},
        "verdict": "FAIL",
        "final_path": None,
        "_current": src,
    }

    if not src.is_file():
        report["reason"] = "missing_input"
        report.pop("_current", None)
        return report

    ensure_paths()
    TEMP_WAV_DIR.mkdir(parents=True, exist_ok=True)

    work_stem = TEMP_WAV_DIR / f"{src.stem}_djprep_{uuid4().hex[:10]}"
    trim_out = _step_path(work_stem, "01_trim")
    head_out = _step_path(work_stem, "02_headroom")
    loud_out = _step_path(work_stem, "03_loud")

    # ── 01 Silence trim (_references Stack A: pydub trim_silence first) ─────
    def _trim() -> Dict[str, Any]:
        from . import silence_trim

        meta = silence_trim.trim(report["_current"], trim_out)
        return {"output": str(trim_out), **meta}

    _run_step(report, "01_silence_trim", _trim)

    # ── 02 Headroom (M-Igashi / legacy / ffmpeg — registry podium) ───────────
    def _headroom() -> Dict[str, Any]:
        from . import headroom

        meta = headroom.apply_headroom(report["_current"], head_out, ceiling_db=true_peak)
        return {"output": str(head_out), **meta}

    _run_step(report, "02_headroom", _headroom)

    # ── 03 Loudness dual-pass (EBU R128, CDJ 44.1k/stereo/s16) ─────────────
    def _loudness() -> Dict[str, Any]:
        from . import loudness

        meta = loudness.normalize(
            report["_current"],
            loud_out,
            target_lufs=target_lufs,
            true_peak=true_peak,
            weak=weak,
        )
        if meta.get("warning") == "no_write_capability":
            shutil.copy2(str(report["_current"]), str(loud_out))
        return {"output": str(loud_out), **meta}

    _run_step(report, "03_loudness", _loudness)

    current: Path = report["_current"]
    _cleanup_intermediates(trim_out, head_out, keep=current)

    # ── 04 BPM + Key (bpm-detector → BeatNet → legacy → librosa) ───────────
    from . import analyzer, energy_score, structure

    analysis: Dict[str, Any] = {}
    try:
        analysis = analyzer.analyze(str(current))
        if not analysis.get("key"):
            analysis.update(harmonic.detect_key(current))
        sections = structure.detect_sections(current)
        energy = energy_score.score(current)
        analysis["sections"] = sections.get("sections")
        analysis["energy"] = energy.get("energy")
        analysis["energy_source"] = energy.get("source")
        report["steps"]["04_analysis"] = {
            "source": analysis.get("source"),
            "bpm": analysis.get("bpm"),
            "key": analysis.get("key") or analysis.get("key_note"),
        }
    except Exception as exc:
        logger.warning("DJ Prep Pro analysis failed: %s", exc)
        report["steps"]["04_analysis"] = {"skipped": True, "error": repr(exc)}

    analysis["track_path"] = str(current)
    report["analysis"] = analysis

    # ── 05 Smart hotcues (Stack C: structure + downbeats + energy) ─────────
    try:
        cues = hotcue_smart.smart_cues(analysis)
        analysis["smart_hotcues"] = cues.get("hotcues")
        report["steps"]["05_hotcues"] = {
            "source": cues.get("source"),
            "count": len(cues.get("hotcues") or []),
        }
    except Exception as exc:
        report["steps"]["05_hotcues"] = {"skipped": True, "error": repr(exc)}

    # ── 06 Smart rename + optional tag commit ───────────────────────────────
    # Resolve artist/title from the ORIGINAL filename (``src``), never from the
    # processed temp file (``current``, e.g. "*_djprep_*.03_loud.wav") whose
    # name would otherwise leak into the canonical title.
    mb = musicbrainz.lookup(src)
    mix_label = mix_edit_parser.extract(src.name) or ""
    bpm_val = analysis.get("bpm")
    bpm_int = int(round(float(bpm_val))) if bpm_val is not None else 0
    display_key = analysis.get("key_note") or analysis.get("key") or "?"
    canonical = canonical_name.build(
        artist=mb.get("artist") or "Unknown",
        title=mb.get("title") or src.stem,
        mix_edit=mix_label or None,
        bpm=bpm_int,
        key=str(display_key),
        ext=_PREP_OUT_EXT,
    )
    report["steps"]["06_rename"] = {"canonical": canonical, "commit": commit}

    final_path = current
    if commit:
        from . import tagger

        dest = src.parent / canonical
        if dest.resolve() != current.resolve():
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists():
                dest = dest.with_name(f"{dest.stem} ({os.getpid()}){dest.suffix}")
            os.replace(str(current), str(dest))
            final_path = dest
        tagger.write_tags(
            final_path,
            {
                "bpm": bpm_int,
                "key": str(display_key),
                "energy": analysis.get("energy"),
                "title": mb.get("title"),
                "artist": mb.get("artist"),
            },
        )
        sidecar.write(final_path, analysis)

    report["final_path"] = str(final_path)
    report["verdict"] = "PASS" if analysis.get("bpm") and final_path.exists() else "FAIL"
    report.pop("_current", None)
    return report
