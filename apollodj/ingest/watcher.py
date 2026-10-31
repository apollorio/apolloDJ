"""Drag & drop and Inbox watcher — single entry point for the auto-ingest flowchart.

Trigger sources:
  (a) pywebview drag-drop via IngestBridge.ingest_track / ingest_folder
  (b) Folder watcher on ~/apolloDJ/Caixa de Entrada/ (started from nicotine_autostart)

Every audio file received here goes through the FULL 6-stage pipeline
(pipeline.run → commit=True): FLAC→WAV conversion, QC, BPM/Key analysis,
metadata, canonical rename, approval routing, sidecar write.

NEVER do partial analysis here. The flowchart has one path only.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Callable, List

from ..conf.paths import INBOX_DIR, TRACKS_ANALISE_DIR

logger = logging.getLogger(__name__)

AUDIO_EXTS = {".mp3", ".flac", ".wav", ".aiff", ".aif", ".m4a", ".ogg", ".aac"}


def process_file(
    src: Path,
    on_progress: Callable[[str], None] | None = None,
) -> Path | None:
    """Full flowchart for a single audio file.

    Steps (all delegated to pipeline.run):
      01 Format detection + FLAC→WAV temp decode
      02 Audio QC  (LUFS, True Peak, Clipping, Silence, Corruption)
      03 Musical analysis (BPM/Key/Energy/Structure/HotCues)
      04 Metadata normalisation + MusicBrainz enrichment
      05 Canonical rename   Artist - Title [Mix] - BPM - Key.ext
      06 Approval routing   → Coletânea (PASS) | Duvidosos (FAIL)
         + sidecar .apollodj.json
    """
    from .pipeline import run  # lazy import avoids circular deps

    TRACKS_ANALISE_DIR.mkdir(parents=True, exist_ok=True)

    # Always copy source into 0. Em Analise first (non-destructive ownership)
    if src.parent != TRACKS_ANALISE_DIR:
        working_src = TRACKS_ANALISE_DIR / src.name
        try:
            import shutil as _sh
            _sh.copy2(str(src), str(working_src))
        except Exception:
            working_src.write_bytes(src.read_bytes())
    else:
        working_src = src

    if on_progress:
        on_progress(f"Preparando {src.name}…")

    # Pre-process: full DJ Prep Pro chain (trim → headroom → loudness → BPM/Key).
    # We run analysis ONCE here and hand the result (+ canonical name) to the
    # pipeline so it does NOT re-analyze / re-lookup MusicBrainz (≈2× faster).
    prep_analysis: dict | None = None
    canonical: str | None = None
    try:
        from . import dj_prep_pro  # lazy — avoids circular deps
        prep_report = dj_prep_pro.prep(working_src, commit=False)
        if prep_report.get("final_path"):
            working_src = Path(prep_report["final_path"])
        prep_analysis = prep_report.get("analysis") or None
        canonical = (prep_report.get("steps", {}).get("06_rename", {}) or {}).get("canonical")
    except Exception as exc:
        logger.warning("dj_prep_pro ignorado para %s (continuando com pipeline): %s", src.name, exc)

    if on_progress:
        on_progress(f"Analisando {src.name}…")

    # Only do the (network) MusicBrainz enrichment if prep didn't already give
    # us a canonical name to apply.
    enrich = canonical is None
    try:
        report = run(
            str(working_src),
            commit=True,
            enrich_metadata=enrich,
            precomputed_analysis=prep_analysis,
            canonical_override=canonical,
        )
    except Exception as exc:
        logger.error("Pipeline falhou para %s: %s", src.name, exc)
        return None

    # Clean the non-destructive staging copy left in 0. Em Análise (the routed
    # file lives in Coletânea/Duvidosos now; the original source is untouched).
    try:
        staging_copy = TRACKS_ANALISE_DIR / src.name
        if staging_copy.exists() and staging_copy.resolve() != Path(working_src).resolve():
            staging_copy.unlink(missing_ok=True)
    except OSError:
        pass

    verdict = report.get("verdict", "FAIL")
    routed = report.get("routed")

    if on_progress:
        if routed:
            on_progress(f"{'Pronto' if verdict == 'PASS' else 'Rejeitado'}: {Path(routed).name}")
        else:
            on_progress(f"Pipeline concluído ({verdict}): {src.name}")

    return Path(routed) if routed else None


def process_folder(folder: Path, on_progress: Callable[[str], None] | None = None) -> List[Path]:
    """Process all audio files in a folder (non-recursive)."""
    results: List[Path] = []
    for f in folder.iterdir():
        if f.is_file() and f.suffix.lower() in AUDIO_EXTS:
            try:
                res = process_file(f, on_progress)
                if res:
                    results.append(res)
            except Exception as exc:
                logger.warning("Falha ao processar %s: %s", f, exc)
    return results
