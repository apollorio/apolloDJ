"""Compatibility wrapper for strict plan naming.

Canonical implementation lives in :mod:`apollodj.ingest.canonical_name`.
"""
from __future__ import annotations

from .canonical_name import build


def build_name(artist: str, title: str, mix_edit: str | None, bpm: int, key: str, ext: str) -> str:
    """Backwards-compatible alias for canonical filename generation."""
    return build(artist=artist, title=title, mix_edit=mix_edit, bpm=bpm, key=key, ext=ext)


__all__ = ["build", "build_name"]
