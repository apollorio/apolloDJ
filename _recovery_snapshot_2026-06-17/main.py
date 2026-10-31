"""apolloDJ PRO bootstrap entrypoint (pre-software stage).

This is the **starter system**. All code that runs before (and inside the beginning of)
`if __name__` / `run_boot()` must be completely organized, clean, and enqueued so that
the very first output the user / shell sees is the canonical "correct flow of expected"
as defined in:
  - apolloDJ-flowchart.md  (App Launch diagram + 5h silent + minimal API principle)
  - mapped.md              (boot mentions, runtime audit, nicotine backend-only)
  - registry.json          (boot_flow.step_00_update_gate → 01_auth → 02_apollo_p2p → 03_shell_ready)

`ensure_paths()` (called at step 2 below) materialises the canonical **pt-BR premium
folder skeleton** under ``~/apolloDJ/`` — ``Tracks/Coletânea`` (master library),
``Tracks/0. Em Análise`` (staging), ``Tracks/2. Duvidosos`` (rejects),
``Caixa de Entrada``, ``Dados``, ``Registros``, ``Configurações``, ``Pendrives``,
``Relatórios`` — exactly as declared in ``registry.json.storage_layout``.

Library UI contract (``registry.json.library_ui`` + ``apolloDJ-flowchart.md`` Page 5 +
``mapped.md`` §15): the Coletânea page shows two cards — **COMPUTADOR** (raw machine
folders: ``~/Downloads`` + ``~/Music`` always shown until hidden, ``[+]`` adds fixed
folders) and **PLAYLISTS** (Rekordbox-standard XML/xlsm/xlm lists). Dragging / adding a
COMPUTADOR path to any playlist runs ``ingest.add_path_to_playlist`` → pipeline_v2 +
dj_prep_pro (BPM, energy curve, waveform, LUFS, gain EQ, headroom, hotcues) → quality gate
→ atomic commit into the single central ``Tracks/Coletânea`` folder. Playlists reference
tracks by path + fingerprint (``Dados/impressoes-digitais.db``) so audio is never
duplicated; club-playability risks surface a yellow WARNING in the UI.

=== CANONICAL EXPECTED BOOT TRACE (text simulation of what should be emitted) ===
(derived directly from the three sources above + the BOOT:/STATUS: protocol)

1. (rthook if frozen) or first python line
2. BOOT:5:Iniciando apolloDJ…          + STATUS:1000
3. BOOT:15:Verificando servidor…       + STATUS:1001   (maintenance gate - can be offline)
4. (local paths skeleton - minimal)     + STATUS:1002
5. BOOT:25:Verificando versão…         + STATUS:1003   (update_check - registry step_00)
6. BOOT:45:Conectando ao Apollo…       + STATUS:2001 + 2002  (local token first per flowchart)
7. (auth_gate.perform_boot - keyring + /verify) → AUTH_REQUIRED or success + 2003/2004
8. (gated) BOOT:70:Iniciando Collab P2P… or "não disponível"   (registry step_02_apollo_p2p, members only)
9. STATUS:300x family for embedded P2P (headless, no chat/GUI)
10. BOOT:90:Carregando shell…          + STATUS:800x
11. BOOT:100:Pronto!                    + STATUS:9001/9002 + JSON payload (step_03)

All heavy imports and side-effectful module code (p2p tree, full paths constants,
preferences, logging, packaging, legacy ApolloClient dynamic load, etc.) MUST be
delayed until *after* step 2/3 so the printed flow is the first thing that happens.
The duplicate stdio hack lives ONLY in rthooks/pyi_rth_apollodj_stdio.py.
"""

from __future__ import annotations

import json
import os
import sys

# NOTE: The official PyInstaller runtime hook (rthooks/pyi_rth_apollodj_stdio.py)
# already guarantees sane stdout/stderr for frozen windowed builds.
# We deliberately do NOT duplicate that logic here. Direct `python main.py` runs
# always have real streams, so no early replacement is required or desired.
# This keeps the "before any visible output" section tiny and clean.


def _step(pct: int, msg: str) -> None:
    """Emit a boot progress event consumed by the HTML loading screen."""
    print(f"BOOT:{pct}:{msg}", flush=True)


def run_boot() -> tuple[int, dict | None]:
    """Run bootstrap stages; return ``(exit_code, payload_or_none)``.

    The sequence below is *explicitly enqueued* to match, in order:
      - registry.json boot_flow (step_00_update_gate → 01_auth → 02_apollo_p2p → 03_shell_ready)
      - flowchart.md "App Launch / Open Flow" (local token first, minimal API, silent refresh)
      - mapped.md + integrated Collab P2P (ONE SYSTEM) rules

    Heavy imports are delayed until after the absolute first visible prints.
    """
    # === FIRST VISIBLE OUTPUT — must happen before any apollodj.* import side effects ===
    _step(5, "Iniciando apolloDJ…")

    # Safe to import now
    from apollodj.boot.funny_status import emit as funny_emit
    from apollodj.boot.update_check import check_maintenance, get_boot_gate
    from apollodj.conf.paths import ensure_paths

    funny_emit(1000)
    ensure_paths()
    funny_emit(1002)

    # Stage 0 — registry step_00 (maintenance + version gate)
    _step(15, "Verificando servidor…")
    funny_emit(1001)
    if check_maintenance():
        from apollodj.boot.update_check import _build_lock_html
        funny_emit(5001)
        print(_build_lock_html(maintenance=True), flush=True)
        return 10, None

    _step(25, "Verificando versão…")
    gate = get_boot_gate()
    if gate.get("action") == "lock":
        funny_emit(5004)
        print(gate.get("html", "<h2>Versão Floppada</h2>"), flush=True)
        return 10, None
    funny_emit(1003)

    # Stage 1 — auth (registry step_01, local-first per flowchart)
    _step(45, "Conectando ao Apollo…")
    funny_emit(2001)
    from apollodj.boot.auth_gate import perform_boot
    auth = perform_boot()
    if not auth.is_authenticated:
        funny_emit(2005)
        print("AUTH_REQUIRED", flush=True)
        return 20, None
    funny_emit(2002)
    funny_emit(2003)

    from apollodj.gating.features import has_nicotine_backend
    from apollodj.gating.tabs import visible_tabs
    from apollodj.runtime.shell_state import set_shell_boot

    boot_features = dict(auth.features or {})
    if has_nicotine_backend(boot_features):
        boot_features.setdefault("nicotine_access", True)
    set_shell_boot({
        "user": auth.username,
        "features": boot_features,
        "visible_tabs": visible_tabs(auth.features),
    })

    # Stage 2 — apolloDJ integrated P2P (registry step_02_apollo_p2p, headless only)
    nicotine_eligible = has_nicotine_backend(auth.features)
    funny_emit(2004)
    nicotine_ready = False
    p2p_status: dict = {}
    if nicotine_eligible:
        from apollodj.boot.nicotine_autostart import get_p2p_status, start_inbox_watcher, start_nicotine
        from apollodj.p2p.service import apply_saved_collab_folder_on_boot

        p2p_status = get_p2p_status()
        if p2p_status.get("available"):
            _step(70, "Iniciando Collab P2P…")
        else:
            _step(70, "Collab P2P: motor não encontrado…")
            print(p2p_status.get("error", "Motor Collab P2P não encontrado."), flush=True)
        funny_emit(3001)
        funny_emit(3002)
        nicotine_ready = start_nicotine(
            headless=True, username=auth.username or "", features=auth.features
        )
        if nicotine_ready:
            funny_emit(3003)
            funny_emit(3004)
        try:
            apply_saved_collab_folder_on_boot()
            start_inbox_watcher()
        except Exception:
            pass
    else:
        _step(70, "Collab P2P não disponível neste plano…")
        funny_emit(3005)

    # Stage 3 — shell ready (registry step_03)
    _step(90, "Carregando shell…")
    funny_emit(8001)
    funny_emit(8002)
    from apollodj.boot.ready_signal import build_ready_payload
    from apollodj.gating.tabs import visible_tabs

    tabs = visible_tabs(auth.features)
    payload = build_ready_payload(auth, tabs)
    set_shell_boot(payload)
    from apollodj.p2p.service import p2p_engine_ready

    payload["nicotine_ready"] = bool(nicotine_ready and p2p_engine_ready())
    payload["p2p_engine_ready"] = payload["nicotine_ready"]
    if nicotine_eligible and p2p_status:
        payload["p2p_status"] = p2p_status

    _step(100, "Pronto!")
    funny_emit(9002)
    funny_emit(9001)
    print(json.dumps(payload, ensure_ascii=False), flush=True)
    return 0, payload


def main() -> int:
    code, _payload = run_boot()
    return code


if __name__ == "__main__":
    code, payload = run_boot()
    if os.environ.get("APOLLODJ_BOOT_ONLY") == "1" or code == 10:
        raise SystemExit(code)
    from apollodj.installer_ui.launcher import launch_desktop
    launch_desktop(code, payload)
    if code in (0, 20):
        raise SystemExit(0)
    raise SystemExit(code)
