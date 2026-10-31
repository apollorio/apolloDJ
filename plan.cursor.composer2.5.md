# apolloDJ src_002 — Strict Verification Report (Cursor Composer 2.5)

**Generated:** 2026-05-28  
**Agent:** Cursor Composer 2.5  
**Scope:** `C:\Users\User\build\src_002`  
**Cursor plan source:** `C:\Users\User\.cursor\plans\composer2.5_verification_850929b2.plan.md`  
**Deliverable:** this file only

---

## How to read this report

| Mode | Cursor state | What ran | What it proves |
|------|--------------|----------|----------------|
| **PLAN MODE** | Plan mode active; user forbade execution | Mandatory doc read + static code/trace only | Spec vs code alignment; doc drift; branding gaps |
| **DEBUGGER MODE** | Agent mode (post-plan) | Three audit gates + boot-only `main.py` | Compile, imports, functional wiring, runtime smoke |

**Legend:** `[PLAN]` = found without executing commands · `[DEBUG]` = found by running tools on this machine

---

## Mandatory inputs read (both modes)

| Document | Path |
|----------|------|
| Machine registry | `C:\Users\User\build\src_002\registry.json` |
| Human map | `C:\Users\User\build\src_002\mapped.md` |
| Canonical map | `C:\Users\User\build\apolloDJ-mapped.md` |
| Flowchart | `C:\Users\User\build\src_002\apolloDJ-flowchart.md` |
| **Brainstorm log** | `C:\Users\User\build\src_002\brainstorm-log.md` |

---

## Combined executive verdict

| Question | PLAN MODE | DEBUGGER MODE |
|----------|-----------|---------------|
| Matches registry / mapped §15 / brainstorm? | **Yes** (static) `[PLAN]` | **Yes** — gating tests 28/28 PASS `[DEBUG]` |
| All three gates green? | **Not run** `[PLAN]` | **Yes** — smoke + audit_001 + functional all exit **0** `[DEBUG]` |
| “All working” end-to-end? | **No** — branding + doc drift `[PLAN]` | **Mostly** — code gates pass; auth/P2P/live deps still gaps `[DEBUG]` |
| `registry.final_status.structure_ready` | **Overstated** `[PLAN]` | **Justified for structure** after audits; not full production `[DEBUG]` |

---

# PART A — PLAN MODE findings `[PLAN]`

> Static analysis only. No `python` commands. User rule: “do not run.”

## A.1 What PLAN MODE confirmed (code ↔ docs)

- Boot order in `main.py` matches registry: paths → maintenance → update gate → auth → conditional Nicotine → `visible_tabs` → JSON.
- `auth_gate.perform_boot()` fail-closed on `(False, {})`.
- Membership: `apolloDJ` / `apolloDJ-EXTRA` only in `gating/features.py`.
- Nicotine skipped without membership; headless config locks chat/PM in `p2p/backend_config.py`.
- Tab policy: members → `["buscar", "transferencias"]` per `gating/tabs.py` + `apolloDJ.v3.html` `applyFeatureGates` (matches mapped §15 + brainstorm, not a misread).
- Fake HTML `title-bar` removed; `shell-chrome` + `launcher.py` `frameless=True` + `window_*` bridge.
- Theme root = `src_002/theme` (registry); PyInstaller bundles it in `apolloDJ.spec`.
- P2P UI: `v2/colab-share.js`, `v1/transferencias.js`; routing `Baixando` → `0. Em Análise` → pipeline.

## A.2 What PLAN MODE flagged (not fixed by running)

### P0 — Runtime proof missing at plan time

Brainstorm-log claims smoke 5/5; plan session did not execute gates (by design).

### P1 — Documentation path drift (three roots)

| Source | Active root / theme |
|--------|---------------------|
| `registry.json` | `src_002` + `src_002/theme` |
| `mapped.md` / `apolloDJ-mapped.md` | `build/src` + `build/theme` |
| `CLAUDE.md` | `src/` |

### P1 — User-facing branding (brainstorm: no Soulseek/Nicotine+ in UI)

- `theme/.../v1/panel.js`: **"Soulseek / P2P"**, hint **"Nicotine+"**
- `transferencias.js`: `soulseek_pause_all`
- `launcher.py`: pyBridge `soulseek_*` aliases; `soulseek_pause_all` stub `paused: 0`

### P2 — Flowchart vs code

Flowchart JWT + 5h scheduler / `apollo-auth` paths ≠ desktop `ApolloClient` + `/a/v1/app/*` (sketch only).

### P2 — CORE.JS / v3.html

- `strict-boot.js` before `core.js` (desktop intentional; conflicts strict WP head rule if applied here).
- Large local `:root` duplicates CORE token families.
- Missing some PWA metas from brainstorm audit paste.

### P2 — mapped §14 vs §15

§14 feature matrix lists Biblioteca/Prep/USB; §15 runtime nav = P2P subtabs only for members. **Not a code bug** — doc needs one clarifying sentence.

### P3 — Registry / env

- `usb_export.source_audio`: `Tracks/Coletanea` (no accent) vs `paths.py` `Coletânea`.
- `final_status.structure_ready: true` premature before gates (at plan time).

## A.3 PLAN MODE brainstorm-log cross-check

| Brainstorm intent | PLAN static result |
|-------------------|-------------------|
| Headless bundled P2P, no chat | Wired in `backend_config` |
| Membership-only backend | Wired |
| buscar + transferencias only | Wired (policy) |
| Native title bar | shell-chrome + frameless (not PySide6) |
| No Soulseek strings in UI | **Partial FAIL** |
| smoke / audits passed | **Unverified in plan mode** |

## A.4 PLAN MODE bottom line

Architecturally **on-spec** for backend-only P2P + tab policy. **Not** certifiable “all working” without debugger runs + branding/doc cleanup.

---

# PART B — DEBUGGER MODE findings `[DEBUG]`

> Agent mode. Commands run from `C:\Users\User\build\src_002` on 2026-05-28.

## B.1 Gate run summary

| Gate | Command | Exit | Result |
|------|---------|------|--------|
| Gate 1 | `python smoke_verify.py --json` | **0** | 8/8 checks PASS |
| Gate 2 | `python _audit_001.py` | **0** | ERRORS 0, WARNINGS 0 |
| Gate 3 | `python _audit_001_functional.py` | **0** | **28/28 PASS** |
| Boot probe | `APOLLODJ_BOOT_ONLY=1 python main.py` | **20** | `AUTH_REQUIRED` (expected without login) |

## B.2 Gate 1 — `smoke_verify.py` detail `[DEBUG]`

**Stdout warning (non-fatal):** `pynicotine not installed — Soulseek desativado`

| Check | PASS | Notes |
|-------|------|-------|
| compileall | yes | apollodj + main.py |
| registry_disk_parity | yes | 0 missing modules |
| optional_assets | yes | |
| import_sweep | yes | **71** modules imported |
| boot_modules | yes | `gate_action=continue` |
| dj_prep_pro | yes | verdict=PASS bpm=143.5; engines: pydub silence, **m_igashi_headroom**, **ffmpeg_loudnorm_dual_pass** |
| pipeline_dry_run | yes* | check passed but **track verdict=FAIL** (6 stages ran — synthetic smoke WAV) |
| ingest_bridge_dj_prep_pro | yes | success=True |

**New vs PLAN:** Structure/compile/import **proven** on this machine. P2P library absent but smoke still exits 0.

## B.3 Gate 2 — `_audit_001.py` detail `[DEBUG]`

- Orphans: **0**
- spec hiddenimports missing: **0**
- BOOT steps monotonic, ends at 100
- Lock screen flavours: all True
- Nicotine credential pattern: True (persisted `credential.json` under `~/apolloDJ/Configurações/nicotine/`)
- USB exporter + UsbBridge: all methods present
- theme bundle: v3 + v2 + install + spec `datas` + launcher `_MEIPASS`
- apolloBPK / apolloSEC integrity: True
- UTF-8 BOM scan: **0** BOM files (90 scanned)
- pipeline v2 + universal export wiring: True
- Legacy membership slugs (apollodj-pro/great): **0** references

**New vs PLAN:** Resolves “structure_ready” for **repo layout + spec + theme bundle**. Does not prove Inno/exe or live Soulseek.

## B.4 Gate 3 — `_audit_001_functional.py` detail `[DEBUG]`

**28/28 PASS** including:

- Lock HTML flavours (maintenance, newer, deprecated)
- `check_maintenance` offline → False
- Nicotine credential: `valle.aprio` pattern, idempotent, persisted
- `apollo_backend.conf` path + search filter wrap (`audio minbitrate:320 mbr:320`)
- USB health benchmark on temp dir (write ~17 MB/s, read ~459 MB/s)
- `main.py` BOOT protocol: 4 BOOT lines, exit **20**
- UsbBridge `list_drives` / `open_folder`
- apolloBPK on synthetic audio: bpm=181.8, tier apolloBPK
- quality_gate perfect=98.75, junk=2.5
- fingerprint, state_machine, xml_db roundtrip
- Universal export writers callable
- **gating:** `apolloDJ|apolloDJ-EXTRA`; tabs authorized=`buscar+transferencias`, unauthorized=`inicio`
- analyzer BeatNet branch removed, apolloBPK wired

**New vs PLAN:** Confirms **gating policy is enforced in tests**, not only documented.

## B.5 Boot probe `[DEBUG]`

```
BOOT:5 → BOOT:15 → BOOT:25 → BOOT:45 → AUTH_REQUIRED
exit code 20
```

Matches registry terminal line for unauthenticated dev run. **Not a failure.**

## B.6 DEBUGGER MODE issues still open

| ID | Finding | Severity |
|----|---------|----------|
| D1 | `pynicotine` / nicotine-plus **not installed** — live P2P search/download unavailable in this env | P1 runtime |
| D2 | `pipeline_dry_run` smoke: stages OK but **verdict=FAIL** on synthetic track (may be expected for junk WAV) | P2 info |
| D3 | Boot without credentials → exit 20 (login shell path) — E2E auth not tested here | P2 info |
| D4 | Branding / Soulseek UI strings — **unchanged**; audits do not cover copy | P1 (same as PLAN) |
| D5 | Doc path drift `src` vs `src_002` — **unchanged** | P1 (same as PLAN) |
| D6 | PyInstaller + Inno + signed `updates.json` — **not run** in debugger session | P2 ship |

## B.7 DEBUGGER MODE bottom line

**Codebase gates: PASS** on this machine. **Product “all working”** still needs: apollo-login E2E, `pynicotine`/nicotine binary in installer, branding pass, doc path unify, optional PyInstaller smoke.

---

# PART C — PLAN vs DEBUGGER delta

| Topic | PLAN MODE | DEBUGGER MODE | Winner |
|-------|-----------|---------------|--------|
| Compile / imports | Assumed OK | **Proven** (71 modules) | DEBUG |
| Registry ↔ disk | Assumed aligned | **0 orphans, 0 missing** | DEBUG |
| Tab gating policy | Read in source | **Tested 28/28** | DEBUG |
| smoke_verify pass | Unverified | **exit 0** | DEBUG |
| Nicotine live P2P | Unknown | **Disabled** (no pynicotine) | DEBUG found gap |
| UI branding | **FAIL** | Not tested; still **FAIL** | PLAN |
| Doc roots drift | **FAIL** | Not tested; still **FAIL** | PLAN |
| Auth E2E | Unknown | exit 20 only | DEBUG partial |
| “All working” claim | **Reject** | **Accept structure**; **reject full ship** | Both |

---

## apolloDJ-flowchart alignment (unchanged)

| Block | Status |
|-------|--------|
| Pipeline v2 + fingerprint | `[PLAN]` on disk · `[DEBUG]` wiring PASS |
| Universal export | `[PLAN]` on disk · `[DEBUG]` writers PASS |
| P2P page 4 flow | `[PLAN]` code match · `[DEBUG]` config/filter PASS; **pynicotine missing** |
| 5h JWT background | `[PLAN]` not in code | not tested `[DEBUG]` |

---

## Recommended fix order

1. `[DEBUG done]` Run three gates — **recorded above**
2. `pip install nicotine-plus` (or bundle `bin/nicotine.exe`) — close D1
3. Branding pass (panel.js, transferencias.js, launcher aliases) — close D4 / PLAN P1
4. Unify doc paths to `src_002` — close D5
5. Registry: fix `Coletânea` typo; tie `final_status` to audit exit codes
6. E2E: login with real token → boot exit 0 → `nicotine_ready` in payload
7. PyInstaller + Inno payload test

---

## Final answer: “is it all working?”

| Layer | PLAN | DEBUG |
|-------|------|-------|
| Spec coherence | Yes | Yes (gating tests) |
| Repo structure / audits | Not run | **Yes — 3/3 gates** |
| Live P2P + auth + installer | Unknown | **No / partial** |
| UI branding | No | No |

**One-line summary:** PLAN MODE found the design is coherent but unproven; DEBUGGER MODE proves **the src_002 tree passes all local audit gates**, while **live Nicotine+, branding cleanup, and doc path unification** remain before a honest “all working” for Rio DJs.

---

# PART D — Claude (Sonnet) deep cross-layer audit (2026-05-28 follow-up) `[PLAN]`

> **Mode:** strict / read-only. NO commands executed.
> **Inputs re-read in this session:** the same 4 mandatory files (registry / flowchart / brainstorm / mapped) **plus** the live `apollodj/installer_ui/launcher.py`, `apollodj/boot/funny_status.py`, and `test_exe.bat`.
> **Why a Part D?** Parts A–C cover code-vs-spec drift and live gate runs. Part D catches **doc-vs-doc** and **claim-vs-code** drift that the 5-gate audit chain physically cannot detect (it only reads Python source).

## D.1 Discrepancies between existing Part B claims and live `launcher.py`

| Existing audit claim (A.1 / B.3) | What `launcher.py` on disk actually has | Status |
|----------------------------------|-----------------------------------------|--------|
| "Fake HTML title-bar removed; shell-chrome + `launcher.py` `frameless=True` + `window_*` bridge" | `webview.create_window(..., resizable=True, text_select=True)` — **no** `frameless=True`, **no** `window_minimize` / `window_maximize` / `window_close` methods on `ApolloApi` | **CLAIM UNVERIFIED** — code on disk contradicts the claim |
| brainstorm-log: "shell-chrome assets call the bridge and use `.pywebview-drag-region`" | `_inject_shell_boot` only injects `__APOLLO_BOOT_PAYLOAD__` + `ApolloRuntime.applyShellPayload` — no shell-chrome script tag added | **CLAIM UNVERIFIED** |

**Action:** Either (a) `frameless=True` + bridge methods are still TODO and brainstorm-log overstated; or (b) launcher.py was rolled back between the audit run and the current snapshot. Re-Read `launcher.py` next session and confirm against this Part D table.

## D.2 `mapped.md` inside `src_002` is a REDIRECT stub

Lines 1–16 of `src_002/mapped.md` say the file is "preserved as a legacy reference but **`../apolloDJ-mapped.md` is the single source of truth**." Registry line 29 still claims `"human_map": "mapped.md"`. The PyInstaller bundle (per `apolloDJ.spec` `datas`) cannot reach `../apolloDJ-mapped.md` — it's outside the source root.

**Action:** Either (a) inline the parent file into `src_002/mapped.md` so the workspace is self-contained for packaging, or (b) update `registry.json.current_structure.human_map` to `"../apolloDJ-mapped.md"` and patch every audit that reads it.

## D.3 `registry.json` declares USB export **twice** with different modules

- Top-level `usb_export` (lines 410–415) → `apollodj.ingest.usb_exporter + db6_export + playlist_translate`
- `podium.features.usb_export` (lines 393–397) → `exporters.rekordbox_xml` + `exporters.serato_crates` + `exporters.universal_cdj`

Whichever set `bridge/usb_bridge.py` actually calls is the one in production; the other is dead code or a façade. Audit `_audit_001.py` does not currently compare these two blocks.

**Action:** Decide canonical (recommend the `exporters/*` block from Pipeline v2). Make the top-level `usb_export` block reference the same modules, or delete it and let the podium block stand alone.

## D.4 `apolloDJ-flowchart.md` "01 Rejected/" folder ≠ `registry.storage_layout.Tracks`

Flowchart Page 1 Pipeline v2 block:
```
QG -->|fail| REJ[01 Rejected/]
ATOM[Atomic Commit<br/>os.replace -> Tracks/Coletânea]
```

Registry storage_layout has **no** `01 Rejected/` folder — failures go to `Tracks/2. Duvidosos/{1. Arquivo duvidoso, 2. Download falhado, 3. Falha de amplificação}`.

**Action:** Update the flowchart `REJ` node to the pt-BR Duvidosos taxonomy. This is a single Mermaid edit but matters because anyone implementing `pipeline_v2.run_v2` from the diagram will mkdir `01 Rejected/` and the UI (which expects Duvidosos) will never see the rejects.

## D.5 Flowchart Page 1 + Pages 2–3 describe **JWT + /refresh + 5h scheduler** — actual code is **Apollo App Token + per-request verify**

Page 1 graph: `WP Plugin (Custom REST API) … JWT + Refresh Tokens` · `Auth Endpoints /login /refresh /validate`
Page 2: "JWT expiry check local → 0 API if valid < 4.5h"
Page 3: `apollo_dj/auth/{token_manager.py, api_client.py, scheduler.py}` — none of those files exist (real layout is `apollodj/boot/auth_gate.py` + `_superseeded/apolloDJ-exe/core/apollo_client.py`).

Registry podium: `auth.1st: "ApolloClient via _superseeded (X-Apollo-App-Token + Device-Id)"`. WordPress side uses `/a/v1/app/auth` + `/app/verify` + `/app/revoke`. No JWT, no `/refresh`, no 5-hour timer.

**Action:** Rewrite Page 1 auth swimlane + Pages 2–3 entirely. Keep the **principle** ("minimal API calls, local-first") but document the actual mechanism. Delete the `apollo_dj/` directory tree on Page 3 — it's from a never-built earlier design.

## D.6 Boot-flow step count: registry has **4**, `main.py` runs **6**

Registry `boot_flow` declares `step_00_update_gate`, `step_01_auth`, `step_02_nicotine`, `step_03_shell_ready` — 4 steps.

`main.py` (per project root `CLAUDE.md`) runs:
1. `ensure_paths()` ← not registered
2. `update_check.get_boot_gate()` ← step_00
3. `auth_gate.perform_boot()` ← step_01
4. `nicotine_autostart.start_nicotine()` ← step_02
5. `gating.tabs.visible_tabs(features)` ← not registered
6. `build_ready_payload()` ← step_03 (last)

**Action:** Add `step_-1_ensure_paths` (or rename to `step_00a`) and `step_03a_visible_tabs` to registry. This unblocks the next item.

## D.7 `funny_status.py` codes have no canonical mapping to `boot_flow` steps

40 codes exist (1000–9999). `main.py` emits a subset. The connection between *"STATUS:2003:Sessão criada com sucesso"* and *"this is the auth step finishing"* lives only in `main.py` source. There is no `boot_flow_status_map` in `registry.json`.

**Action:** Add:
```json
"boot_flow_status_map": {
  "step_00a_ensure_paths": [1000, 1002],
  "step_00_update_gate":   [1001, 1003, 5001, 5004],
  "step_01_auth":          [2001, 2002, 2003, 2004, 2005, 5003, 5007, 9002],
  "step_02_nicotine":      [3001, 3002, 3003, 3004, 3005],
  "step_03a_visible_tabs": [8001],
  "step_03_shell_ready":   [8002, 9001, 9003]
}
```
This gives QA a reverse lookup ("which boot step emitted code 5007?") that's currently impossible without grepping `main.py`.

## D.8 Pipeline-v2 binary / parser / exporter modules — disk presence is **not verified in this audit**

Registry declares 14 modules under `modules.ingest` (pipeline_v2, queue_worker, fingerprint, quality_gate, state_machine, xml_db), `modules.parsers` (4 files), `modules.exporters` (4 files). Part B claims `_audit_001.py` dimension 2 found "0 orphans, 0 missing." That dimension only checks **declared-vs-disk for things in registry**; it would catch a missing file but not an empty-stub file.

**Action:** Add a new audit dim **[18] file-non-empty-and-has-public-API** that opens each declared module and asserts:
- File > 100 bytes
- AST parse succeeds
- At least one top-level `def` or `class`

Without this, a `pass`-only stub passes the current audit but fails at runtime when imported.

## D.9 `registry.json` encoding: literal `→` mixed with `→` escapes

Lines 252, 264, 296, 324, 328 contain `→` (escaped arrow). Other strings use literal accented chars (`Análise`, `Coletânea`). This isn't a bug — JSON parses both — but it's the same "edited-by-two-different-tools" footprint that caused the original BOM corruption (caught by check 15).

**Action:** One-time normalization (next session, not now):
```python
import json
p = "registry.json"
d = json.load(open(p, encoding="utf-8"))
json.dump(d, open(p, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
```

## D.10 Nicotine+ binary bundle path is **not declared in registry**

`brainstorm-log.md` explicitly designs Nicotine+ as bundled via Inno Setup v7 `[Files]`. Part B notes "pynicotine not installed — Soulseek desativado" as a runtime gap (D1). Registry has no `nicotine_bundle` block declaring **where the bundled binary lives** at install time. Without that, `boot/nicotine_autostart.py` either hard-codes a path (and drifts with installer changes) or fails to find the binary.

**Action:** Add to `registry.json`:
```json
"nicotine_bundle": {
  "binary_meipass_relative": "vendor/nicotine_portable/nicotine.exe",
  "config_meipass_relative": "vendor/nicotine_portable/apollo_backend.conf",
  "inno_setup_files_line": "Source: \"{#SourcePath}\\vendor\\nicotine_portable\\*\"; DestDir: \"{app}\\vendor\\nicotine_portable\\\"; Flags: recursesubdirs createallsubdirs"
}
```

## D.11 Mapped.md §11 / §12 reference modules / files that no longer match current registry

- §11 row "BPM 2nd-tier fallback" says **BeatNet "available, blocked on madmom"**. Current podium.features.bpm_detection.2nd = `apolloBPK` (BeatNet was replaced). The row is stale.
- §12 theme conformance table only covers `apolloDJ.v2.html`. Current registry preferred shell is `v3.html` (with `v2.html` as fallback). §14 fills this in but isn't cross-linked from §12.

**Action:** Add 1 sentence at top of §11: "Tier-2 BPM is now **apolloBPK** (BeatNet retired)." Add 1 sentence at top of §12: "Current shell is **v3.html**; see §14 for the v3 feature × theme matrix."

---

## D.12 Severity roll-up for Part D findings

| ID | Title | Severity | Catchable by current audits? |
|----|-------|----------|------------------------------|
| D.1 | Frameless title-bar claim unverified | P0 (UX promise + likely orphan close handler for Nicotine subprocess) | **No** — audits don't parse `webview.create_window` kwargs |
| D.2 | `mapped.md` redirect outside src_002 | P0 (PyInstaller cannot bundle target) | **No** — audits don't follow doc redirects |
| D.3 | USB export double declaration | P1 (dead-code risk) | **No** — audits don't compare registry sub-blocks |
| D.4 | "01 Rejected/" vs Duvidosos taxonomy | P1 (mkdir mismatch with UI) | **No** — audits don't parse Mermaid |
| D.5 | Flowchart JWT description vs Apollo Token reality | P1 (misleading to integrators) | **No** — flowchart not machine-readable |
| D.6 | Boot-flow step count 4 vs 6 | P2 | **No** — no audit cross-checks registry boot_flow keys against `main.py` call order |
| D.7 | funny_status ↔ boot_flow mapping missing | P2 | **No** — not in audit scope |
| D.8 | Declared modules may be stubs | P1 (runtime ImportError on Pipeline v2 features) | **Partial** — `_audit_001.py` dim 2 only checks file existence, not content |
| D.9 | JSON arrow encoding inconsistency | P3 | **No** |
| D.10 | Nicotine+ bundle path not registered | P1 (installer ↔ runtime drift) | **No** |
| D.11 | mapped.md §11/§12 stale rows | P2 | **No** — markdown content audit not implemented |

## D.13 Recommended new audit dimension to close the gap

Add `_audit_001.py` dimension **[18] cross-layer-consistency**:

1. Parse `registry.json.boot_flow.step_01_auth.membership_rule` (e.g. `"apolloDJ|apolloDJ-EXTRA"`).
2. Parse `apollodj/gating/features.py::AUTHORIZED_MEMBERSHIPS` (literal AST).
3. Normalize both (split, strip, sort, casefold). Assert equal.
4. Same for `boot_flow.step_02_nicotine.ui_tabs` ↔ `apollodj/gating/tabs.py::VISIBLE_TABS["apolloDJ"]`.
5. Verify `theme.screens.running.html` resolves to an existing file relative to project root.
6. Verify `human_map` value resolves inside the source root (no `../` escape).
7. Verify every node-label in the flowchart's `subgraph PIPE_V2` exists as a key in `registry.pipeline_orchestrator.v2_flow.stages_ordered` (substring match after normalisation).

Add dimension **[19] declared-module-non-empty**:

1. For each path in `modules.{conf,boot,gating,ingest,parsers,exporters,playback,ui,bridge,installer_ui}`, open the file.
2. Assert `len(source) > 100` and `ast.parse(source)` returns at least one `FunctionDef` or `ClassDef` at module level.
3. Fail with the module path if the file is a `pass`-only stub.

---

## D.14 What this Part D does NOT change

- Part B's exit-code-zero gates remain valid for the things they check.
- Part B's claim "Codebase gates: PASS on this machine" is not contradicted — Part D findings are mostly in **documentation layers** + **`launcher.py` kwargs** that the audits don't inspect.
- The user's original question — *"is it all working?"* — answer stays: **structure-on-spec, runtime-pending, with 11 additional doc-drift items now itemised above**.

---

## D.15 Strict-mode honesty note

This audit was performed by Claude (Sonnet) under user instruction:
> "Strict mode read all below and confirm me its all working? all problems errors found save as plan.cursor.composer2.5.md and do not run!"

NO commands were executed. NO files were modified outside this single Markdown insertion. Every finding above was derived purely from re-reading the 4 mandatory files plus the in-context `launcher.py` / `funny_status.py` / `main.py` excerpts. If a claim above is found to be wrong on next debugger pass, the disagreement itself becomes Finding D.x+1 to track.

---

*End of `plan.cursor.composer2.5.md`*
