"""TDD — Phase 2.2: usb_exporter pulls its track list from the Master XML heart.

`export_to_usb` now resolves its track list from `master_xml.library_tracks_for_export()`
when that playlist is present in the heart (best-effort, logged), falling back to the
caller-supplied list otherwise — same safe pattern as the pipeline mirror.

Run from src_002:  python _test_export_source.py
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import apollodj.ingest.usb_exporter as ux  # noqa: E402
import apollodj.ingest.master_xml as mx  # noqa: E402


def _patch_reader(fn):
    orig = mx.library_tracks_for_export
    mx.library_tracks_for_export = fn  # type: ignore[assignment]
    return orig


def test_resolve_prefers_master_xml_when_playlist_present():
    orig = _patch_reader(lambda store=None: [("/m/a.mp3", ["Set"]), ("/m/b.mp3", ["Other"])])
    try:
        tracks, src = ux._resolve_export_tracks("Set", [Path("/caller/x.mp3")])
        assert src == "master_xml"
        assert [p.name for p in tracks] == ["a.mp3"]
    finally:
        mx.library_tracks_for_export = orig  # type: ignore[assignment]


def test_resolve_falls_back_to_caller_when_playlist_absent():
    orig = _patch_reader(lambda store=None: [("/m/a.mp3", ["Other"])])
    try:
        tracks, src = ux._resolve_export_tracks("Set", [Path("/caller/x.mp3")])
        assert src == "caller"
        assert [p.name for p in tracks] == ["x.mp3"]
    finally:
        mx.library_tracks_for_export = orig  # type: ignore[assignment]


def test_resolve_best_effort_when_master_raises():
    def boom(store=None):
        raise RuntimeError("master xml unavailable")
    orig = _patch_reader(boom)
    try:
        tracks, src = ux._resolve_export_tracks("Set", [Path("/caller/x.mp3")])
        assert src == "caller"
        assert [p.name for p in tracks] == ["x.mp3"]
    finally:
        mx.library_tracks_for_export = orig  # type: ignore[assignment]


def test_resolve_empty_when_both_empty():
    orig = _patch_reader(lambda store=None: [])
    try:
        tracks, src = ux._resolve_export_tracks("Set", [])
        assert tracks == []
        assert src == "caller"
    finally:
        mx.library_tracks_for_export = orig  # type: ignore[assignment]


def test_export_to_usb_reports_track_source_from_master():
    # Hermetic: stub the f3 guard + health gate + unified-xml writer; assert the
    # export sources its tracks from the master XML and copies them.
    with tempfile.TemporaryDirectory() as d:
        usb_root = Path(d) / "USB"
        music = Path(d) / "music"
        music.mkdir()
        a = music / "a.mp3"; a.write_bytes(b"\x00")
        saved = {
            "_f3_export_guard": ux._f3_export_guard,
            "usb_health_check": ux.usb_health_check,
            "generate_unified_playlist_xml": ux.generate_unified_playlist_xml,
            "reader": mx.library_tracks_for_export,
        }
        ux._f3_export_guard = lambda root, **k: {"allow": True}  # type: ignore
        ux.usb_health_check = lambda root, **k: {"healthy": True, "verdict": "ok"}  # type: ignore
        ux.generate_unified_playlist_xml = lambda name, tl: Path(d) / "stub.xml"  # type: ignore
        (Path(d) / "stub.xml").write_text("<x/>", encoding="utf-8")
        mx.library_tracks_for_export = lambda store=None: [(str(a), ["Set"])]  # type: ignore
        try:
            res = ux.export_to_usb("Set", [Path("/caller/ignored.mp3")], usb_root)
            assert res["success"] is True
            assert res["track_source"] == "master_xml"
            assert any("a.mp3" in c for c in res["tracks_copied"])
        finally:
            ux._f3_export_guard = saved["_f3_export_guard"]  # type: ignore
            ux.usb_health_check = saved["usb_health_check"]  # type: ignore
            ux.generate_unified_playlist_xml = saved["generate_unified_playlist_xml"]  # type: ignore
            mx.library_tracks_for_export = saved["reader"]  # type: ignore


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {fn.__name__}: {type(exc).__name__}: {exc}")
    if failed:
        print(f"\n{failed}/{len(fns)} FAILED")
        sys.exit(1)
    print(f"\nOK — {len(fns)} tests passed")
