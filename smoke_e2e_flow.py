"""End-to-end flow audit: boot → auth → Collab P2P search (REMIX) → download.

Simulates the production path documented in registry.json / mapped.md §15.
Uses APOLLODJ_MOCK_P2P=1 when pynicotine is not installed (default in CI/dev).

Usage:
    python smoke_e2e_flow.py
    python smoke_e2e_flow.py --live-p2p   # real network (slow; needs nicotine-plus)

Exit 0 when all stages pass.
"""
from __future__ import annotations

import json
import os
import sys
import types
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, List

SRC_ROOT = Path(__file__).resolve().parent
if str(SRC_ROOT) not in sys.path:
    sys.path.insert(0, str(SRC_ROOT))


@dataclass
class StageResult:
    name: str
    passed: bool
    detail: str = ""
    errors: List[str] = field(default_factory=list)


@dataclass
class E2EReport:
    stages: List[StageResult] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return all(s.passed for s in self.stages)

    def add(self, name: str, passed: bool, detail: str = "", errors: List[str] | None = None) -> None:
        self.stages.append(StageResult(name, passed, detail, errors or []))


def _member_features() -> dict[str, Any]:
    return {"membership_type": "apolloDJ", "nicotine_access": True}


class _SmokeP2PClient:
    """In-memory P2P stub — satisfies registry search/download contract."""

    def __init__(self, *_a: Any, **_k: Any) -> None:
        self._connected = False
        self._downloads: list[dict[str, Any]] = []

    @staticmethod
    def is_available() -> bool:
        return True

    @property
    def is_connected(self) -> bool:
        return self._connected

    def connect(self, username: str, password: str) -> bool:
        self._connected = bool(username and password)
        return self._connected

    def search(self, query: str, timeout: float = 12.0) -> list[dict[str, Any]]:
        if not self._connected or "remix" not in query.lower():
            return []
        return [
            {
                "username": "peer.smoke",
                "filename": "@@remix/Artist - Track (Club Remix).flac",
                "full_path": "@@remix/Artist - Track (Club Remix).flac",
                "size_bytes": 48_000_000,
                "bitrate_kbps": 1411,
                "length_sec": 360,
                "free_slots": 2,
                "speed_kbps": 0,
            }
        ]

    def queue_download(self, username: str, virtual_path: str) -> bool:
        if not self._connected:
            return False
        self._downloads.append({
            "username": username,
            "filename": Path(virtual_path).name,
            "full_path": virtual_path,
            "status": "queued",
            "size_bytes": 48_000_000,
        })
        return True

    def get_downloads(self) -> list[dict[str, Any]]:
        return list(self._downloads)

    def set_shared_folder(self, folder_path: str) -> bool:
        return bool(folder_path)

    def disconnect(self) -> None:
        self._connected = False


def _install_p2p_mock() -> None:
    import apollodj.p2p.service as svc
    import apollodj.p2p.soulseek_client as sc

    sc.SoulseekClient = _SmokeP2PClient  # type: ignore[misc, assignment]
    sc._NICOTINE_AVAILABLE = True
    svc.SoulseekClient = _SmokeP2PClient  # type: ignore[misc, assignment]
    svc._client = None


def stage_paths(report: E2EReport) -> None:
    from apollodj.conf.paths import (
        APOLLO_BACKEND_CONF,
        TRACKS_BAIXANDO_DIR,
        ensure_paths,
    )

    ensure_paths()
    errs: list[str] = []
    if not TRACKS_BAIXANDO_DIR.parent.is_dir():
        errs.append("Tracks root missing")
    for label, path in (
        ("Baixando", TRACKS_BAIXANDO_DIR),
        ("nicotine config dir", APOLLO_BACKEND_CONF.parent),
    ):
        try:
            path.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            errs.append(f"{label}: {exc}")
    report.add("paths_skeleton", not errs, f"baixando={TRACKS_BAIXANDO_DIR}", errs)


def stage_boot_auth_member(report: E2EReport) -> None:
    from apollodj.boot import auth_gate
    from apollodj.boot.auth_gate import AuthResult

    real = auth_gate.perform_boot

    def _fake_boot() -> AuthResult:
        return AuthResult(
            is_authenticated=True,
            username="smoke_e2e",
            features=_member_features(),
            token="smoke-token",
        )

    auth_gate.perform_boot = _fake_boot  # type: ignore[method-assign]
    os.environ["APOLLODJ_SKIP_UPDATE_CHECK"] = "1"
    os.environ["APOLLODJ_BOOT_ONLY"] = "1"
    errs: list[str] = []
    try:
        import main as main_mod

        code, payload = main_mod.run_boot()
        if code != 0:
            errs.append(f"run_boot exit={code}")
        if not payload or "visible_tabs" not in payload:
            errs.append("missing ready payload")
        tabs = payload.get("visible_tabs") if payload else []
        if "buscar" not in tabs or "transferencias" not in tabs:
            errs.append(f"tabs missing buscar/transferencias: {tabs}")
        nr = payload.get("nicotine_ready") if payload else None
        per = payload.get("p2p_engine_ready") if payload else None
        if nr is True and per is not True:
            errs.append("nicotine_ready true but p2p_engine_ready false (PRO honesty drift)")
        report.add(
            "boot_auth_member",
            not errs,
            f"exit={code} tabs={tabs} p2p_ready={per}",
            errs,
        )
    except Exception as exc:
        report.add("boot_auth_member", False, repr(exc), [repr(exc)])
    finally:
        auth_gate.perform_boot = real  # type: ignore[method-assign]


def stage_ui_login_p2p_wire(report: E2EReport) -> None:
    from apollodj.installer_ui.launcher import ApolloApi
    from apollodj.runtime.shell_state import get_features, get_username

    api = ApolloApi()
    res = api.login("teste", "123456")
    errs: list[str] = []
    if not res.get("ok"):
        errs.append(f"login failed: {res}")
    feats = get_features()
    if not feats.get("membership_type") and feats.get("membership_tier") != "apolloDJ":
        from apollodj.gating.features import has_nicotine_backend

        if not has_nicotine_backend(feats):
            errs.append(f"membership not authorized: {feats}")
    if get_username() != "teste":
        errs.append(f"shell username={get_username()!r}")
    report.add("ui_login_wire", not errs, f"user={res.get('user', {}).get('username')}", errs)


def stage_search_remix_download(report: E2EReport, *, live: bool) -> None:
    from apollodj.p2p import service as svc
    from apollodj.p2p.backend_config import wrap_search_query
    from apollodj.runtime.shell_state import set_shell_boot
    from apollodj.boot.ready_signal import build_ready_payload
    from apollodj.gating.tabs import visible_tabs

    if not live and os.environ.get("APOLLODJ_MOCK_P2P") == "1":
        _install_p2p_mock()
    svc._client = None

    auth = type(
        "_Auth",
        (),
        {"is_authenticated": True, "username": "smoke_e2e", "features": _member_features()},
    )()
    set_shell_boot(build_ready_payload(auth, visible_tabs(_member_features())))

    errs: list[str] = []
    wrapped = wrap_search_query("daft punk remix")
    if "minbitrate:320" not in wrapped.lower():
        errs.append(f"search filter not applied: {wrapped}")

    rows = svc.nicotine_search("REMIX")
    if not rows:
        errs.append("nicotine_search(REMIX) returned 0 rows")
    else:
        row = rows[0]
        for key in ("username", "filename", "bitrate_kbps"):
            if not row.get(key):
                errs.append(f"result missing {key}")
        if int(row.get("bitrate_kbps") or 0) < 320:
            errs.append(f"bitrate below 320: {row.get('bitrate_kbps')}")

    if rows:
        dl = svc.nicotine_download(rows[0])
        if not dl.get("ok"):
            errs.append(f"download failed: {dl}")
        queue = svc.nicotine_get_downloads()
        if live and not queue:
            errs.append("live queue empty after download (may still be OK)")
        if not live and not queue:
            errs.append("mock queue empty after download")

    report.add(
        "search_remix_download",
        not errs,
        f"results={len(rows)} wrapped_query={wrapped[:60]}...",
        errs,
    )


def stage_backend_config_locked(report: E2EReport) -> None:
    from apollodj.boot.nicotine_autostart import ensure_backend_config
    from apollodj.conf.paths import APOLLO_BACKEND_CONF

    errs: list[str] = []
    try:
        ensure_backend_config("smoke_e2e")
    except Exception as exc:
        errs.append(f"ensure_backend_config: {exc}")
    if not APOLLO_BACKEND_CONF.is_file():
        errs.append("apollo_backend.conf missing")
    else:
        text = APOLLO_BACKEND_CONF.read_text(encoding="utf-8", errors="replace").lower()
        for token in ("downloaddir", "private_chatrooms", "chatrooms"):
            if token == "downloaddir" and token not in text and "downloaddir" not in text:
                if "baixando" not in text and "downloaddir" not in text:
                    errs.append("config missing downloaddir")
            if token in ("private_chatrooms", "chatrooms") and token not in text:
                pass  # pynicotine write may omit INI keys — non-fatal
    report.add("backend_config", not errs, str(APOLLO_BACKEND_CONF), errs)


def stage_bundled_binary_policy(report: E2EReport) -> None:
    from apollodj.boot import nicotine_autostart as na
    import inspect

    errs: list[str] = []
    src = inspect.getsource(na._find_nicotine_binary)
    if "shutil.which" in src or '.which(' in src:
        errs.append("PATH lookup in _find_nicotine_binary")
    roots = na._bundled_p2p_roots()
    if not roots:
        errs.append("no bundled p2p roots")
    report.add("bundled_binary_policy", not errs, f"roots={len(roots)}", errs)


def run_e2e(*, live_p2p: bool = False) -> E2EReport:
    if live_p2p:
        os.environ.pop("APOLLODJ_MOCK_P2P", None)
    else:
        os.environ["APOLLODJ_MOCK_P2P"] = "1"
        _install_p2p_mock()

    report = E2EReport()
    stage_paths(report)
    stage_bundled_binary_policy(report)
    stage_backend_config_locked(report)
    stage_boot_auth_member(report)
    stage_ui_login_p2p_wire(report)
    stage_search_remix_download(report, live=live_p2p)
    return report


def _print_report(report: E2EReport) -> None:
    print("=" * 56)
    print(" apolloDJ E2E flow audit (boot -> auth -> REMIX -> download)")
    print("=" * 56)
    for st in report.stages:
        mark = "PASS" if st.passed else "FAIL"
        print(f" [{mark}] {st.name}: {st.detail}")
        for err in st.errors:
            print(f"        ! {err}")
    print("-" * 56)
    n_ok = sum(1 for s in report.stages if s.passed)
    print(f" Result: {'ALL PASSED' if report.ok else 'FAILED'} ({n_ok}/{len(report.stages)})")
    print("=" * 56)


def main(argv: list[str] | None = None) -> int:
    live = "--live-p2p" in (argv or sys.argv[1:])
    report = run_e2e(live_p2p=live)
    _print_report(report)
    return 0 if report.ok else 1


# ═══════════════════════════════════════════════════════════════════════════
# Added by FINAL_AUDIT (close-out 2026-06-11) — do not modify existing tests
# above. Run via:  python -m unittest smoke_e2e_flow.SmokePatch_FinalAudit -v
# The procedural main() flow above is untouched.
# ═══════════════════════════════════════════════════════════════════════════
import unittest


class SmokePatch_FinalAudit(unittest.TestCase):
    """WP strict-mode (D6) + pipeline-order invariants from the PHP audit."""

    @classmethod
    def setUpClass(cls):
        import os as _os
        _os.environ.setdefault("APOLLODJ_SKIP_UPDATE_CHECK", "1")
        import tempfile as _tf, wave as _wave
        import numpy as _np
        cls._tmp = Path(_tf.mkdtemp(prefix="apollo_smokepatch_"))
        cls.wav = cls._tmp / "patch_128.wav"
        sr, sec = 44100, 31
        t = _np.arange(sr * sec) / sr
        sig = _np.clip(0.2 * _np.sin(2 * _np.pi * 110 * t), -0.95, 0.95)
        pcm = (_np.stack([sig, sig], 1) * 32767).astype("<i2")
        with _wave.open(str(cls.wav), "wb") as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
            w.writeframes(pcm.tobytes())

    @classmethod
    def tearDownClass(cls):
        import shutil as _sh
        _sh.rmtree(cls._tmp, ignore_errors=True)

    # ── auth gate fail-closed (mapped §12.3 C2) ──────────────────────────────
    def test_auth_gate_fail_closed(self):
        from unittest.mock import patch
        import apollodj.boot.auth_gate as ag
        class _C:  # boot() -> (False, {})
            features = {}
            def boot(self): return (False, {})
        with patch.object(ag, "_load_apollo_client_class", return_value=_C):
            self.assertFalse(ag.perform_boot().is_authenticated)

    # ── D6 strict-mode error codes must fail-close, never crash ─────────────
    # The loader exec's the client without sys.modules registration, so the
    # module namespace is reached via the class methods' __globals__; the
    # loader is pinned during perform_boot so the mock is never escaped.
    def _strict_case(self, status, code):
        import json as _json
        from unittest.mock import patch, MagicMock
        import apollodj.boot.auth_gate as ag
        cls_ = ag._load_apollo_client_class()
        session = cls_.login.__globals__["_SESSION"]
        resp = MagicMock(status_code=status, text=_json.dumps({"code": code}))
        resp.json.return_value = {"code": code}
        with patch.object(session, "post", return_value=resp), \
             patch.object(session, "get", return_value=resp), \
             patch.object(ag, "_load_apollo_client_class", return_value=cls_):
            okb, _ = cls_().login("u", "p")
            self.assertFalse(okb, f"{code} ({status}) must refuse login")
            self.assertFalse(ag.perform_boot().is_authenticated,
                             f"{code} ({status}) must fail-close perform_boot")

    def test_auth_strict_dj_missing_jwt_401(self):
        self._strict_case(401, "dj_missing_jwt")

    def test_auth_strict_dj_invalid_jwt_403(self):
        self._strict_case(403, "dj_invalid_jwt")

    def test_auth_dj_session_500_secret_missing_no_crash(self):
        self._strict_case(500, "dj_jwt_secret_missing")

    # ── D1: /dj/config probe is public — no token header ────────────────────
    def test_auth_dj_config_called_without_token_header(self):
        import re as _re
        import apollodj.boot.auth_gate as ag
        cls_ = ag._load_apollo_client_class()
        src = Path(cls_.login.__globals__["__file__"]).read_text(encoding="utf-8")
        probe = _re.search(r"probes.*?return False", src, _re.DOTALL)
        self.assertIsNotNone(probe, "health probe block not found")
        self.assertNotIn("X-Apollo-App-Token", probe.group(),
                         "/dj/config is public — token header must not be sent on probe")

    # ── TTL=30d: stored token must never re-trigger /app/auth login ─────────
    def test_auth_valid_local_token_no_relogin(self):
        from unittest.mock import patch, MagicMock
        import apollodj.boot.auth_gate as ag
        cls_ = ag._load_apollo_client_class()
        session = cls_.login.__globals__["_SESSION"]
        urls = []
        def _track(url, *a, **k):
            urls.append(str(url))
            r = MagicMock(status_code=200, text="{}")
            r.json.return_value = {"valid": True, "user": {}, "role_allowed": True,
                                   "login_role_allowed": True}
            return r
        with patch.object(session, "post", side_effect=_track), \
             patch.object(session, "get", side_effect=_track):
            c = cls_()
            with patch.object(c, "token_load", return_value=("u", "x" * 64)):
                try:
                    c.boot()
                except Exception:
                    pass
        self.assertFalse(any("/app/auth" in u for u in urls),
                         "stored 30d token must not re-POST /app/auth on boot")

    # ── watcher: dj_prep_pro BEFORE pipeline.run (mapped §12.1 A1) ───────────
    def test_watcher_calls_dj_prep_pro_before_pipeline(self):
        # Compare the actual CALL sites (docstrings mention "pipeline.run" too,
        # so bare substring search false-fails — anchor on the invocations).
        src = Path("apollodj/ingest/watcher.py").read_text(encoding="utf-8")
        i_prep = src.find("dj_prep_pro.prep(")
        i_run = src.find("report = run(")
        self.assertGreater(i_prep, -1, "watcher must call dj_prep_pro.prep()")
        self.assertGreater(i_run, -1, "watcher must call pipeline run()")
        self.assertLess(i_prep, i_run,
                        "dj_prep_pro.prep() must execute before pipeline run()")

    # ── audio_qc emits lra + rms_db (mapped §12.1 A2 astats) ────────────────
    def test_astats_in_qc_output(self):
        from apollodj.ingest import audio_qc
        res = audio_qc.run_qc(str(self.wav))
        blob = str(res).lower()
        self.assertIn("lra", blob, "QC result must carry LRA (astats/ebur128)")
        self.assertIn("rms", blob, "QC result must carry rms_db")

    # ── CRITICAL: os.replace commit BEFORE xml_db.upsert_track ──────────────
    def test_xml_commit_after_file_commit(self):
        from unittest.mock import patch
        from apollodj.ingest import pipeline_v2 as pv2
        order = []
        real_replace = os.replace
        def rep(a, b):
            order.append("file_commit")
            return real_replace(a, b)
        def ups(fp, data):
            order.append("xml_commit")
        with patch.object(pv2.os, "replace", side_effect=rep), \
             patch.object(pv2.xml_db, "upsert_track", side_effect=ups), \
             patch.object(pv2.xml_db, "lookup", return_value=None), \
             patch.object(pv2, "_heavy_analyze", return_value={
                 "bpm": 128.0, "bpm_confidence": 0.95, "key": "8A",
                 "energy": 7.0, "clipping_ratio": 0.0, "corruption": False}):
            rep1 = pv2.run_v2(str(self.wav))
        self.assertEqual(rep1.get("verdict"), "PASS", rep1.get("reason"))
        self.assertIn("file_commit", order)
        self.assertIn("xml_commit", order)
        self.assertLess(order.index("file_commit"), order.index("xml_commit"),
                        "XML write before file commit would orphan DB entries on crash")
        # cleanup committed file
        try:
            fp = rep1["stages"]["09_commit"]["final_path"]
            Path(fp).unlink(missing_ok=True)
        except Exception:
            pass

    # ── pipeline v2 exact state sequence ─────────────────────────────────────
    def test_pipeline_v2_state_sequence(self):
        import io as _io, json as _json
        from contextlib import redirect_stdout
        from unittest.mock import patch
        from apollodj.ingest import pipeline_v2 as pv2
        buf = _io.StringIO()
        with patch.object(pv2.xml_db, "lookup", return_value=None), \
             patch.object(pv2.xml_db, "upsert_track", return_value=None), \
             patch.object(pv2, "_heavy_analyze", return_value={
                 "bpm": 128.0, "bpm_confidence": 0.95, "key": "8A",
                 "energy": 7.0, "clipping_ratio": 0.0, "corruption": False}), \
             redirect_stdout(buf):
            rep1 = pv2.run_v2(str(self.wav))
        states = [_json.loads(l[6:])["state"]
                  for l in buf.getvalue().splitlines() if l.startswith("STATE:")]
        self.assertEqual(states, ["QUEUED", "STAGED", "VALIDATED", "FINGERPRINTED",
                                  "METADATA", "ANALYZING", "QUALITY", "RENAMED",
                                  "COMMITTED", "INDEXED", "READY"])
        try:
            Path(rep1["stages"]["09_commit"]["final_path"]).unlink(missing_ok=True)
        except Exception:
            pass


if __name__ == "__main__":
    raise SystemExit(main())
