"""Universal Export — canonical Track model (path + fingerprint key).

The same Track flows through every exporter (rekordbox_xml, serato_crates,
universal_cdj) so a single audio file ships to all three DJ ecosystems
from one canonical entry — zero duplication.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional


@dataclass(frozen=False)
class Track:
    """Canonical Track — the single source of truth across all exporters."""
    fingerprint: str
    path: Path
    artist: str = "Unknown"
    title: str = ""
    bpm: Optional[float] = None
    key: Optional[str] = None              # Camelot, e.g. "8A"
    key_note: Optional[str] = None         # tonic, e.g. "A"
    key_mode: Optional[str] = None         # "major" | "minor"
    energy: Optional[float] = None         # 1..10
    duration_sec: float = 0.0
    bitrate_kbps: int = 0
    sample_rate: int = 44100
    channels: int = 2
    beat_times: List[float] = field(default_factory=list)
    downbeat_cues: List[float] = field(default_factory=list)
    hotcues: List[Dict[str, Any]] = field(default_factory=list)
    sections: List[Dict[str, Any]] = field(default_factory=list)
    waveform_path: Optional[Path] = None
    cover_path: Optional[Path] = None
    quality_score: float = 0.0
    playlists: List[str] = field(default_factory=list)
    extra: Dict[str, Any] = field(default_factory=dict)

    # ── factories ─────────────────────────────────────────────────────────

    @classmethod
    def from_pipeline_v2_report(cls, report: Dict[str, Any]) -> "Track":
        """Build a Track from the pipeline_v2.run_v2 report dict."""
        stages = report.get("stages", {}) or {}
        analysis = stages.get("06_analysis", {}) or {}
        prep = stages.get("06_dj_prep", {}) or {}
        prep_steps = prep.get("steps") if isinstance(prep.get("steps"), dict) else {}
        metadata = stages.get("05_metadata", {}) or {}
        validate = stages.get("03_validate", {}) or {}
        commit = stages.get("09_commit", {}) or {}
        quality = stages.get("07_quality", {}) or {}
        path = Path(commit.get("final_path") or report.get("source") or "")
        wf_path = analysis.get("waveform_path")
        return cls(
            fingerprint=str(report.get("fingerprint", "")),
            path=path,
            artist=str(metadata.get("artist") or "Unknown"),
            title=str(metadata.get("title") or path.stem),
            bpm=analysis.get("bpm"),
            key=analysis.get("key"),
            key_note=analysis.get("key_note"),
            key_mode=analysis.get("key_mode"),
            energy=analysis.get("energy"),
            duration_sec=float(metadata.get("duration_sec") or validate.get("duration_sec") or 0.0),
            bitrate_kbps=int(validate.get("bitrate_kbps") or 0),
            beat_times=list(analysis.get("beat_times") or []),
            downbeat_cues=list(analysis.get("downbeat_cues") or []),
            hotcues=list(analysis.get("hotcues") or analysis.get("smart_hotcues") or []),
            sections=list(analysis.get("sections") or []),
            waveform_path=Path(wf_path) if wf_path else None,
            quality_score=float(quality.get("score") or 0.0),
            playlists=[report["target_playlist"]] if report.get("target_playlist") else [],
            extra={
                "lufs": analysis.get("lufs"),
                "gain_eq_db": analysis.get("gain_eq_db"),
                "prep_steps": prep_steps,
                "club_warn": quality.get("club_warn"),
            },
        )

    def as_dict(self) -> Dict[str, Any]:
        d = self.__dict__.copy()
        d["path"] = str(self.path)
        if self.waveform_path:
            d["waveform_path"] = str(self.waveform_path)
        if self.cover_path:
            d["cover_path"] = str(self.cover_path)
        return d
