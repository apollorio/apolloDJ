"""TDD tests for the hardened version/update gate (apollo_dj_safe_flows (2).py flow).

Adds to apollodj.boot.update_check (additive — existing latest_version/mandatory
logic untouched):
  · min_v + action=='lock' semantics
  · fail-CLOSED when the update server is unreachable
  · paid unlock_code (keyring) override
  · self_clean / self_delete / broken hooks

Run from src_002:  python _test_update_gate.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from apollodj.boot import update_check as U  # noqa: E402


def test_version_less_than_semver():
    assert U._version_less_than("1.9.0", "2.0.0") is True
    assert U._version_less_than("2.0.0", "2.0.0") is False
    assert U._version_less_than("2.1.0", "2.0.0") is False
    assert U._version_less_than("2.0.0-beta", "2.0.0") is True  # pre-release < final


def test_gate_locks_when_below_min_v():
    g = U.get_update_gate("1.5.0", manifest={"min_v": "2.0.0"}, unlocked=False)
    assert g["action"] == "lock"
    assert g.get("min_v") == "2.0.0"


def test_gate_locks_on_action_lock():
    g = U.get_update_gate("9.9.9", manifest={"action": "lock", "html": "<h2>Off</h2>"}, unlocked=False)
    assert g["action"] == "lock"
    assert "Off" in g.get("html", "")


def test_gate_continues_when_version_ok():
    g = U.get_update_gate("2.0.0", manifest={"min_v": "2.0.0", "action": "allow"}, unlocked=False)
    assert g["action"] == "continue"


def test_gate_fail_closed_when_server_unreachable(monkeypatch_none=None):
    # Force fetch failure: _load_manifest returns None
    orig = U._load_manifest
    U._load_manifest = lambda *a, **k: None  # type: ignore
    try:
        locked = U.get_update_gate("2.0.0", fail_closed=True, unlocked=False)
        assert locked["action"] == "lock"
        assert "gate_error" in locked.get("reason", "") or locked.get("html")
        opened = U.get_update_gate("2.0.0", fail_closed=False, unlocked=False)
        assert opened["action"] == "continue"
    finally:
        U._load_manifest = orig  # type: ignore


def test_paid_unlock_overrides_lock():
    g = U.get_update_gate("1.0.0", manifest={"min_v": "2.0.0"}, unlocked=True)
    assert g["action"] == "continue"
    assert g.get("unlocked") is True


def test_paid_unlock_active_returns_bool_no_raise():
    assert isinstance(U._paid_unlock_active(), bool)


def test_self_clean_and_self_delete_hooks_exist():
    assert callable(U._self_clean)
    assert callable(U._self_delete)
    # must not raise / must not actually delete in safe mode
    U._self_clean(["fake_module"])
    U._self_delete()


def test_self_clean_invoked_from_gate_when_signaled():
    calls: list = []
    orig = U._self_clean
    U._self_clean = lambda broken: calls.append(broken)  # type: ignore
    try:
        U.get_update_gate("2.0.0", manifest={"action": "allow", "self_clean": True, "broken": ["x"]}, unlocked=False)
        assert calls == [["x"]], calls
    finally:
        U._self_clean = orig  # type: ignore


def test_existing_get_boot_gate_still_works():
    # Additive change must not break the original API.
    g = U.get_boot_gate("2.0.0")
    assert g["action"] in {"continue", "lock"}


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
