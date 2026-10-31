"""TDD tests — surface device_mismatch as a re-login reason in auth_gate.

apollo_dj_safe_flows.py verify() returns reason 'device_mismatch' (401) →
"logout + re-login on this machine". auth_gate must carry that reason through
AuthResult so the shell can react. Additive: AuthResult.reason defaults None.

Run from src_002:  python _test_auth_gate_reason.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from apollodj.boot import auth_gate as AG  # noqa: E402


def test_authresult_has_reason_field():
    r = AG.AuthResult(is_authenticated=False, username=None, features={})
    assert hasattr(r, "reason")
    assert r.reason is None


def test_detect_device_mismatch_from_dict_reason():
    assert AG._detect_device_mismatch({"reason": "device_mismatch"}) is True


def test_detect_device_mismatch_from_code_key():
    assert AG._detect_device_mismatch({"code": "device_mismatch"}) is True


def test_detect_device_mismatch_from_exception_message():
    assert AG._detect_device_mismatch(RuntimeError("401 device_mismatch on verify")) is True


def test_detect_device_mismatch_false_for_other_reason():
    assert AG._detect_device_mismatch({"reason": "invalid"}) is False
    assert AG._detect_device_mismatch(None) is False


def test_perform_boot_returns_authresult_with_reason_attr():
    # In a bare test env (no _superseeded client / no network) boot fails closed;
    # it must still return an AuthResult exposing a reason (never crash).
    res = AG.perform_boot()
    assert isinstance(res, AG.AuthResult)
    assert hasattr(res, "reason")


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
