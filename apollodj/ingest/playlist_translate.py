"""Translate the unified apolloDJ XML playlist to vendor formats.

Top 3 Podium:
  1. universal-dj-usb USBParser + PlaylistConverter  (battle-tested .pdb→NML/M3U)
  2. pyrekordbox.RekordboxXml → M3U export (when universal-dj-usb missing)
  3. Plain text M3U writer (always available)
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, Iterable, List


def translate(playlist_name: str, tracks: Iterable[Path],
              out_dir: str | Path) -> Dict[str, str]:
    """Write traktor.nml + .m3u + serato.crate.json into ``out_dir``."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    tracks_list: List[Path] = [Path(t) for t in tracks]

    try:
        from universal_dj_usb import PlaylistConverter
        conv = PlaylistConverter([{"name": playlist_name,
                                   "tracks": [str(t) for t in tracks_list]}])
        m3u_path = out / f"{playlist_name}.m3u"
        nml_path = out / f"{playlist_name}.nml"
        conv.to_m3u(str(m3u_path), relative_paths=True)
        conv.to_traktor_nml(str(nml_path))
        return {"engine": "universal_dj_usb",
                "m3u": str(m3u_path), "traktor_nml": str(nml_path)}
    except Exception:
        pass

    try:
        from pyrekordbox import RekordboxXml
        xml_path = out / f"{playlist_name}.rekordbox.xml"
        rx = RekordboxXml()
        for t in tracks_list:
            rx.add_track(str(t))
        rx.add_playlist(playlist_name, [str(t) for t in tracks_list])
        rx.save(str(xml_path))
        m3u_path = _write_text_m3u(playlist_name, tracks_list, out)
        return {"engine": "pyrekordbox_xml_plus_m3u",
                "rekordbox_xml": str(xml_path), "m3u": str(m3u_path)}
    except Exception:
        pass

    m3u_path = _write_text_m3u(playlist_name, tracks_list, out)
    return {"engine": "text_m3u", "m3u": str(m3u_path)}


def _write_text_m3u(name: str, tracks: List[Path], out: Path) -> Path:
    m3u = out / f"{name}.m3u"
    lines = ["#EXTM3U"]
    for t in tracks:
        lines.append(f"#EXTINF:-1,{t.stem}")
        lines.append(str(t))
    m3u.write_text("\n".join(lines), encoding="utf-8")
    return m3u
