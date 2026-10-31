"""TDD tests for apollodj.ingest.master_xml — Apollo Master XML SSOT "heart".

Faithful to apollo_xml_pro_lock.py reference flow, stdlib-only (no lxml/filelock
hard dep): cross-process exclusive lock + atomic write + Rekordbox DJ_PLAYLISTS
skeleton + TrackID dedup on drag-to-playlist (no track duplication ever).

Run from src_002:  python _test_master_xml.py
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))

from apollodj.ingest import master_xml as mx  # noqa: E402


def test_stable_track_id_is_deterministic_16char_upper():
    a = mx.stable_track_id("/music/dj/track 01.mp3")
    b = mx.stable_track_id("/music/dj/track 01.mp3")
    c = mx.stable_track_id("/music/dj/other.mp3")
    assert a == b
    assert a != c
    assert len(a) == 16 and a == a.upper()


def test_locked_apollo_xml_creates_rekordbox_skeleton():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "apollo_library.xml"
        with mx.locked_apollo_xml(xml) as (root, tree):
            assert root.tag == "DJ_PLAYLISTS"
            assert root.find("COLLECTION") is not None
            assert root.find("PLAYLISTS") is not None
        assert xml.exists()
        # lock released → file re-parseable
        root2 = ET.parse(str(xml)).getroot()
        assert root2.tag == "DJ_PLAYLISTS"


def test_ensure_track_in_collection_idempotent():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "a.mp3"
        track.write_bytes(b"\x00")
        tid1 = store.ensure_track_in_collection(track, title="Drop", artist="DJ X")
        tid2 = store.ensure_track_in_collection(track, title="Drop", artist="DJ X")
        assert tid1 == tid2
        root = ET.parse(str(xml)).getroot()
        coll = root.find("COLLECTION")
        tracks = coll.findall("TRACK")
        assert len(tracks) == 1, "track imported exactly once"
        assert coll.get("Entries") == "1"


def test_add_track_to_playlist_dedup_returns_false_on_second():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "a.mp3"
        track.write_bytes(b"\x00")
        tid = store.ensure_track_in_collection(track)
        first = store.add_track_to_playlist(tid, "Set 2026")
        second = store.add_track_to_playlist(tid, "Set 2026")
        assert first is True
        assert second is False, "the heart: no dupe ever"
        ids = store.get_playlist_track_ids("Set 2026")
        assert ids == [tid]


def test_playlist_entry_is_reference_only_no_metadata_copy():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "a.mp3"
        track.write_bytes(b"\x00")
        tid = store.ensure_track_in_collection(track, title="Drop", artist="DJ X")
        store.add_track_to_playlist(tid, "Set")
        root = ET.parse(str(xml)).getroot()
        pl_track = root.find('.//PLAYLIST[@Name="Set"]/TRACK')
        assert pl_track is not None
        # Reference must carry ONLY the id key — never copied metadata.
        assert pl_track.get("Name") in (None, "")
        assert pl_track.get("Artist") in (None, "")
        assert pl_track.get("TrackID") == tid or pl_track.get("Key") == tid


def test_remove_track_from_playlist():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "a.mp3"
        track.write_bytes(b"\x00")
        tid = store.ensure_track_in_collection(track)
        store.add_track_to_playlist(tid, "Set")
        assert store.remove_track_from_playlist(tid, "Set") is True
        assert store.get_playlist_track_ids("Set") == []
        assert store.remove_track_from_playlist(tid, "Set") is False


def test_export_to_rekordbox_writes_dj_playlists():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "a.mp3"
        track.write_bytes(b"\x00")
        tid = store.ensure_track_in_collection(track, title="Drop")
        store.add_track_to_playlist(tid, "Set")
        out = store.export_to_rekordbox(Path(d) / "rb.xml")
        assert out.exists()
        root = ET.parse(str(out)).getroot()
        assert root.tag == "DJ_PLAYLISTS"
        assert root.find("COLLECTION") is not None


def test_add_path_to_playlist_live_bridge_dedup():
    # Phase 1 — one-call live bridge: import + add, dedup-protected boolean.
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "a.mp3"
        track.write_bytes(b"\x00")
        first = store.add_path_to_playlist(str(track), "Main Set")
        second = store.add_path_to_playlist(str(track), "Main Set")
        assert first is True
        assert second is False, "dedup protected"
        # track imported to collection exactly once + referenced in playlist
        tid = mx.stable_track_id(track)
        assert store.get_playlist_track_ids("Main Set") == [tid]
        root = ET.parse(str(xml)).getroot()
        assert len(root.find("COLLECTION").findall("TRACK")) == 1


def test_add_path_to_playlist_defaults_to_default_apollo():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "b.mp3"
        track.write_bytes(b"\x00")
        assert store.add_path_to_playlist(str(track)) is True
        tid = mx.stable_track_id(track)
        assert store.get_playlist_track_ids("Default Apollo") == [tid]


def test_export_rekordbox_uses_node_structure_and_track_key_refs():
    # Phase 3 — real Rekordbox structure: <PLAYLISTS><NODE Type=0 ROOT><NODE Type=1>
    # with playlist refs as <TRACK Key="TrackID"/> (Pioneer/CDJ-importable).
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "a.mp3"
        track.write_bytes(b"\x00")
        tid = store.ensure_track_in_collection(track, title="Drop", artist="DJ X")
        store.add_track_to_playlist(tid, "Set")
        out = store.export_to_rekordbox(Path(d) / "rb.xml")
        root = ET.parse(str(out)).getroot()

        assert root.tag == "DJ_PLAYLISTS"
        assert root.find("PRODUCT").get("Name") == "rekordbox"
        # ROOT folder node (Type 0) → playlist node (Type 1)
        root_node = root.find('PLAYLISTS/NODE[@Name="ROOT"]')
        assert root_node is not None and root_node.get("Type") == "0"
        pl_node = root_node.find('NODE[@Name="Set"]')
        assert pl_node is not None and pl_node.get("Type") == "1"
        # playlist refs use Key=, not TrackID=
        refs = pl_node.findall("TRACK")
        assert len(refs) == 1
        assert refs[0].get("Key") == tid
        assert refs[0].get("TrackID") is None


def test_export_rekordbox_collection_location_is_file_localhost_url():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "my track.mp3"  # space → must be URL-encoded
        track.write_bytes(b"\x00")
        tid = store.ensure_track_in_collection(track)
        out = store.export_to_rekordbox(Path(d) / "rb.xml")
        root = ET.parse(str(out)).getroot()
        ct = root.find(f'COLLECTION/TRACK[@TrackID="{tid}"]')
        assert ct is not None
        loc = ct.get("Location")
        assert loc.startswith("file://localhost/"), loc
        assert "%20" in loc, "space must be percent-encoded for Rekordbox"


def test_export_does_not_mutate_internal_master_format():
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        store = mx.ApolloXMLStore(xml)
        track = Path(d) / "a.mp3"
        track.write_bytes(b"\x00")
        tid = store.ensure_track_in_collection(track)
        store.add_track_to_playlist(tid, "Set")
        before = xml.read_text(encoding="utf-8")
        store.export_to_rekordbox(Path(d) / "rb.xml")
        after = xml.read_text(encoding="utf-8")
        # internal master keeps its native <PLAYLIST> form, untouched by export
        assert "<PLAYLIST" in after
        assert before == after


def test_serato_and_traktor_extension_points_present():
    store = mx.ApolloXMLStore("x.xml")
    assert hasattr(store, "export_to_serato_crate")
    assert hasattr(store, "export_to_traktor_nml")
    # documented hooks — explicitly not implemented yet
    try:
        store.export_to_serato_crate()
        assert False, "should signal not-implemented"
    except NotImplementedError:
        pass
    try:
        store.export_to_traktor_nml()
        assert False, "should signal not-implemented"
    except NotImplementedError:
        pass


def test_cross_process_lock_released_after_context():
    # Two sequential locked sessions must both succeed (lock file cleaned up).
    with tempfile.TemporaryDirectory() as d:
        xml = Path(d) / "lib.xml"
        with mx.locked_apollo_xml(xml) as (root, _t):
            root.find("COLLECTION").set("Entries", "0")
        with mx.locked_apollo_xml(xml) as (root, _t):
            assert root.find("COLLECTION") is not None  # second acquire works


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
