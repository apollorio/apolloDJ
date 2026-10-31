"""6-stage ingest orchestrator (single entry point).

Stages (per technical spec):
  01 Format Detection & Conversion -> converter.decode_to_wav
  02 Audio QC                      -> audio_qc.run_qc
  03 Musical Analysis              -> analyzer.analyze (+ harmonic, structure, energy)
  04 Metadata Normalization        -> tagger.write_tags + musicbrainz enrichment
  05 Naming                        -> canonical_name.build
  06 Approval & Export             -> approval.route_track

Optional pre-stages: silence_trim, dc_phase, headroom, loudness.

This module is intentionally side-effect-light: it does not move files
unless ``commit=True``. Always returns a structured report.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Optional

from . import (
    analyzer,
    approval,
    audio_qc,
    canonical_name,
    cdj_auditor,
    converter,
    energy_score,
    harmonic,
    hotcue_smart,
    mix_edit_parser,
    musicbrainz,
    sidecar,
    structure,
    tagger,
)


def _qc_reason_to_route(reasons: list[str]) -> str:
    blob = ";".join(reasons).lower()
    if "true_peak" in blob or "clipping" in blob or "lufs" in blob:
        return "amplificacao"
    if "download" in blob:
        return "download"
    return "quality"


def run(track_path: str | Path, *, commit: bool = False,
        enrich_metadata: bool = True,
        precomputed_analysis: Dict[str, Any] | None = None,
        canonical_override: str | None = None) -> Dict[str, Any]:
    """Run the full 6-stage pipeline against ``track_path``.

    ``precomputed_analysis`` (from a prior DJ-Prep pass) skips the heavy
    re-analysis (BPM/Key/structure/energy/hotcues) so the watcher does NOT
    analyze every track twice. ``canonical_override`` supplies the final
    ``Artist - Title [Mix] - BPM - Key.ext`` name directly (skips the duplicate
    MusicBrainz lookup); it is applied to the file on commit via the router.
    """
    src = Path(track_path)
    report: Dict[str, Any] = {"input": str(src), "stages": {}}

    work_path = src
    if converter.needs_decode(src):
        wav = converter.decode_to_wav(src)
        report["stages"]["01_convert"] = {"temp_wav": str(wav)}
        work_path = wav
    else:
        report["stages"]["01_convert"] = {"temp_wav": None, "skipped": True}

    qc = audio_qc.run_qc(work_path)
    report["stages"]["02_qc"] = qc

    if qc.get("qc") == "FAIL":
        report["verdict"] = "FAIL"
        reason_route = _qc_reason_to_route(qc.get("reasons") or [])
        report["reason"] = reason_route
        if commit:
            report["routed"] = str(
                approval.route_track(src, "FAIL", reason_route, new_name=canonical_override)
            )
        return report

    if precomputed_analysis:
        analysis = dict(precomputed_analysis)
        report["stages"]["03_analysis"] = {"reused": True, **analysis}
    else:
        analysis = analyzer.analyze(str(work_path))
        if not analysis.get("key"):
            analysis.update(harmonic.detect_key(work_path))
        sections = structure.detect_sections(work_path)
        energy = energy_score.score(work_path)
        analysis["sections"] = sections.get("sections")
        analysis["energy"] = energy.get("energy")
        analysis["energy_source"] = energy.get("source")
        cues = hotcue_smart.smart_cues(analysis)
        analysis["smart_hotcues"] = cues.get("hotcues")
        report["stages"]["03_analysis"] = analysis

    metadata_fields: Dict[str, Any] = {
        "bpm": analysis.get("bpm"),
        "key": analysis.get("key"),
        "energy": analysis.get("energy"),
        "lufs": qc.get("lufs"),
        "qc": qc.get("qc"),
    }
    if enrich_metadata:
        mb = musicbrainz.lookup(src)
        metadata_fields.setdefault("artist", mb.get("artist"))
        metadata_fields.setdefault("title", mb.get("title"))
        report["stages"]["04_metadata_lookup"] = mb

    if commit:
        report["stages"]["04_tagging"] = tagger.write_tags(src, metadata_fields)
    else:
        report["stages"]["04_tagging"] = {"dry_run": True, "fields": metadata_fields}

    mix_label = mix_edit_parser.extract(src.name) or ""
    if canonical_override:
        canonical = canonical_override
    else:
        bpm_int = int(round(float(metadata_fields.get("bpm") or 0)))
        canonical = canonical_name.build(
            artist=metadata_fields.get("artist") or "Unknown",
            title=metadata_fields.get("title") or src.stem,
            mix_edit=mix_label,
            bpm=bpm_int,
            key=metadata_fields.get("key") or "?",
            ext=src.suffix,
        )
    report["stages"]["05_name"] = {"canonical": canonical, "mix_edit": mix_label}

    cdj = cdj_auditor.audit(src)
    report["stages"]["06_cdj_preflight"] = cdj

    cdj_ready = bool(cdj.get("cdj_ready", True))
    report["verdict"] = "PASS" if cdj_ready else "FAIL"
    if not cdj_ready:
        report["reason"] = "quality"

    if commit:
        if cdj_ready:
            final_path = approval.route_track(src, "PASS", new_name=canonical)
        else:
            final_path = approval.route_track(src, "FAIL", "quality", new_name=canonical)
        report["routed"] = str(final_path)
        sidecar.write(final_path, analysis)
    return report


def run_optional_preprocess(src: str | Path, *, dst: Optional[str | Path] = None,
                            do_silence_trim: bool = False,
                            do_dc_phase: bool = False,
                            do_headroom: bool = False,
                            do_loudness: bool = False) -> Dict[str, Any]:
    """Optional preprocessing chain — runs only what is explicitly requested."""
    from . import dc_phase, headroom, loudness, silence_trim

    current = Path(src)
    out = Path(dst) if dst else current.with_suffix(".pre.wav")
    report: Dict[str, Any] = {"input": str(current), "steps": []}

    if do_silence_trim:
        report["steps"].append({"silence_trim": silence_trim.trim(current, out)})
        current = out
    if do_dc_phase:
        report["steps"].append({"dc_phase": dc_phase.correct(current, out)})
        current = out
    if do_headroom:
        report["steps"].append({"headroom": headroom.apply_headroom(current, out)})
        current = out
    if do_loudness:
        report["steps"].append({"loudness": loudness.normalize(current, out)})
        current = out

    report["output"] = str(current)
    return report
