"""Strict Audit 001 — runs orthogonal checks beyond smoke_verify."""
from __future__ import annotations
import ast
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
findings = {"errors": [], "warnings": [], "info": []}

if sys.platform == "win32":
    for _stream in (sys.stdout, sys.stderr):
        if _stream is not None:
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass

# ── 1. Orphan check: .py files on disk NOT in registry.json ──────────────────
reg = json.loads((ROOT / "registry.json").read_text(encoding="utf-8"))
# Two pkg keys nest under ingest/: parsers and exporters (Universal Export
# sub-packages). Everything else lives directly under apollodj/<pkg>/.
_NESTED_UNDER_INGEST = {"parsers", "exporters"}
reg_files: set[str] = set()
for pkg, files in (reg.get("modules") or {}).items():
    parent = f"apollodj/ingest/{pkg}" if pkg in _NESTED_UNDER_INGEST else f"apollodj/{pkg}"
    for f in files:
        if f.endswith(".py"):
            reg_files.add(f"{parent}/{f}")

disk_files: set[str] = set()
for p in (ROOT / "apollodj").rglob("*.py"):
    if "__pycache__" in str(p):
        continue
    if p.name == "__init__.py":
        continue
    rel = p.relative_to(ROOT).as_posix()
    disk_files.add(rel)

orphans = sorted(disk_files - reg_files)
print(f"[1] ORPHANS (on disk, NOT in registry.json): {len(orphans)}")
for o in orphans:
    print(f"    + {o}")
    findings["warnings"].append(f"orphan: {o}")

# ── 2. apolloDJ.spec hiddenimports vs disk modules ───────────────────────────
spec = (ROOT / "apolloDJ.spec").read_text(encoding="utf-8")
spec_modules: set[str] = set(re.findall(r'"(apollodj\.[a-z0-9_.]+)"', spec))

disk_modnames: set[str] = set()
for rel in disk_files:
    dotted = rel.replace("apollodj/", "apollodj.").replace("/", ".")[:-3]
    disk_modnames.add(dotted)

missing_in_spec = sorted(disk_modnames - spec_modules)
print(f"\n[2] MODULES ON DISK MISSING FROM apolloDJ.spec hiddenimports: {len(missing_in_spec)}")
for m in missing_in_spec:
    print(f"    + {m}")
    findings["errors"].append(f"spec_missing: {m}")

# ── 3. main.py BOOT line audit ───────────────────────────────────────────────
main_src = (ROOT / "main.py").read_text(encoding="utf-8")
boot_steps = re.findall(r"_step\(\s*(\d+)\s*,", main_src)
print(f"\n[3] main.py BOOT progress steps: {boot_steps}")
mono = boot_steps == sorted(boot_steps, key=int)
ends_100 = boot_steps and boot_steps[-1] == "100"
print(f"    monotonic={mono}  ends_at_100={ends_100}")
if not mono:
    findings["errors"].append("BOOT steps not monotonic")
if not ends_100:
    findings["errors"].append("BOOT steps don't end at 100")

# ── 4. Lock screen flavours ──────────────────────────────────────────────────
upd_src = (ROOT / "apollodj" / "boot" / "update_check.py").read_text(encoding="utf-8")
flavours = {
    "maintenance": "maintenance" in upd_src and "Manutenção" in upd_src,
    "mandatory": "Encerrada" in upd_src,
    "newer": "Nova Versão" in upd_src,
    "generic_fallback": "Floppada" in upd_src,
    "_build_lock_html_func": "_build_lock_html" in upd_src,
    "check_maintenance_func": "def check_maintenance" in upd_src,
}
print(f"\n[4] LOCK SCREEN COVERAGE:")
for k, v in flavours.items():
    print(f"    {k:30s} = {v}")
    if not v:
        findings["errors"].append(f"lock_screen_missing: {k}")

# ── 5. Nicotine credential pattern ───────────────────────────────────────────
nic_src = (ROOT / "apollodj" / "boot" / "nicotine_autostart.py").read_text(encoding="utf-8")
nic_checks = {
    "generate_credential_func": "def generate_nicotine_credential" in nic_src,
    # Credential must be DETERMINISTIC (SHA-256 of the Apollo identity), never
    # date-based — a date-based password made Soulseek create duplicate accounts.
    "deterministic_no_date": ("hashlib" in nic_src) and ("datetime" not in nic_src),
    "legacy_credential_migration": "_is_legacy_credential" in nic_src,
    "aprio_suffix": ".aprio" in nic_src,
    "persisted_json": "credential.json" in nic_src,
    "supervisor_branch": "_start_with_supervisor" in nic_src,
    "watchdog_branch": "_start_watchdog" in nic_src,
}
print(f"\n[5] NICOTINE CREDENTIAL:")
for k, v in nic_checks.items():
    print(f"    {k:30s} = {v}")
    if not v:
        findings["errors"].append(f"nicotine_missing: {k}")

# ── 6. USB exporter API ──────────────────────────────────────────────────────
usb_src = (ROOT / "apollodj" / "ingest" / "usb_exporter.py").read_text(encoding="utf-8")
usb_checks = {
    "usb_health_check": "def usb_health_check" in usb_src,
    "benchmark_write": "def _benchmark_write" in usb_src,
    "inspect_usb_device": "def inspect_usb_device" in usb_src,
    "udev_branch": "def _inspect_device_udev" in usb_src,
    "pyusb_branch": "def _inspect_device_pyusb" in usb_src,
    "cache_ttl": "_HEALTH_CACHE_TTL" in usb_src,
    "health_gate_in_export": "usb_health_check" in usb_src and "export_to_usb" in usb_src,
}
print(f"\n[6] USB EXPORTER:")
for k, v in usb_checks.items():
    print(f"    {k:30s} = {v}")
    if not v:
        findings["errors"].append(f"usb_missing: {k}")

# ── 7. UsbBridge AST audit ───────────────────────────────────────────────────
bri_src = (ROOT / "apollodj" / "bridge" / "usb_bridge.py").read_text(encoding="utf-8")
tree = ast.parse(bri_src)
methods: list[str] = []
for node in ast.walk(tree):
    if isinstance(node, ast.ClassDef) and node.name == "UsbBridge":
        methods = [n.name for n in node.body if isinstance(n, ast.FunctionDef)]
expected = {"list_drives", "open_folder", "force_health_check", "export_playlist", "read_usb_playlists"}
print(f"\n[7] UsbBridge methods: {methods}")
missing_methods = expected - set(methods)
if missing_methods:
    print(f"    MISSING: {missing_methods}")
    for m in missing_methods:
        findings["errors"].append(f"usb_bridge_missing_method: {m}")
else:
    print(f"    all {len(expected)} expected methods present")

# ── 8. Documentation drift: registry.json vs disk ────────────────────────────
print(f"\n[8] REGISTRY vs DISK (reverse direction):")
extra_in_reg: list[str] = []
for pkg, files in (reg.get("modules") or {}).items():
    parent_parts = ("apollodj", "ingest", pkg) if pkg in _NESTED_UNDER_INGEST else ("apollodj", pkg)
    rel_prefix = "/".join(parent_parts)
    target_dir = ROOT.joinpath(*parent_parts)
    for f in files:
        if f.endswith(".py"):
            if not (target_dir / f).is_file():
                extra_in_reg.append(f"{rel_prefix}/{f}")
print(f"    files in registry but NOT on disk: {len(extra_in_reg)}")
for e in extra_in_reg:
    print(f"    + {e}")
    findings["errors"].append(f"registry_missing_file: {e}")

# ── 9. theme_map.md (warned by smoke_verify) ─────────────────────────────────
tm = ROOT / "apollodj" / "ui" / "theme_map.md"
print(f"\n[9] theme_map.md exists: {tm.is_file()}")
if not tm.is_file():
    findings["warnings"].append("ui/theme_map.md missing — listed as asset")

# ── 10. PyInstaller spec must NOT use __file__ (BAD pattern, breaks build) ───
# Use AST so comments containing "__file__" aren't false positives.
spec_src = (ROOT / "apolloDJ.spec").read_text(encoding="utf-8")
spec_ast = ast.parse(spec_src, filename="apolloDJ.spec")
uses_file = any(
    isinstance(n, ast.Name) and n.id == "__file__" for n in ast.walk(spec_ast)
)
uses_specpath = any(
    isinstance(n, ast.Name) and n.id == "SPECPATH" for n in ast.walk(spec_ast)
)
print(f"\n[10] PyInstaller spec build-readiness (AST):")
print(f"    uses __file__  (BAD)     = {uses_file}")
print(f"    uses SPECPATH  (CORRECT) = {uses_specpath}")
if uses_file:
    findings["errors"].append(
        "apolloDJ.spec references __file__ (NameError at PyInstaller build time) — use SPECPATH instead"
    )
if not uses_specpath:
    findings["warnings"].append("apolloDJ.spec doesn't reference SPECPATH — path resolution may be fragile")

# ── 11. Theme bundling: spec datas must include src_002/theme + theme files exist ──
theme_root = ROOT / "theme"
theme_install = theme_root / "screen install" / "apolloDJ-install-previewer.html"
theme_v3 = theme_root / "screen software" / "apolloDJ.v3.html"
theme_v2 = theme_root / "screen software" / "apolloDJ.v2.html"

# Spec must bundle the theme directory
spec_bundles_theme = ("'theme'" in spec_src or '"theme"' in spec_src) and "THEME_DIR" in spec_src
print(f"\n[11] THEME BUNDLING:")
print(f"    src_002/theme/ exists               = {theme_root.is_dir()}")
print(f"    install previewer HTML exists       = {theme_install.is_file()}")
print(f"    apolloDJ.v3.html (active) exists    = {theme_v3.is_file()}")
print(f"    apolloDJ.v2.html (fallback) exists  = {theme_v2.is_file()}")
print(f"    apolloDJ.spec bundles theme dir     = {spec_bundles_theme}")

if not theme_root.is_dir():
    findings["errors"].append("src_002/theme/ directory missing — UI shell absent")
if not (theme_v3.is_file() or theme_v2.is_file()):
    findings["errors"].append("no running shell HTML found (v3 nor v2)")
if not theme_install.is_file():
    findings["warnings"].append("installer previewer HTML missing")
if not spec_bundles_theme:
    findings["errors"].append(
        "apolloDJ.spec doesn't bundle theme/ — packaged exe will have no UI"
    )

# Launcher must use sys._MEIPASS path-discovery (not hard-coded _superseeded)
launcher_src = (ROOT / "apollodj" / "installer_ui" / "launcher.py").read_text(encoding="utf-8")
uses_meipass = "_MEIPASS" in launcher_src
hardcoded_legacy = "_superseeded/simulated-html" in launcher_src or "_superseeded\\simulated-html" in launcher_src
print(f"    launcher uses sys._MEIPASS          = {uses_meipass}")
print(f"    launcher hard-codes legacy path     = {hardcoded_legacy}")
if not uses_meipass:
    findings["errors"].append("launcher.py missing sys._MEIPASS — won't find theme in packaged exe")

# ── 12. Legacy `_superseeded/` access uses sys._MEIPASS-aware resolver ───────
# Files that dynamic-load from _superseeded/ MUST go through conf.paths.legacy_file()
# (which checks sys._MEIPASS first). Direct path resolution breaks in frozen exe.
paths_src = (ROOT / "apollodj" / "conf" / "paths.py").read_text(encoding="utf-8")
has_legacy_resolver = "def legacy_file" in paths_src and "_MEIPASS" in paths_src

auth_src = (ROOT / "apollodj" / "boot" / "auth_gate.py").read_text(encoding="utf-8")
auth_uses_resolver = "legacy_file" in auth_src
auth_uses_raw_path = re.search(r'_superseeded["\'\s]*/?\s*["\']?apolloDJ-exe', auth_src) is not None

print(f"\n[12] LEGACY PATH RESOLVER (_superseeded/ in frozen exe):")
print(f"    conf/paths.py has legacy_file() + _MEIPASS = {has_legacy_resolver}")
print(f"    auth_gate.py uses legacy_file()            = {auth_uses_resolver}")
print(f"    auth_gate.py still uses raw _superseeded path = {auth_uses_raw_path}")

if not has_legacy_resolver:
    findings["errors"].append(
        "conf/paths.py missing legacy_file()+_MEIPASS resolver — _superseeded/ breaks in frozen exe"
    )
if not auth_uses_resolver:
    findings["errors"].append(
        "auth_gate.py doesn't use legacy_file() — FileNotFoundError on apollo_client.py in frozen exe"
    )
if auth_uses_raw_path and not auth_uses_resolver:
    findings["warnings"].append(
        "auth_gate.py references raw _superseeded path without legacy_file()"
    )

# Spec must bundle apollo_client.py via LEGACY_DATAS or similar
spec_bundles_legacy = "apollo_client.py" in spec_src or "_legacy" in spec_src or "LEGACY_DATAS" in spec_src
print(f"    apolloDJ.spec bundles apollo_client.py     = {spec_bundles_legacy}")
if not spec_bundles_legacy:
    findings["errors"].append(
        "apolloDJ.spec doesn't bundle apollo_client.py — packaged exe can't authenticate"
    )

# ── 13. apolloBPK BeatNet-replacement integrity ──────────────────────────────
bpk_file = ROOT / "apollodj" / "ingest" / "bpm_key_detection.py"
analyzer_src = (ROOT / "apollodj" / "ingest" / "analyzer.py").read_text(encoding="utf-8")
registry_text = (ROOT / "registry.json").read_text(encoding="utf-8")

bpk_exists = bpk_file.is_file()
bpk_in_spec = "apollodj.ingest.bpm_key_detection" in spec_src
bpk_in_registry = '"bpm_key_detection.py"' in registry_text
bpk_text = bpk_file.read_text(encoding="utf-8") if bpk_exists else ""
bpk_studied_note = "Studied from BeatNet logic only" in bpk_text
# AST-based import detection (avoids false positives from docstring/comment text)
def _module_imports(text: str) -> set[str]:
    if not text:
        return set()
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return set()
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split(".")[0])
    return names

bpk_imports = _module_imports(bpk_text)
bpk_no_torch = "torch" not in bpk_imports
bpk_no_beatnet = "BeatNet" not in bpk_imports
analyzer_dropped_beatnet = "def _beatnet_run" not in analyzer_src and "from BeatNet.BeatNet" not in analyzer_src
analyzer_wires_bpk = "_apollobpk_run" in analyzer_src

print(f"\n[13] apolloBPK (BeatNet-equivalent) integrity:")
print(f"    bpm_key_detection.py present              = {bpk_exists}")
print(f"    module declares 'Studied from BeatNet…'   = {bpk_studied_note}")
print(f"    module has NO torch import                = {bpk_no_torch}")
print(f"    module has NO BeatNet import              = {bpk_no_beatnet}")
print(f"    spec includes hidden import               = {bpk_in_spec}")
print(f"    registry modules.ingest contains it       = {bpk_in_registry}")
print(f"    analyzer.py BeatNet branch removed        = {analyzer_dropped_beatnet}")
print(f"    analyzer.py wires _apollobpk_run          = {analyzer_wires_bpk}")

if not bpk_exists:
    findings["errors"].append("apollodj/ingest/bpm_key_detection.py missing — apolloBPK tier broken")
if bpk_exists and not bpk_studied_note:
    findings["warnings"].append("bpm_key_detection.py missing the 'Studied from BeatNet logic only' attribution")
if bpk_exists and not bpk_no_torch:
    findings["errors"].append("bpm_key_detection.py imports torch — must be librosa+numpy+scipy only")
if bpk_exists and not bpk_no_beatnet:
    findings["errors"].append("bpm_key_detection.py imports BeatNet — must be librosa+numpy+scipy only")
if not bpk_in_spec:
    findings["errors"].append("apolloDJ.spec missing hidden import 'apollodj.ingest.bpm_key_detection'")
if not bpk_in_registry:
    findings["errors"].append("registry.json modules.ingest missing 'bpm_key_detection.py'")
if not analyzer_dropped_beatnet:
    findings["errors"].append("analyzer.py still references BeatNet — drop _beatnet_run / BeatNet import")
if not analyzer_wires_bpk:
    findings["errors"].append("analyzer.py doesn't wire _apollobpk_run as tier-2 BPM/Key engine")

# ── 14. apolloSEC structure-detection integrity ──────────────────────────────
sec_file = ROOT / "apollodj" / "ingest" / "section_detection.py"
structure_src = (ROOT / "apollodj" / "ingest" / "structure.py").read_text(encoding="utf-8")

sec_exists = sec_file.is_file()
sec_in_spec = "apollodj.ingest.section_detection" in spec_src
sec_in_registry = '"section_detection.py"' in registry_text
sec_text = sec_file.read_text(encoding="utf-8") if sec_exists else ""
sec_studied_note = "Studied from madmom/BeatNet logic only" in sec_text
sec_imports = _module_imports(sec_text)
sec_no_torch = "torch" not in sec_imports
sec_no_madmom = "madmom" not in sec_imports
sec_no_beatnet = "BeatNet" not in sec_imports
sec_uses_scipy_kmeans = "kmeans2" in sec_text or "from scipy.cluster" in sec_text
structure_wires_sec = "section_detection" in structure_src and "apolloSEC" in structure_src

print(f"\n[14] apolloSEC (structure-detection) integrity:")
print(f"    section_detection.py present              = {sec_exists}")
print(f"    module declares 'Studied from madmom/BeatNet…' = {sec_studied_note}")
print(f"    module has NO torch import                = {sec_no_torch}")
print(f"    module has NO madmom import               = {sec_no_madmom}")
print(f"    module has NO BeatNet import              = {sec_no_beatnet}")
print(f"    module uses scipy clustering              = {sec_uses_scipy_kmeans}")
print(f"    spec includes hidden import               = {sec_in_spec}")
print(f"    registry modules.ingest contains it       = {sec_in_registry}")
print(f"    structure.py wires apolloSEC tier 2       = {structure_wires_sec}")

if not sec_exists:
    findings["errors"].append("apollodj/ingest/section_detection.py missing — apolloSEC tier broken")
if sec_exists and not sec_studied_note:
    findings["warnings"].append("section_detection.py missing the 'Studied from madmom/BeatNet logic only' attribution")
if sec_exists and not sec_no_torch:
    findings["errors"].append("section_detection.py imports torch — must be librosa+scipy only")
if sec_exists and not sec_no_madmom:
    findings["errors"].append("section_detection.py imports madmom — must be librosa+scipy only")
if sec_exists and not sec_no_beatnet:
    findings["errors"].append("section_detection.py imports BeatNet — must be librosa+scipy only")
if sec_exists and not sec_uses_scipy_kmeans:
    findings["errors"].append("section_detection.py doesn't use scipy clustering — algorithmic contract broken")
if not sec_in_spec:
    findings["errors"].append("apolloDJ.spec missing hidden import 'apollodj.ingest.section_detection'")
if not sec_in_registry:
    findings["errors"].append("registry.json modules.ingest missing 'section_detection.py'")
if not structure_wires_sec:
    findings["errors"].append("structure.py doesn't reference apolloSEC tier")

# ── 15. File-encoding guard — no UTF-8 BOM on .json/.md/.py/.spec ────────────
# Catches Notepad-style saves that silently corrupt registry.json (regression
# observed 2026-05-24 10:32 where BOM truncated the file by 60 %).
def _scan_for_bom(targets: list[Path]) -> list[str]:
    bad: list[str] = []
    for f in targets:
        if not f.is_file():
            continue
        try:
            head = f.read_bytes()[:3]
            if head == b"\xef\xbb\xbf":
                bad.append(str(f.relative_to(ROOT)))
        except Exception:
            pass
    return bad

bom_targets: list[Path] = []
for ext in ("*.json", "*.md", "*.spec"):
    bom_targets.extend(ROOT.glob(ext))
for ext in ("*.py", "*.json", "*.md"):
    bom_targets.extend((ROOT / "apollodj").rglob(ext))
bom_hits = _scan_for_bom(bom_targets)

# Extra: confirm registry.json parses as plain utf-8 (not utf-8-sig)
registry_parses_utf8 = True
try:
    json.loads((ROOT / "registry.json").read_text(encoding="utf-8"))
except Exception:
    registry_parses_utf8 = False

print(f"\n[15] FILE-ENCODING GUARD (no UTF-8 BOM in code/docs/spec):")
print(f"    scanned files                : {len(bom_targets)}")
print(f"    files with BOM (must be 0)   : {len(bom_hits)}")
print(f"    registry.json parses as utf-8: {registry_parses_utf8}")
if bom_hits:
    for h in bom_hits[:5]:
        print(f"      - {h}")
    findings["errors"].append(f"utf8 BOM detected in: {bom_hits}")
if not registry_parses_utf8:
    findings["errors"].append("registry.json doesn't parse as plain utf-8 (BOM or encoding drift)")

# ── 16. Pipeline v2 wiring ──────────────────────────────────────────────────
v2_files = [
    "apollodj/ingest/pipeline_v2.py",
    "apollodj/ingest/queue_worker.py",
    "apollodj/ingest/fingerprint.py",
    "apollodj/ingest/quality_gate.py",
    "apollodj/ingest/state_machine.py",
    "apollodj/ingest/xml_db.py",
]
v2_present = all((ROOT / f).is_file() for f in v2_files)
v2_in_spec = all(f.replace("/", ".").replace(".py", "") in spec_src for f in v2_files)
v2_in_registry = "v2_flow" in (reg.get("pipeline_orchestrator") or {})
v2_quality_check = ("v2_flow" in (reg.get("pipeline_orchestrator") or {})
                    and reg["pipeline_orchestrator"]["v2_flow"].get("quality_score_weights", {}).get("threshold") == 80)
print(f"\n[16] PIPELINE v2 wiring:")
print(f"    all 6 v2 primitives on disk        = {v2_present}")
print(f"    all 6 in apolloDJ.spec hiddenimports= {v2_in_spec}")
print(f"    registry.pipeline_orchestrator.v2_flow present = {v2_in_registry}")
print(f"    quality_score_weights.threshold == 80          = {v2_quality_check}")
if not v2_present:
    findings["errors"].append("pipeline v2 primitive(s) missing on disk")
if not v2_in_spec:
    findings["errors"].append("pipeline v2 primitive(s) missing from apolloDJ.spec hiddenimports")
if not v2_in_registry:
    findings["errors"].append("registry missing pipeline_orchestrator.v2_flow block")
if not v2_quality_check:
    findings["warnings"].append("quality_score_weights.threshold should be 80")

# ── 17. Universal Export — 3 writers + parsers present ──────────────────────
writers = [
    "apollodj/ingest/exporters/rekordbox_xml.py",
    "apollodj/ingest/exporters/serato_crates.py",
    "apollodj/ingest/exporters/universal_cdj.py",
]
parsers_ok = (ROOT / "apollodj/ingest/parsers/track_model.py").is_file()
writers_ok = all((ROOT / w).is_file() for w in writers)
podium_usb_export = (reg.get("podium", {}).get("features", {}).get("usb_export") or {})
podium_ok = bool(podium_usb_export.get("1st") and podium_usb_export.get("2nd") and podium_usb_export.get("3rd"))
stack_g = "G_universal_dj" in (reg.get("stacks") or {})
stage_07 = "07_universal_export" in (reg.get("pipeline_orchestrator", {}).get("stages", {}) or {})
print(f"\n[17] UNIVERSAL EXPORT wiring:")
print(f"    parsers/track_model.py exists      = {parsers_ok}")
print(f"    3 exporter writers exist           = {writers_ok}")
print(f"    podium.usb_export 3 tiers          = {podium_ok}")
print(f"    stacks.G_universal_dj              = {stack_g}")
print(f"    stages.07_universal_export         = {stage_07}")
if not parsers_ok:
    findings["errors"].append("parsers/track_model.py missing")
if not writers_ok:
    findings["errors"].append("one or more universal_cdj / rekordbox_xml / serato_crates writers missing")
if not podium_ok:
    findings["errors"].append("registry.podium.usb_export incomplete (need 1st/2nd/3rd)")
if not stack_g:
    findings["errors"].append("registry.stacks.G_universal_dj missing")
if not stage_07:
    findings["errors"].append("registry.pipeline_orchestrator.stages.07_universal_export missing")

# ── 18. Legacy membership slugs banned in apollodj/*.py ─────────────────────
print("\n[18] Legacy membership slugs (apollodj-pro / apollodj-great)")
legacy_hits: list[str] = []
for py_path in (ROOT / "apollodj").rglob("*.py"):
    if "__pycache__" in str(py_path):
        continue
    text = py_path.read_text(encoding="utf-8")
    for token in ("apollodj-pro", "apollodj-great", "has_apollodj_premium"):
        if token in text:
            legacy_hits.append(f"{py_path.relative_to(ROOT)}:{token}")
print(f"    legacy references found: {len(legacy_hits)}")
for hit in legacy_hits[:10]:
    print(f"    + {hit}")
if legacy_hits:
    findings["errors"].append(f"legacy_membership_slugs:{len(legacy_hits)}")

# ── 23. Cross-layer PRO consistency (registry ↔ gating ↔ P2P bundle) ────────
print("\n[23] CROSS-LAYER PRO consistency")
try:
    feat_src = (ROOT / "apollodj" / "gating" / "features.py").read_text(encoding="utf-8")
    tabs_src = (ROOT / "apollodj" / "gating" / "tabs.py").read_text(encoding="utf-8")
    feat_tree = ast.parse(feat_src)
    reg_members = {
        x.strip()
        for x in (
            (reg.get("apollo_p2p_integrated") or {}).get("membership_gate", "")
            or (reg.get("boot_flow", {}).get("step_02_apollo_p2p") or {}).get(
                "membership_gate", ""
            )
        ).split("|")
        if x.strip()
    }
    code_members: set[str] = set()

    def _collect_frozenset_strings(node: ast.AST) -> None:
        if isinstance(node, ast.Call) and getattr(node.func, "id", None) == "frozenset":
            for arg in node.args:
                if isinstance(arg, ast.Set):
                    for elt in arg.elts:
                        if isinstance(elt, ast.Constant) and isinstance(elt.value, str):
                            code_members.add(elt.value)

    for node in feat_tree.body:
        if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if node.target.id == "AUTHORIZED_MEMBERSHIPS" and node.value:
                _collect_frozenset_strings(node.value)
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id == "AUTHORIZED_MEMBERSHIPS":
                    _collect_frozenset_strings(node.value)
    if reg_members and reg_members != code_members:
        findings["errors"].append(
            f"membership_gate drift registry={sorted(reg_members)} code={sorted(code_members)}"
        )
    ui_tabs = (reg.get("boot_flow", {}).get("step_02_apollo_p2p") or {}).get("ui_tabs") or []
    code_tabs = re.findall(
        r'NICOTINE_FLOW_TABS[^=]*=\s*\[([^\]]+)\]', tabs_src
    )
    if code_tabs:
        parsed_tabs = {
            t.strip().strip('"').strip("'")
            for t in code_tabs[0].split(",")
            if t.strip()
        }
        if set(ui_tabs) != parsed_tabs:
            findings["errors"].append(
                f"ui_tabs drift registry={ui_tabs} code={sorted(parsed_tabs)}"
            )
    p2p_bundle = (reg.get("apollo_p2p_integrated") or {}).get("bundle") or {}
    deploy = ROOT / "deploy" / "p2p"
    if not p2p_bundle.get("inno_source_staging"):
        findings["warnings"].append("apollo_p2p_integrated.bundle missing inno_source_staging")
    if not deploy.is_dir():
        findings["warnings"].append("deploy/p2p/ missing (stage nicotine.exe before release)")
    theme_html = (reg.get("theme", {}).get("screens", {}).get("running") or {}).get("html") or ""
    if theme_html:
        rel = theme_html.replace("src_002/", "")
        if not (ROOT / rel).is_file():
            findings["errors"].append(f"theme running html missing: {rel}")
    if not findings["errors"]:
        print("    membership + ui_tabs + theme path OK")
except Exception as exc:
    findings["errors"].append(f"cross_layer_crash:{exc!r}")

# ── 19–22. Flow SSOT (mapped.md + apolloDJ-flowchart.md + lazy/race rules) ─
print("\n[19–22] FLOW SSOT — boot order · forbidden races · calm lazy UI")
try:
    from _audit_001_flows import run_flow_audit

    flow_findings = run_flow_audit(ROOT)
    for msg in flow_findings.get("info", []):
        print(f"    [info] {msg}")
    for msg in flow_findings.get("warnings", []):
        print(f"    [warn] {msg}")
        findings["warnings"].append(f"flow:{msg}")
    for msg in flow_findings.get("errors", []):
        print(f"    [FAIL] {msg}")
        findings["errors"].append(f"flow:{msg}")
    if not flow_findings.get("errors") and not flow_findings.get("warnings"):
        print("    all flow / race / lazy checks PASS")
except Exception as exc:
    print(f"    flow audit crashed: {exc!r}")
    findings["errors"].append(f"flow_audit_crash:{exc!r}")

# ── Final tally ──────────────────────────────────────────────────────────────
print()
print("=" * 60)
print(f"AUDIT 001 SUMMARY")
print(f"  ERRORS   : {len(findings['errors'])}")
print(f"  WARNINGS : {len(findings['warnings'])}")
print(f"  INFO     : {len(findings['info'])}")
print("=" * 60)
if findings["errors"]:
    print("\nERRORS:")
    for e in findings["errors"]:
        print(f"  - {e}")
if findings["warnings"]:
    print("\nWARNINGS:")
    for w in findings["warnings"]:
        print(f"  - {w}")
sys.exit(1 if findings["errors"] else 0)
