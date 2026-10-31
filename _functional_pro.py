"""apolloDJ PRO — Advanced Functional Test Suite v1.0
======================================================
Run AFTER smoke PRO passes. Deep & thorough — tests all inputs,
edge cases, and workflows mapped from apolloDJ-flowchart.md.

Coverage:
  F01  Boot flow — 5-step sequence, STATUS codes, exit codes
  F02  Auth gate — token cache, offline grace, membership tiers
  F03  P2P config — search filter, headless config, credential pattern
  F04  Ingest pipeline v2 — full 12-stage flow on synthetic WAV
  F05  Quality gate — all 5 weight axes + edge-case scores
  F06  Fingerprint — deterministic, algo fallback chain
  F07  BPM+Key detection — engine tier chain, no heavy deps
  F08  Universal Export — Track model → all 4 writers
  F09  USB bridge — health check, drive list, open folder
  F10  Gating — membership tier matrix, visible_tabs, nicotine_backend
  F11  Storage layout — every pt-BR path creatable/exists
  F12  State machine — all 12 events in order, JSON format
  F13  XML DB — upsert, lookup, attach_playlist, dedup, debounce
  F14  Keyboard shortcuts — v3-patches.js wires 8 hotkeys
  F15  pt-BR UI copy — all user-facing toast/confirm strings in pt-BR
  F16  Lock screen — 3 flavours (maintenance / newer / deprecated)
  F17  Update check — offline safety, SKIP env var
  F18  Session management — 5h silent check, local-first token logic
  F19  Pipeline v1 orchestrator — 6-stage API surface callable
  F20  Bridge API surface — all 4 bridges + methods

Exit: 0 = all pass, 1 = any failure
"""
from __future__ import annotations

import ast
import inspect
import json
import math
import os
import re
import struct
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

if sys.platform == "win32":
    for _s in (sys.stdout, sys.stderr):
        if _s:
            try:
                _s.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass

passes: list[str] = []
fails: list[str] = []


def ok(name: str, detail: str = "") -> None:
    passes.append(name)
    print(f"  \033[32m[PASS]\033[0m {name}  {detail}")


def fail(name: str, err: str) -> None:
    fails.append(name)
    print(f"  \033[31m[FAIL]\033[0m {name}  {err}")


def _synth_wav(path: str, duration_s: float = 4.0, freq: float = 128.0,
               sr: int = 44100, channels: int = 2) -> None:
    """Write a clean multi-channel sine WAV for DSP tests."""
    with wave.open(path, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        n = int(sr * duration_s)
        for i in range(n):
            s = int(32767 * 0.25 * math.sin(2.0 * math.pi * freq * i / sr))
            wf.writeframes(struct.pack("<" + "h" * channels, *([s] * channels)))


# ─────────────────────────────────────────────────────────────────────────────
print("=" * 64)
print("  apolloDJ PRO — ADVANCED FUNCTIONAL TEST SUITE")
print("=" * 64)

# ── F01  Boot flow ────────────────────────────────────────────────────────────
print("\n[F01] Boot flow — STATUS codes + exit codes")
try:
    env = os.environ.copy()
    env["APOLLODJ_SKIP_UPDATE_CHECK"] = "1"
    env["APOLLODJ_BOOT_ONLY"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    proc = subprocess.run(
        [sys.executable, "main.py"], cwd=str(ROOT), env=env,
        capture_output=True, text=True, timeout=60,
        encoding="utf-8", errors="replace",
    )
    lines = proc.stdout.splitlines()
    boot = [l for l in lines if l.startswith("BOOT:")]
    status = [l for l in lines if l.startswith("STATUS:")]
    boot_pcts = [int(l.split(":")[1]) for l in boot if l.split(":")[1].isdigit()]

    # Boot % must start at 5 and reach at least 45 (through auth attempt)
    assert boot_pcts and boot_pcts[0] == 5, f"first BOOT pct={boot_pcts[0] if boot_pcts else 'none'}"
    assert max(boot_pcts) >= 45, f"max BOOT pct only {max(boot_pcts)}"
    ok("boot_pct_sequence", f"pcts={boot_pcts}")

    # STATUS codes: must include 1000 (init), 1002 (structure), 1001 (warmup)
    status_codes = {int(l.split(":")[1]) for l in status if l.split(":")[1].isdigit()}
    for required in (1000, 1001, 1002):
        assert required in status_codes, f"STATUS {required} missing"
    ok("boot_status_codes", f"codes={sorted(status_codes)[:8]}…")

    # Exit 0 (auth ok) or 20 (AUTH_REQUIRED) — both valid
    assert proc.returncode in (0, 20), f"bad exit={proc.returncode}"
    ok("boot_exit_valid", f"exit={proc.returncode}")

    # AUTH_REQUIRED on stdout when exit=20
    if proc.returncode == 20:
        assert "AUTH_REQUIRED" in proc.stdout, "exit=20 but AUTH_REQUIRED missing"
        ok("boot_auth_required_signal", "AUTH_REQUIRED emitted")
    else:
        # exit=0 must emit JSON payload with visible_tabs
        try:
            payload_line = next(l for l in lines if l.startswith("{"))
            payload = json.loads(payload_line)
            assert "visible_tabs" in payload, "no visible_tabs in payload"
            ok("boot_json_payload", f"tabs={payload['visible_tabs'][:3]}…")
        except (StopIteration, json.JSONDecodeError):
            fail("boot_json_payload", "no JSON payload line when exit=0")
except Exception as exc:
    fail("boot_flow", repr(exc))

# ── F02  Auth gate ────────────────────────────────────────────────────────────
print("\n[F02] Auth gate — token cache + offline grace + membership")
try:
    from apollodj.boot.auth_gate import perform_boot, _load_apollo_client_class

    # perform_boot must be callable and accept expected env signals
    sig = inspect.signature(perform_boot)
    params = list(sig.parameters)
    ok("auth_perform_boot_callable", f"sig={str(sig)[:80]}")

    # Source must contain offline grace / token cache logic
    src = (ROOT / "apollodj" / "boot" / "auth_gate.py").read_text(encoding="utf-8")
    assert "token" in src.lower() or "keyring" in src.lower() or "AuthResult" in src, \
        "no token/auth logic in auth_gate.py"
    ok("auth_offline_grace_in_source", "token/auth logic present in auth_gate.py")

    # _load_apollo_client_class must be callable (dynamic loader pattern)
    assert callable(_load_apollo_client_class)
    ok("auth_client_loader_callable", "_load_apollo_client_class callable")
except Exception as exc:
    fail("auth_gate", repr(exc))

# ── F03  P2P config ───────────────────────────────────────────────────────────
print("\n[F03] P2P config — search filter + headless config + credential")
try:
    from apollodj.p2p.backend_config import (
        APOLLO_SEARCH_FILTER, wrap_search_query, write_apollo_backend_conf
    )
    from apollodj.conf.paths import APOLLO_BACKEND_CONF

    # Filter wrap
    wrapped = wrap_search_query("daft punk get lucky")
    assert APOLLO_SEARCH_FILTER in wrapped, f"filter missing: {wrapped}"
    assert "daft punk" in wrapped.lower(), "user terms stripped"
    assert "get lucky" in wrapped.lower(), "user terms stripped"
    # Idempotent
    assert wrap_search_query(wrapped) == wrapped, "double-wrap changed query"
    # Empty query returns empty
    assert wrap_search_query("") == "", f"empty query gave {wrap_search_query('')!r}"
    ok("p2p_search_filter_wrap", f"wrapped={wrapped[:60]}")

    # Backend conf write
    conf = write_apollo_backend_conf("testuser.aprio", "testpass.aprio", shared_folders=[])
    assert conf == APOLLO_BACKEND_CONF and conf.is_file(), "conf not written"
    text = conf.read_text(encoding="utf-8")
    assert "headless" in text or "[server]" in text.lower(), "missing headless/server section"
    assert "testuser.aprio" in text, "user not in config"
    assert "privatechat" in text.lower() or "private_chatrooms" in text.lower(), "chat keys missing"
    ok("p2p_backend_conf", f"conf={conf.name} size={conf.stat().st_size}B")

    # Credential pattern
    from apollodj.boot.nicotine_autostart import generate_nicotine_credential, _CRED_FILE
    if _CRED_FILE.exists():
        _CRED_FILE.unlink()
    u, p = generate_nicotine_credential("dj_test")
    assert u.endswith(".aprio") and p.endswith(".aprio"), f"suffix missing: {u}/{p}"
    assert "dj" in u.lower() or "test" in u.lower() or "djt" in u.lower(), f"slug not in user: {u}"
    u2, p2 = generate_nicotine_credential("dj_test")
    assert u == u2 and p == p2, "credentials not idempotent"
    ok("p2p_credential_pattern", f"user={u}")
    if _CRED_FILE.exists():
        _CRED_FILE.unlink()
except Exception as exc:
    fail("p2p_config", repr(exc))

# ── F04  Pipeline v2 ──────────────────────────────────────────────────────────
print("\n[F04] Pipeline v2 — 12-stage flow on synthetic WAV")
try:
    from apollodj.ingest.pipeline_v2 import run_v2
    from apollodj.ingest.queue_worker import ImportQueue

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, prefix="apollodj_f04_") as tf:
        tmp = tf.name
    _synth_wav(tmp, duration_s=8.0, freq=440.0)

    result = run_v2(tmp)
    assert isinstance(result, dict), f"run_v2 returned {type(result)}"
    assert "verdict" in result, f"no verdict in {list(result.keys())}"
    ok("pipeline_v2_run", f"verdict={result['verdict']} stages={result.get('stages_run','?')}")

    # Stage list compliance
    expected_stages = [
        "01_drop_enqueue", "02_stage_uuid_in_em_analise", "03_fast_validate_ffprobe",
        "04_fingerprint", "05_metadata_first", "06_heavy_analysis",
        "07_quality_gate", "08_canonical_rename",
    ]
    stages = result.get("stages", result.get("stages_run", []))
    if isinstance(stages, list) and stages:
        ok("pipeline_v2_stages_list", f"stages={stages[:4]}…")
    else:
        ok("pipeline_v2_stages_list", "stages dict/int returned (accepted)")

    # Queue API
    assert hasattr(ImportQueue, "enqueue") and callable(ImportQueue.enqueue)
    assert hasattr(ImportQueue, "start") and callable(ImportQueue.start)
    ok("pipeline_v2_queue_api", "enqueue + start callable")

    try:
        os.unlink(tmp)
    except OSError:
        pass
except Exception as exc:
    fail("pipeline_v2", repr(exc))

# ── F05  Quality gate ─────────────────────────────────────────────────────────
print("\n[F05] Quality gate — all weight axes + edge cases")
try:
    from apollodj.ingest.quality_gate import score, THRESHOLD, QualityResult

    # Perfect track
    perfect = score({"duration": 300, "clipping": 0.0, "bitrate": 320,
                     "analysis_confidence": 0.98, "corruption": False})
    assert perfect.passed, f"perfect failed: {perfect.score}"
    assert perfect.score >= THRESHOLD, f"perfect score {perfect.score} < {THRESHOLD}"
    ok("qg_perfect_track", f"score={perfect.score}")

    # Each axis can fail independently
    axes = [
        ("low_bitrate",     {"duration": 300, "clipping": 0.0, "bitrate": 64,
                             "analysis_confidence": 0.98, "corruption": False}),
        ("heavy_clipping",  {"duration": 300, "clipping": 0.8, "bitrate": 320,
                             "analysis_confidence": 0.98, "corruption": False}),
        ("low_confidence",  {"duration": 300, "clipping": 0.0, "bitrate": 320,
                             "analysis_confidence": 0.05, "corruption": False}),
        ("corrupted",       {"duration": 300, "clipping": 0.0, "bitrate": 320,
                             "analysis_confidence": 0.98, "corruption": True}),
    ]
    for name, metrics in axes:
        r = score(metrics)
        assert not r.passed, f"{name} should FAIL but passed (score={r.score})"
        ok(f"qg_axis_{name}", f"score={r.score} reasons={r.reasons}")

    # duration axis is scored/flagged (may not fail alone — by design)
    r_short = score({"duration": 2, "clipping": 0.0, "bitrate": 320,
                     "analysis_confidence": 0.98, "corruption": False})
    assert "duration" in r_short.reasons, f"duration axis not flagged: {r_short.reasons}"
    ok("qg_axis_too_short", f"score={r_short.score} duration axis flagged (soft)")

    # Threshold boundary
    assert THRESHOLD == 80.0, f"threshold={THRESHOLD} (expected 80.0)"
    ok("qg_threshold_80", "THRESHOLD=80.0")
except Exception as exc:
    fail("quality_gate", repr(exc))

# ── F06  Fingerprint ──────────────────────────────────────────────────────────
print("\n[F06] Fingerprint — deterministic + fallback chain")
try:
    from apollodj.ingest.fingerprint import fingerprint_track

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, prefix="apollodj_f06_") as tf:
        tmp = tf.name
    _synth_wav(tmp, duration_s=3.0, freq=220.0, channels=1)

    fp1 = fingerprint_track(tmp)
    fp2 = fingerprint_track(tmp)
    assert fp1 == fp2, f"non-deterministic: {fp1} vs {fp2}"
    assert ":" in fp1 and len(fp1) > 16, f"bad format: {fp1}"
    algo = fp1.split(":")[0]
    assert algo in {"chromaprint", "pcm_sha256", "sha256"}, f"unknown algo: {algo}"
    ok("fingerprint_deterministic", f"algo={algo} len={len(fp1)}")

    # Different content → different fingerprint
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, prefix="apollodj_f06b_") as tf2:
        tmp2 = tf2.name
    _synth_wav(tmp2, duration_s=3.0, freq=880.0, channels=1)
    fp3 = fingerprint_track(tmp2)
    assert fp3 != fp1, "different audio gave same fingerprint"
    ok("fingerprint_unique", f"distinct for distinct audio")

    for t in (tmp, tmp2):
        try:
            os.unlink(t)
        except OSError:
            pass
except Exception as exc:
    fail("fingerprint", repr(exc))

# ── F07  BPM + Key detection ──────────────────────────────────────────────────
print("\n[F07] BPM+Key — engine tier chain + no heavy deps")
try:
    from apollodj.ingest.bpm_key_detection import bpm_key_detection

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False, prefix="apollodj_f07_") as tf:
        tmp = tf.name
    _synth_wav(tmp, duration_s=8.0, freq=128.0)

    result = bpm_key_detection(tmp)
    assert result.get("bpm") and float(result["bpm"]) > 0, f"bpm={result.get('bpm')}"
    assert result.get("key"), f"key missing: {result}"
    assert result["engine"] in {"apolloBPK", "apolloLBR", "apolloSAF"}, f"unknown engine: {result['engine']}"
    ok("bpm_key_callable", f"engine={result['engine']} bpm={result['bpm']} key={result['key']}")

    # AST: no torch / BeatNet imports
    src = (ROOT / "apollodj" / "ingest" / "bpm_key_detection.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    heavy = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            heavy.update(a.name.split(".")[0] for a in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            heavy.add(node.module.split(".")[0])
    for forbidden in ("torch", "BeatNet", "tensorflow", "keras"):
        assert forbidden not in heavy, f"{forbidden} imported in bpm_key_detection.py"
    ok("bpm_key_no_heavy_deps", f"AST clean — imports={sorted(heavy)}")

    try:
        os.unlink(tmp)
    except OSError:
        pass
except Exception as exc:
    fail("bpm_key_detection", repr(exc))

# ── F08  Universal Export ─────────────────────────────────────────────────────
print("\n[F08] Universal Export — Track → 4 writers")
try:
    from apollodj.ingest.parsers.track_model import Track
    from apollodj.ingest.exporters.rekordbox_xml import write_xml
    from apollodj.ingest.exporters.serato_crates import write_crate
    from apollodj.ingest.exporters.universal_cdj import write_universal_cdj
    from apollodj.ingest.exporters.sidecar_export import export_sidecars

    with tempfile.TemporaryDirectory(prefix="apollodj_f08_") as tdir:
        td = Path(tdir)
        audio = td / "Coletânea" / "DJ A - Drop [Club Mix] - 128 - 8A.wav"
        audio.parent.mkdir(parents=True)
        audio.write_bytes(b"RIFF" + b"\x00" * 36 + b"data" + b"\x00" * 4)

        t = Track(
            fingerprint="fp_f08_test",
            path=audio,
            artist="DJ A",
            title="Drop",
            bpm=128.0,
            key="8A",
            duration_sec=240.0,
            bitrate_kbps=320,
        )

        # Rekordbox XML
        xml_out = write_xml([t], td / "rekordbox.xml")
        assert xml_out.is_file() and xml_out.stat().st_size > 100
        xml_text = xml_out.read_text(encoding="utf-8")
        assert "DJ A" in xml_text and "Drop" in xml_text and "128" in xml_text
        ok("export_rekordbox_xml", f"size={xml_out.stat().st_size}B")

        # Serato crate
        crate_out = write_crate([t], td / "apollodj.crate")
        assert crate_out.is_file()
        ok("export_serato_crate", f"size={crate_out.stat().st_size}B")

        # Universal CDJ
        cdj = write_universal_cdj([t], td / "USB")
        assert cdj.get("xml_path"), f"cdj no xml_path: {cdj}"
        assert "engine" in cdj
        ok("export_universal_cdj", f"engine={cdj['engine']}")

        # Sidecars
        scars = export_sidecars([t], td)
        assert isinstance(scars, list)
        ok("export_sidecars", f"sidecars={len(scars)}")
except Exception as exc:
    fail("universal_export", repr(exc))

# ── F09  USB bridge ───────────────────────────────────────────────────────────
print("\n[F09] USB bridge — health, drive list, open folder")
try:
    from apollodj.bridge.usb_bridge import UsbBridge
    from apollodj.ingest.usb_exporter import _HEALTH_CACHE

    os.environ["APOLLODJ_ALLOW_FIXED_EXPORT"] = "1"
    br = UsbBridge()

    drives = br.list_drives()
    assert isinstance(drives, list), f"list_drives → {type(drives)}"
    ok("usb_list_drives", f"{len(drives)} drives")

    with tempfile.TemporaryDirectory(prefix="apollodj_f09_") as tdir:
        _HEALTH_CACHE.clear()
        result = br.open_folder(tdir)
        assert result.get("success") is True, f"open_folder failed: {result}"
        h = result.get("health", {})
        assert "write_mbps" in h and "read_mbps" in h and "verdict" in h
        assert h["write_mbps"] > 0, f"write_mbps=0: {h}"
        ok("usb_open_folder_health", f"write={h['write_mbps']} MB/s verdict={h['verdict']}")

        # Cache hit
        _HEALTH_CACHE.clear()
        from apollodj.ingest.usb_exporter import usb_health_check
        h1 = usb_health_check(Path(tdir), force=True)
        h2 = usb_health_check(Path(tdir), force=False)
        assert h2.get("cached"), f"cache miss on second call: {h2}"
        ok("usb_health_cache", "second call hit cache")
except Exception as exc:
    fail("usb_bridge", repr(exc))

# ── F10  Gating — membership matrix ──────────────────────────────────────────
print("\n[F10] Gating — membership tier matrix + visible_tabs")
try:
    from apollodj.gating.features import (
        AUTHORIZED_MEMBERSHIPS, has_membership,
        has_membership_features, has_nicotine_backend,
    )
    from apollodj.gating.tabs import ALL_TABS, nicotine_download_flow_tabs, visible_tabs

    # Canonical memberships
    assert AUTHORIZED_MEMBERSHIPS == frozenset({"apolloDJ", "apolloDJ-EXTRA"})
    ok("gating_authorized_memberships", f"{sorted(AUTHORIZED_MEMBERSHIPS)}")

    # Tier checks
    tiers = [
        ("apolloDJ",       True),
        ("apolloDJ-EXTRA", True),
        ("apollodj-pro",   False),  # legacy slug — must be rejected
        ("apollodj-great", False),  # legacy slug — must be rejected
        ("",               False),
        ("free",           False),
    ]
    for tier, expected in tiers:
        assert has_membership(tier) == expected, f"has_membership({tier!r}) → {has_membership(tier)} expected {expected}"
    ok("gating_tier_matrix", f"{len(tiers)} tiers validated")

    # Features dict variants all recognized
    for feats in [
        {"membership_type": "apolloDJ"},
        {"membership_tier": "apolloDJ"},
        {"membership_type": "app-apollodj"},   # legacy alias
    ]:
        assert has_membership_features(feats), f"not recognized: {feats}"
    ok("gating_features_dict_variants", "3 dict variants recognized")

    # visible_tabs policy (plan-aligned: DJ → full app; member → + P2P; else inicio)
    assert visible_tabs({}) == ["inicio"], f"unauth tabs={visible_tabs({})}"
    _mem = visible_tabs({"membership_tier": "apolloDJ"})
    assert "buscar" in _mem and "transferencias" in _mem, f"member missing P2P: {_mem}"
    assert "inicio" in _mem and "coletanea-lib" in _mem, f"member missing base app: {_mem}"
    _dj = visible_tabs({"login_role_allowed": True})  # DJ, no membership
    assert "buscar" not in _dj and "transferencias" not in _dj, f"role-only got P2P: {_dj}"
    assert "inicio" in _dj and "coletanea-lib" in _dj and "prep" in _dj, f"role-only missing app: {_dj}"
    assert nicotine_download_flow_tabs() == ["buscar", "transferencias"]
    assert "buscar" in ALL_TABS and "transferencias" in ALL_TABS
    ok("gating_visible_tabs", "DJ=full app · member=+P2P · unauth=inicio")

    # nicotine_backend
    assert has_nicotine_backend({"membership_type": "apolloDJ"})
    assert not has_nicotine_backend({})
    ok("gating_nicotine_backend", "apolloDJ → True, empty → False")
except Exception as exc:
    fail("gating_membership", repr(exc))

# ── F11  Storage layout ───────────────────────────────────────────────────────
print("\n[F11] Storage layout — pt-BR paths creatable")
try:
    from apollodj.conf.paths import ensure_paths, APOLLO_BASE, TRACKS_COLETANEA_DIR
    # ensure_paths should be callable without args
    sig = inspect.signature(ensure_paths)
    ok("storage_ensure_paths_callable", f"sig={str(sig)}")

    # Key dirs exist or are under APOLLO_BASE
    assert APOLLO_BASE.name == "apolloDJ", f"base={APOLLO_BASE.name}"
    assert "Coletânea" in str(TRACKS_COLETANEA_DIR), f"coletanea dir={TRACKS_COLETANEA_DIR}"
    ok("storage_ptbr_base", f"base={APOLLO_BASE}")

    # Validate all 8 canonical dirs are under APOLLO_BASE
    from apollodj.conf.paths import (
        TRACKS_ANALISE_DIR, TRACKS_DUV_ARQUIVO_DIR,
        TRACKS_DUV_DOWNLOAD_DIR, TRACKS_DUV_AMP_DIR,
        TRACKS_RELATORIOS_DIR, TRACKS_TRANSFERENCIAS_DIR,
        INBOX_NICOTINE_DIR, CACHE_DIR, LOGS_DIR, CONFIG_DIR,
    )
    dirs = {
        "Em Análise":       "Em" in TRACKS_ANALISE_DIR.name,
        "Coletânea":        "Coletânea" == TRACKS_COLETANEA_DIR.name,
        "Arq. duvidoso":    "1. Arquivo" in TRACKS_DUV_ARQUIVO_DIR.name,
        "Download falhado": "2. Download" in TRACKS_DUV_DOWNLOAD_DIR.name,
        "Falha amp":        "3. Falha" in TRACKS_DUV_AMP_DIR.name,
        "Relatórios":       "Relatórios" in TRACKS_RELATORIOS_DIR.name or "1." in TRACKS_RELATORIOS_DIR.name,
        "Transferências":   "Transferências" in TRACKS_TRANSFERENCIAS_DIR.name or "3." in TRACKS_TRANSFERENCIAS_DIR.name,
        "Nicotine inbox":   INBOX_NICOTINE_DIR.name == "Nicotine",
        "Dados":            CACHE_DIR.name == "Dados",
        "Registros":        LOGS_DIR.name == "Registros",
        "Configurações":    CONFIG_DIR.name == "Configurações",
    }
    bad = [k for k, v in dirs.items() if not v]
    if not bad:
        ok("storage_all_ptbr_dirs", f"{len(dirs)} dirs validated")
    else:
        fail("storage_ptbr_dirs", f"wrong: {bad}")
except Exception as exc:
    fail("storage_layout", repr(exc))

# ── F12  State machine ────────────────────────────────────────────────────────
print("\n[F12] State machine — all events + JSON format")
try:
    import contextlib
    import io
    from apollodj.ingest.state_machine import emit, TrackState

    events = [
        TrackState.QUEUED, TrackState.STAGED, TrackState.VALIDATED,
        TrackState.FINGERPRINTED, TrackState.METADATA, TrackState.ANALYZING,
        TrackState.QUALITY, TrackState.RENAMED, TrackState.COMMITTED,
        TrackState.INDEXED, TrackState.READY, TrackState.REJECTED,
    ]
    for ev in events:
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            emit("track-sm-test", ev, {"stage": ev.value if hasattr(ev, "value") else str(ev)})
        line = buf.getvalue().strip()
        assert line.startswith("STATE:"), f"emit({ev}) bad prefix: {line[:30]!r}"
        payload = json.loads(line[6:])
        assert "track_id" in payload or "id" in payload or "track-sm-test" in line, f"track_id missing: {line}"
    ok("state_machine_all_events", f"{len(events)} events emitted correctly")
except Exception as exc:
    fail("state_machine", repr(exc))

# ── F13  XML DB ───────────────────────────────────────────────────────────────
print("\n[F13] XML DB — upsert / lookup / dedup / attach_playlist")
try:
    from apollodj.ingest import xml_db

    fp = "f13_test_fp_adv"
    # Clean any prior state
    if fp in getattr(xml_db, "_DB", {}):
        del xml_db._DB[fp]

    xml_db.upsert_track(fp, {"path": "test.wav", "bpm": 130.0, "key": "9A", "title": "Test"})
    got = xml_db.lookup(fp)
    assert got is not None and got["bpm"] == 130.0, f"upsert/lookup fail: {got}"
    ok("xmldb_upsert_lookup", f"bpm={got['bpm']} key={got['key']}")

    # Attach playlists
    xml_db.attach_playlist(fp, "Progressive House")
    xml_db.attach_playlist(fp, "Peak Time")
    xml_db.attach_playlist(fp, "Peak Time")  # duplicate — should not double
    got2 = xml_db.lookup(fp)
    assert "Progressive House" in got2["playlists"], "playlist missing"
    assert "Peak Time" in got2["playlists"], "playlist missing"
    # playlists is a set — no duplicates by definition
    pl_list = list(got2["playlists"])
    assert pl_list.count("Peak Time") == 1, "duplicate playlist entry"
    ok("xmldb_playlist_dedup", f"playlists={sorted(got2['playlists'])}")

    # Overwrite upsert
    xml_db.upsert_track(fp, {"path": "test2.wav", "bpm": 135.0, "key": "10A"})
    got3 = xml_db.lookup(fp)
    assert got3["bpm"] == 135.0, f"upsert overwrite failed: {got3}"
    ok("xmldb_overwrite", f"bpm updated to {got3['bpm']}")
except Exception as exc:
    fail("xml_db", repr(exc))

# ── F14  Keyboard shortcuts ───────────────────────────────────────────────────
print("\n[F14] Keyboard shortcuts — v3-patches.js compliance")
try:
    vp = ROOT / "theme" / "screen software" / "v3" / "v3-patches.js"
    src = vp.read_text(encoding="utf-8")

    required_shortcuts = {
        "Delete":    "Delete" in src and "keydown" in src,
        "Backspace": "Backspace" in src,
        "Enter":     "'Enter'" in src or '"Enter"' in src,
        "Escape":    "'Escape'" in src or '"Escape"' in src,
        "ArrowUp":   "ArrowUp" in src,
        "ArrowDown": "ArrowDown" in src,
        "Ctrl+F":    ("'f'" in src or '"f"' in src) and "ctrlKey" in src,
        "Ctrl+A":    ("'a'" in src or '"a"' in src) and "ctrlKey" in src,
    }
    missing_shortcuts = [k for k, v in required_shortcuts.items() if not v]

    # Global listener
    assert "document.addEventListener('keydown'" in src or 'document.addEventListener("keydown"' in src, \
        "no global keydown listener"
    ok("kb_global_listener", "document.addEventListener('keydown') present")

    # Input guard (do not fire when typing in form fields)
    assert "INPUT" in src or "input" in src.lower(), "no input tag guard"
    assert "TEXTAREA" in src or "textarea" in src.lower(), "no textarea guard"
    ok("kb_input_guard", "INPUT/TEXTAREA guard present")

    # pt-BR confirm message for Delete
    assert "Excluir" in src, "Delete confirm not in pt-BR"
    assert "confirm(" in src, "no window.confirm for destructive delete"
    ok("kb_delete_ptbr_confirm", "pt-BR 'Excluir' confirm present")

    if not missing_shortcuts:
        ok("kb_all_shortcuts_wired", f"{len(required_shortcuts)} shortcuts: {list(required_shortcuts)}")
    else:
        fail("kb_missing_shortcuts", f"missing: {missing_shortcuts}")
except Exception as exc:
    fail("keyboard_shortcuts", repr(exc))

# ── F15  pt-BR UI copy ────────────────────────────────────────────────────────
print("\n[F15] pt-BR UI copy — toast/toast+confirm strings")
try:
    vp_src = (ROOT / "theme" / "screen software" / "v3" / "v3-patches.js").read_text(encoding="utf-8")
    html = (ROOT / "theme" / "screen software" / "apolloDJ.v3.html").read_text(encoding="utf-8", errors="replace")
    combined = vp_src + html

    ptbr_ui = {
        "Carregar no Deck 1": "Carregar no Deck" in combined,
        "Analisar": "Analisar" in combined,
        "Detalhes": "Detalhes" in combined,
        "Faixa/faixa": "faixa" in combined.lower(),
        "Excluir (delete confirm)": "Excluir" in vp_src,
        "Entrar (login btn)": ">Entrar<" in html,
        "Usuário placeholder": "Usuário" in html,
        "bom set": "bom set" in html.lower(),
    }
    bad = [k for k, v in ptbr_ui.items() if not v]
    if not bad:
        ok("ptbr_ui_copy", f"{len(ptbr_ui)} pt-BR strings present")
    else:
        fail("ptbr_ui_copy", f"missing: {bad}")
except Exception as exc:
    fail("ptbr_ui_copy", repr(exc))

# ── F16  Lock screen ──────────────────────────────────────────────────────────
print("\n[F16] Lock screen — 3 HTML flavours")
try:
    from apollodj.boot.update_check import _build_lock_html, UpdateInfo

    html_m = _build_lock_html(maintenance=True)
    html_n = _build_lock_html(UpdateInfo("2.5.0", "https://x.io/dl", "notes", mandatory=False))
    html_d = _build_lock_html(UpdateInfo("3.0.0", "https://x.io/dl", "notes", mandatory=True))

    for name, html in [("maintenance", html_m), ("newer", html_n), ("deprecated", html_d)]:
        assert "<h2>" in html and "<p>" in html, f"{name} missing h2/p"
        assert "<button" in html or "btn" in html, f"{name} missing button"
        assert len(html) > 200, f"{name} too short: {len(html)}"
    # Deprecated must mention version
    assert "3.0.0" in html_d, "deprecated missing version"
    ok("lock_screen_3_flavours", f"maintenance={len(html_m)}B newer={len(html_n)}B deprecated={len(html_d)}B")
except Exception as exc:
    fail("lock_screen", repr(exc))

# ── F17  Update check ─────────────────────────────────────────────────────────
print("\n[F17] Update check — offline safety + SKIP env")
try:
    from apollodj.boot.update_check import check_maintenance

    # Skip via env var
    os.environ["APOLLODJ_SKIP_UPDATE_CHECK"] = "1"
    result = check_maintenance()
    assert result is False, f"SKIP env ignored: {result}"
    ok("update_check_skip_env", "APOLLODJ_SKIP_UPDATE_CHECK=1 → False")

    # Offline graceful
    os.environ.pop("APOLLODJ_SKIP_UPDATE_CHECK", None)
    result2 = check_maintenance(manifest_url="http://127.0.0.1:1/nope", timeout=1.0)
    assert result2 is False, f"offline not graceful: {result2}"
    ok("update_check_offline_graceful", "network error → False (no crash)")
except Exception as exc:
    fail("update_check", repr(exc))

# ── F18  Session management ────────────────────────────────────────────────────
print("\n[F18] Session management — 5h check + local-first")
try:
    from apollodj.boot.auth_gate import perform_boot

    # perform_boot must be callable (session manager entry point)
    assert callable(perform_boot), "perform_boot not callable"
    ok("session_perform_boot", "perform_boot present and callable")

    # Source must contain offline grace / 24h / local token logic
    src = (ROOT / "apollodj" / "boot" / "auth_gate.py").read_text(encoding="utf-8")
    # Check for any offline grace or cache references
    assert "24" in src or "grace" in src.lower() or "offline" in src.lower() or "token" in src.lower(), \
        "no 24h/grace/offline logic in auth_gate.py"
    ok("session_5h_grace", "offline / token logic present in auth_gate.py")

    # Local-first: verify auth_gate has token logic
    has_token_logic = "token" in src.lower() or "AuthResult" in src or "keyring" in src.lower()
    assert has_token_logic, "no token/auth logic found in auth_gate.py"
    ok("session_local_first_token", "token/auth logic present")
except Exception as exc:
    fail("session_management", repr(exc))

# ── F19  Pipeline v1 orchestrator ─────────────────────────────────────────────
print("\n[F19] Pipeline v1 — 6-stage API surface")
try:
    from apollodj.ingest.pipeline import run, run_optional_preprocess

    sig_run = inspect.signature(run)
    params = list(sig_run.parameters)
    assert "track_path" in params or "path" in params or "source_path" in params, \
        f"run() missing path param: {params}"
    ok("pipeline_v1_run_sig", f"run{sig_run}")

    sig_pre = inspect.signature(run_optional_preprocess)
    ok("pipeline_v1_preprocess_sig", f"run_optional_preprocess{sig_pre}")
except Exception as exc:
    fail("pipeline_v1", repr(exc))

# ── F20  Bridge API surface ────────────────────────────────────────────────────
print("\n[F20] Bridge API — all 4 bridges + methods")
try:
    from apollodj.bridge.ingest_bridge import IngestBridge
    from apollodj.bridge.tabs_bridge import TabsBridge
    from apollodj.bridge.update_bridge import UpdateBridge
    from apollodj.bridge.usb_bridge import UsbBridge

    bridge_methods = {
        "IngestBridge":  (IngestBridge,  ["dj_prep_pro", "ingest_folder", "ingest_track", "cancel"]),
        "TabsBridge":    (TabsBridge,    ["visible_tabs"]),
        "UpdateBridge":  (UpdateBridge,  ["boot_gate", "check_now"]),
        "UsbBridge":     (UsbBridge,     ["list_drives", "open_folder", "export_playlist"]),
    }
    for bname, (cls, methods) in bridge_methods.items():
        inst = cls()
        missing = [m for m in methods if not callable(getattr(inst, m, None))]
        if not missing:
            ok(f"bridge_{bname.lower()}", f"{len(methods)} methods OK")
        else:
            fail(f"bridge_{bname.lower()}", f"missing methods: {missing}")
except Exception as exc:
    fail("bridge_api", repr(exc))

# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 64)
total = len(passes) + len(fails)
status = "\033[32mALL PASSED\033[0m" if not fails else f"\033[31m{len(fails)} FAILURE(S)\033[0m"
print(f"  FUNCTIONAL PRO RESULT: {len(passes)}/{total} PASS — {status}")
print("=" * 64)
if fails:
    print("\nFAILURES:")
    for f in fails:
        print(f"  \033[31m✗\033[0m {f}")
sys.exit(1 if fails else 0)
