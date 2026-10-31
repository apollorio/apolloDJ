"""Library approval router.

Routes analyzed tracks to Coletânea (PASS) or Duvidosos subfolders (FAIL)
according to QC failure reason.
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from ..conf.paths import (
    TRACKS_COLETANEA_DIR,
    TRACKS_DUV_ARQUIVO_DIR,
    TRACKS_DUV_DOWNLOAD_DIR,
    TRACKS_DUV_AMP_DIR,
)
from .mover import move

FailReason = Literal["quality", "download", "amplificacao"]


def route_track(
    src: Path,
    status: Literal["PASS", "FAIL"],
    reason: FailReason | None = None,
    new_name: str | None = None,
) -> Path:
    if status == "PASS":
        dest = TRACKS_COLETANEA_DIR
    else:
        if reason == "download":
            dest = TRACKS_DUV_DOWNLOAD_DIR
        elif reason == "amplificacao":
            dest = TRACKS_DUV_AMP_DIR
        else:
            dest = TRACKS_DUV_ARQUIVO_DIR

    final_path, _ = move(src, dest, new_name=new_name)
    return final_path
