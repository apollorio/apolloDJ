"""STRICT COMPLIANCE AUDIT - verify prior-prompt requirements TRUE/FALSE."""
from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

if sys.platform == "win32":
    for _stream in (sys.stdout, sys.stderr):
        if _stream is not None:
            try:
                _stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass

reg = json.loads((ROOT / "registry.json").read_text(encoding="utf-8"))
mapped = (ROOT / "mapped.md").read_text(encoding="utf-8")
flowchart = (ROOT / "apolloDJ-flowchart.md").read_text(encoding="utf-8")
spec = (ROOT / "apolloDJ.spec").read_text(encoding="utf-8")
main_src = (ROOT / "main.py").read_text(encoding="utf-8")

results: list[bool] = []


def chk(label: str, cond: bool, evidence: str = "") -> bool:
    mark = "TRUE " if cond else "FALSE"
    print(f"  [{mark}] {label:60s} {evidence}")
    results.append(bool(cond))
    return bool(cond)


def section(title: str) -> None:
    pad = max(0, 60 - len(title))
    print(f"\n--- {title} " + "-" * pad)


print("=" * 72)
print(" STRICT COMPLIANCE AUDIT - prior-prompt requirements")
print("=" * 72)

section("TO DO 000 - recovery")
chk("backup folder src_002.bak exists (optional snapshot)", (ROOT.parent / "src_002.bak").is_dir())
reg_sz = (ROOT / "registry.json").stat().st_size
chk("registry.json size > 14 KB (full structure)", reg_sz > 14_000, f"{reg_sz} B")
chk("registry.json has NO UTF-8 BOM",
    (ROOT / "registry.json").read_bytes()[:3] != b"\xef\xbb\xbf")
map_sz = (ROOT / "mapped.md").stat().st_size
chk("mapped.md size > 30 KB (full)", map_sz > 30_000, f"{map_sz} B")
_rthook_path = ROOT / "rthooks" / "pyi_rth_apollodj_stdio.py"
_rthook_src = _rthook_path.read_text(encoding="utf-8") if _rthook_path.is_file() else ""
chk(
    "PyInstaller-safe stdio guard (canonical rthook, windowed exe)",
    "getattr(sys, _n, None) is None" in _rthook_src
    and "pyi_rth_apollodj_stdio" in spec
    and "runtime_hooks" in spec,
)
chk("audit check [15] BOM/encoding guard present",
    "15] FILE-ENCODING GUARD" in (ROOT / "_audit_001.py").read_text(encoding="utf-8"))

section("TO DO 02 - UNIVERSAL EXPORT WIRING")
chk("apolloDJ-flowchart.md has PIPE_V2 subgraph", "PIPE_V2" in flowchart)
chk("apolloDJ-flowchart.md has EXPORT subgraph",
    "EXPORT" in flowchart and "UNIVERSAL EXPORT PRO" in flowchart)
chk("flowchart EXPORT lists parsers/ + exporters/ + sidecar",
    all(t in flowchart for t in ("parsers/", "exporters/", "sidecar")))
chk("mapped.md mentions parsers/ + exporters/ + Universal Export",
    "parsers/" in mapped and "exporters/" in mapped and "Universal Export" in mapped)
chk("mapped.md has Pipeline v2 canonical section",
    "Pipeline v2" in mapped and "fingerprint-first" in mapped.lower())
chk("registry.modules.parsers exists",
    isinstance(reg["modules"].get("parsers"), list) and len(reg["modules"]["parsers"]) > 0)
chk("registry.modules.exporters exists",
    isinstance(reg["modules"].get("exporters"), list) and len(reg["modules"]["exporters"]) > 0)
chk("registry.stages.07_universal_export present",
    "07_universal_export" in reg["pipeline_orchestrator"]["stages"])
stg07 = reg["pipeline_orchestrator"]["stages"].get("07_universal_export", [])
chk("  refs parsers.track_model", "parsers.track_model" in stg07)
chk("  refs exporters.rekordbox_xml", "exporters.rekordbox_xml" in stg07)
chk("  refs exporters.serato_crates", "exporters.serato_crates" in stg07)
chk("registry.podium.usb_export.1st = exporters.rekordbox_xml",
    "rekordbox_xml" in (reg["podium"]["features"].get("usb_export", {}) or {}).get("1st", ""))
chk("registry.stacks.G_universal_dj present", "G_universal_dj" in reg["stacks"])

section("PIPELINE v2 - 15-section architecture")
pv2 = (ROOT / "apollodj" / "ingest" / "pipeline_v2.py").read_text(encoding="utf-8")
qw = (ROOT / "apollodj" / "ingest" / "queue_worker.py").read_text(encoding="utf-8")
fp = (ROOT / "apollodj" / "ingest" / "fingerprint.py").read_text(encoding="utf-8")
xml_db = (ROOT / "apollodj" / "ingest" / "xml_db.py").read_text(encoding="utf-8")
qg = (ROOT / "apollodj" / "ingest" / "quality_gate.py").read_text(encoding="utf-8")
sm = (ROOT / "apollodj" / "ingest" / "state_machine.py").read_text(encoding="utf-8")

chk("S1  Drop -> stage first (Em analise)", "TRACKS_ANALISE_DIR" in pv2)
chk("S2  ImportQueue + ProcessPoolExecutor worker pool",
    "ImportQueue" in qw and "ProcessPoolExecutor" in qw)
chk("S3  UUID temp filename (tmp_<uuid>)", "uuid" in pv2.lower() and "tmp_" in pv2)
chk("S4  Fast validate via ffprobe", "ffprobe" in pv2 and "_fast_validate" in pv2)
chk("S5  Fingerprint FIRST (chromaprint)", "chromaprint" in fp.lower())
i_fp = pv2.find("fingerprint")
i_md = pv2.find("_read_metadata_quick")
chk("  fingerprint runs before metadata", i_fp >= 0 and i_md >= 0 and i_fp < i_md)
chk("S6  Playlist-first registry (attach_playlist)", "def attach_playlist" in xml_db)
chk("S7  Metadata-first (mutagen tags before DSP)", "mutagen" in pv2 and "_read_metadata_quick" in pv2)
chk("S8  Heavy analysis via ProcessPoolExecutor", "ProcessPoolExecutor" in qw)
chk("S9  State machine has all key events",
    all(s in sm for s in ("QUEUED", "ANALYZING", "READY", "REJECTED")))
chk("S10 Quality gate weighted (10/25/20/25/20, threshold 80)",
    all(w in qg for w in ("duration", "clipping", "bitrate", "analysis_confidence", "corruption"))
    and "80" in qg and "THRESHOLD" in qg)
i_qual = pv2.find("07 quality")
i_ren = pv2.find("08 canonical rename")
chk("S11 Canonical rename AFTER quality gate", i_qual >= 0 and i_ren >= 0 and i_qual < i_ren)
chk("S12 Atomic commit via os.replace", "os.replace" in pv2)
i_atom = pv2.find("09 atomic commit")
i_xml = pv2.find("10 XML commit")
chk("S13 XML commit AFTER file commit (correct order)", i_atom >= 0 and i_xml >= 0 and i_atom < i_xml)
chk("S14 XML as DB: in-RAM cache + debounced save",
    "_db" in xml_db and "DEBOUNCE" in xml_db and "def flush" in xml_db)
perf_strings = ["ffprobe", "mutagen", "chromaprint", "os.replace"]
chk("S15 Perf stack listed in registry v2_flow",
    all(t in json.dumps(reg["pipeline_orchestrator"].get("v2_flow", {})) for t in perf_strings))

section("VERIFICATION GATES (fresh run)")


def _run(cmd: list[str]) -> int:
    return subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace"
    ).returncode


chk("python -m compileall apollodj -> exit 0",
    _run([sys.executable, "-m", "compileall", "-q", "apollodj"]) == 0)
chk("smoke_verify.py -> exit 0",
    _run([sys.executable, "-X", "utf8", "smoke_verify.py"]) == 0)
chk("_audit_001.py -> exit 0",
    _run([sys.executable, "-X", "utf8", "_audit_001.py"]) == 0)
chk("_audit_001_functional.py -> exit 0",
    _run([sys.executable, "-X", "utf8", "_audit_001_functional.py"]) == 0)

print()
total = len(results)
passed = sum(results)
pct = passed / total * 100 if total else 0
print("=" * 72)
print(f"  RESULT: {passed}/{total} compliance checks PASS ({pct:.1f}%)")
print(f"  COMPLIANCE: " + ("FULL OK" if passed == total else f"PARTIAL ({passed}/{total})"))
print("=" * 72)
sys.exit(0 if passed == total else 1)
