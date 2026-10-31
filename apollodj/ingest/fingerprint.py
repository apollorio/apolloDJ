"""Pipeline v2 — Audio fingerprint (Chromaprint / SHA-256 fallback).

Used by the v2 ingest pipeline to detect duplicate audio BEFORE running
expensive DSP analysis. A fingerprint hit lets us skip BPM/key/structure
entirely and just attach a new ``<playlistRef>`` to the existing track.

Podium (function never raises):
    #1 MAIN     Chromaprint via ``pyacoustid`` (acoustic fingerprint —
                same audio with different encoding still matches)
    #2 FALLBACK SHA-256 of decoded PCM via ffprobe + ffmpeg pipe
                (exact-bytes match — different encodes won't match but
                same-file re-imports do)
    #3 SAFETY   SHA-256 of raw file bytes (fastest, encoding-sensitive)
"""
from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path
from typing import Optional


def fingerprint_track(track_path: str) -> str:
    """Return a deterministic fingerprint string for a track file.

    Studied from AcoustID / Chromaprint design — our resilient version.

    Args:
        track_path: Absolute or relative path to an audio file.

    Returns:
        A string of the form ``"<algo>:<hex>"`` where ``<algo>`` is one of
        ``chromaprint``, ``pcm_sha256``, or ``raw_sha256``. Never empty,
        never raises — falls through to raw SHA-256 of the file as last resort.
    """
    p = Path(track_path).expanduser().resolve()
    if not p.is_file():
        return "missing:0000000000"

    fp = _tier1_chromaprint(p)
    if fp:
        return f"chromaprint:{fp}"

    fp = _tier2_pcm_sha256(p)
    if fp:
        return f"pcm_sha256:{fp}"

    return f"raw_sha256:{_tier3_raw_sha256(p)}"


def _tier1_chromaprint(p: Path) -> Optional[str]:
    """Acoustic fingerprint via Chromaprint (encoding-independent)."""
    try:
        import acoustid  # type: ignore
        duration, fp = acoustid.fingerprint_file(str(p))
        if isinstance(fp, bytes):
            fp = fp.decode("ascii", errors="ignore")
        return f"{int(round(duration))}-{fp}"
    except Exception:
        return None


def _tier2_pcm_sha256(p: Path) -> Optional[str]:
    """SHA-256 of the decoded mono 22050 Hz s16 stream (re-encoding-stable)."""
    try:
        cmd = [
            "ffmpeg", "-nostdin", "-loglevel", "error",
            "-i", str(p),
            "-ac", "1", "-ar", "22050", "-f", "s16le", "-",
        ]
        h = hashlib.sha256()
        with subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as proc:
            assert proc.stdout is not None
            for chunk in iter(lambda: proc.stdout.read(64 * 1024), b""):
                h.update(chunk)
            proc.wait(timeout=120)
            if proc.returncode != 0:
                return None
        return h.hexdigest()[:32]  # 128-bit truncation is plenty for dedup
    except Exception:
        return None


def _tier3_raw_sha256(p: Path) -> str:
    """Raw file SHA-256 — fast, exact-bytes only."""
    h = hashlib.sha256()
    with p.open("rb") as fh:
        for chunk in iter(lambda: fh.read(64 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()[:32]
