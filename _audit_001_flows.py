"""Flow SSOT audit — mapped.md + apolloDJ-flowchart.md + registry.json.

Static inline checks for:
  - Boot / auth / nicotine / shell sequence (no stage inversion)
  - Forbidden parallel boot races (webview, poll, page mount)
  - Calm lazy UI loading (splash → login → shell, deferred App.init)

Called from ``_audit_001.py`` (dimension 19+) and optionally standalone.
"""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from typing import Any


def run_flow_audit(root: Path) -> dict[str, list[str]]:
    """Return findings dict with keys errors, warnings, info."""
    findings: dict[str, list[str]] = {"errors": [], "warnings": [], "info": []}

    def err(msg: str) -> None:
        findings["errors"].append(msg)

    def warn(msg: str) -> None:
        findings["warnings"].append(msg)

    def info(msg: str) -> None:
        findings["info"].append(msg)

    reg = json.loads((root / "registry.json").read_text(encoding="utf-8"))
    main_src = (root / "main.py").read_text(encoding="utf-8")
    launcher_src = (root / "apollodj" / "installer_ui" / "launcher.py").read_text(encoding="utf-8")
    v3_html = (root / "theme" / "screen software" / "apolloDJ.v3.html").read_text(encoding="utf-8")
    # §15.6 (2026-06-16): all CSS consolidated into universal.apollodj.css (SSOT).
    # shell-chrome.css is now an empty stub — the auth-stage chrome/shell rules
    # live in universal.apollodj.css. Read the SSOT, not the emptied stub.
    universal_css = (root / "theme" / "screen software" / "v3" / "universal.apollodj.css").read_text(encoding="utf-8")
    trans_js = (root / "theme" / "screen software" / "v1" / "transferencias.js").read_text(encoding="utf-8")
    colab_js = (root / "theme" / "screen software" / "v2" / "colab-share.js").read_text(encoding="utf-8")
    backend_cfg = (root / "apollodj" / "p2p" / "backend_config.py").read_text(encoding="utf-8")
    mapped_src = (root / "mapped.md").read_text(encoding="utf-8")
    flow_src = (root / "apolloDJ-flowchart.md").read_text(encoding="utf-8")

    # ── 19. Registry boot_flow ↔ main.py BOOT trace ─────────────────────────
    boot_flow = reg.get("boot_flow") or {}
    expected_steps = [
        "step_00_update_gate",
        "step_01_auth",
        "step_02_apollo_p2p",
        "step_03_shell_ready",
    ]
    reg_keys = [k for k in expected_steps if k in boot_flow]
    if reg_keys != expected_steps:
        err(f"registry boot_flow missing or misordered: have {reg_keys}")
    else:
        info("registry boot_flow step_00→03 order OK")

    boot_pcts = [int(x) for x in re.findall(r"_step\(\s*(\d+)\s*,", main_src)]
    if boot_pcts != sorted(boot_pcts):
        err(f"main.py BOOT percentages not monotonic: {boot_pcts}")
    if not boot_pcts or boot_pcts[-1] != 100:
        err(f"main.py BOOT must end at 100, got {boot_pcts}")
    canonical = [5, 15, 25, 45, 70, 90, 100]
    if boot_pcts != sorted(boot_pcts) or boot_pcts[-1] != 100:
        err(f"main.py BOOT pcts invalid: {boot_pcts}")
    elif set(boot_pcts) != set(canonical):
        warn(f"main.py BOOT pcts {boot_pcts} differ from canonical {canonical} (branch OK)")

    # Heavy imports only after first visible boot line (flowchart: local-first, delayed)
    first_step = main_src.find("_step(5")
    if first_step < 0:
        err("main.py missing _step(5) first output")
    else:
        pre = main_src[:first_step]
        if re.search(r"from\s+apollodj\.|import\s+apollodj", pre):
            err("main.py imports apollodj before first BOOT:5 (forbidden eager load)")

    # Stage wiring order in run_boot (no nicotine before auth)
    auth_pos = main_src.find("perform_boot")
    nic_pos = main_src.find("start_nicotine")
    ready_pos = main_src.rfind("payload = build_ready_payload")
    if ready_pos < 0:
        ready_pos = main_src.rfind("build_ready_payload")
    if not (0 < auth_pos < nic_pos < ready_pos):
        err("main.py stage order must be auth → nicotine → shell_ready")
    if "has_nicotine_backend" not in main_src:
        err("main.py missing has_nicotine_backend gate before nicotine")

    if "launch_desktop" not in main_src or "run_boot()" not in main_src:
        err("main.py must call run_boot() before launch_desktop")
    if re.search(r"launch_desktop\s*\([^)]*\)\s*\n[^#]*run_boot", main_src):
        err("forbidden race: launch_desktop before run_boot in main")

    # Flowchart: AUTH_REQUIRED exit 20, lock exit 10, boot-only env
    if 'return 20, None' not in main_src or "AUTH_REQUIRED" not in main_src:
        err("main.py missing AUTH_REQUIRED / exit 20 path")
    if "APOLLODJ_BOOT_ONLY" not in main_src:
        warn("main.py missing APOLLODJ_BOOT_ONLY early-exit guard")

    # ── 20. Launcher / pywebview — no boot race with shell inject ───────────
    shell_m = re.search(r"def launch_shell\b.*?(?=\ndef |\Z)", launcher_src, re.S)
    shell_body = shell_m.group(0) if shell_m else ""
    if not re.search(
        r"if start_hook is not None:\s*\n\s*webview\.start\(start_hook\)\s*\n\s*else:\s*\n\s*webview\.start\(\)",
        shell_body,
    ):
        err("launch_shell must use mutually exclusive webview.start(start_hook) / start()")
    if "launch_desktop" in launcher_src and re.search(
        r"def launch_desktop\b.*?webview\.start\(", launcher_src, re.S
    ):
        err("forbidden race: launch_desktop must not call webview.start (delegate to launch_shell)")
    if "frameless=True" not in launcher_src:
        err("launcher.py shell must use frameless=True (SSOT chrome)")
    if "events.loaded" not in launcher_src and "start_hook" not in launcher_src:
        warn("launcher.py boot inject should hook loaded event")
    if "_inject_shell_boot" not in launcher_src:
        err("launcher.py missing _inject_shell_boot")
    if "_inject_shell_boot" not in launcher_src or (
        "events.loaded" not in launcher_src and "start_hook" not in launcher_src
    ):
        err("launcher.py must inject boot via loaded event or start_hook delay")

    # Inbox watcher must not start at import in nicotine_autostart
    nic_src = (root / "apollodj" / "boot" / "nicotine_autostart.py").read_text(encoding="utf-8")
    if re.search(r"^start_inbox_watcher\s*\(", nic_src, re.M):
        err("nicotine_autostart: forbidden top-level start_inbox_watcher (race at import)")

    # ── 21. P2P ingest path (flowchart page 4 + mapped §15) ───────────────────
    p2p_step = boot_flow.get("step_02_apollo_p2p") or boot_flow.get("step_02_nicotine") or {}
    routing = p2p_step.get("download_routing") or []
    routing_str = " ".join(str(x) for x in routing).lower()
    if "baixando" not in routing_str or ("análise" not in routing_str and "analise" not in routing_str):
        err("registry nicotine download_routing missing Baixando -> Em Analise")
    if "pipeline" not in routing_str:
        err("registry nicotine download_routing missing pipeline.run")
    if "TRACKS_BAIXANDO_DIR" not in backend_cfg or 'downloaddir' not in backend_cfg:
        err("backend_config missing Baixando downloaddir")
    if "nicotine_search" not in colab_js:
        err("colab-share.js must use nicotine_search (backend-only P2P)")
    if re.search(r"nicotine.*login|soulseek.*connect", colab_js, re.I):
        err("colab-share forbidden external P2P login UI")
    p2p_policy = reg.get("apollo_p2p_integrated") or {}
    if not p2p_policy.get("one_system"):
        err("registry missing apollo_p2p_integrated.one_system")
    if "separate_nicotine_install" not in (p2p_policy.get("forbidden") or []):
        err("registry apollo_p2p_integrated.forbidden must ban separate_nicotine_install")
    for ui_path in (
        root / "theme/screen software/v1/panel.js",
        root / "theme/screen software/v2/colab-share.js",
        root / "theme/screen software/v1/transferencias.js",
    ):
        ui = ui_path.read_text(encoding="utf-8", errors="replace")
        for banned in ("Nicotine+", "Soulseek", "nicotine-plus", "instale nicotine"):
            if banned.lower() in ui.lower():
                err(f"user-facing '{banned}' in {ui_path.name} — apolloDJ ONE system only")
    if "setInterval(pollDownloads, 3000)" not in trans_js:
        err("transferencias.js must poll every 3s per mapped.md")
    if "stopPoll" not in trans_js or "cleanup" not in trans_js:
        err("transferencias.js missing stopPoll/cleanup (forbidden poll race)")
    if "colabShare" not in v3_html or (
        "id:'buscar'" not in v3_html and 'id:"buscar"' not in v3_html
    ):
        err("v3 Config missing buscar -> colabShare route")

    ui_routes = (reg.get("theme") or {}).get("ui_routes") or {}
    collab = ui_routes.get("collab_p2p") or {}
    if collab.get("subtab") != "buscar" or collab.get("page_module") != "v2/colab-share.js":
        warn("registry theme.ui_routes.collab_p2p drift from v3 buscar/colabShare")

    # mapped §15 integrated Collab P2P keywords
    for phrase in ("ONE SYSTEM", "headless", "buscar", "transferencias", "bundled"):
        if phrase not in mapped_src:
            warn(f"mapped.md missing §15 keyword: {phrase}")

    # flowchart minimal API principle
    if "5-HOUR" not in flow_src and "5h" not in flow_src.lower():
        warn("flowchart missing 5h silent session reference")

    # ── 22. Calm lazy UI loading (splash → login → shell) ─────────────────────
    lazy_markers = {
        "apollo-auth-stage": "body starts in auth stage (chrome/shell gated)",
        "requestAnimationFrame": "splash uses rAF before timers",
        "setTimeout": "splash/login uses delayed transition",
        "apollo:shell-ready": "shell-ready listener before forced nav",
        "setTimeout(w,80)": "App.init waits for gsap (lazy)",
        "tries++>30": "bounded gsap wait loop",
        "apollo:shell-unlocked": "chrome unlock event after login",
    }
    for token, desc in lazy_markers.items():
        if token not in v3_html and token not in universal_css:
            err(f"v3 lazy loading missing: {desc} ({token})")

    if "body.apollo-auth-stage #shell-chrome" not in universal_css:
        err("universal.apollodj.css must hide chrome during apollo-auth-stage")
    if "body.apollo-auth-stage #shell" not in universal_css:
        err("universal.apollodj.css must hide #shell during apollo-auth-stage (calm lazy load)")

    if '#login-user" value=""' not in v3_html and "value=\"\"" not in v3_html:
        warn("login-user should have empty value attribute")
    if 'autocomplete="off"' not in v3_html:
        warn("login fields should disable autocomplete")

    # Page modules: cleanup hooks + App must call them (forbidden double-poll race)
    pages_with_cleanup = []
    for js_path in (root / "theme" / "screen software").rglob("*.js"):
        text = js_path.read_text(encoding="utf-8", errors="replace")
        if re.search(r"ApolloPages\.\w+\.cleanup\s*=", text):
            pages_with_cleanup.append(js_path.name)

    if "transferencias.js" in str(pages_with_cleanup):
        if "_activePageKey" not in v3_html or "cleanup === 'function'" not in v3_html:
            err(
                "App._renderPage must call ApolloPages.*.cleanup before mount "
                "(forbidden transferencias poll race)"
            )

    if "_transitionPending" not in v3_html:
        warn("App._transition missing _transitionPending guard")

    if "ApolloPages[sub.page](main)" not in v3_html:
        err("App._renderPage must lazy-mount ApolloPages[sub.page]")

    # SSOT cross-refs present in repo
    reg_text = (root / "registry.json").read_text(encoding="utf-8", errors="replace")
    mapped_text = (root / "mapped.md").read_text(encoding="utf-8", errors="replace")
    flow_text = (root / "apolloDJ-flowchart.md").read_text(encoding="utf-8", errors="replace")
    if "step_02_apollo_p2p" not in flow_text and "apollo_p2p_integrated" not in flow_text:
        warn("flowchart missing step_02_apollo_p2p / ONE SYSTEM P2P cross-link")
    if "membership_gate" not in reg_text and "visible_tabs_eligible" not in reg_text:
        warn("registry missing membership_gate / visible_tabs_eligible")
    if (
        "ONE SYSTEM" not in mapped_text
        and "100% ONE SYSTEM" not in mapped_text
        and "apollo_p2p_integrated" not in mapped_text
    ):
        warn("mapped.md missing apolloDJ ONE SYSTEM P2P section")
    if "apollo_p2p_integrated" not in reg_text:
        err("registry.json missing apollo_p2p_integrated block")
    if "shutil.which" in nic_src and "_find_nicotine_binary" in nic_src:
        if 'shutil.which("nicotine' in nic_src or "shutil.which(name)" in nic_src:
            err("nicotine_autostart must not use PATH lookup for separate Nicotine+ installs")

    return findings


def main() -> int:
    import sys

    root = Path(__file__).resolve().parent
    if sys.platform == "win32":
        for stream in (sys.stdout, sys.stderr):
            if stream is not None:
                try:
                    stream.reconfigure(encoding="utf-8", errors="replace")
                except Exception:
                    pass
    findings = run_flow_audit(root)
    print("=" * 60)
    print("FLOW SSOT AUDIT (mapped + flowchart + registry)")
    print(f"  ERRORS   : {len(findings['errors'])}")
    print(f"  WARNINGS : {len(findings['warnings'])}")
    print(f"  INFO     : {len(findings['info'])}")
    print("=" * 60)
    for label, items in findings.items():
        if items:
            print(f"\n{label.upper()}:")
            for item in items:
                print(f"  - {item}")
    return 1 if findings["errors"] else 0


if __name__ == "__main__":
    import sys

    raise SystemExit(main())
