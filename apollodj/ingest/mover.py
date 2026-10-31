"""Atomic move helper for the auto-ingest pipeline.

Guarantees collision-free placement under ~/apolloDJ/Tracks/.
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path
from typing import Tuple


def _unique_path(target: Path) -> Path:
    """Return a non-existing path by appending ' (n)' if needed."""
    if not target.exists():
        return target
    stem, suffix = target.stem, target.suffix
    counter = 2
    while True:
        candidate = target.with_name(f"{stem} ({counter}){suffix}")
        if not candidate.exists():
            return candidate
        counter += 1


def move(src: Path, dest_dir: Path, new_name: str | None = None) -> Tuple[Path, bool]:
    """Move src into dest_dir with collision handling.

    ``new_name`` (when given) renames the file at its destination — this is how
    the canonical ``Artist - Title [Mix] - BPM - Key.ext`` name is applied.
    Returns (final_path, was_moved).
    Uses os.replace when possible (atomic on same volume).
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    target = _unique_path(dest_dir / (new_name or src.name))

    try:
        os.replace(src, target)          # atomic on Windows (same volume)
        return target, True
    except OSError:
        # Cross-volume or permission issue — fall back to copy + delete
        shutil.copy2(src, target)
        src.unlink(missing_ok=True)
        return target, True