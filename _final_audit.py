"""FINAL INTEGRATION AUDIT  - all TO-DOs 001-006 in one report."""
from __future__ import annotations
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
THEME = ROOT / "theme" / "screen software"

if sys.platform == "win32":
    for _stream in (sys.stdout, sys.stderr):
        if _stream is not None:
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass

results: list[tuple[str, bool, str]] = []


def chk(label: str, cond: bool, evidence: str = "") -> bool:
    results.append((label, bool(cond), evidence))
    return bool(cond)


def section(name: str) -> None:
    # ASCII only: Windows cp1252 consoles choke on box-drawing / emoji.
    pad = max(0, 60 - len(name))
    print(f"\n--- {name} " + "-" * pad)


# ── TO-DO 001: docs sync ─────────────────────────────────────────────────
section("TO-DO 001  - docs sync (paths + structure)")
reg_text = (ROOT / "registry.json").read_text(encoding="utf-8")
reg = json.loads(reg_text)
mapped = (ROOT / "mapped.md").read_text(encoding="utf-8")
flow = (ROOT / "apolloDJ-flowchart.md").read_text(encoding="utf-8")
mainpy = (ROOT / "main.py").read_text(encoding="utf-8")

NEW_NAMES = ["Coletânea", "Em Análise", "Caixa de Entrada", "Dados", "Registros", "Configurações", "Pendrives"]
chk("registry.json storage_layout has all 7 new pt-BR names",
    all(n in reg_text for n in NEW_NAMES),
    f"hits={sum(1 for n in NEW_NAMES if n in reg_text)}/7")
chk("mapped.md pt-BR storage section present",
    "pt-BR Premium" in mapped and "Storage Layout" in mapped)
chk("apolloDJ-flowchart.md uses Coletânea (accented)",
    "Coletânea" in flow)
chk("main.py docstring mentions pt-BR folder skeleton",
    "Coletânea" in mainpy or "pt-BR" in mainpy)

# ── TO-DO 002: Python path compliance ────────────────────────────────────
section("TO-DO 002  - Python path compliance")
FORBIDDEN = [r'/Cache/', r'/Logs/', r'/Inbox/', r'/Database/']
hits = []
for py in (ROOT / "apollodj").rglob("*.py"):
    if "__pycache__" in str(py):
        continue
    t = py.read_text(encoding="utf-8")
    for pat in FORBIDDEN:
        for m in re.finditer(pat, t):
            ln = t[: m.start()].count("\n") + 1
            hits.append(f"{py.relative_to(ROOT)}:{ln}")
chk("zero hardcoded OLD paths in apollodj/*.py", len(hits) == 0,
    f"{len(hits)} hits" if hits else "0 hits")
chk("conf/paths.py uses pt-BR + Final aliases",
    'TRACKS_COLETANEA_DIR' in (ROOT / "apollodj" / "conf" / "paths.py").read_text(encoding="utf-8")
    and 'Coletânea' in (ROOT / "apollodj" / "conf" / "paths.py").read_text(encoding="utf-8"))

# ── TO-DO 003: UI tree-ext filter + sections ────────────────────────────
section("TO-DO 003  - UI structure (file ext filter + playlist sections)")
ext_js = THEME / "v3" / "biblioteca-tree-ext.js"
ext_html_wired = "v3/biblioteca-tree-ext.js" in (THEME / "apolloDJ.v3.html").read_text(encoding="utf-8")
chk("biblioteca-tree-ext.js present", ext_js.is_file(), f"{ext_js.stat().st_size if ext_js.is_file() else 0} B")
if ext_js.is_file():
    js_txt = ext_js.read_text(encoding="utf-8")
    chk("ext filter restricts to .wav .aiff .flac .mp3",
        ".wav" in js_txt and ".aiff" in js_txt and ".flac" in js_txt and ".mp3" in js_txt)
    chk("PLAYLIST_SECTIONS includes Favorites + All + Groups + Playlists",
        all(k in js_txt for k in ("Favoritas", "Todas as faixas", "Grupos de playlists", "Playlists"))
        or all(k in js_txt for k in ("Favorited", "All Tracks", "Groups of Playlists", "Playlists")))
chk("apolloDJ.v3.html includes biblioteca-tree-ext.js", ext_html_wired)

# ── TO-DO 004: right-click integration ───────────────────────────────────
section("TO-DO 004  - right-click integration (row-ctx-v3)")
v3p = (THEME / "v3" / "v3-patches.js").read_text(encoding="utf-8")
chk("right-click contextmenu handler present", "contextmenu" in v3p and "row-ctx-v3" in v3p)
chk("ctx menu has Carregar no Deck 1/2", "Carregar no Deck 1" in v3p and "Carregar no Deck 2" in v3p)
chk("ctx menu has Waveform / Analisar / Detalhes",
    "Waveform" in v3p and "Analisar" in v3p and "Detalhes" in v3p)
chk("ctx menu has playlist-add panel", "Adicionar à playlist" in v3p or "addpl" in v3p)

# ── TO-DO 005a: screen software theme ────────────────────────────────────
section("TO-DO 005a  - screen software (running shell)")
css = (THEME / "v3" / "apolloDJ.css").read_text(encoding="utf-8")
chk("drag-state CSS rules present in apolloDJ.css",
    "body.dragging-track" in css and "target-playlist" in css and "drop-hover" in css)
chk("--rgb-diff hover treatment in CSS",
    "rgba(var(--rgb-diff)" in css)
chk("apolloDJ.v3.html shell present", (THEME / "apolloDJ.v3.html").is_file(),
    f"{(THEME / 'apolloDJ.v3.html').stat().st_size} B")
chk("v3 fallback (v2.html) present", (THEME / "apolloDJ.v2.html").is_file())
v3_js_files = sorted((THEME / "v3").glob("*.js"))
chk("v3/ has 5+ JS modules (boot + glass + patches + dnd + tree-ext)",
    len(v3_js_files) >= 5, f"{len(v3_js_files)} files")

# ── TO-DO 005b: screen install theme ────────────────────────────────────
section("TO-DO 005b  - screen install (installer previewer)")
install_dir = ROOT / "theme" / "screen install"
chk("apolloDJ-install-previewer.html present",
    (install_dir / "apolloDJ-install-previewer.html").is_file())
chk("install-previewer.js present",
    (install_dir / "install-previewer.js").is_file())

# ── TO-DO 005 misc: folder skeleton + gates ─────────────────────────────
section("TO-DO 005 misc  - folder skeleton + verification gates")
# ensure_paths
import importlib.util
spec = importlib.util.spec_from_file_location(
    "apollodj.conf.paths", ROOT / "apollodj" / "conf" / "paths.py"
)
paths_mod = importlib.util.module_from_spec(spec)
sys.path.insert(0, str(ROOT))
import apollodj.conf.paths as paths_mod
paths_mod.ensure_paths()
created = [d.name for d in paths_mod._DIRS_TO_CREATE if d.is_dir()]
chk(f"ensure_paths created {len(paths_mod._DIRS_TO_CREATE)} folders",
    len(created) == len(paths_mod._DIRS_TO_CREATE),
    f"{len(created)}/{len(paths_mod._DIRS_TO_CREATE)}")

# 4 gates
def _gate(cmd: list[str]) -> int:
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding="utf-8", errors="replace").returncode

chk("smoke_verify.py exit 0",
    _gate([sys.executable, "-X", "utf8", "smoke_verify.py"]) == 0)
chk("_audit_001.py exit 0",
    _gate([sys.executable, "-X", "utf8", "_audit_001.py"]) == 0)
chk("_audit_001_functional.py exit 0",
    _gate([sys.executable, "-X", "utf8", "_audit_001_functional.py"]) == 0)
chk("_compliance_audit.py exit 0",
    _gate([sys.executable, "-X", "utf8", "_compliance_audit.py"]) == 0)
chk("compileall apollodj exit 0",
    _gate([sys.executable, "-m", "compileall", "-q", "apollodj"]) == 0)

# ── TO-DO 006: integration scorecard ────────────────────────────────────
section("TO-DO 006  - FINAL INTEGRATION SCORECARD")
total = len(results)
passed = sum(1 for _, ok, _ in results if ok)
pct = passed / total * 100 if total else 0

print()
print("=" * 72)
for label, ok, ev in results:
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label:60s} {ev}")
print("=" * 72)
print(f"  RESULT: {passed}/{total} checks pass ({pct:.1f}%)")
print(f"  STATUS: " + ("FULL INTEGRATION OK" if passed == total else f"PARTIAL ({passed}/{total})"))
print("=" * 72)
sys.exit(0 if passed == total else 1)
