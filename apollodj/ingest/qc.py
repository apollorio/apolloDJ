"""Compatibility wrapper for strict plan naming.

Canonical implementation lives in :mod:`apollodj.ingest.audio_qc`.
"""
from __future__ import annotations

from .audio_qc import run_qc

__all__ = ["run_qc"]
