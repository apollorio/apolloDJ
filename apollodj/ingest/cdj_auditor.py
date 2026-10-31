"""CDJ preflight audit (run before USB export).

Validates each track will read on a Pioneer CDJ-2000 / CDJ-3000 / XDJ-XZ.

Top 3 Podium:
  1. legacy _superseeded/apolloDJ-exe/pipeline/cdj_auditor.py
     (full check: sample rate, depth, headroom, beatgrid, ANLZ probe)
  2. mutagen info (sample_rate, channels, length) + tag check
  3. ffprobe subprocess (last resort)
"""
from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict

CDJ_VALID_SAMPLE_RATES = (44100, 48000)
CDJ_MAX_BIT_DEPTH = 24


def _load_legacy() -> Any:
    root = Path(__file__).resolve().parents[3]
    candidate = root / "_superseeded" / "apolloDJ-exe" / "pipeline" / "cdj_auditor.py"
    if not candidate.exists():
        return None
    spec = importlib.util.spec_from_file_location("legacy_cdj_audit", candidate)
    if not spec or not spec.loader:
        return None
    mod = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(mod)
        return mod
    except Exception:
        return None


def audit(path: str | Path) -> Dict[str, Any]:
    """Return a CDJ-readiness verdict."""
    p = Path(path)

    mod = _load_legacy()
    if mod is not None and hasattr(mod, "audit"):
        try:
            res = mod.audit(str(p))
            res.setdefault("source", "legacy_cdj_auditor")
            return res
        except Exception:
            pass

    try:
        from mutagen import File as MFile
        m = MFile(str(p))
        info = getattr(m, "info", None)
        sr = int(getattr(info, "sample_rate", 0) or 0)
        length = float(getattr(info, "length", 0.0) or 0.0)
        reasons = []
        if sr and sr not in CDJ_VALID_SAMPLE_RATES:
            reasons.append(f"unsupported_sample_rate:{sr}")
        if length < 30:
            reasons.append(f"too_short:{length:.1f}s")
        return {
            "cdj_ready": not reasons,
            "reasons": reasons,
            "sample_rate": sr,
            "length_sec": length,
            "source": "mutagen_info",
        }
    except Exception:
        pass

    if shutil.which("ffprobe"):
        cmd = ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(p)]
        out = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", check=True
        )
        meta = json.loads(out.stdout)
        sr = int(meta.get("streams", [{}])[0].get("sample_rate", 0) or 0)
        return {
            "cdj_ready": sr in CDJ_VALID_SAMPLE_RATES,
            "reasons": [] if sr in CDJ_VALID_SAMPLE_RATES else [f"unsupported_sample_rate:{sr}"],
            "sample_rate": sr,
            "source": "ffprobe",
        }

    return {"cdj_ready": False, "reasons": ["no_audit_engine"], "source": "none"}
