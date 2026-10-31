"""apolloDJ PRO — local smoke verification tool.

Runs compile, registry/disk parity, import sweep, and optional runtime checks
(dj_prep_pro + pipeline dry-run on a synthetic WAV).

Usage:
    python smoke_verify.py              # full smoke
    python smoke_verify.py --quick      # compile + imports only (no ffmpeg)
    python smoke_verify.py --json       # machine-readable report on stdout

Exit codes: 0 = all checks passed, 1 = one or more failures.
"""
from __future__ import annotations

import argparse
import importlib
import json
import math
import struct
import subprocess
import sys
import tempfile
import wave
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

SRC_ROOT = Path(__file__).resolve().parent
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))


@dataclass
class CheckResult:
    name: str
    passed: bool
    detail: str = ""
    meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SmokeReport:
    checks: List[CheckResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(c.passed for c in self.checks)

    def add(self, name: str, passed: bool, detail: str = "", **meta: Any) -> None:
        self.checks.append(CheckResult(name=name, passed=passed, detail=detail, meta=meta))


def _load_registry() -> Dict[str, Any]:
    path = SRC_ROOT / "registry.json"
    return json.loads(path.read_text(encoding="utf-8"))


def check_compile(report: SmokeReport) -> None:
    proc = subprocess.run(
        [sys.executable, "-m", "compileall", "-q", "apollodj", "main.py", "smoke_verify.py"],
        cwd=str(SRC_ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    report.add(
        "compileall",
        proc.returncode == 0,
        proc.stderr.strip() or "apollodj + main.py compile OK",
    )


_NESTED_UNDER_INGEST = {"parsers", "exporters"}


def _pkg_disk_path(pkg: str) -> Path:
    """Disk dir for a registry pkg key (parsers/exporters live under ingest/)."""
    if pkg in _NESTED_UNDER_INGEST:
        return SRC_ROOT / "apollodj" / "ingest" / pkg
    return SRC_ROOT / "apollodj" / pkg


def _pkg_dotted(pkg: str) -> str:
    return f"apollodj.ingest.{pkg}" if pkg in _NESTED_UNDER_INGEST else f"apollodj.{pkg}"


def check_registry_disk(report: SmokeReport, registry: Dict[str, Any]) -> None:
    modules: Dict[str, List[str]] = registry.get("modules") or {}
    missing_py: List[str] = []
    missing_optional: List[str] = []

    for pkg, files in modules.items():
        base = _pkg_disk_path(pkg)
        rel_prefix = _pkg_dotted(pkg).replace(".", "/")
        for fname in files:
            target = base / fname
            if fname.endswith(".py"):
                if not target.is_file():
                    missing_py.append(f"{rel_prefix}/{fname}")
            elif not target.is_file():
                missing_optional.append(f"{rel_prefix}/{fname}")

    for icon in registry.get("current_structure", {}).get("icons") or []:
        if not (SRC_ROOT / icon).is_file():
            missing_optional.append(icon)

    report.add(
        "registry_disk_parity",
        not missing_py,
        "all registry Python modules present"
        if not missing_py
        else f"missing: {', '.join(missing_py)}",
        missing=missing_py,
    )
    report.add(
        "optional_assets",
        True,
        "all optional assets present"
        if not missing_optional
        else f"missing (non-blocking): {', '.join(missing_optional)}",
        missing=missing_optional,
        blocking=False,
    )


def check_imports(report: SmokeReport, registry: Dict[str, Any]) -> None:
    modules: Dict[str, List[str]] = registry.get("modules") or {}
    failures: List[str] = []
    imported = 0

    for pkg, files in modules.items():
        for fname in files:
            if not fname.endswith(".py"):
                continue
            stem = Path(fname).stem
            mod_path = f"{_pkg_dotted(pkg)}.{stem}"
            try:
                importlib.import_module(mod_path)
                imported += 1
            except Exception as exc:
                failures.append(f"{mod_path}: {exc!s:.120}")

    for extra in ("main",):
        try:
            importlib.import_module(extra)
            imported += 1
        except Exception as exc:
            failures.append(f"{extra}: {exc!s:.120}")

    report.add(
        "import_sweep",
        not failures,
        f"{imported} modules imported" if not failures else f"{len(failures)} import failures",
        failures=failures,
        imported=imported,
    )


def _write_test_wav(path: Path, *, duration_sec: float = 4.0, sr: int = 44100) -> None:
    """Minimal stereo sine WAV — no external deps (>=4s for loudnorm)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    n_frames = int(sr * duration_sec)
    freq = 128.0  # nod to BPM smoke expectations

    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        for i in range(n_frames):
            sample = int(32767 * 0.25 * math.sin(2.0 * math.pi * freq * i / sr))
            wf.writeframes(struct.pack("<hh", sample, sample))


def check_dj_prep_pro(report: SmokeReport, wav_path: Path) -> None:
    from apollodj.ingest.dj_prep_pro import prep

    result = prep(wav_path, weak=False, commit=False)
    passed = result.get("verdict") == "PASS" and bool(result.get("final_path"))
    engines = {
        k: v.get("engine") if isinstance(v, dict) else None
        for k, v in (result.get("steps") or {}).items()
    }
    report.add(
        "dj_prep_pro",
        passed,
        f"verdict={result.get('verdict')} bpm={result.get('analysis', {}).get('bpm')}",
        engines=engines,
        final_path=result.get("final_path"),
    )


def check_pipeline_dry(report: SmokeReport, wav_path: Path) -> None:
    from apollodj.ingest.pipeline import run

    result = run(str(wav_path), commit=False, enrich_metadata=False)
    passed = "stages" in result and "verdict" in result
    report.add(
        "pipeline_dry_run",
        passed,
        f"verdict={result.get('verdict')} stages={len(result.get('stages') or {})}",
        stages=list((result.get("stages") or {}).keys()),
    )


def check_ingest_bridge(report: SmokeReport, wav_path: Path) -> None:
    from apollodj.bridge.ingest_bridge import IngestBridge

    bridge = IngestBridge()
    out = bridge.dj_prep_pro(str(wav_path), weak=False, commit=False)
    passed = isinstance(out, dict) and "success" in out and "report" in out
    report.add(
        "ingest_bridge_dj_prep_pro",
        passed,
        f"success={out.get('success')}",
    )


def check_boot_modules(report: SmokeReport) -> None:
    """Light boot-layer checks that do not require network auth."""
    from apollodj.boot.ready_signal import build_ready_payload
    from apollodj.boot.update_check import get_boot_gate
    from apollodj.conf.paths import ensure_paths
    from apollodj.gating.tabs import visible_tabs

    ensure_paths()
    gate = get_boot_gate()
    tabs = visible_tabs({})
    payload = build_ready_payload(
        type("Auth", (), {"is_authenticated": True, "username": "smoke", "features": {}})(),
        tabs,
    )
    passed = isinstance(gate, dict) and isinstance(payload, dict) and "visible_tabs" in payload
    report.add("boot_modules", passed, f"gate_action={gate.get('action', 'none')}")


def check_e2e_flow(report: SmokeReport) -> None:
    """Simulated boot → login → REMIX search → download (mock P2P if needed)."""
    try:
        from smoke_e2e_flow import run_e2e

        e2e = run_e2e(live_p2p=False)
        failed = [s.name for s in e2e.stages if not s.passed]
        report.add(
            "e2e_boot_p2p_sim",
            e2e.ok,
            f"stages={len(e2e.stages)} failed={failed or 'none'}",
            failures=failed,
        )
    except Exception as exc:
        report.add("e2e_boot_p2p_sim", False, repr(exc))


def check_flow_ssot(report: SmokeReport) -> None:
    """Inline flow / race / lazy-load checks vs mapped.md + flowchart."""
    from _audit_001_flows import run_flow_audit

    findings = run_flow_audit(SRC_ROOT)
    n_err = len(findings.get("errors", []))
    n_warn = len(findings.get("warnings", []))
    passed = n_err == 0
    detail = f"errors={n_err} warnings={n_warn}"
    if not passed and findings["errors"]:
        detail += " | " + findings["errors"][0][:80]
    report.add("flow_ssot", passed, detail)


def run_smoke(*, quick: bool) -> SmokeReport:
    report = SmokeReport()
    registry = _load_registry()

    check_compile(report)
    check_registry_disk(report, registry)
    check_imports(report, registry)
    check_boot_modules(report)
    check_flow_ssot(report)
    check_e2e_flow(report)

    if quick:
        return report

    with tempfile.TemporaryDirectory(prefix="apollodj_smoke_") as tmp:
        wav = Path(tmp) / "_smoke_djprep.wav"
        _write_test_wav(wav)
        check_dj_prep_pro(report, wav)
        check_pipeline_dry(report, wav)
        check_ingest_bridge(report, wav)

    return report


def _print_human(report: SmokeReport) -> None:
    width = 52
    print("=" * width)
    print(" apolloDJ PRO — smoke verify")
    print("=" * width)
    for chk in report.checks:
        mark = "PASS" if chk.passed else "FAIL"
        if chk.meta.get("blocking") is False and chk.meta.get("missing"):
            mark = "WARN"
        print(f" [{mark}] {chk.name}")
        if chk.detail:
            print(f"        {chk.detail}")
        if not chk.passed and chk.meta.get("failures"):
            for line in chk.meta["failures"][:8]:
                print(f"        - {line}")
    print("-" * width)
    print(f" Result: {'ALL PASSED' if report.ok else 'FAILED'} ({sum(c.passed for c in report.checks)}/{len(report.checks)})")
    print("=" * width)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="apolloDJ PRO smoke verification")
    parser.add_argument(
        "--quick",
        action="store_true",
        help="compile + registry + imports only (skip runtime audio chain)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit JSON report instead of human-readable output",
    )
    args = parser.parse_args(argv)

    report = run_smoke(quick=args.quick)

    if args.json:
        payload = {
            "ok": report.ok,
            "checks": [asdict(c) for c in report.checks],
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        _print_human(report)

    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
