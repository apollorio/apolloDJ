"""End-to-end ingest run for the apollo-test folder, mirroring the
drag-to-playlist flow (watcher.process_file = non-destructive copy → dj_prep_pro
→ pipeline.run(commit=True) → Coletânea/Duvidosos + sidecar). Then creates the
"00 To Test" playlist in preferences.json (plan playlist_store schema).

Run:  python _run_apollo_test.py
Writes incremental progress to _apollo_test_report.json so it can be polled.
"""
import json
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

# Background/non-TTY stdout on Windows is cp1252 and chokes on "→"/"â".
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

from apollodj.conf.paths import TRACKS_COLETANEA_DIR, ensure_paths  # noqa: E402
from apollodj.conf.preferences import load_preferences, save_preferences  # noqa: E402
from apollodj.ingest import library, sidecar, watcher  # noqa: E402

FOLDER = Path(r"C:\Users\User\AppData\Roaming\nicotine\downloads\apollo-test")
REPORT = Path(__file__).resolve().parent / "_apollo_test_report.json"
PLAYLIST_NAME = "00 To Test"


def _in_coletanea(p: Path) -> bool:
    col = TRACKS_COLETANEA_DIR.resolve()
    rp = p.resolve()
    return rp.parent == col or col in rp.parents


def _write_report(payload: dict) -> None:
    REPORT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    ensure_paths()
    scan = library.scan_folder(str(FOLDER))
    files = [Path(t["path"]) for t in scan["tracks"]]
    files.sort(key=lambda f: f.name.lower())
    # Optional subset: pass basenames (or substrings) as argv to limit the run.
    subset = sys.argv[1:]
    if subset:
        files = [f for f in files if any(s.lower() in f.name.lower() for s in subset)]
    total = len(files)
    print(f"=== apollo-test run: {total} files → Coletânea ===", flush=True)

    results: list[dict] = []
    coletanea_paths: list[str] = []
    t0 = time.time()

    for i, f in enumerate(files, 1):
        rec = {"index": i, "source": str(f), "name": f.name}
        st = time.time()
        print(f"\n[{i}/{total}] {f.name}", flush=True)
        try:
            def prog(msg):
                print(f"   · {msg}", flush=True)

            routed = watcher.process_file(f, on_progress=prog)
            dt = round(time.time() - st, 1)
            if routed:
                routed = Path(routed)
                in_col = _in_coletanea(routed)
                sc = sidecar.read(routed) or {}
                an = (sc.get("analysis") if isinstance(sc, dict) else {}) or {}
                rec.update({
                    "ok": True,
                    "routed": str(routed),
                    "final_name": routed.name,
                    "in_coletanea": in_col,
                    "seconds": dt,
                    "bpm": an.get("bpm"),
                    "key": an.get("key") or an.get("camelot"),
                })
                print(f"   -> {'COLETANEA' if in_col else 'DUVIDOSOS'}: {routed.name}  ({dt}s)", flush=True)
                if in_col:
                    coletanea_paths.append(str(routed))
            else:
                rec.update({"ok": False, "routed": None, "in_coletanea": False,
                            "seconds": dt, "error": "no_routed_path"})
                print(f"   -> FAIL (no routed path)  ({dt}s)", flush=True)
        except Exception as exc:
            rec.update({"ok": False, "in_coletanea": False,
                        "seconds": round(time.time() - st, 1),
                        "error": repr(exc), "traceback": traceback.format_exc()})
            print(f"   -> ERROR: {exc}", flush=True)
        results.append(rec)
        _write_report({"done": i, "total": total, "results": results})

    # ── Create/Update playlist "00 To Test" (plan playlist_store schema) ──
    prefs = load_preferences()
    store = prefs.get("playlist_store") or {}
    groups = store.get("groups") or []
    playlists = store.get("playlists") or []
    favorites = store.get("favorites") or []
    pl = next((p for p in playlists if p.get("name") == PLAYLIST_NAME), None)
    if pl is None:
        pl = {"id": "p_00totest", "name": PLAYLIST_NAME, "group": None, "tracks": []}
        playlists.append(pl)
    seen = set(pl.get("tracks") or [])
    for p in coletanea_paths:
        if p not in seen:
            pl.setdefault("tracks", []).append(p)
            seen.add(p)
    prefs["playlist_store"] = {"groups": groups, "playlists": playlists, "favorites": favorites}
    save_preferences(prefs)

    total_dt = round(time.time() - t0, 1)
    passed = sum(1 for r in results if r.get("in_coletanea"))
    duv = sum(1 for r in results if r.get("ok") and not r.get("in_coletanea"))
    err = sum(1 for r in results if not r.get("ok"))
    print("\n================ SUMMARY ================", flush=True)
    print(f"total {total} | Coletanea(PASS) {passed} | Duvidosos {duv} | erro {err} | {total_dt}s", flush=True)
    print(f"playlist '{PLAYLIST_NAME}' tracks: {len(pl.get('tracks', []))}", flush=True)
    print(f"report: {REPORT}", flush=True)
    _write_report({
        "done": total, "total": total,
        "summary": {"passed": passed, "duvidosos": duv, "erro": err,
                    "seconds": total_dt, "playlist": PLAYLIST_NAME,
                    "playlist_tracks": len(pl.get("tracks", []))},
        "results": results,
    })


if __name__ == "__main__":
    main()
