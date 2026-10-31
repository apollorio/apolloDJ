"""Standalone smoke test for apollodj.ingest.library (no pytest needed).
Run from src_002:  python _test_library.py   → exit 0 = pass, raises on failure.
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from apollodj.ingest import library  # noqa: E402


def test_scan_folder_finds_audio_recursively_and_ignores_other():
    with tempfile.TemporaryDirectory() as d:
        base = Path(d)
        (base / "a.mp3").write_bytes(b"\x00")
        (base / "b.flac").write_bytes(b"\x00")
        (base / "c.txt").write_text("nope")
        sub = base / "sub"
        sub.mkdir()
        (sub / "deep.wav").write_bytes(b"\x00")
        res = library.scan_folder(str(base))
        assert res["ok"] is True, res
        names = sorted(t["name"] for t in res["tracks"])
        assert names == ["a.mp3", "b.flac", "deep.wav"], names
        for t in res["tracks"]:
            assert t["analyzed"] is False
            assert t["bpm"] is None
            assert t["path"]


def test_scan_folder_missing_dir_returns_not_ok():
    res = library.scan_folder(str(Path(tempfile.gettempdir()) / "nope_apollo_xyz_123"))
    assert res["ok"] is False
    assert res["tracks"] == []


def test_list_library_reads_sidecar_analysis():
    with tempfile.TemporaryDirectory() as d:
        col = Path(d)
        track = col / "Artist - Title - 128 - 8A.flac"
        track.write_bytes(b"\x00")
        sc = track.with_suffix(track.suffix + ".apollodj.json")
        sc.write_text(
            json.dumps({"version": "1.0", "track": track.name,
                        "analysis": {"bpm": 128, "key": "8A", "energy": 7}}),
            encoding="utf-8",
        )
        res = library.list_library(coletanea_dir=col)
        assert res["ok"] is True and len(res["tracks"]) == 1, res
        t = res["tracks"][0]
        assert t["analyzed"] is True
        assert t["bpm"] == 128 and t["key"] == "8A" and t["energy"] == 7


def test_report_stats_counts_library():
    with tempfile.TemporaryDirectory() as d:
        col = Path(d)
        (col / "x.flac").write_bytes(b"\x00")
        (col / "y.mp3").write_bytes(b"\x00")
        res = library.report_stats(module="geral", coletanea_dir=col)
        assert res["ok"] is True
        lib_row = next(r for r in res["rows"] if r["k"] == "Faixas na biblioteca")
        assert lib_row["v"] == 2, res


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"PASS {fn.__name__}")
    print(f"\nOK — {len(fns)} tests passed")
