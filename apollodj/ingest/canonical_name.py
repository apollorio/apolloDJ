"""Canonical filename builder for apolloDJ PRO.

Produces: Artist - Title [Mix/Edit] - BPM - Key.ext
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import Optional


def _sanitize(text: str) -> str:
    """Remove filesystem-illegal characters and normalize unicode."""
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r'[\\/:*?"<>|]', "_", text)
    return text.strip()


def build(
    artist: str,
    title: str,
    mix_edit: Optional[str],
    bpm: int,
    key: str,
    ext: str,
) -> str:
    """Return a safe, canonical track filename."""
    artist = _sanitize(artist) or "Unknown Artist"
    title = _sanitize(title) or "Untitled"
    mix = f" [{_sanitize(mix_edit)}]" if mix_edit else ""
    bpm_str = str(int(bpm))
    key = _sanitize(key).upper()

    return f"{artist} - {title}{mix} - {bpm_str} - {key}{ext}"