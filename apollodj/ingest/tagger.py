"""Stage 04 — Metadata Normalization & Tag Writing.

Writes TBPM, TKEY, ENERGY, LUFS, QC_STATUS into the file using the official
tag frame for each container.

Top 3 Podium:
  1. mutagen ID3 / FLAC native frames (most accurate, format-correct)
  2. analyze-tag-songs pattern (mutagen wrapper, batch friendly)
  3. ffmpeg -metadata flags (subprocess transcode, lossless re-mux)
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict


def write_tags(path: str | Path, fields: Dict[str, Any]) -> Dict[str, Any]:
    """Write a normalized set of DJ fields into a file.

    ``fields`` keys recognized: bpm, key, energy, lufs, qc, title, artist.
    Returns ``{"written": True, "engine": "mutagen"|"ffmpeg"|"none"}``.
    """
    p = Path(path)
    ext = p.suffix.lower()

    try:
        return _mutagen_write(p, ext, fields)
    except Exception:
        pass

    if shutil.which("ffmpeg"):
        try:
            return _ffmpeg_write(p, fields)
        except Exception:
            pass

    return {"written": False, "engine": "none"}


def _mutagen_write(path: Path, ext: str, fields: Dict[str, Any]) -> Dict[str, Any]:
    if ext == ".mp3":
        from mutagen.mp3 import MP3
        from mutagen.id3 import ID3, TBPM, TKEY, TIT2, TPE1, TXXX
        audio = MP3(str(path))
        if audio.tags is None:
            audio.add_tags()
        if "bpm" in fields:
            audio.tags["TBPM"] = TBPM(encoding=3, text=[str(fields["bpm"])])
        if "key" in fields:
            audio.tags["TKEY"] = TKEY(encoding=3, text=[str(fields["key"])])
        if "title" in fields:
            audio.tags["TIT2"] = TIT2(encoding=3, text=[str(fields["title"])])
        if "artist" in fields:
            audio.tags["TPE1"] = TPE1(encoding=3, text=[str(fields["artist"])])
        for k in ("energy", "lufs", "qc"):
            if k in fields:
                audio.tags[f"TXXX:{k.upper()}"] = TXXX(
                    encoding=3, desc=k.upper(), text=[str(fields[k])]
                )
        audio.save()
        return {"written": True, "engine": "mutagen"}

    if ext == ".flac":
        from mutagen.flac import FLAC
        audio = FLAC(str(path))
        mapping = {
            "bpm": "BPM", "key": "INITIALKEY", "energy": "ENERGY",
            "lufs": "LUFS", "qc": "QC_STATUS",
            "title": "TITLE", "artist": "ARTIST",
        }
        for k, v in fields.items():
            if k in mapping:
                audio[mapping[k]] = str(v)
        audio.save()
        return {"written": True, "engine": "mutagen"}

    if ext in {".m4a", ".aac", ".mp4"}:
        from mutagen.mp4 import MP4
        audio = MP4(str(path))
        if "bpm" in fields:
            audio["tmpo"] = [int(float(fields["bpm"]))]
        if "title" in fields:
            audio["\u00a9nam"] = [str(fields["title"])]
        if "artist" in fields:
            audio["\u00a9ART"] = [str(fields["artist"])]
        for k in ("key", "energy", "lufs", "qc"):
            if k in fields:
                audio[f"----:com.apolloDJ:{k.upper()}"] = [
                    str(fields[k]).encode("utf-8")
                ]
        audio.save()
        return {"written": True, "engine": "mutagen"}

    raise ValueError(f"mutagen path unsupported for {ext}")


def _ffmpeg_write(path: Path, fields: Dict[str, Any]) -> Dict[str, Any]:
    # Keep the real extension (e.g. ".wav") so ffmpeg can choose a muxer —
    # a name like "foo.wav.tag.tmp" makes ffmpeg fail with "Unable to choose
    # an output format". Write to "foo.apollotag.wav" then atomically replace.
    tmp = path.with_name(f"{path.stem}.apollotag{path.suffix}")
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(path)]
    for k, v in fields.items():
        cmd += ["-metadata", f"{k}={v}"]
    cmd += ["-c", "copy", str(tmp)]
    subprocess.run(cmd, check=True)
    tmp.replace(path)
    return {"written": True, "engine": "ffmpeg"}
