# PLAN — Claude Code strict-mode audit of `src_002`
## Cross-layer consistency report: `registry.json` ⇄ `apolloDJ-flowchart.md` ⇄ `brainstorm-log.md` ⇄ `mapped.md` ⇄ live code

> **Generated:** 2026-05-28
> **Agent:** Claude (Sonnet) via Claude Code
> **Skill applied:** `superpowers:systematic-debugging` — Phase 1 (root cause investigation) only
> **Mode:** strict / READ-ONLY. **No commands executed.** Per user instruction: *"do not execute"*.
> **Inputs:** the 4 mandatory documents + in-context `apollodj/installer_ui/launcher.py`, `apollodj/boot/funny_status.py`, project-root `CLAUDE.md`, `test_exe.bat`, and the session-summary description of `main.py`.

---

## 0 — Executive verdict

**Question:** *"Is it all working?"*
**Answer:** **No.** The 5-gate audit chain (smoke / `_audit_001` / functional / compliance / final) reports green for what it inspects — Python compile, imports, registry-to-disk parity, hidden-imports, BOOT protocol monotonicity — but those gates **physically cannot** detect the class of bugs found below, which live in **documentation layers** and in **`webview.create_window(...)` kwargs** that the audits don't parse.

**11 cross-layer contradictions** identified. **3 are P0** (block the user-visible promise or break packaging). The smallest-blast-radius next move is **C-1 (frameless window)** — code change is ~10 lines + an HTML title-bar removal.

---

## 1 — How the audit chain misses these

| Gate | What it checks | Why it misses Part-D class of bugs |
|------|----------------|------------------------------------|
| `smoke_verify.py` | compile + import sweep + boot smoke | doesn't read flowchart / brainstorm / mapped |
| `_audit_001.py` (17 dims) | spec ↔ disk, registry ↔ disk, BOOT monotonic, BOM-guard | doesn't compare registry **strings** to features.py **constants**; doesn't parse `create_window` kwargs |
| `_audit_001_functional.py` (24 checks) | runtime behaviour of Pro features | doesn't follow markdown redirects, doesn't verify Mermaid node text against code |
| `_compliance_audit.py` (39 checks) | apollo-* rules compliance | scoped to apollo-* plugins (web), not to desktop frameless window or registry sub-blocks |
| `_final_audit.py` (27 checks) | final-stage promises | doesn't inspect launcher.py kwargs, doesn't cross-link flowchart ↔ registry |

**Net:** every finding below is invisible to the current gate chain. See §4 for two new audit dims that close the gap.

---

## 2 — Findings, ordered by severity

### C-1 (P0) — Frameless title bar **claimed implemented**, **not present in `launcher.py` on disk**

**Source of the claim:** `brainstorm-log.md` ("Removed the decorative HTML title bar and wired a real frameless pywebview chrome: launcher.py uses `frameless=True` with window control methods on ApolloApi…").

**Actual `apollodj/installer_ui/launcher.py` (lines 310–318):**
```python
window = webview.create_window(
    title,
    _shell_load_url(shell),
    js_api=_build_js_api(),
    width=1400,
    height=900,
    resizable=True,
    text_select=True,
)
```
- No `frameless=True`.
- `class ApolloApi` has `ingest / tabs / update / usb / login / get_boot_status / _gate_membership` — but **no** `window_minimize` / `window_maximize` / `window_close` methods.
- `_inject_shell_boot` injects `__APOLLO_BOOT_PAYLOAD__` only — no `shell-chrome` script tag.

**User-visible impact:** The horizontal title strip remains as the HTML block `<div class="title-bar">…</div>` (TODO 001 in brainstorm). User explicitly wrote: *"NO border line NO shadow background system = background topside all performing as one"*. That promise is not yet honoured.

**Fix:**
1. `launcher.py::launch_shell` — add `frameless=True, easy_drag=False` to `webview.create_window`.
2. `class ApolloApi` — add three methods:
   ```python
   def window_minimize(self): webview.windows[0].minimize()
   def window_maximize(self): webview.windows[0].toggle_fullscreen()
   def window_close(self): webview.windows[0].destroy()
   ```
3. `theme/screen software/apolloDJ.v3.html` — delete the `<div class="title-bar">…</div>` block listed in `brainstorm-log.md` TODO 001; add a `.pywebview-drag-region` along the top.
4. Wire HTML controls: `onclick="pywebview.api.window_minimize()"` etc.
5. Audit subprocess cleanup: `window_close` must terminate the Nicotine+ subprocess started by `boot/nicotine_autostart.py` or it orphans on Win10.

---

### C-2 (P0) — `src_002/mapped.md` is a **redirect stub** pointing **outside** the source root

**Lines 1–16** of `src_002/mapped.md`:
> "Canonical system map has moved to `../apolloDJ-mapped.md`."
> "**`../apolloDJ-mapped.md` is the single source of truth** as of 2026-05-24."

**But:**
- `registry.json` line 29 still declares `"human_map": "mapped.md"` (the redirect stub inside src_002).
- `apolloDJ.spec` `datas` only bundles paths under `src_002/` — `../apolloDJ-mapped.md` is **outside** the bundle scope.
- A frozen exe shipped to a user has no access to the parent dir.

**User-visible impact:** Any in-app "Help → about" / "Docs" link that resolves `human_map` via `_MEIPASS` will hit the redirect stub. Anyone auditing `src_002` programmatically reads the stub instead of the real map.

**Fix (pick one):**
- **(a) Recommended.** Copy the contents of `build/apolloDJ-mapped.md` into `src_002/mapped.md`, delete the redirect block. `src_002` becomes self-contained.
- **(b)** Change `registry.json.current_structure.human_map` to `"../apolloDJ-mapped.md"`; update every audit that reads it; accept that the frozen exe will not have it.

---

### C-3 (P0) — Membership-tier naming convention is consistent **between registry + brainstorm + mapped**, but the **function name in `launcher.py`** (`has_apollodj_premium`) is misleading and the legacy constants (`apollodj-pro`, `apollodj-great`) appear in session history

**Cross-layer check:**
| Layer | Tier names |
|-------|-----------|
| `registry.boot_flow.step_01_auth.membership_rule` | `"apolloDJ\|apolloDJ-EXTRA"` |
| `registry.boot_flow.step_02_nicotine.membership_gate` | `"apolloDJ\|apolloDJ-EXTRA"` |
| `mapped.md §15` | `apolloDJ` / `apolloDJ-EXTRA` |
| `brainstorm-log` (canonical decision) | `tier in ("apolloDJ", "apolloDJ-EXTRA")` |
| `_audit_001.py` Part B output (existing audit) | "Legacy membership slugs (apollodj-pro/great): **0** references" |
| `_audit_001_functional.py` Part B output | "gating: `apolloDJ\|apolloDJ-EXTRA`; tabs authorized=`buscar+transferencias`" |
| `launcher.py` (in-context) | imports `has_apollodj_premium` from `..gating.features` |

**Apparent reality:** the runtime check actually accepts `apolloDJ` / `apolloDJ-EXTRA` (audit confirms zero legacy refs). The **function name** `has_apollodj_premium` is a leftover that misleads readers — it sounds like it would gate on `apollodj-pro / great` (which is what the session summary documented as the implementation). The function body and the constant inside it have been corrected; the name has not.

**Why P0:** new contributor reads `has_apollodj_premium` and writes calling code assuming the old tier names — silent regression risk.

**Fix:**
1. Rename `apollodj/gating/features.py::has_apollodj_premium` → `has_apollodj_membership` (or `has_membership` per brainstorm-log canonical).
2. Update the 2 call sites in `launcher.py::login` and `launcher.py::_gate_membership`.
3. Add an audit dim that asserts every reference to `gating.features` uses the new name (dim 18 in §4).
4. **Verify on the WordPress side**: `apollo.rio.br/wp-content/plugins/apollo-login/class-api.php` actually emits `features.membership_tier == "apolloDJ"` or `"apolloDJ-EXTRA"` on `/a/v1/app/verify`. If WP emits something else (`apolloDJ-PRO`, `apolloDJ-GREAT`, etc.), the gate fails even for paying users.

---

### C-4 (P1) — `registry.json` declares USB export **twice** with **different module sets**

| Block | Module references |
|-------|-------------------|
| `usb_export` (top-level, lines 410–415) | `apollodj.ingest.usb_exporter + db6_export + playlist_translate` |
| `podium.features.usb_export` (lines 393–397) | `exporters.rekordbox_xml` + `exporters.serato_crates` + `exporters.universal_cdj` |

These describe the same end-user action (export playlist to USB) but reference disjoint module sets — legacy `ingest/*` vs the new Pipeline-v2 `exporters/*`. Whichever set `bridge/usb_bridge.py` actually calls is the one in production; the other is dead code or a façade.

**Fix:**
- Read `bridge/usb_bridge.py` to determine which path is live.
- Make `apollodj/ingest/usb_exporter.py` a thin façade that calls `apollodj/exporters/*` — keep registry top-level block pointing to the façade, keep podium block pointing to the implementation.
- OR delete the legacy block and have callers use podium directly.

---

### C-5 (P1) — Flowchart routes rejects to `01 Rejected/`; registry/code routes them to `2. Duvidosos/{1,2,3}/`

**`apolloDJ-flowchart.md` Page 1 Pipeline-v2 subgraph:**
```
QG -->|fail| REJ[01 Rejected/]
ATOM[Atomic Commit<br/>os.replace -> Tracks/Coletânea]
```

**`registry.storage_layout.Tracks`:**
```json
"2. Duvidosos": {
  "1. Arquivo duvidoso": "Quality-gate rejects",
  "2. Download falhado": "Nicotine+ failures",
  "3. Falha de amplificação": "LUFS / headroom / clipping rejects"
}
```

**Risk:** when `pipeline_v2.run_v2` is wired, whoever implements it from the diagram will `mkdir("01 Rejected")` while the UI tabs (built from the registry taxonomy) read `2. Duvidosos/`. Rejected tracks pile up in an invisible folder.

**Fix:** edit flowchart Pipeline-v2 block to:
```
QG -->|fail quality| DUV1[Tracks/2. Duvidosos/1. Arquivo duvidoso/]
QG -->|fail download| DUV2[Tracks/2. Duvidosos/2. Download falhado/]
QG -->|fail LUFS/headroom| DUV3[Tracks/2. Duvidosos/3. Falha de amplificação/]
```

---

### C-6 (P1) — Flowchart describes JWT + `/refresh` + 5h-scheduler auth; **actual code uses Apollo App Token + per-request verify**

**Flowchart Page 1:** `WP Plugin (Custom REST API) … JWT + Refresh Tokens` · `Auth Endpoints /login /refresh /validate`
**Flowchart Page 2:** "JWT expiry check local → 0 API if valid < 4.5h"
**Flowchart Page 3:** prescribes `apollo_dj/auth/{token_manager.py, api_client.py, scheduler.py}` — none of those exist.

**Reality:**
- `registry.podium.features.auth.1st`: "ApolloClient via _superseeded (X-Apollo-App-Token + Device-Id)"
- Project-root `CLAUDE.md`: endpoints are `/a/v1/app/auth` + `/app/verify` + `/app/revoke`
- `apollodj/boot/auth_gate.py` loads `ApolloClient` from `_superseeded/apolloDJ-exe/core/apollo_client.py`

There is no `/refresh` endpoint, no JWT, no 5-hour scheduler.

**Fix:** rewrite flowchart Pages 1–3 to reflect the Apollo App Token model. Keep the principle ("minimal API calls, local-first") but change the mechanism. Delete the `apollo_dj/` directory tree on Page 3.

---

### C-7 (P1) — Pipeline-v2 + Universal-Export modules declared in registry; `_audit_001` only checks they **exist** — not that they're non-stub

Registry declares 14 modules total:
- `modules.ingest` adds `state_machine.py, quality_gate.py, fingerprint.py, xml_db.py, queue_worker.py, pipeline_v2.py`
- `modules.parsers` declares 4 files
- `modules.exporters` declares 4 files

`_audit_001.py` dimension 2 (per existing Part B audit) confirms "0 orphans, 0 missing". That dim checks **filesystem presence**. It does **not** verify the files are non-empty or contain a public API. A `pass`-only stub or a `raise NotImplementedError` passes this audit.

**Fix:** add audit dim 19 (see §4) — assert each declared module has size > 100 bytes and `ast.parse` returns ≥ 1 top-level `FunctionDef` or `ClassDef`.

---

### C-8 (P1) — Nicotine+ binary bundle path is **not declared in registry**

`brainstorm-log.md` explicitly designs Nicotine+ as bundled via Inno Setup v7 `[Files]`. Part B audit notes "pynicotine not installed — Soulseek desativado" as a runtime gap (D1 in existing Part B).

`registry.json` has no `nicotine_bundle` block. Without one:
- `boot/nicotine_autostart.py` hard-codes the binary path (and drifts when the installer changes layout)
- `installer/apolloDJ.iss [Files]` hard-codes the source path separately
- Both can disagree silently

**Fix:** add to `registry.json`:
```json
"nicotine_bundle": {
  "binary_meipass_relative": "vendor/nicotine_portable/nicotine.exe",
  "config_meipass_relative": "vendor/nicotine_portable/apollo_backend.conf",
  "inno_setup_files_line": "Source: \"{#SourcePath}\\vendor\\nicotine_portable\\*\"; DestDir: \"{app}\\vendor\\nicotine_portable\\\"; Flags: recursesubdirs createallsubdirs"
}
```
Then make `nicotine_autostart.py` resolve the binary via `_MEIPASS + registry.nicotine_bundle.binary_meipass_relative`.

---

### C-9 (P2) — Boot-flow has **4** registered steps, `main.py` runs **6**

`registry.boot_flow` keys:
- `step_00_update_gate`
- `step_01_auth`
- `step_02_nicotine`
- `step_03_shell_ready`

`main.py` (per project-root `CLAUDE.md`):
1. `ensure_paths()` — not registered
2. `update_check.get_boot_gate()` — step_00
3. `auth_gate.perform_boot()` — step_01
4. `nicotine_autostart.start_nicotine()` — step_02
5. `gating.tabs.visible_tabs(features)` — not registered
6. `build_ready_payload()` — step_03

**Fix:** add `step_00a_ensure_paths` and `step_03a_visible_tabs` to registry. Then C-10 becomes possible.

---

### C-10 (P2) — `funny_status.py` codes (40 codes, 1000–9999) have **no canonical mapping to `boot_flow` steps**

40 codes exist, `main.py` emits a subset interleaved with BOOT lines. The connection between e.g. `STATUS:2003:Sessão criada com sucesso` and *"this is the auth step finishing"* lives only in `main.py` source.

**Fix:** add to `registry.json` (after C-9):
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
Gives QA a reverse lookup ("which boot step emitted 5007?") that's currently impossible without grepping `main.py`.

---

### C-11 (P2 / P3) — Mixed encoding + stale rows in mapped.md

**P3 — Encoding inconsistency in `registry.json`:** lines 252, 264, 296, 324, 328 contain `→` (escaped arrow); the rest use literal accented chars. Parses fine but signals "edited by two tools" — same footprint as the prior BOM corruption.

**Fix (later, not now):**
```python
import json
d = json.load(open("registry.json", encoding="utf-8"))
json.dump(d, open("registry.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
```

**P2 — Stale rows in `mapped.md` §11 / §12:**
- §11 row "BPM 2nd-tier fallback" says BeatNet "available, blocked on madmom". Current podium has `apolloBPK` as 2nd. BeatNet was retired.
- §12 theme conformance table only covers `apolloDJ.v2.html`. Current shell is `v3.html` (see §14, which is not cross-linked from §12).

**Fix:** prepend §11 with "**Update 2026-05-28:** Tier-2 BPM is now apolloBPK (BeatNet retired). The row below is preserved for history." Same pattern for §12 → §14.

---

## 3 — Severity roll-up

| ID | Title | Severity | Catchable by current audits? |
|----|-------|----------|------------------------------|
| C-1 | Frameless title-bar claim unverified | **P0** | No — audits don't parse `create_window` kwargs |
| C-2 | `mapped.md` redirect outside src_002 | **P0** | No — audits don't follow doc redirects |
| C-3 | Misleading function name `has_apollodj_premium` (constants are right; name is wrong) | **P0** | No — audits check constants, not symbol names |
| C-4 | USB export double declaration in registry | **P1** | No — audits don't compare registry sub-blocks |
| C-5 | "01 Rejected/" in flowchart vs Duvidosos taxonomy in registry | **P1** | No — audits don't parse Mermaid text |
| C-6 | Flowchart JWT description vs Apollo Token reality | **P1** | No — flowchart not machine-readable |
| C-7 | Declared Pipeline-v2 modules may be stubs | **P1** | Partial — dim 2 checks existence only |
| C-8 | Nicotine+ bundle path not in registry | **P1** | No — no dim cross-checks installer ↔ runtime |
| C-9 | Boot-flow step count 4 vs 6 | **P2** | No |
| C-10 | funny_status ↔ boot_flow reverse-lookup missing | **P2** | No |
| C-11 | JSON arrow-encoding drift + mapped.md stale rows | **P2 / P3** | No |

---

## 4 — Two new audit dimensions to close the gap

### Dim 18 — cross-layer-consistency

```python
def check_cross_layer():
    import ast, json, re, pathlib
    r = json.loads(pathlib.Path("registry.json").read_text(encoding="utf-8"))

    # 18.1 membership_rule ↔ AUTHORIZED_MEMBERSHIPS
    declared = set(r["boot_flow"]["step_01_auth"]["membership_rule"].split("|"))
    src = pathlib.Path("apollodj/gating/features.py").read_text(encoding="utf-8")
    tree = ast.parse(src)
    code_set = None
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == "AUTHORIZED_MEMBERSHIPS":
                    code_set = set(c.value for c in node.value.elts)
    assert code_set == declared, f"membership drift: registry={declared} code={code_set}"

    # 18.2 visible_tabs ↔ VISIBLE_TABS["apolloDJ"]
    # (similar pattern)

    # 18.3 theme.screens.running.html must exist on disk relative to repo root
    p = pathlib.Path(r["theme"]["screens"]["running"]["html"].replace("src_002/", ""))
    assert p.is_file(), f"running.html missing: {p}"

    # 18.4 human_map must not escape src_002
    hm = r["current_structure"]["human_map"]
    assert not hm.startswith(".."), f"human_map escapes src_002: {hm}"
```

### Dim 19 — declared-module-non-empty

```python
def check_modules_non_empty():
    import ast, json, pathlib
    r = json.loads(pathlib.Path("registry.json").read_text(encoding="utf-8"))
    for pkg, files in r["modules"].items():
        for f in files:
            if not f.endswith(".py"):
                continue
            p = pathlib.Path(f"apollodj/{pkg}/{f}")
            assert p.is_file(), f"missing: {p}"
            src = p.read_text(encoding="utf-8")
            assert len(src) > 100, f"stub (too small): {p}"
            tree = ast.parse(src)
            has_api = any(
                isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))
                for n in tree.body
            )
            assert has_api, f"no public API in: {p}"
```

Add both to `_audit_001.py`, bumping dimension count from 17 → **19**.

---

## 5 — Recommended remediation order

(Smallest blast radius first.)

| # | Item | Effort | Risk |
|---|------|--------|------|
| 1 | **C-3 rename** `has_apollodj_premium` → `has_membership` | 10 min | Low |
| 2 | **C-2** copy `apolloDJ-mapped.md` into `src_002/mapped.md`, delete redirect | 5 min | Low |
| 3 | **C-1** add `frameless=True` + 3 bridge methods + HTML title-bar removal + drag-region | ~1 hr | Medium (test Win10 vs Win11 chrome behaviour) |
| 4 | **C-5** edit flowchart REJ node to 3-folder Duvidosos taxonomy | 5 min | Low |
| 5 | **C-4** decide canonical USB export module set; turn other into façade | 30 min | Low |
| 6 | **C-7** dir-walk + open + ast.parse all 14 Pipeline-v2 modules; fill any stubs | 30 min – 2 hr | Medium (depends on which are stubs) |
| 7 | **C-8** add `nicotine_bundle` block to registry; update `nicotine_autostart.py` to resolve via `_MEIPASS` | 30 min | Medium (cross-tested with Inno Setup .iss) |
| 8 | **C-6** rewrite flowchart Pages 1–3 auth swimlane | 1 hr | Low (pure docs) |
| 9 | **C-9 + C-10** extend `boot_flow` to 6 steps + add `boot_flow_status_map` | 15 min | Low |
| 10 | **C-11** JSON normalize + mapped.md update notes | 10 min | Low |
| 11 | Add audit **dim 18 + dim 19** | 1 hr | Low (prevents future drift) |

**After all 11:** re-run the 5 audit gates. If dims 18 + 19 are added, the gates will catch the next round of drift automatically.

---

## 6 — What is demonstrably working (don't break these)

From the in-context evidence + the existing `plan.cursor.composer2.5.md` Part B gate runs:

- ✅ `funny_status.py` — 40 codes loaded, formal pt-BR DJ-vibe tone (no slapstick).
- ✅ `main.py` PyInstaller-safe stdio guard (`sys.stdout is None` check before `.reconfigure`).
- ✅ `launcher.py::ApolloApi.login` — `teste/123456` shortcut + `_gate_membership` returns `"Seu nome não consta nessa Lista Amiga…"` with `reason: not_apollodj_member`.
- ✅ `apolloDJ.v3.html` — duplicate "Acordando os neurônios" box removed.
- ✅ `v3/funny_console.js` — deleted.
- ✅ `registry.json` — JSON parses cleanly, no BOM (recovered from `.bak`).
- ✅ Pipeline v1 (legacy 6-stage) — documented and stable.
- ✅ `test_exe.bat` — restored to minimal 4-line user-original form.
- ✅ Background build `br5cwbq18` — completed exit 0; `dist_002/apolloDJ.exe` rebuilt.
- ✅ Audit gates (per existing Part B): smoke 8/8, audit_001 0/0, functional 28/28, BOOT protocol monotonic to 100.

---

## 7 — Honesty note

This audit was performed under strict mode by Claude (Sonnet) via Claude Code. **No commands were executed.** **No files were modified outside writing this single Markdown file.** Every finding above was derived from re-reading the 4 mandatory documents plus the in-context excerpts of `launcher.py`, `funny_status.py`, project-root `CLAUDE.md`, and `test_exe.bat`.

Some findings (notably **C-1 frameless** and **C-3 has_apollodj_premium**) **contradict** claims made in the prior `plan.cursor.composer2.5.md` Part B Cursor audit. The contradiction itself is the finding — either Cursor's audit overstated, or `launcher.py` was rolled back between Cursor's run and the snapshot Claude Code is reading. **Next debugger pass should re-Read `launcher.py` to determine which is true; that disagreement becomes finding C-12 to track until resolved.**

---

*End of `plan.claude.code.md`*
