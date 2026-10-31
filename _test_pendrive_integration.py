"""Standalone TDD tests — f3 integration into quality_gate, usb_exporter, bridge.

Run from src_002:  python _test_pendrive_integration.py

Covers:
  · Phase 3.1 — quality_gate.check_usb_health()  (export decision + weighted combine)
  · Phase 4.1 — usb_exporter export guard (block on failed f3 test, allow otherwise)
  · Phase 4.2 — UsbBridge.test_pendrive() + get_pendrive_status()
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from apollodj.conf import paths  # noqa: E402
from apollodj.ingest import quality_gate as qg  # noqa: E402
from apollodj.ingest import pendrive_utils as pu  # noqa: E402
from apollodj.ingest import usb_exporter as ux  # noqa: E402
from apollodj.bridge.usb_bridge import UsbBridge  # noqa: E402


GOOD = {"drive": "F:", "fake_detected": False, "health_score": 100,
        "write_speed_mbs": 17.4, "read_speed_mbs": 22.5, "bad_blocks_count": 0,
        "recommendation": "Excellent", "health_status": "green", "available": True}
FAKE = {"drive": "F:", "fake_detected": True, "health_score": 60,
        "write_speed_mbs": 20.0, "read_speed_mbs": 25.0, "bad_blocks_count": 0,
        "recommendation": "Do not use", "health_status": "red", "available": True}
WEAK = {"drive": "F:", "fake_detected": False, "health_score": 20,
        "write_speed_mbs": 3.0, "read_speed_mbs": 5.0, "bad_blocks_count": 9,
        "recommendation": "Do not use", "health_status": "red", "available": True}
NOTOOL = {"drive": "F:", "available": False, "error": "f3probe não encontrado",
          "fake_detected": False, "health_score": 0, "recommendation": "Do not use"}


# ── Phase 3.1 — check_usb_health ─────────────────────────────────────────────

def test_check_usb_health_allows_healthy_drive():
    r = qg.check_usb_health(GOOD)
    assert r["export_allowed"] is True
    assert r["usb_health_score"] == 100
    assert r["reasons"] == [] or all("fals" not in x for x in r["reasons"])


def test_check_usb_health_blocks_fake_drive():
    r = qg.check_usb_health(FAKE)
    assert r["export_allowed"] is False
    assert any("fals" in x.lower() for x in r["reasons"]), r["reasons"]


def test_check_usb_health_blocks_low_score():
    r = qg.check_usb_health(WEAK)
    assert r["export_allowed"] is False


def test_check_usb_health_unavailable_is_graceful_not_hard_block():
    # f3 missing must NOT hard-block (the speed benchmark is the #2 fallback)
    r = qg.check_usb_health(NOTOOL)
    assert r["export_allowed"] is True
    assert any("indispon" in x.lower() or "f3" in x.lower() for x in r["reasons"]), r["reasons"]


def test_check_usb_health_combines_audio_score():
    r = qg.check_usb_health(GOOD, audio_score=80.0)
    assert "combined_score" in r
    assert abs(r["combined_score"] - 90.0) < 0.01  # (100 + 80) / 2


# ── Phase 4.1 — export guard ─────────────────────────────────────────────────

def _patch_registry(tmp: Path):
    """Point pendrive_utils registry at temp files; return restore callable."""
    old_csv, old_json = paths.PENDRIVES_CSV, paths.PENDRIVES_JSON
    paths.PENDRIVES_CSV = tmp / "pendrives-registrados.csv"
    paths.PENDRIVES_JSON = tmp / "drives.json"

    def restore():
        paths.PENDRIVES_CSV = old_csv
        paths.PENDRIVES_JSON = old_json
    return restore


def test_export_guard_blocks_when_last_f3_test_failed():
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        restore = _patch_registry(tmp)
        try:
            usb_root = tmp / "drive"
            usb_root.mkdir()
            drive = ux._drive_letter(usb_root)
            failed = {**WEAK, "drive": drive}
            pu.log_pendrive_test(failed)
            res = ux.export_to_usb("Set1", [], usb_root)
            assert res["success"] is False
            assert "f3" in res["reason"], res
        finally:
            restore()


def test_export_guard_allows_when_no_test_present():
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        restore = _patch_registry(tmp)
        try:
            usb_root = tmp / "drive"
            usb_root.mkdir()
            guard = ux._f3_export_guard(usb_root)
            assert guard["allow"] is True
            assert guard["tested"] is False
        finally:
            restore()


def test_export_guard_allows_when_last_test_passed():
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        restore = _patch_registry(tmp)
        try:
            usb_root = tmp / "drive"
            usb_root.mkdir()
            drive = ux._drive_letter(usb_root)
            pu.log_pendrive_test({**GOOD, "drive": drive})
            guard = ux._f3_export_guard(usb_root)
            assert guard["allow"] is True
            assert guard["tested"] is True
        finally:
            restore()


# ── Phase 4.2 — bridge methods ───────────────────────────────────────────────

def test_bridge_get_pendrive_status_untested_drive():
    with tempfile.TemporaryDirectory() as d:
        restore = _patch_registry(Path(d))
        try:
            status = UsbBridge().get_pendrive_status("Z:")
            assert status["tested"] is False
        finally:
            restore()


def test_bridge_get_pendrive_status_after_logging():
    with tempfile.TemporaryDirectory() as d:
        restore = _patch_registry(Path(d))
        try:
            pu.log_pendrive_test({**GOOD, "drive": "Q:"})
            status = UsbBridge().get_pendrive_status("Q:")
            assert status["tested"] is True
            assert status["last"]["health_score"] == 100
        finally:
            restore()


def test_bridge_test_pendrive_without_f3_is_graceful():
    # No f3 binaries injected/installed → must return available False, never raise.
    out = UsbBridge().test_pendrive("Z:", quick=True)
    assert out["available"] is False
    assert "error" in out


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {fn.__name__}: {type(exc).__name__}: {exc}")
    if failed:
        print(f"\n{failed}/{len(fns)} FAILED")
        sys.exit(1)
    print(f"\nOK — {len(fns)} tests passed")
