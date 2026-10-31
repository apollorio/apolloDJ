"""TDD — Phase 2 master_xml live integration API.

The pipeline (pipeline_v2 stage 10 + dedup-HIT) mirrors every committed track
into the master XML SSOT so it becomes the Rekordbox export source. These tests
cover the thin module-level integration API that the pipeline calls best-effort:

  · default_store()             → ApolloXMLStore at the canonical library path
  · record_committed_track(...) → import a committed track (+ optional playlist),
                                  idempotent, returns TrackID or None on failure
  · library_tracks_for_export() → [(path, [playlists])] for usb_exporter / rekordbox

Run from src_002:  python _test_master_xml_integration.py
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from apollodj.ingest import master_xml as mx  # noqa: E402


def test_default_store_uses_canonical_library_path():
    from apollodj.conf.paths import APOLLO_LIBRARY_XML
    store = mx.default_store()
    assert isinstance(store, mx.ApolloXMLStore)
    assert store.xml_path == Path(APOLLO_LIBRARY_XML).resolve()


def test_record_committed_track_imports_and_attaches_playlist():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "Artist - Title - 128 - 8A.mp3"
        track.write_bytes(b"\x00")
        tid = mx.record_committed_track(track, playlist="Set 2026",
                                        title="Title", artist="Artist", store=store)
        assert tid == mx.stable_track_id(track)
        assert store.get_playlist_track_ids("Set 2026") == [tid]


def test_record_committed_track_idempotent_no_dupe():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "a.mp3"
        track.write_bytes(b"\x00")
        mx.record_committed_track(track, playlist="Set", store=store)
        mx.record_committed_track(track, playlist="Set", store=store)  # again
        from xml.etree import ElementTree as ET
        root = ET.parse(str(xml)).getroot()
        assert len(root.find("COLLECTION").findall("TRACK")) == 1
        assert store.get_playlist_track_ids("Set") == [mx.stable_track_id(track)]


def test_record_committed_track_no_playlist_just_collection():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "a.mp3"
        track.write_bytes(b"\x00")
        tid = mx.record_committed_track(track, store=store)
        from xml.etree import ElementTree as ET
        root = ET.parse(str(xml)).getroot()
        assert root.find(f'COLLECTION/TRACK[@TrackID="{tid}"]') is not None


def test_record_committed_track_best_effort_never_raises():
    # A bad/blank path must not raise — the pipeline must never fail on mirror.
    assert mx.record_committed_track("", playlist="X") is None
    assert mx.record_committed_track(None) is None  # type: ignore[arg-type]


def test_library_tracks_for_export_returns_paths_and_playlists():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        t1 = Path(d) / "one.mp3"; t1.write_bytes(b"\x00")
        t2 = Path(d) / "two.mp3"; t2.write_bytes(b"\x00")
        mx.record_committed_track(t1, playlist="Set A", store=store)
        mx.record_committed_track(t2, playlist="Set A", store=store)
        mx.record_committed_track(t1, playlist="Set B", store=store)  # t1 in two lists, one copy
        rows = mx.library_tracks_for_export(store=store)
        by_path = {Path(p).name: set(pls) for p, pls in rows}
        assert by_path["one.mp3"] == {"Set A", "Set B"}
        assert by_path["two.mp3"] == {"Set A"}
        # one.mp3 referenced by two playlists but appears exactly once (no dupe)
        assert sum(1 for p, _ in rows if Path(p).name == "one.mp3") == 1


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
