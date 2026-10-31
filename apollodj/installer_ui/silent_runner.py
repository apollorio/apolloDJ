"""Silent installer payload runner (deferred-grade stub).

This keeps strict-plan compatibility while preserving the current
pre-software focus. It executes an embedded Inno payload when present.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


def run_silent_payload(payload_exe: str | Path) -> dict[str, Any]:
    """Run ``payload_exe /SILENT`` and return status metadata."""
    payload = Path(payload_exe)
    if not payload.exists():
        return {"started": False, "reason": "payload_not_found", "path": str(payload)}

    cmd = [str(payload), "/SILENT", "/NORESTART"]
    proc = subprocess.Popen(cmd)
    return {"started": True, "pid": proc.pid, "command": cmd}
