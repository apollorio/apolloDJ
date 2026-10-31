"""apolloDJ PRO — Advanced Smoke Test Suite v1.0
=================================================
First line of defence. Runs BEFORE functional tests.
If this fails → build is rejected immediately.

Gates (broad & shallow):
  S01  Python 3.12+ runtime
  S02  compileall — zero syntax errors
  S03  registry/disk parity — all declared modules on disk
  S04  Critical imports — no ImportError on any bridge/boot/gating module
  S05  boot sequence — main.py exits 0 or 20 within 60 s
  S06  pt-BR storage paths — all expected pt-BR names exist or can be created
  S07  Login HTML — placeholders / value="" / readonly / onfocus present
  S08  Keyboard shortcut compliance — v3.html shell wires global keydown handler
  S09  Theme locale — no English-only user-facing strings in wrong places
  S10  P2P policy — no GUI/chat/rooms in p2p modules (AST-level)
  S11  Exporter API surface — all 4 writers callable
  S12  test_exe.bat — file exists and references correct ps1 script

Exit: 0 = all pass, 1 = any failure
"""
from __future__ import annotations

import ast
import importlib
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import wave
from pathlib import Path
from typing import Any, Dict, List

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
warns: list[str] = []


def ok(name: str, detail: str = "") -> None:
    passes.append(name)
    print(f"  \033[32m[PASS]\033[0m {name}  {detail}")


def fail(name: str, err: str) -> None:
    fails.append(name)
    print(f"  \033[31m[FAIL]\033[0m {name}  {err}")


def warn(name: str, msg: str) -> None:
    warns.append(name)
    print(f"  \033[33m[WARN]\033[0m {name}  {msg}")


# ─────────────────────────────────────────────────────────────────────────────
print("=" * 62)
print("  apolloDJ PRO — ADVANCED SMOKE TEST SUITE")
print("=" * 62)

# ── S01  Python 3.12+ ─────────────────────────────────────────────────────────
print("\n[S01] Python runtime version")
try:
    vi = sys.version_info
    assert vi >= (3, 12), f"need >= 3.12, got {vi.major}.{vi.minor}.{vi.micro}"
    ok("python_version", f"{vi.major}.{vi.minor}.{vi.micro}")
except AssertionError as e:
    fail("python_version", str(e))

# ── S02  compileall ───────────────────────────────────────────────────────────
print("\n[S02] Syntax check — compileall")
try:
    proc = subprocess.run(
        [sys.executable, "-m", "compileall", "-q", "apollodj", "main.py"],
        cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    if proc.returncode == 0:
        ok("compileall", "zero syntax errors")
    else:
        fail("compileall", proc.stderr.strip()[:300])
except Exception as exc:
    fail("compileall", repr(exc))

# ── S03  Registry disk parity ─────────────────────────────────────────────────
print("\n[S03] Registry ↔ disk parity")
try:
    reg = json.loads((ROOT / "registry.json").read_text(encoding="utf-8"))
    _NESTED = {"parsers", "exporters"}
    missing = []
    for pkg, files in reg.get("modules", {}).items():
        base = ROOT / "apollodj" / ("ingest/" + pkg if pkg in _NESTED else pkg)
        for f in files:
            if f.endswith(".py") and not (base / f).is_file():
                missing.append(f"{pkg}/{f}")
    if not missing:
        ok("registry_disk_parity", f"{sum(len(v) for v in reg['modules'].values())} modules")
    else:
        fail("registry_disk_parity", f"missing: {', '.join(missing)}")
except Exception as exc:
    fail("registry_disk_parity", repr(exc))

# ── S04  Critical imports ─────────────────────────────────────────────────────
print("\n[S04] Critical module imports")
_CRITICAL_MODULES = [
    "apollodj.conf.paths",
    "apollodj.conf.constants",
    "apollodj.boot.auth_gate",
    "apollodj.boot.update_check",
    "apollodj.boot.nicotine_autostart",
    "apollodj.boot.ready_signal",
    "apollodj.gating.features",
    "apollodj.gating.tabs",
    "apollodj.bridge.ingest_bridge",
    "apollodj.bridge.tabs_bridge",
    "apollodj.bridge.update_bridge",
    "apollodj.bridge.usb_bridge",
    "apollodj.p2p.backend_config",
    "apollodj.p2p.service",
    "apollodj.ingest.pipeline",
    "apollodj.ingest.pipeline_v2",
    "apollodj.ingest.queue_worker",
    "apollodj.ingest.quality_gate",
    "apollodj.ingest.fingerprint",
    "apollodj.ingest.state_machine",
    "apollodj.ingest.xml_db",
    "apollodj.ingest.parsers.track_model",
    "apollodj.ingest.exporters.rekordbox_xml",
    "apollodj.ingest.exporters.serato_crates",
    "apollodj.ingest.exporters.universal_cdj",
    "apollodj.ingest.exporters.sidecar_export",
    "apollodj.installer_ui.launcher",
]
_import_fails = []
for mod in _CRITICAL_MODULES:
    try:
        importlib.import_module(mod)
    except Exception as exc:
        _import_fails.append(f"{mod}: {exc}")
if not _import_fails:
    ok("critical_imports", f"{len(_CRITICAL_MODULES)} modules OK")
else:
    for mf in _import_fails:
        fail("critical_import", mf)

# ── S05  Boot sequence ────────────────────────────────────────────────────────
print("\n[S05] Boot sequence — main.py (boot-only, no GUI)")
try:
    env = os.environ.copy()
    env["APOLLODJ_SKIP_UPDATE_CHECK"] = "1"
    env["APOLLODJ_BOOT_ONLY"] = "1"
    env["PYTHONUNBUFFERED"] = "1"
    proc = subprocess.run(
        [sys.executable, "main.py"],
        cwd=str(ROOT), env=env,
        capture_output=True, text=True,
        timeout=60, encoding="utf-8", errors="replace",
    )
    boot_lines = [l for l in proc.stdout.splitlines() if l.startswith("BOOT:")]
    if len(boot_lines) >= 4:
        ok("boot_protocol_lines", f"{len(boot_lines)} BOOT events")
    else:
        fail("boot_protocol_lines", f"only {len(boot_lines)} BOOT events (need ≥4)")
    if proc.returncode in (0, 20):
        ok("boot_exit_code", f"exit={proc.returncode} ({'AUTH_REQUIRED ok' if proc.returncode == 20 else 'authenticated'})")
    else:
        fail("boot_exit_code", f"unexpected exit {proc.returncode}: {proc.stderr[:200]}")
except subprocess.TimeoutExpired:
    fail("boot_sequence", "timeout >60 s")
except Exception as exc:
    fail("boot_sequence", repr(exc))

# ── S06  pt-BR storage paths ──────────────────────────────────────────────────
print("\n[S06] pt-BR storage layout compliance")
try:
    from apollodj.conf.paths import (
        APOLLO_BASE, TRACKS_ANALISE_DIR, TRACKS_COLETANEA_DIR,
        TRACKS_BAIXANDO_DIR, INBOX_NICOTINE_DIR, CACHE_DIR,
        LOGS_DIR, CONFIG_DIR,
    )
    checks = {
        "base=apolloDJ": APOLLO_BASE.name == "apolloDJ",
        "0. Em Análise": "Em" in TRACKS_ANALISE_DIR.name and "Análise" in TRACKS_ANALISE_DIR.name,
        "Coletânea": TRACKS_COLETANEA_DIR.name == "Coletânea",
        "Baixando": TRACKS_BAIXANDO_DIR.name == "Baixando",
        "Nicotine inbox": INBOX_NICOTINE_DIR.name == "Nicotine",
        "Dados (cache)": CACHE_DIR.name == "Dados",
        "Registros (logs)": LOGS_DIR.name == "Registros",
        "Configurações": CONFIG_DIR.name == "Configurações",
    }
    bad = [k for k, v in checks.items() if not v]
    if not bad:
        ok("ptbr_storage_paths", f"{len(checks)} path names correct")
    else:
        fail("ptbr_storage_paths", f"wrong names: {bad}")
except Exception as exc:
    fail("ptbr_storage_paths", repr(exc))

# ── S07  Login HTML compliance ────────────────────────────────────────────────
print("\n[S07] Login screen HTML — placeholders + readonly trick")
try:
    html_path = ROOT / "theme" / "screen software" / "apolloDJ.v3.html"
    html = html_path.read_text(encoding="utf-8", errors="replace")
    checks = {
        'placeholder="Usuário"': 'placeholder="Usuário"' in html,
        'placeholder="Senha"': 'placeholder="Senha"' in html,
        'id="login-user"': 'id="login-user"' in html,
        'id="login-pass"': 'id="login-pass"' in html,
        'value="" (user)': re.search(r'id="login-user"[^>]*value=""', html) or re.search(r'value=""[^>]*id="login-user"', html),
        'readonly onfocus trick': 'readonly' in html and 'removeAttribute' in html,
        'apolloLogin function': 'window.apolloLogin' in html or 'function apolloLogin' in html,
        'hideLoginScreen': 'function hideLoginScreen' in html,
        'login-screen display hidden': '#login-screen' in html,
    }
    bad = [k for k, v in checks.items() if not v]
    if not bad:
        ok("login_html_compliance", f"{len(checks)} checks")
    else:
        fail("login_html_compliance", f"missing: {bad}")
except Exception as exc:
    fail("login_html_compliance", repr(exc))

# ── S08  Keyboard shortcut wiring ─────────────────────────────────────────────
print("\n[S08] Keyboard shortcut global handler wired in shell")
try:
    html_path = ROOT / "theme" / "screen software" / "apolloDJ.v3.html"
    html = html_path.read_text(encoding="utf-8", errors="replace")
    # Check for global keydown listener for Delete key
    has_global_keydown = "document.addEventListener('keydown'" in html or \
                         'document.addEventListener("keydown"' in html
    # Check for Delete key handler in v3 patches or shell
    vp_path = ROOT / "theme" / "screen software" / "v3" / "v3-patches.js"
    vp_src = vp_path.read_text(encoding="utf-8", errors="replace") if vp_path.exists() else ""
    has_delete_in_patches = "Delete" in vp_src and "keydown" in vp_src
    if has_global_keydown or has_delete_in_patches:
        ok("keyboard_global_keydown", "global keydown handler present")
    else:
        fail("keyboard_global_keydown", "no document.addEventListener('keydown') — DEL key not wired")
    # Check Enter on login
    has_login_enter = re.search(r"keydown.*Enter.*login|login.*keydown.*Enter|key.*Enter.*apolloLogin", html, re.S | re.I)
    if has_login_enter:
        ok("keyboard_login_enter", "Enter key triggers login")
    else:
        fail("keyboard_login_enter", "Enter key on login-screen not wired")
except Exception as exc:
    fail("keyboard_shortcuts", repr(exc))

# ── S09  Theme pt-BR locale ───────────────────────────────────────────────────
print("\n[S09] Theme locale — key pt-BR strings present")
try:
    html = (ROOT / "theme" / "screen software" / "apolloDJ.v3.html").read_text(encoding="utf-8", errors="replace")
    pt_checks = {
        "Usuário": "Usuário" in html,
        "Senha": "Senha" in html,
        "Buscar": "Buscar" in html or "buscar" in html,
        "Coletânea": "Coletânea" in html or "coletanea" in html,
        "Transferências": "Transferências" in html or "transferencias" in html,
        "Faixas / faixa": "faixa" in html.lower(),
        "Pendrive": "pendrive" in html.lower() or "Pendrive" in html,
        "Analisar": "Analisar" in html or "analisar" in html,
        "Entrar (login btn)": ">Entrar<" in html,
    }
    bad = [k for k, v in pt_checks.items() if not v]
    if not bad:
        ok("theme_ptbr_locale", f"{len(pt_checks)} pt-BR strings present")
    else:
        fail("theme_ptbr_locale", f"missing strings: {bad}")
except Exception as exc:
    fail("theme_ptbr_locale", repr(exc))

# ── S10  P2P policy — AST-level no-GUI check ─────────────────────────────────
print("\n[S10] P2P policy — no GUI/chat/rooms imports (AST)")
try:
    forbidden_imports = {"nicotine_gui", "slskd", "soulseek_gui"}
    p2p_py_files = list((ROOT / "apollodj" / "p2p").glob("*.py")) + \
                   [ROOT / "apollodj" / "boot" / "nicotine_autostart.py"]
    violations = []
    for fpath in p2p_py_files:
        try:
            tree = ast.parse(fpath.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        if any(fb in alias.name for fb in forbidden_imports):
                            violations.append(f"{fpath.name}: import {alias.name}")
                elif isinstance(node, ast.ImportFrom) and node.module:
                    if any(fb in node.module for fb in forbidden_imports):
                        violations.append(f"{fpath.name}: from {node.module}")
        except SyntaxError:
            pass
    if not violations:
        ok("p2p_no_gui_imports", f"{len(p2p_py_files)} files clean")
    else:
        fail("p2p_no_gui_imports", f"forbidden: {violations}")
except Exception as exc:
    fail("p2p_policy", repr(exc))

# ── S11  Exporter API surface ─────────────────────────────────────────────────
print("\n[S11] Exporter API surface — 4 writers callable")
try:
    from apollodj.ingest.exporters.rekordbox_xml import write_xml
    from apollodj.ingest.exporters.serato_crates import write_crate
    from apollodj.ingest.exporters.universal_cdj import write_universal_cdj
    from apollodj.ingest.exporters.sidecar_export import export_sidecars
    assert callable(write_xml) and callable(write_crate)
    assert callable(write_universal_cdj) and callable(export_sidecars)
    ok("exporter_api_surface", "write_xml + write_crate + write_universal_cdj + export_sidecars")
except Exception as exc:
    fail("exporter_api_surface", repr(exc))

# ── S12  test_exe.bat integrity ───────────────────────────────────────────────
print("\n[S12] test_exe.bat — file exists + references Run-Server.ps1")
try:
    bat = Path(ROOT).parent / "test_exe.bat"
    assert bat.is_file(), f"not found: {bat}"
    content = bat.read_text(encoding="utf-8", errors="replace")
    assert "Run-Server.ps1" in content, "Run-Server.ps1 not referenced"
    assert "scripts\\apollo-test" in content or "scripts/apollo-test" in content, "wrong ps1 path"
    ps1 = Path(ROOT).parent / "scripts" / "apollo-test" / "Run-Server.ps1"
    assert ps1.is_file(), f"Run-Server.ps1 not found: {ps1}"
    ok("test_exe_bat", f"{bat.name} → {ps1.name}")
except Exception as exc:
    fail("test_exe_bat", repr(exc))

# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 62)
total = len(passes) + len(fails)
status = "ALL PASSED" if not fails else f"{len(fails)} FAILURE(S)"
print(f"  SMOKE PRO RESULT: {len(passes)}/{total} PASS — {status}")
if warns:
    print(f"  WARNINGS: {len(warns)}")
print("=" * 62)
if fails:
    print("\nFAILURES:")
    for f in fails:
        print(f"  ✗ {f}")
if warns:
    print("\nWARNINGS:")
    for w in warns:
        print(f"  ⚠ {w}")
sys.exit(1 if fails else 0)
