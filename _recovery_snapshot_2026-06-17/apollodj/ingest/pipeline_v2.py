"""Pipeline v2 — async, fingerprint-first, atomic ingest orchestrator.

Drop-in successor to ``ingest/pipeline.py``. Composes the 12 stages from the
v2 architecture: stage → validate → fingerprint → metadata → dj_prep_pro +
heavy analysis → quality gate → rename → atomic commit → XML commit → playlist link →
background export index.

Public API:
    run_v2(source_path: str, target_playlist: str | None = None) -> dict

Returns a structured report compatible with the existing pipeline result
shape so callers (watcher, bridge, audit) keep working.

Studied from Rekordbox import flow + media-library best practice; our
architecture (queue + fingerprint-first + atomic commit) avoids three known
Rekordbox failure modes:
    1) re-analysing the same audio on every playlist drop
    2) corrupting the library DB on power loss mid-write
    3) blocking the UI thread on heavy DSP
"""
from __future__ import annotations

import logging
import os
import re
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

from ..conf.paths import PLAYLISTS_DIR, TRACKS_ANALISE_DIR, TRACKS_COLETANEA_DIR, TRACKS_DUVIDOSOS_DIR
from . import fingerprint as fp_mod
from . import quality_gate as qg
from . import xml_db
from .state_machine import TrackState, emit

logger = logging.getLogger(__name__)


def run_v2(source_path: str, target_playlist: Optional[str] = None) -> Dict[str, Any]:
    """Execute the v2 ingest pipeline on a single audio file.

    Args:
        source_path: Absolute or relative path to a dropped audio file.
        target_playlist: Optional playlist name the file is being dropped into.
            Used by stage 11 to attach a ``<playlistRef>`` without re-analysing
            if fingerprint stage finds a match.

    Returns:
        Structured report: ``{verdict, track_id, fingerprint, stages, warn?, ...}``.
    """
    track_id = str(uuid.uuid4())
    report: Dict[str, Any] = {
        "track_id": track_id,
        "source": str(source_path),
        "target_playlist": target_playlist,
        "stages": {},
    }
    src = Path(source_path).expanduser().resolve()
    if not src.is_file():
        report["verdict"] = "FAIL"
        report["reason"] = "source_not_found"
        report["warn"] = {"msg": "Arquivo de origem não encontrado."}
        emit(track_id, TrackState.REJECTED, {"reason": "source_not_found", "warn": report["warn"]})
        return report

    # ── 01 enqueue (caller already enqueued; we mark the event) ─────────────
    emit(track_id, TrackState.QUEUED, {"source": str(src)})

    # ── 02 stage UUID copy into 00 Em análise ───────────────────────────────
    TRACKS_ANALISE_DIR.mkdir(parents=True, exist_ok=True)
    staged = TRACKS_ANALISE_DIR / f"tmp_{track_id[:8]}{src.suffix.lower()}"
    try:
        shutil.copy2(src, staged)
    except Exception as exc:
        report["verdict"] = "FAIL"
        report["reason"] = f"stage_copy_failed: {exc!r}"
        report["warn"] = {"msg": "Falha ao copiar para análise."}
        emit(track_id, TrackState.REJECTED, {"reason": report["reason"], "warn": report["warn"]})
        return report
    report["stages"]["02_stage"] = {"staged_path": str(staged)}
    emit(track_id, TrackState.STAGED, {"path": str(staged)})

    # ── 03 fast validate via ffprobe ────────────────────────────────────────
    valid = _fast_validate(staged)
    report["stages"]["03_validate"] = valid
    if not valid.get("ok"):
        _route_to_duvidosos(staged, "quality")
        report["verdict"] = "FAIL"
        report["reason"] = valid.get("reason", "validate_failed")
        report["warn"] = {"msg": f"Validação rápida falhou: {report['reason']}"}
        emit(track_id, TrackState.REJECTED, {"reason": report["reason"], "warn": report["warn"]})
        return report
    emit(track_id, TrackState.VALIDATED, valid)

    # ── 04 FINGERPRINT FIRST ────────────────────────────────────────────────
    fp = fp_mod.fingerprint_track(str(staged))
    report["fingerprint"] = fp
    report["stages"]["04_fingerprint"] = {"fp": fp}
    emit(track_id, TrackState.FINGERPRINTED, {"fp": fp})

    existing = xml_db.lookup(fp)
    if existing:
        # HIT — skip analysis, just attach playlist reference and remove staged tmp.
        if target_playlist:
            xml_db.attach_playlist(fp, target_playlist)
            # Mirror the playlist attach into the master XML heart (best-effort).
            from . import master_xml as _mx
            _mx.record_committed_track(existing.get("path", ""), playlist=target_playlist)
        try:
            staged.unlink(missing_ok=True)
        except Exception:
            pass
        report["verdict"] = "PASS_DEDUP"
        report["existing_track"] = existing
        emit(track_id, TrackState.READY, {"dedup": True, "playlist": target_playlist})
        return report

    # ── 05 metadata-first (cheap mutagen scan) ──────────────────────────────
    metadata = _read_metadata_quick(staged)
    report["stages"]["05_metadata"] = metadata
    emit(track_id, TrackState.METADATA, metadata)

    # ── 06 dj_prep_pro + heavy analysis (LUFS, headroom, waveform, energy) ──
    emit(track_id, TrackState.ANALYZING)
    work_path, prep_report = _run_dj_prep_pro(staged)
    report["stages"]["06_dj_prep"] = {
        k: v for k, v in prep_report.items() if k not in ("_current", "analysis")
    }
    analysis = _merge_analysis(work_path, prep_report)
    report["stages"]["06_analysis"] = analysis

    # ── 07 quality gate (+ club-playability warn) ───────────────────────────
    prep_steps = prep_report.get("steps") or {}
    qc = _run_audio_qc(work_path)
    report["stages"]["07_qc"] = qc
    cdj = _run_cdj_audit(work_path)
    report["stages"]["07_cdj"] = cdj

    qmetrics = {
        "duration": valid.get("duration_sec", 0),
        "clipping": analysis.get("clipping_ratio", 0),
        "bitrate": valid.get("bitrate_kbps", 0),
        "analysis_confidence": analysis.get("bpm_confidence", 0),
        "corruption": analysis.get("corruption", False),
    }
    qres = qg.score(qmetrics)
    club_warn = qg.club_playability_warn(
        qmetrics, prep_steps=prep_steps, qc=qc, cdj_audit=cdj,
    ) or qres.warn
    report["stages"]["07_quality"] = {
        "score": qres.score,
        "passed": qres.passed,
        "breakdown": qres.breakdown,
        "reasons": qres.reasons,
        "club_warn": club_warn,
    }
    if club_warn:
        report["warn"] = club_warn
    emit(track_id, TrackState.QUALITY, {"score": qres.score, "passed": qres.passed, "warn": club_warn})
    if not qres.passed:
        _route_to_duvidosos(work_path if work_path.is_file() else staged, "quality")
        report["verdict"] = "FAIL"
        report["reason"] = f"quality_score_below_threshold ({qres.score:.1f})"
        fail_warn = club_warn or {"msg": f"Qualidade abaixo do limite ({qres.score:.0f}/100)"}
        report["warn"] = fail_warn
        emit(track_id, TrackState.REJECTED, {"score": qres.score, "warn": fail_warn})
        return report

    # ── 08 canonical rename ─────────────────────────────────────────────────
    from .canonical_name import build as build_name
    from .mix_edit_parser import extract as extract_mix

    mix = extract_mix(src.name) or ""
    bpm = int(round(float(analysis.get("bpm") or 0)))
    out_ext = work_path.suffix.lower() if work_path.is_file() else src.suffix.lower()
    canonical = build_name(
        artist=metadata.get("artist") or "Unknown",
        title=metadata.get("title") or src.stem,
        mix_edit=mix,
        bpm=bpm,
        key=analysis.get("key") or "?",
        ext=out_ext,
    )
    report["stages"]["08_rename"] = {"canonical": canonical}
    emit(track_id, TrackState.RENAMED, {"name": canonical})

    # ── 09 atomic commit os.replace → Coletânea ─────────────────────────────
    TRACKS_COLETANEA_DIR.mkdir(parents=True, exist_ok=True)
    final = TRACKS_COLETANEA_DIR / canonical
    commit_src = work_path if work_path.is_file() else staged
    try:
        os.replace(commit_src, final)
    except OSError:
        shutil.copy2(commit_src, final)
        try:
            commit_src.unlink(missing_ok=True)
        except Exception:
            pass
    # Remove staging copy if different from committed source.
    if staged.is_file() and staged.resolve() != final.resolve():
        try:
            staged.unlink(missing_ok=True)
        except Exception:
            pass
    report["stages"]["09_commit"] = {"final_path": str(final)}
    emit(track_id, TrackState.COMMITTED, {"path": str(final)})

    # Sidecar with full analysis payload (energy curve, waveform path, prep meta).
    _write_sidecar(final, analysis, qres.score, prep_steps)

    # ── 10 XML commit AFTER file commit ────────────────────────────────────
    xml_db.upsert_track(fp, {
        "path": str(final),
        "bpm": analysis.get("bpm"),
        "key": analysis.get("key"),
        "energy": analysis.get("energy"),
        "quality": qres.score,
        "playlists": {target_playlist} if target_playlist else set(),
    })
    # Mirror the committed track into the master XML heart (Rekordbox/USB export
    # source) — best-effort: a mirror failure must never fail a good ingest.
    from . import master_xml as _mx
    _mx.record_committed_track(
        final, playlist=target_playlist,
        title=metadata.get("title") or "", artist=metadata.get("artist") or "",
    )
    report["stages"]["10_xml"] = {"fingerprint": fp}
    emit(track_id, TrackState.INDEXED, {"fp": fp})

    # ── 11 playlist link (handled inside upsert_track if target given) ──────
    # ── 12 background export index (sidecar + rekordbox + serato + CDJ XML) ─
    export_report = _run_background_export(report, final, target_playlist)
    report["stages"]["12_export"] = export_report

    report["verdict"] = "PASS"
    ready_extra: Dict[str, Any] = {"path": str(final), "fp": fp}
    if club_warn:
        ready_extra["warn"] = club_warn
        report["verdict"] = "PASS_WARN"
    emit(track_id, TrackState.READY, ready_extra)
    return report


# ─────────────────────────────────────────────────────────────────────────────
# Helper stages
# ─────────────────────────────────────────────────────────────────────────────

def _run_dj_prep_pro(staged: Path) -> tuple[Path, Dict[str, Any]]:
    """Run DJ Prep Pro chain on staged audio; return working path + report."""
    try:
        from . import dj_prep_pro

        prep_report = dj_prep_pro.prep(staged, commit=False)
    except Exception as exc:
        logger.warning("dj_prep_pro skipped for %s: %s", staged, exc)
        return staged, {"verdict": "SKIP", "steps": {}, "analysis": {}, "error": repr(exc)}

    final_raw = prep_report.get("final_path")
    if final_raw:
        final = Path(final_raw)
        if final.is_file():
            return final, prep_report
    return staged, prep_report


def _merge_analysis(work_path: Path, prep_report: Dict[str, Any]) -> Dict[str, Any]:
    """Merge dj_prep_pro analysis with waveform / spectral enrichment."""
    analysis: Dict[str, Any] = dict(prep_report.get("analysis") or {})
    if not analysis.get("bpm"):
        analysis.update(_heavy_analyze(work_path))

    prep_steps = prep_report.get("steps") or {}
    loud = prep_steps.get("03_loudness") or {}
    head = prep_steps.get("02_headroom") or {}
    if loud.get("output_lufs") is not None:
        analysis["lufs"] = loud.get("output_lufs")
    elif loud.get("lufs") is not None:
        analysis["lufs"] = loud.get("lufs")
    if head.get("gain_db") is not None:
        analysis["gain_eq_db"] = head.get("gain_db")
    if head.get("ceiling_db") is not None:
        analysis["true_peak_db"] = head.get("ceiling_db")

    if not analysis.get("energy"):
        try:
            from . import energy_score

            energy = energy_score.score(work_path)
            analysis["energy"] = energy.get("energy")
            analysis["energy_source"] = energy.get("source")
        except Exception:
            pass

    if not analysis.get("waveform_path"):
        try:
            from ..ui import waveform as wf_mod

            wf = wf_mod.render(work_path)
            if wf.get("path"):
                analysis["waveform_path"] = wf["path"]
                analysis["waveform_engine"] = wf.get("engine")
        except Exception as exc:
            logger.debug("Waveform render skipped for %s: %s", work_path, exc)

    analysis["track_path"] = str(work_path)
    return analysis


def _run_audio_qc(path: Path) -> Dict[str, Any]:
    try:
        from . import audio_qc

        return audio_qc.run_qc(path)
    except Exception as exc:
        return {"qc": "SKIP", "reasons": [repr(exc)]}


def _run_cdj_audit(path: Path) -> Dict[str, Any]:
    try:
        from . import cdj_auditor

        return cdj_auditor.audit(path)
    except Exception as exc:
        return {"cdj_ok": True, "skipped": True, "error": repr(exc)}


def _write_sidecar(
    final: Path,
    analysis: Dict[str, Any],
    quality_score: float,
    prep_steps: Dict[str, Any],
) -> None:
    try:
        from . import sidecar

        payload = {
            **analysis,
            "quality_score": quality_score,
            "dj_prep_steps": prep_steps,
        }
        sidecar.write(final, payload)
    except Exception as exc:
        logger.debug("Sidecar write skipped for %s: %s", final, exc)


def _safe_playlist_name(name: str) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", name).strip().rstrip(".")
    return cleaned or "apolloDJ"


def _tracks_for_export(report: Dict[str, Any], final: Path) -> list:
    from .parsers.track_model import Track

    primary = Track.from_pipeline_v2_report({**report, "stages": {**report.get("stages", {}), "09_commit": {"final_path": str(final)}}})
    primary.path = final
    try:
        entries = xml_db.all_tracks()
    except Exception:
        return [primary]
    if not entries:
        return [primary]

    tracks: list[Track] = []
    for entry in entries:
        path_raw = entry.get("path") or ""
        path = Path(path_raw) if path_raw else final
        tracks.append(Track(
            fingerprint=str(entry.get("fingerprint") or ""),
            path=path,
            bpm=_float_or_none(entry.get("bpm")),
            key=entry.get("key"),
            energy=_float_or_none(entry.get("energy")),
            quality_score=_float_or_none(entry.get("quality")) or 0.0,
            playlists=sorted(entry.get("playlists") or []),
        ))
    return tracks or [primary]


def _float_or_none(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _run_background_export(
    report: Dict[str, Any],
    final: Path,
    target_playlist: Optional[str],
) -> Dict[str, Any]:
    """Stage 12 — update Playlists/ index via universal exporters (best-effort)."""
    out: Dict[str, Any] = {"ok": True, "writers": {}}
    try:
        from .exporters import rekordbox_xml, serato_crates, sidecar_export
        from .parsers.track_model import Track

        track = Track.from_pipeline_v2_report(report)
        track.path = final

        sidecar_paths = sidecar_export.export_sidecars([track], final.parent)
        out["writers"]["sidecar"] = [str(p) for p in sidecar_paths]

        PLAYLISTS_DIR.mkdir(parents=True, exist_ok=True)
        all_tracks = _tracks_for_export(report, final)

        master_xml = PLAYLISTS_DIR / "coletanea.rekordbox.xml"
        rekordbox_xml.write_xml(all_tracks, master_xml, playlist_name="Coletânea")
        out["writers"]["rekordbox_xml"] = str(master_xml)

        if target_playlist:
            pl_xml = PLAYLISTS_DIR / f"{_safe_playlist_name(target_playlist)}.rekordbox.xml"
            pl_tracks = [t for t in all_tracks if target_playlist in (t.playlists or [])]
            rekordbox_xml.write_xml(pl_tracks or [track], pl_xml, playlist_name=target_playlist)
            out["writers"]["playlist_xml"] = str(pl_xml)

        crate_path = PLAYLISTS_DIR / "coletanea.crate"
        serato_crates.write_crate(all_tracks, crate_path, crate_name="Coletânea")
        out["writers"]["serato_crate"] = str(crate_path)

        # Universal CDJ XML index (pointer layout — full USB copy is usb_exporter).
        cdj_index = PLAYLISTS_DIR / "UniversalCDJ"
        cdj_index.mkdir(parents=True, exist_ok=True)
        cdj_xml = cdj_index / f"{_safe_playlist_name(target_playlist or 'Coletânea')}.xml"
        rekordbox_xml.write_xml([track], cdj_xml, playlist_name=target_playlist or "Coletânea")
        out["writers"]["universal_cdj"] = {"xml_path": str(cdj_xml), "engine": "xml_index_only"}
    except Exception as exc:
        logger.warning("Background export index failed: %s", exc)
        out["ok"] = False
        out["error"] = repr(exc)
    return out


def _fast_validate(p: Path) -> Dict[str, Any]:
    """50 ms ffprobe scan — exists/codec/size/duration/bitrate."""
    if not p.is_file():
        return {"ok": False, "reason": "missing"}
    size = p.stat().st_size
    if size < 32 * 1024:
        return {"ok": False, "reason": "too_small", "bytes": size}
    try:
        cmd = ["ffprobe", "-v", "error", "-show_entries",
               "format=duration,bit_rate:stream=codec_type",
               "-of", "default=noprint_wrappers=1", str(p)]
        out = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=10
        ).stdout
        kv: Dict[str, str] = {}
        for line in out.splitlines():
            if "=" in line:
                k, v = line.split("=", 1)
                kv[k.strip()] = v.strip()
        duration = float(kv.get("duration", "0") or 0)
        bitrate_kbps = int(int(kv.get("bit_rate", "0") or 0) / 1000)
        if duration < 30.0:
            return {"ok": False, "reason": "too_short", "duration_sec": duration}
        return {"ok": True, "duration_sec": duration, "bitrate_kbps": bitrate_kbps, "bytes": size}
    except Exception as exc:
        return {"ok": True, "warning": f"probe_skipped: {exc!r}",
                "duration_sec": 0.0, "bitrate_kbps": 0, "bytes": size}


def _read_metadata_quick(p: Path) -> Dict[str, Any]:
    """Cheap mutagen tag read — no DSP."""
    try:
        from mutagen import File as MutagenFile
        f = MutagenFile(str(p))
        if not f:
            return {}
        tags = getattr(f, "tags", {}) or {}
        def _g(*keys: str) -> Optional[str]:
            for k in keys:
                v = tags.get(k)
                if v:
                    return str(v[0]) if isinstance(v, list) else str(v)
            return None
        return {
            "artist": _g("TPE1", "artist", "ARTIST"),
            "title": _g("TIT2", "title", "TITLE"),
            "album": _g("TALB", "album", "ALBUM"),
            "year": _g("TDRC", "date", "DATE"),
            "duration_sec": float(getattr(getattr(f, "info", None), "length", 0) or 0),
        }
    except Exception:
        return {}


def _heavy_analyze(p: Path) -> Dict[str, Any]:
    """Delegate to the existing analyzer facade (apolloBPK tier inside)."""
    try:
        from . import analyzer
        return analyzer.analyze(str(p))
    except Exception as exc:
        logger.warning("Heavy analysis failed for %s: %s", p, exc)
        return {"bpm": None, "bpm_confidence": 0.0, "key": None, "error": repr(exc)}


def _route_to_duvidosos(staged: Path, bucket: str) -> Path:
    """Move a failed track to Tracks/2. Duvidosos/<bucket>/ (best-effort)."""
    sub = {"quality": "1. Arquivo duvidoso",
           "download": "2. Download falhado",
           "amplificacao": "3. Falha de amplificação"}.get(bucket, "1. Arquivo duvidoso")
    target_dir = TRACKS_DUVIDOSOS_DIR / sub
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / staged.name
    try:
        os.replace(staged, target)
    except Exception:
        try:
            shutil.copy2(staged, target)
            staged.unlink(missing_ok=True)
        except Exception:
            pass
    return target
