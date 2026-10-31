"""Apollo Master XML — the single-source-of-truth "heart" (Rekordbox-style).

One file pumps everything (web, desktop, Pioneer/CDJ export, playlists). Each
track is defined **once** in ``<COLLECTION>`` with a stable ``TrackID``; playlists
under ``<PLAYLISTS>`` hold **only references** (TrackID), never copied metadata —
so a track can live in any number of playlists with **zero duplication**.

Faithful to the ``apollo_xml_pro_lock.py`` reference flow, but **stdlib-only by
default** (priority C — lightweight): cross-process exclusive lock + crash-safe
atomic write via ``os.replace``. If the optional ``filelock`` package is present
it is used (more robust against stale locks); otherwise a portable
``O_CREAT|O_EXCL`` spin-lock is used — same guarantee, no hard dependency.

Drag-to-playlist contract (no dupe ever)::

    store = ApolloXMLStore(path)
    tid = store.ensure_track_in_collection(audio_path)   # import once → TrackID
    added = store.add_track_to_playlist(tid, "Main Set")  # True, or False if dupe

Concurrency: every mutation goes through :func:`locked_apollo_xml`, which holds an
exclusive lock for the whole read-modify-write so two Apollo instances (desktop +
WP exporter) never corrupt the master file.

Parser backend (priority C — lightweight, no hard deps):
  · Default runtime parser is the stdlib ``xml.etree.ElementTree``.
  · ``lxml`` is an **optional accelerator** — if installed it is used for the
    read path (faster C parser); otherwise stdlib is used. The write path always
    stays on stdlib ElementTree so serialization is identical regardless of deps.
  · Future fast-path for very large libraries: ``lxml.etree.iterparse`` can stream
    :meth:`ApolloXMLStore.get_playlist_track_ids` without building the whole tree
    (extension point marked in that method — not needed at current scale).
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional, Tuple
from urllib.parse import quote
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

# Optional lxml read accelerator (same opt-in pattern as filelock). The write
# path never uses it, so a missing lxml changes nothing about output format.
try:  # pragma: no cover - presence depends on the host environment
    from lxml import etree as _LXML  # type: ignore
    _HAVE_LXML = True
except Exception:  # noqa: BLE001
    _LXML = None
    _HAVE_LXML = False

LOCK_TIMEOUT_SEC = 8.0
XML_ENCODING = "UTF-8"
DEFAULT_PLAYLIST = "Default Apollo"

# Playlist refs carry the id under "TrackID" (apolloDJ-native); we also accept the
# Rekordbox "Key" attribute on read for interop with exported files.
_REF_ATTR = "TrackID"


def stable_track_id(file_path: str | Path) -> str:
    """Stable, collision-resistant TrackID from the absolute path (Rekordbox-style)."""
    p = str(Path(file_path).resolve())
    return hashlib.sha256(p.encode("utf-8")).hexdigest()[:16].upper()


def _parse_root(xml_path: Path):
    """Parse *xml_path* and return its root for READ-ONLY use.

    Uses the faster ``lxml`` C parser when available, else stdlib ElementTree.
    Both expose the same ``.get()/.find()/.findall()/.iter()`` surface used here,
    so callers are backend-agnostic. (Read-only: never feed this root back to the
    stdlib write path.)
    """
    if _HAVE_LXML:
        return _LXML.parse(str(xml_path)).getroot()
    return ET.parse(str(xml_path)).getroot()


# ── Cross-process exclusive lock ─────────────────────────────────────────────

class _ExclusiveLock:
    """Cross-process exclusive lock with two interchangeable strategies.

    Strategy 1 — ``filelock`` (preferred, when installed): a battle-tested
        cross-platform advisory lock that also handles stale-lock recovery and
        re-entrancy. Raises on timeout.
    Strategy 2 — stdlib ``O_CREAT|O_EXCL`` spin-lock (always available, zero
        deps): atomically creates the ``.lock`` file; if it already exists we
        spin (50 ms) until it frees up or *timeout* elapses, then raise
        ``TimeoutError``. The lock file is removed on release.

    Both give the same guarantee — only one Apollo process mutates the master
    XML at a time — so the optional dependency never changes behaviour, only
    robustness. ``timeout`` bounds the wait either way.
    """

    def __init__(self, lock_path: Path, timeout: float) -> None:
        self.lock_path = lock_path
        self.timeout = timeout
        self._fl = None          # filelock handle
        self._fd: Optional[int] = None  # stdlib O_EXCL fd

    def acquire(self) -> None:
        try:
            from filelock import FileLock, Timeout as _FLTimeout  # type: ignore

            self._fl = FileLock(str(self.lock_path), timeout=self.timeout)
            try:
                self._fl.acquire()
                return
            except _FLTimeout as exc:  # noqa: PERF203
                raise TimeoutError(
                    f"XML lock timeout ({self.timeout}s) — another Apollo instance is editing"
                ) from exc
        except ImportError:
            pass  # fall through to stdlib lock

        deadline = time.monotonic() + self.timeout
        self.lock_path.parent.mkdir(parents=True, exist_ok=True)
        while True:
            try:
                self._fd = os.open(str(self.lock_path), os.O_CREAT | os.O_EXCL | os.O_RDWR)
                return
            except FileExistsError:
                if time.monotonic() > deadline:
                    raise TimeoutError(
                        f"XML lock timeout ({self.timeout}s) — another Apollo instance is editing"
                    ) from None
                time.sleep(0.05)

    def release(self) -> None:
        if self._fl is not None:
            try:
                self._fl.release()
            except Exception:  # noqa: BLE001
                pass
            self._fl = None
            return
        if self._fd is not None:
            try:
                os.close(self._fd)
            except Exception:  # noqa: BLE001
                pass
            self._fd = None
        try:
            self.lock_path.unlink(missing_ok=True)
        except Exception:  # noqa: BLE001
            pass


def create_empty_rekordbox_xml() -> ET.ElementTree:
    """Minimal Rekordbox-compatible skeleton (DJ_PLAYLISTS/COLLECTION/PLAYLISTS)."""
    root = ET.Element("DJ_PLAYLISTS", Version="1.0.0")
    ET.SubElement(root, "PRODUCT", Name="Apollo.rio", Version="1.0", Company="apollo.rio.br")
    ET.SubElement(root, "COLLECTION", Entries="0")
    playlists = ET.SubElement(root, "PLAYLISTS")
    root_node = ET.SubElement(playlists, "NODE", Name="ROOT", Type="0", Count="0")
    ET.SubElement(root_node, "PLAYLIST", Name=DEFAULT_PLAYLIST, Type="1", KeyType="0", Entries="0")
    return ET.ElementTree(root)


def _atomic_write_tree(tree: ET.ElementTree, xml_path: Path) -> None:
    """Crash-safe atomic write (tmp in same dir → ``os.replace``)."""
    root = tree.getroot()
    try:
        ET.indent(tree, space="  ")  # py3.9+ pretty print
    except Exception:  # noqa: BLE001
        pass
    body = ET.tostring(root, encoding="unicode")
    text = f'<?xml version="1.0" encoding="{XML_ENCODING}"?>\n{body}\n'
    xml_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = xml_path.with_name(xml_path.name + f".{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, xml_path)  # atomic on Windows + POSIX


@contextmanager
def locked_apollo_xml(
    xml_path: str | Path, timeout: float = LOCK_TIMEOUT_SEC
) -> Iterator[Tuple[ET.Element, ET.ElementTree]]:
    """Exclusive lock + parse-or-create + atomic write-back.

    Usage::

        with locked_apollo_xml(path) as (root, tree):
            ...mutate root...
    """
    xml_path = Path(xml_path).resolve()
    lock = _ExclusiveLock(xml_path.with_suffix(xml_path.suffix + ".lock"), timeout)
    lock.acquire()
    try:
        if xml_path.exists():
            tree = ET.parse(str(xml_path))
        else:
            tree = create_empty_rekordbox_xml()
            xml_path.parent.mkdir(parents=True, exist_ok=True)
        root = tree.getroot()
        yield root, tree
        _atomic_write_tree(tree, xml_path)
        logger.debug("Master XML updated atomically: %s", xml_path)
    finally:
        lock.release()


# ── Rekordbox export builders (primary pro target — PIONEER/CDJ/XDJ) ─────────

_KIND_BY_EXT = {
    ".mp3": "MP3 File", ".wav": "WAV File", ".flac": "FLAC File",
    ".aif": "AIFF File", ".aiff": "AIFF File", ".m4a": "M4A File",
    ".aac": "AAC File", ".ogg": "OGG File",
}


def _kind_for(location_or_path: str) -> str:
    ext = Path(location_or_path.split("://")[-1]).suffix.lower()
    return _KIND_BY_EXT.get(ext, "MP3 File")


def _to_rekordbox_location(internal_loc: str) -> str:
    """Internal ``file://<abs path>`` → Rekordbox ``file://localhost/<url-encoded>``.

    Rekordbox stores Locations as ``file://localhost/`` URLs with forward slashes
    and percent-encoded special characters (spaces → ``%20``). The drive colon and
    path separators are kept readable for round-trip clarity.
    """
    path = internal_loc or ""
    for prefix in ("file://localhost/", "file://"):
        if path.startswith(prefix):
            path = path[len(prefix):]
            break
    path = path.replace("\\", "/").lstrip("/")
    return f"file://localhost/{quote(path, safe='/:')}"


def _build_rekordbox_tree(
    tracks: list[Tuple[str, dict]], playlists: list[Tuple[str, list[str]]]
) -> ET.ElementTree:
    """Build a clean, importable Rekordbox 6 DJ_PLAYLISTS tree.

    *tracks*    : ``[(track_id, internal_attrib_dict), ...]`` — each emitted once.
    *playlists* : ``[(name, [track_id, ...]), ...]`` — emitted as Rekordbox NODEs
                  with ``<TRACK Key="TrackID"/>`` references (no metadata copy).
    """
    root = ET.Element("DJ_PLAYLISTS", Version="1.0.0")
    ET.SubElement(root, "PRODUCT", Name="rekordbox", Version="6.0.0", Company="AlphaTheta")

    coll = ET.SubElement(root, "COLLECTION", Entries=str(len(tracks)))
    for tid, attrib in tracks:
        loc = attrib.get("Location", "")
        ET.SubElement(
            coll, "TRACK",
            TrackID=tid,
            Name=attrib.get("Name", ""),
            Artist=attrib.get("Artist", ""),
            Kind=_kind_for(loc or attrib.get("Name", "")),
            Size=str(attrib.get("Size", "0") or "0"),
            TotalTime=str(attrib.get("TotalTime", "0") or "0"),
            Location=_to_rekordbox_location(loc),
        )

    # Rekordbox playlist tree: a Type=0 "ROOT" folder NODE holding Type=1 playlist
    # NODEs; each playlist references collection tracks by Key (the TrackID).
    pls_container = ET.SubElement(root, "PLAYLISTS")
    root_node = ET.SubElement(pls_container, "NODE", Type="0", Name="ROOT", Count=str(len(playlists)))
    for name, ids in playlists:
        node = ET.SubElement(root_node, "NODE", Name=name, Type="1", KeyType="0", Entries=str(len(ids)))
        for tid in ids:
            ET.SubElement(node, "TRACK", Key=tid)
    return ET.ElementTree(root)


class ApolloXMLStore:
    """High-level API over the locked master XML. Use this everywhere in Apollo."""

    def __init__(self, xml_path: str | Path):
        self.xml_path = Path(xml_path).resolve()

    # ── element helpers ────────────────────────────────────────────────────
    def _get_collection(self, root: ET.Element) -> ET.Element:
        coll = root.find("COLLECTION")
        if coll is None:
            coll = ET.SubElement(root, "COLLECTION", Entries="0")
        return coll

    def _get_playlist(self, root: ET.Element, name: str) -> ET.Element:
        playlists = root.find("PLAYLISTS")
        if playlists is None:
            playlists = ET.SubElement(root, "PLAYLISTS")
        for node in playlists.iter("PLAYLIST"):
            if node.get("Name") == name:
                return node
        root_node = playlists.find('NODE[@Name="ROOT"]')
        parent = root_node if root_node is not None else playlists
        return ET.SubElement(parent, "PLAYLIST", Name=name, Type="1", KeyType="0", Entries="0")

    @staticmethod
    def _ref_id(track_el: ET.Element) -> Optional[str]:
        return track_el.get(_REF_ATTR) or track_el.get("Key")

    # ── collection (import once) ───────────────────────────────────────────
    def ensure_track_in_collection(
        self, file_path: str | Path, title: str = "", artist: str = ""
    ) -> str:
        """Import track if missing; return its stable TrackID. Idempotent."""
        track_id = stable_track_id(file_path)
        abs_path = str(Path(file_path).resolve())
        with locked_apollo_xml(self.xml_path) as (root, _tree):
            coll = self._get_collection(root)
            if coll.find(f'TRACK[@TrackID="{track_id}"]') is not None:
                return track_id
            try:
                size = Path(abs_path).stat().st_size if Path(abs_path).exists() else 0
            except OSError:
                size = 0
            ET.SubElement(
                coll, "TRACK",
                TrackID=track_id,
                Name=title or Path(abs_path).stem,
                Artist=artist,
                Location=f"file://{abs_path}",
                Size=str(size),
            )
            coll.set("Entries", str(int(coll.get("Entries", "0") or 0) + 1))
            logger.info("Track imported to COLLECTION: %s → %s", track_id, abs_path)
        return track_id

    # ── drag-to-playlist (no dupe ever) ────────────────────────────────────
    def add_track_to_playlist(self, track_id: str, playlist_name: str = DEFAULT_PLAYLIST) -> bool:
        """Append a TrackID reference. Returns False if already present (dedup)."""
        with locked_apollo_xml(self.xml_path) as (root, _tree):
            playlist = self._get_playlist(root, playlist_name)
            for t in playlist.findall("TRACK"):
                if self._ref_id(t) == track_id:
                    logger.debug("Duplicate prevented: %s already in '%s'", track_id, playlist_name)
                    return False
            ET.SubElement(playlist, "TRACK", **{_REF_ATTR: track_id})
            playlist.set("Entries", str(int(playlist.get("Entries", "0") or 0) + 1))
            logger.info("Track %s added to playlist '%s' (no dupe)", track_id, playlist_name)
            return True

    def add_path_to_playlist(self, file_path: str, playlist_name: str = DEFAULT_PLAYLIST) -> bool:
        """Live bridge. Returns True only if the track was newly added (dedup protected).

        One call does the full drag-to-playlist flow: import the audio into the
        COLLECTION once (idempotent), then append a reference to the playlist.
        """
        track_id = self.ensure_track_in_collection(file_path)
        return self.add_track_to_playlist(track_id, playlist_name)

    def remove_track_from_playlist(self, track_id: str, playlist_name: str = DEFAULT_PLAYLIST) -> bool:
        with locked_apollo_xml(self.xml_path) as (root, _tree):
            playlist = self._get_playlist(root, playlist_name)
            for t in list(playlist.findall("TRACK")):
                if self._ref_id(t) == track_id:
                    playlist.remove(t)
                    playlist.set("Entries", str(max(0, int(playlist.get("Entries", "1") or 1) - 1)))
                    return True
            return False

    def get_playlist_track_ids(self, playlist_name: str = DEFAULT_PLAYLIST) -> list[str]:
        """Fast read (eventual consistency acceptable for reads — no lock).

        Uses :func:`_parse_root` (lxml C parser when available, else stdlib).
        EXTENSION POINT: for libraries with 100k+ refs, swap this for
        ``lxml.etree.iterparse`` streaming so the whole tree is never built.
        """
        if not self.xml_path.exists():
            return []
        root = _parse_root(self.xml_path)
        playlists = root.find("PLAYLISTS")
        if playlists is None:
            return []
        for node in playlists.iter("PLAYLIST"):
            if node.get("Name") == playlist_name:
                return [rid for t in node.findall("TRACK") if (rid := self._ref_id(t))]
        return []

    def _snapshot(self) -> Tuple[list[Tuple[str, dict]], list[Tuple[str, list[str]]]]:
        """Consistent (collection, playlists) snapshot taken under the lock.

        Shared by every exporter so format writers never see a partial mid-write
        master. The internal master format is read only — never mutated.
        """
        with locked_apollo_xml(self.xml_path) as (root, _tree):
            coll = root.find("COLLECTION")
            tracks: list[Tuple[str, dict]] = []
            if coll is not None:
                for t in coll.findall("TRACK"):
                    tid = t.get("TrackID")
                    if tid:
                        tracks.append((tid, dict(t.attrib)))
            playlists: list[Tuple[str, list[str]]] = []
            pls = root.find("PLAYLISTS")
            if pls is not None:
                for node in pls.iter("PLAYLIST"):
                    name = node.get("Name") or "Playlist"
                    ids = [rid for x in node.findall("TRACK") if (rid := self._ref_id(x))]
                    playlists.append((name, ids))
        return tracks, playlists

    def export_to_rekordbox(self, output_path: Optional[Path] = None) -> Path:
        """Export a clean, valid, importable **Rekordbox 6** XML (PIONEER/CDJ/XDJ).

        Builds a fresh, spec-compliant ``DJ_PLAYLISTS`` tree from a locked snapshot
        of the master: tracks emitted once in ``<COLLECTION>`` (with
        ``file://localhost/`` URL Locations), playlists emitted as ``<NODE>`` folders
        with ``<TRACK Key="TrackID"/>`` references. The internal master format is
        left completely unchanged.
        """
        if output_path is None:
            output_path = self.xml_path.with_name("apollo_export_for_rekordbox.xml")
        output_path = Path(output_path)
        tracks, playlists = self._snapshot()
        _atomic_write_tree(_build_rekordbox_tree(tracks, playlists), output_path)
        logger.info(
            "Rekordbox XML exported: %s (%d tracks, %d playlists)",
            output_path, len(tracks), len(playlists),
        )
        return output_path

    # ── Extension points (future format writers — reuse self._snapshot()) ──────
    def export_to_serato_crate(self, output_path: Optional[Path] = None) -> Path:
        """EXTENSION POINT (planned): write Serato ``.crate`` files.

        Serato crates are a binary format (a ``vrsn`` header followed by tagged
        ``otrk``/``ptrk`` records, big-endian length-prefixed). Implement here using
        :meth:`_snapshot`, mapping each playlist to one ``.crate`` under
        ``_Serato_/Subcrates/``. Kept as a clean hook so callers can branch on
        target format without touching the master heart.
        """
        raise NotImplementedError("Serato crate export is a planned extension point")

    def export_to_traktor_nml(self, output_path: Optional[Path] = None) -> Path:
        """EXTENSION POINT (planned): write a Traktor ``.nml`` collection.

        Traktor NML is XML: ``<NML VERSION="19"><COLLECTION><ENTRY><LOCATION DIR/FILE>``
        plus ``<PLAYLISTS><NODE TYPE="PLAYLIST"><PLAYLIST><ENTRY><PRIMARYKEY KEY=…>``.
        Implement with the same :meth:`_snapshot` + builder pattern as
        :meth:`export_to_rekordbox`. Kept as a hook for parity with Rekordbox.
        """
        raise NotImplementedError("Traktor NML export is a planned extension point")


# ── Live pipeline integration (Phase 2 — master XML as the export source) ─────
#
# The 6-stage ingest pipeline (pipeline_v2) owns the internal fingerprint-keyed
# SSOT (xml_db). These helpers let the pipeline ALSO mirror every committed track
# into the path-keyed master XML "heart" so it can serve Rekordbox/USB export.
# All entry points are BEST-EFFORT: a mirror failure must never break ingest.

_default_store: Optional["ApolloXMLStore"] = None


def default_store() -> "ApolloXMLStore":
    """The process-wide ApolloXMLStore at the canonical library path (cached)."""
    global _default_store
    if _default_store is None:
        from ..conf.paths import APOLLO_LIBRARY_XML
        _default_store = ApolloXMLStore(APOLLO_LIBRARY_XML)
    return _default_store


def record_committed_track(
    file_path: str | Path,
    playlist: Optional[str] = None,
    *,
    title: str = "",
    artist: str = "",
    store: Optional["ApolloXMLStore"] = None,
) -> Optional[str]:
    """Mirror a committed track into the master XML. BEST-EFFORT — never raises.

    Called by the pipeline after a track lands in Coletânea (and on dedup-HIT to
    attach a playlist). Imports the track once into the COLLECTION and, when a
    *playlist* is given, adds a dedup-protected reference. Returns the TrackID, or
    ``None`` if the input was empty or any error occurred (logged, swallowed).
    """
    try:
        if not file_path or not str(file_path).strip():
            return None
        st = store or default_store()
        track_id = st.ensure_track_in_collection(file_path, title=title, artist=artist)
        if playlist:
            st.add_track_to_playlist(track_id, playlist)
        return track_id
    except Exception as exc:  # noqa: BLE001 — mirror must never break ingest
        logger.warning("master XML mirror skipped for %s: %s", file_path, exc)
        return None


def library_tracks_for_export(
    store: Optional["ApolloXMLStore"] = None,
) -> list[Tuple[str, list[str]]]:
    """Export source: ``[(absolute_path, [playlist, ...]), ...]`` — one row per track.

    Reverses the master snapshot (collection + playlist refs) into a path-centric
    view that ``usb_exporter`` / ``exporters.rekordbox_xml`` consume directly. Each
    track appears exactly once even when referenced by multiple playlists.
    """
    st = store or default_store()
    tracks, playlists = st._snapshot()
    # map TrackID → playlists that reference it
    tid_playlists: dict[str, list[str]] = {}
    for name, ids in playlists:
        for tid in ids:
            tid_playlists.setdefault(tid, []).append(name)
    rows: list[Tuple[str, list[str]]] = []
    for tid, attrib in tracks:
        loc = attrib.get("Location", "")
        path = loc[len("file://"):] if loc.startswith("file://") else loc
        rows.append((path, tid_playlists.get(tid, [])))
    return rows
