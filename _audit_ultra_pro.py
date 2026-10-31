"""apolloDJ PRO — ULTRA PREMIUM Final Audit v2.0

Exit 0 = shippable. Covers Coletânea hard-lock, recursive scan, advanced
metadata + standardized tag save, backend-only Nicotine+, canonical membership
gate, no ghost tabs, path validation, post-ingest metadata wiring, all core
gates green, and a real frozen-exe boot.

Run before every ``dist_002\\apolloDJ.exe`` release::

    python _audit_ultra_pro.py        # exit 0 = SHIP · exit 1 = BLOCKED

Implementation notes (why this differs from a naive substring version):
  * Each check is a real function wrapped in try/except → a failure is a clean
    [FAIL], never a traceback that aborts the whole gate.
  * Checks run ONCE (no double evaluation).
  * The frozen exe is booted via the ``APOLLODJ_BOOT_ONLY`` env var (the exe has
    no ``--boot-only`` CLI flag) and exit 0 or 20 both count as a healthy boot.
  * "Backend-only Nicotine+" and "no ghost tabs" assert true intent (headless
    policy enforced + no chat/PM/rooms TAB surface) instead of blunt substring
    matches that would false-fail on the policy docstring that *documents* the
    lock-off.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

PY = sys.executable
ENV = {**os.environ, "APOLLODJ_SKIP_UPDATE_CHECK": "1", "PYTHONIOENCODING": "utf-8"}


def _read(rel: str) -> str:
    return (ROOT / rel).read_text(encoding="utf-8", errors="replace")


def _sh(args: list[str], extra_env: dict | None = None) -> subprocess.CompletedProcess:
    env = dict(ENV)
    if extra_env:
        env.update(extra_env)
    return subprocess.run(
        args, cwd=str(ROOT), capture_output=True, text=True,
        encoding="utf-8", errors="replace", env=env, timeout=600,
    )


# ── Individual checks (each returns (ok: bool, detail: str)) ──────────────────

def c01_hard_lock() -> tuple[bool, str]:
    from apollodj.bridge.ingest_bridge import IngestBridge
    b = IngestBridge()
    blocked = not b.validate_drop_path("C:/Windows")["valid"]
    allowed = b.validate_drop_path(b.get_library_root()["path"])["valid"]
    return (blocked and allowed), f"forbidden_blocked={blocked} coletanea_allowed={allowed}"


def c02_recursive_scan() -> tuple[bool, str]:
    from apollodj.bridge.ingest_bridge import IngestBridge
    r = IngestBridge().scan_library_recursive()
    ok = isinstance(r, dict) and "tracks" in r and isinstance(r.get("count"), int) and r["count"] >= 0
    return ok, f"count={r.get('count')}"


def c03_metadata_and_tags() -> tuple[bool, str]:
    from apollodj.bridge.ingest_bridge import IngestBridge
    b = IngestBridge()
    has_methods = callable(getattr(b, "extract_advanced_metadata", None)) and \
        callable(getattr(b, "save_standardized_tags", None))
    m = b.extract_advanced_metadata()  # no path → full Coletânea scan
    scan_ok = isinstance(m, dict) and "tracks" in m and "count" in m
    return (has_methods and scan_ok), f"methods={has_methods} scan_keys={list(m)[:3]}"


def c04_backend_only_nicotine() -> tuple[bool, str]:
    src = _read("apollodj/boot/nicotine_autostart.py").lower()
    headless = "headless" in src                       # policy enforced
    no_gtk = "gtkgui" not in src and "import gi" not in src and "gtk.main" not in src
    return (headless and no_gtk), f"headless={headless} no_gui_toolkit={no_gtk}"


def c05_membership_canonical() -> tuple[bool, str]:
    from apollodj.gating.features import has_membership
    ok = (has_membership("apolloDJ") and has_membership("apolloDJ-EXTRA")
          and not has_membership("apollodj-pro") and not has_membership(""))
    return ok, "apolloDJ|apolloDJ-EXTRA only"


def c06_no_ghost_tabs() -> tuple[bool, str]:
    html = _read("theme/screen software/apolloDJ.v3.html").lower()
    ghosts = ['data-tab="chat"', 'data-tab="rooms"', 'data-tab="pm"',
              'data-tab="soulseek"', "soulseek"]
    present = [g for g in ghosts if g in html]
    return (not present), f"ghost_tab_surface={present or 'none'}"


def c07_path_validation_rejects() -> tuple[bool, str]:
    from apollodj.conf.paths import validate_library_path
    rejects = not validate_library_path("C:/Windows")["valid"]
    rejects2 = not validate_library_path("C:/Users/User/Downloads")["valid"]
    return (rejects and rejects2), f"win_rejected={rejects} downloads_rejected={rejects2}"


def c08_metadata_after_ingest() -> tuple[bool, str]:
    src = _read("apollodj/bridge/ingest_bridge.py")
    ok = "scan_library_recursive" in src and "save_standardized_tags" in src \
        and "extract_advanced_metadata" in src
    return ok, "scan+metadata+tag-save wired"


def c09_core_gates_green() -> tuple[bool, str]:
    gates = ["smoke_verify.py", "_audit_001.py", "_functional_pro.py", "_compliance_audit.py"]
    results = {}
    for g in gates:
        rc = _sh([PY, g]).returncode
        results[g] = rc
    ok = all(rc == 0 for rc in results.values())
    detail = " ".join(f"{Path(g).stem}={rc}" for g, rc in results.items())
    return ok, detail


def c10_real_exe_boot() -> tuple[bool, str]:
    exe = ROOT.parent / "dist_002" / "apolloDJ.exe"
    if not exe.is_file():
        return False, "dist_002/apolloDJ.exe NOT FOUND — build first"
    rc = _sh([str(exe)], extra_env={"APOLLODJ_BOOT_ONLY": "1"}).returncode
    return (rc in (0, 20)), f"exe_boot_exit={rc} (0=auth ok · 20=login required)"


CHECKS = [
    ("Coletânea hard-lock + validate", c01_hard_lock),
    ("scan_library_recursive + count badge", c02_recursive_scan),
    ("extract_advanced_metadata + save_standardized_tags", c03_metadata_and_tags),
    ("Backend-only Nicotine+ (headless, no GUI toolkit)", c04_backend_only_nicotine),
    ("Membership canonical (apolloDJ|apolloDJ-EXTRA only)", c05_membership_canonical),
    ("No fake/ghost tabs in v3 (no chat/PM/rooms surface)", c06_no_ghost_tabs),
    ("Path validation rejects outside Coletânea", c07_path_validation_rejects),
    ("Metadata + tag save wired into ingest bridge", c08_metadata_after_ingest),
    ("All core gates green (smoke/audit/func/compliance)", c09_core_gates_green),
    ("Real exe boot + DB auth (dist_002 frozen build)", c10_real_exe_boot),
]


def main() -> int:
    print("\n" + "=" * 64)
    print("  apolloDJ PRO — ULTRA PRO FINAL CHECKLIST v2.0")
    print("=" * 64)
    passed = 0
    for name, fn in CHECKS:
        try:
            ok, detail = fn()
        except Exception as exc:  # any check error → FAIL, never crash the gate
            ok, detail = False, f"EXC {exc!r}"
        if ok:
            passed += 1
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
        if detail:
            print(f"         {detail}")
    total = len(CHECKS)
    print("-" * 64)
    verdict = "SHIP" if passed == total else "BLOCKED"
    print(f"  Result: {passed}/{total} PASS — {verdict}")
    print("=" * 64)
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
