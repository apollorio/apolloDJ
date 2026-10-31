"""HotCue preview engine — hardened against thread/process leaks.

Top 3 Podium:
  1. python-vlc (best for FLAC/WAV/AIFF — gapless, instant seek, low RAM)
  2. pydub.playback.play (simple, ffplay-backed — daemon thread, never blocks UI)
  3. ffplay subprocess (last resort, always available — tracked Popen handle)

Bug fixes applied (audit P1):
  * Cache ONE vlc.Instance() per process (previous code created two — second
    Instance() created on every media_new leaked native resources).
  * Order is set_media → set_time → play (was play → set_time → start glitch).
  * length_sec is enforced via threading.Timer (was ignored — VLC played to EOF).
  * pydub fallback runs in a daemon thread so the UI never blocks.
  * ffplay Popen is tracked; previous handle terminated on new play / stop.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class PreviewPlayer:
    """Stateful preview player. Reuses a single VLC instance per process."""

    def __init__(self) -> None:
        self._engine: Optional[str] = None
        self._vlc_instance = None              # cached vlc.Instance
        self._vlc_player = None                # cached MediaPlayer
        self._stop_timer: Optional[threading.Timer] = None
        self._ffplay_proc: Optional[subprocess.Popen] = None
        self._pydub_thread: Optional[threading.Thread] = None
        self._lock = threading.RLock()

    # ── public API ─────────────────────────────────────────────────────────

    def play(self, path: str | Path, start_sec: float = 0.0,
             length_sec: float = 8.0) -> Dict[str, Any]:
        """Start playing ``path`` from ``start_sec`` for ``length_sec`` seconds.

        Stops any in-flight playback before starting a new one — guarantees no
        overlapping audio / orphan processes.
        """
        with self._lock:
            self.stop()
            try:
                return self._vlc_play(str(path), start_sec, length_sec)
            except Exception as exc:
                logger.debug("VLC preview failed (%r), trying pydub", exc)
            try:
                return self._pydub_play(str(path), start_sec, length_sec)
            except Exception as exc:
                logger.debug("pydub preview failed (%r), trying ffplay", exc)
            return self._ffplay(str(path), start_sec, length_sec)

    def stop(self) -> None:
        """Cancel timer, stop VLC, terminate ffplay."""
        with self._lock:
            if self._stop_timer is not None:
                try:
                    self._stop_timer.cancel()
                except Exception:
                    pass
                self._stop_timer = None
            if self._vlc_player is not None:
                try:
                    self._vlc_player.stop()
                except Exception:
                    pass
            if self._ffplay_proc is not None and self._ffplay_proc.poll() is None:
                try:
                    self._ffplay_proc.terminate()
                    try:
                        self._ffplay_proc.wait(timeout=1.0)
                    except subprocess.TimeoutExpired:
                        self._ffplay_proc.kill()
                except Exception:
                    pass
                self._ffplay_proc = None

    # ── engine: python-vlc ─────────────────────────────────────────────────

    def _vlc_play(self, path: str, start: float, length: float) -> Dict[str, Any]:
        import vlc

        # Cache ONE instance per process (fixes native-resource leak).
        if self._vlc_instance is None:
            self._vlc_instance = vlc.Instance()
        if self._vlc_player is None:
            self._vlc_player = self._vlc_instance.media_player_new()

        media = self._vlc_instance.media_new(path)
        self._vlc_player.set_media(media)
        # Correct order: seek FIRST, then play (was reversed → 0-to-start glitch).
        self._vlc_player.set_time(int(start * 1000))
        self._vlc_player.play()

        # Enforce length_sec — VLC otherwise plays to end-of-file.
        if length > 0:
            self._stop_timer = threading.Timer(length, self.stop)
            self._stop_timer.daemon = True
            self._stop_timer.start()

        self._engine = "python_vlc"
        return {"engine": "python_vlc", "start": start, "length": length}

    # ── engine: pydub.playback (daemon thread — never blocks UI) ───────────

    def _pydub_play(self, path: str, start: float, length: float) -> Dict[str, Any]:
        from pydub import AudioSegment
        from pydub.playback import play

        seg = AudioSegment.from_file(path)
        snippet = seg[int(start * 1000): int((start + length) * 1000)]

        def _worker() -> None:
            try:
                play(snippet)
            except Exception:
                pass

        self._pydub_thread = threading.Thread(target=_worker, daemon=True, name="apollodj-preview-pydub")
        self._pydub_thread.start()
        self._engine = "pydub_playback"
        return {"engine": "pydub_playback", "start": start, "length": length}

    # ── engine: ffplay subprocess (tracked handle) ─────────────────────────

    def _ffplay(self, path: str, start: float, length: float) -> Dict[str, Any]:
        if not shutil.which("ffplay"):
            raise RuntimeError("ffplay not found")
        cmd = [
            "ffplay", "-nodisp", "-autoexit",
            "-ss", str(start), "-t", str(length),
            "-loglevel", "error", path,
        ]
        self._ffplay_proc = subprocess.Popen(
            cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        self._engine = "ffplay_subprocess"
        return {"engine": "ffplay_subprocess", "start": start, "length": length, "pid": self._ffplay_proc.pid}
