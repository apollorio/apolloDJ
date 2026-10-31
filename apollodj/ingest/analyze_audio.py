"""Compatibility wrapper for strict plan naming.

Canonical implementation lives in :mod:`apollodj.ingest.analyzer`.
"""
from __future__ import annotations

from .analyzer import analyze


def analyze_audio(path: str):
    """Backwards-compatible alias used by older plan references."""
    return analyze(path)


__all__ = ["analyze", "analyze_audio"]
