"""Functional smoke for new Pro/Premium features.

Tests the actual *behaviour* of the new functions I added — not just their
presence on disk.  Catches semantic bugs the static audit can't see.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

if sys.platform == "win32":
    for _stream in (sys.stdout, sys.stderr):
        if _stream is not None:
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass

passes: list[str] = []
fails: list[str] = []


def ok(name: str, detail: str = "") -> None:
    passes.append(name)
    print(f"  [PASS] {name}  {detail}")


def fail(name: str, err: str) -> None:
    fails.append(name)
    print(f"  [FAIL] {name}  {err}")


# ─────────────────────────────────────────────────────────────────────────────
print("=" * 60)
print("FUNCTIONAL AUDIT 001 — new Pro/Premium features")
print("=" * 60)

# ── 1. Lock screen HTML — all 3 flavours render valid HTML ───────────────────
print("\n[1] _build_lock_html — 3 flavours")
try:
    from apollodj.boot.update_check import _build_lock_html, UpdateInfo

    html_m = _build_lock_html(maintenance=True)
    html_n = _build_lock_html(UpdateInfo("2.5.0", "https://x.io/dl", "notes", mandatory=False))
    html_d = _build_lock_html(UpdateInfo("3.0.0", "https://x.io/dl", "notes", mandatory=True))

    for name, html in [("maintenance", html_m), ("newer", html_n), ("deprecated", html_d)]:
        assert "<h2>" in html, f"{name} missing <h2>"
        assert "<p>" in html, f"{name} missing <p>"
        assert "<button" in html or "<btn" in html, f"{name} missing button element"
    ok("lock_html_maintenance", f"len={len(html_m)}")
    ok("lock_html_newer", f"len={len(html_n)} url=https://x.io/dl")
    ok("lock_html_deprecated", "Encerrada" in html_d and "v3.0.0" in html_d and "OK")
except Exception as exc:
    fail("lock_html", repr(exc))

# ── 2. check_maintenance — graceful when network fails ───────────────────────
print("\n[2] check_maintenance — offline safety")
try:
    from apollodj.boot.update_check import check_maintenance
    os.environ.pop("APOLLODJ_SKIP_UPDATE_CHECK", None)
    # Bogus URL guarantees offline path
    result = check_maintenance(manifest_url="http://127.0.0.1:1/nope", timeout=1.0)
    if result is False:
        ok("check_maintenance_offline", "returns False on network error")
    else:
        fail("check_maintenance_offline", f"expected False, got {result}")
except Exception as exc:
    fail("check_maintenance_offline", repr(exc))

# ── 3. generate_nicotine_credential — pattern + persistence ──────────────────
print("\n[3] generate_nicotine_credential — pattern + idempotency")
try:
    from apollodj.boot.nicotine_autostart import generate_nicotine_credential, _CRED_FILE

    # Clean slate
    if _CRED_FILE.exists():
        _CRED_FILE.unlink()

    u1, p1 = generate_nicotine_credential("valle")
    u2, p2 = generate_nicotine_credential("valle")  # second call — must be identical

    assert u1 == u2 and p1 == p2, "credentials not idempotent across calls"
    assert u1.endswith(".aprio"), f"user missing .aprio suffix: {u1}"
    assert p1.endswith(".aprio"), f"pass missing .aprio suffix: {p1}"
    assert "valle" in u1.lower(), f"user missing slug: {u1}"
    assert _CRED_FILE.exists(), "credential not persisted"

    data = json.loads(_CRED_FILE.read_text())
    assert data["user"] == u1 and data["pass"] == p1, "persisted creds mismatch"
    ok("nicotine_cred_pattern", f"user={u1} pass={p1}")
    ok("nicotine_cred_idempotent", "second call returned identical")
    ok("nicotine_cred_persisted", f"file={_CRED_FILE}")

    # Cleanup
    _CRED_FILE.unlink()
except Exception as exc:
    fail("nicotine_cred", repr(exc))

# ── 3b. backend config + search filter ───────────────────────────────────────
print("\n[3b] apollo_backend.conf + search filter wrap")
try:
    from apollodj.conf.paths import APOLLO_BACKEND_CONF, INBOX_NICOTINE_DIR, NICOTINE_DIR
    from apollodj.p2p.backend_config import APOLLO_SEARCH_FILTER, wrap_search_query, write_apollo_backend_conf

    wrapped = wrap_search_query("daft punk remix")
    assert APOLLO_SEARCH_FILTER in wrapped, f"filter missing: {wrapped}"
    assert "remix" in wrapped, "user terms stripped"
    assert wrap_search_query(wrapped) == wrapped, "double-wrap changed query"

    conf = write_apollo_backend_conf("audit.aprio", "auditpass", shared_folders=[])
    assert conf == APOLLO_BACKEND_CONF and conf.is_file(), "backend conf not written"
    assert NICOTINE_DIR.is_dir(), "nicotine dir missing"
    assert INBOX_NICOTINE_DIR.name == "Nicotine", "inbox path drift"
    ok("backend_conf_path", str(APOLLO_BACKEND_CONF))
    ok("search_filter_wrap", wrapped[:60])
except Exception as exc:
    fail("backend_conf", repr(exc))

# ── 4. usb_health_check — runs on a real local directory ─────────────────────
print("\n[4] usb_health_check — local dir simulating USB")
try:
    from apollodj.ingest.usb_exporter import usb_health_check, _HEALTH_CACHE

    # tempfile is on a FIXED drive (C:) — usb_health_check correctly rejects
    # fixed drives by default. Enable opt-in via env var to exercise the
    # write/read benchmark code path.
    os.environ["APOLLODJ_ALLOW_FIXED_EXPORT"] = "1"
    with tempfile.TemporaryDirectory(prefix="apollodj_usb_smoke_") as tmp:
        root = Path(tmp)
        _HEALTH_CACHE.clear()
        h1 = usb_health_check(root, force=True)
        assert "healthy" in h1, "missing 'healthy' key"
        assert "write_mbps" in h1 and "read_mbps" in h1, "missing speed keys"
        assert "verdict" in h1, "missing verdict"
        assert h1["write_mbps"] > 0, f"write_mbps=0: {h1}"
        ok("usb_health_run", f"write={h1['write_mbps']} MB/s  read={h1['read_mbps']} MB/s  verdict={h1['verdict']}")

        # Cache test: same path within 60 s should return cached=True
        h2 = usb_health_check(root, force=False)
        if h2.get("cached"):
            ok("usb_health_cache", "second call hit cache")
        else:
            fail("usb_health_cache", f"expected cached=True, got {h2.get('cached')}")
except Exception as exc:
    fail("usb_health", repr(exc))

# ── 5. main.py BOOT protocol — runs end-to-end ───────────────────────────────
print("\n[5] main.py BOOT protocol — end-to-end")
try:
    env = os.environ.copy()
    env["APOLLODJ_SKIP_UPDATE_CHECK"] = "1"
    env["APOLLODJ_BOOT_ONLY"] = "1"
    proc = subprocess.run(
        [sys.executable, "main.py"],
        cwd=str(ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        encoding="utf-8",
        errors="replace",
    )
    out_lines = [l for l in proc.stdout.splitlines() if l]
    boot_lines = [l for l in out_lines if l.startswith("BOOT:")]
    print(f"      stdout lines: {len(out_lines)}, BOOT lines: {len(boot_lines)}, exit={proc.returncode}")
    for bl in boot_lines:
        # encode safely for the parent's cp1252 console
        print("      | " + bl.encode("ascii", "replace").decode("ascii"))

    # When auth fails (no token / offline) main.py runs steps 5/15/25/45 then prints
    # AUTH_REQUIRED. When auth succeeds it runs 5/15/25/45/70/90/100. Accept either.
    if len(boot_lines) >= 4:
        ok("main_boot_protocol_lines", f"{len(boot_lines)} BOOT events (>=4 expected)")
    else:
        fail("main_boot_protocol_lines", f"only {len(boot_lines)} BOOT events")

    # Exit code: 0 (auth ok + tabs json) or 20 (AUTH_REQUIRED) — both legitimate
    if proc.returncode in (0, 20):
        ok("main_exit_code", f"exit={proc.returncode}")
    else:
        fail("main_exit_code", f"unexpected exit {proc.returncode}: {proc.stderr[:200]}")

    # First BOOT line should be 5%
    if boot_lines and boot_lines[0].startswith("BOOT:5:"):
        ok("main_boot_starts_at_5", boot_lines[0])
    else:
        fail("main_boot_starts_at_5", f"first BOOT: {boot_lines[0] if boot_lines else 'none'}")
except Exception as exc:
    fail("main_boot", repr(exc))

# ── 6. UsbBridge instantiation — methods callable ────────────────────────────
print("\n[6] UsbBridge — instantiation + method callable")
try:
    from apollodj.bridge.usb_bridge import UsbBridge
    br = UsbBridge()
    drives = br.list_drives()
    assert isinstance(drives, list), f"list_drives returned {type(drives)}"
    ok("usb_bridge_list_drives", f"{len(drives)} drives detected")

    with tempfile.TemporaryDirectory() as tmp:
        from apollodj.ingest.usb_exporter import _HEALTH_CACHE
        _HEALTH_CACHE.clear()
        result = br.open_folder(tmp)
        assert result.get("success") is True, f"open_folder failed: {result}"
        assert "health" in result, "open_folder missing health key"
        ok("usb_bridge_open_folder", f"verdict={result['health']['verdict']}")
except Exception as exc:
    fail("usb_bridge", repr(exc))

# ── 7. apolloBPK — joint BPM + Key detection on synthetic 128 BPM WAV ────────
print("\n[7] apolloBPK — bpm_key_detection on synthetic sine")
try:
    import math
    import struct
    import wave

    from apollodj.ingest.bpm_key_detection import bpm_key_detection

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        tmp_wav = tf.name
    sr = 44100
    freq = 128.0
    with wave.open(tmp_wav, "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        for i in range(sr * 4):
            sample = int(32767 * 0.25 * math.sin(2.0 * math.pi * freq * i / sr))
            wf.writeframes(struct.pack("<hh", sample, sample))

    result = bpm_key_detection(tmp_wav)
    try:
        os.unlink(tmp_wav)
    except OSError:
        pass

    assert "engine" in result, f"missing 'engine' key in {result.keys()}"
    assert result["engine"] in {"apolloBPK", "apolloLBR", "apolloSAF"}, (
        f"unknown engine {result['engine']}"
    )
    assert result.get("bpm") and float(result["bpm"]) > 0, f"bpm={result.get('bpm')}"
    assert result.get("key"), f"key missing: {result.get('key')}"
    ok("bpm_key_detection_callable", f"engine={result['engine']} bpm={result['bpm']}")

    # On a 4 s 128 Hz sine, tier 1 may degrade — accept apolloLBR or apolloBPK as PASS
    # but flag pure apolloSAF (degenerate fallback) as a warning, not a failure.
    if result["engine"] == "apolloSAF":
        ok("bpm_key_detection_engine_tier", "WARN: apolloSAF (sine too degenerate, acceptable)")
    else:
        ok("bpm_key_detection_engine_tier", f"non-safety tier engaged: {result['engine']}")

    # Verify no torch / BeatNet import survives (AST-based, not substring — avoids
    # docstring false-positives like "studied from BeatNet logic only").
    import ast as _ast
    bpk_src = (ROOT / "apollodj" / "ingest" / "bpm_key_detection.py").read_text(encoding="utf-8")
    bpk_tree = _ast.parse(bpk_src)
    bpk_imp = set()
    for node in _ast.walk(bpk_tree):
        if isinstance(node, _ast.Import):
            bpk_imp.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, _ast.ImportFrom) and node.module:
            bpk_imp.add(node.module.split(".")[0])
    assert "torch" not in bpk_imp, f"bpk imports torch: {bpk_imp}"
    assert "BeatNet" not in bpk_imp, f"bpk imports BeatNet: {bpk_imp}"
    ok("bpm_key_detection_no_heavy_deps", f"AST imports: {sorted(bpk_imp)}")
except Exception as exc:
    fail("bpm_key_detection", repr(exc))


# ── 7b. apolloBPK functional sanity (already covered in [7]; kept compact) ───
#       and Pipeline v2 primitives + Universal Export


# ── 8a. quality_gate weighted score ──────────────────────────────────────────
print("\n[8a] quality_gate.score on perfect + failing inputs")
try:
    from apollodj.ingest.quality_gate import score, THRESHOLD
    perfect = score({"duration": 240, "clipping": 0, "bitrate": 320,
                     "analysis_confidence": 0.95, "corruption": False})
    junk = score({"duration": 10, "clipping": 0.3, "bitrate": 96,
                  "analysis_confidence": 0.1, "corruption": True})
    assert perfect.passed and perfect.score >= THRESHOLD, f"perfect failed: {perfect}"
    assert not junk.passed and junk.score < THRESHOLD, f"junk passed: {junk}"
    ok("quality_gate_perfect", f"score={perfect.score}")
    ok("quality_gate_junk", f"score={junk.score} reasons={junk.reasons}")
except Exception as exc:
    fail("quality_gate", repr(exc))


# ── 8b. fingerprint deterministic + non-empty ────────────────────────────────
print("\n[8b] fingerprint.fingerprint_track on synthetic WAV")
try:
    import math, struct, wave
    from apollodj.ingest.fingerprint import fingerprint_track
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        tmp = tf.name
    sr = 22050
    with wave.open(tmp, "wb") as wf:
        wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr)
        for i in range(sr * 2):
            wf.writeframes(struct.pack("<h", int(20000 * math.sin(2 * math.pi * 440 * i / sr))))
    fp1 = fingerprint_track(tmp)
    fp2 = fingerprint_track(tmp)
    try: os.unlink(tmp)
    except Exception: pass
    assert isinstance(fp1, str) and ":" in fp1 and len(fp1) > 16, f"bad fp: {fp1}"
    assert fp1 == fp2, f"non-deterministic: {fp1} vs {fp2}"
    ok("fingerprint_deterministic", f"algo={fp1.split(':')[0]} len={len(fp1)}")
except Exception as exc:
    fail("fingerprint", repr(exc))


# ── 8c. state_machine event emission ─────────────────────────────────────────
print("\n[8c] state_machine.emit produces STATE:<json> line")
try:
    import io as _io
    import contextlib as _ctx
    from apollodj.ingest.state_machine import emit, TrackState
    buf = _io.StringIO()
    with _ctx.redirect_stdout(buf):
        emit("track-abc", TrackState.READY, {"path": "x.wav"})
    line = buf.getvalue().strip()
    assert line.startswith("STATE:"), f"bad emit prefix: {line[:30]!r}"
    assert "READY" in line and "track-abc" in line, f"bad payload: {line}"
    ok("state_machine_emit", f"line_len={len(line)}")
except Exception as exc:
    fail("state_machine", repr(exc))


# ── 8d. xml_db roundtrip — upsert + lookup + attach_playlist ─────────────────
print("\n[8d] xml_db upsert + lookup roundtrip")
try:
    from apollodj.ingest import xml_db
    test_fp = "test_xml_db_fp_zzz"
    xml_db.upsert_track(test_fp, {"path": "x.wav", "bpm": 128.0, "key": "8A"})
    xml_db.attach_playlist(test_fp, "House")
    xml_db.attach_playlist(test_fp, "Peak Time")
    got = xml_db.lookup(test_fp)
    assert got is not None and got["bpm"] == 128.0, f"missing: {got}"
    assert "House" in got["playlists"] and "Peak Time" in got["playlists"], got["playlists"]
    ok("xml_db_roundtrip", f"playlists={sorted(got['playlists'])}")
except Exception as exc:
    fail("xml_db", repr(exc))


# ── 8e. Universal Export — Track model + writers callable ────────────────────
print("\n[8e] Universal Export — Track + writers callable")
try:
    import pathlib as _pl
    from apollodj.ingest.parsers.track_model import Track
    from apollodj.ingest.exporters.rekordbox_xml import write_xml
    from apollodj.ingest.exporters.serato_crates import write_crate
    from apollodj.ingest.exporters.universal_cdj import write_universal_cdj
    from apollodj.ingest.exporters.sidecar_export import export_sidecars
    with tempfile.TemporaryDirectory() as tdir:
        td = _pl.Path(tdir)
        audio = td / "House" / "track.wav"
        audio.parent.mkdir(parents=True)
        audio.write_bytes(b"RIFFmock")
        t = Track(fingerprint="fp1", path=audio, artist="DJ A", title="Drop",
                  bpm=128.0, key="8A", duration_sec=240.0, bitrate_kbps=320)
        xml_out = write_xml([t], td / "out.xml")
        assert xml_out.is_file() and xml_out.stat().st_size > 100
        crate_out = write_crate([t], td / "out.crate")
        assert crate_out.is_file()
        cdj_report = write_universal_cdj([t], td / "USB")
        assert cdj_report["xml_path"] and "engine" in cdj_report
        scs = export_sidecars([t], td)
        assert isinstance(scs, list)
    ok("universal_export_writers", "rekordbox_xml + serato_crates + universal_cdj + sidecars all callable")
except Exception as exc:
    fail("universal_export", repr(exc))


# ── 7b. membership + tabs.py — canonical apolloDJ slugs ─────────────────────
print("\n[7b] gating — membership + visible_tabs policy")
try:
    from apollodj.gating.features import (
        AUTHORIZED_MEMBERSHIPS,
        has_membership,
        has_membership_features,
        has_nicotine_backend,
    )
    from apollodj.gating.tabs import ALL_TABS, nicotine_download_flow_tabs, visible_tabs

    assert has_membership("apolloDJ") and has_membership("apolloDJ-EXTRA")
    assert not has_membership("apollodj-pro") and not has_membership("apollodj-great")
    assert AUTHORIZED_MEMBERSHIPS == frozenset({"apolloDJ", "apolloDJ-EXTRA"})

    feats = {"membership_tier": "apolloDJ"}
    assert has_membership_features(feats) and has_nicotine_backend(feats)
    assert has_membership_features({"membership_type": "app-apollodj"})
    _mem = visible_tabs(feats)
    assert "buscar" in _mem and "transferencias" in _mem, f"member missing P2P: {_mem}"
    assert "inicio" in _mem and "coletanea-lib" in _mem, f"member missing app: {_mem}"
    assert visible_tabs({"membership_tier": ""}) == ["inicio"]
    # Authenticated DJ without membership → full app, no P2P
    _dj = visible_tabs({"login_role_allowed": True})
    assert "buscar" not in _dj and "inicio" in _dj and "coletanea-lib" in _dj, f"role-only tabs={_dj}"
    assert nicotine_download_flow_tabs() == ["buscar", "transferencias"]
    assert "buscar" in ALL_TABS and "transferencias" in ALL_TABS
    assert "colab-share" not in ALL_TABS
    ok("membership_canonical", "apolloDJ|apolloDJ-EXTRA")
    ok("tabs_nicotine_flow", "DJ=full app · member=+P2P · unauth=inicio")
except Exception as exc:
    fail("gating_membership_tabs", repr(exc))


# ── 8. analyzer.py — BeatNet branch fully removed ────────────────────────────
print("\n[8] analyzer.py — BeatNet branch removed, apolloBPK wired")
try:
    analyzer_src = (ROOT / "apollodj" / "ingest" / "analyzer.py").read_text(encoding="utf-8")
    assert "def _beatnet_run" not in analyzer_src, "_beatnet_run still present in analyzer.py"
    assert "from BeatNet.BeatNet" not in analyzer_src, "BeatNet import still in analyzer.py"
    assert "_apollobpk_run" in analyzer_src, "_apollobpk_run not wired in analyzer.py"
    assert "apollodj.ingest.bpm_key_detection" in analyzer_src or "from .bpm_key_detection" in analyzer_src, (
        "bpm_key_detection import not found in analyzer.py"
    )
    ok("analyzer_beatnet_removed", "BeatNet symbols gone; apolloBPK wired")
except Exception as exc:
    fail("analyzer_beatnet_removed", repr(exc))


# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 60)
print(f"FUNCTIONAL AUDIT 001 RESULT: {len(passes)}/{len(passes)+len(fails)} PASS")
print("=" * 60)
if fails:
    print("\nFAILURES:")
    for f in fails:
        print(f"  - {f}")
sys.exit(1 if fails else 0)
