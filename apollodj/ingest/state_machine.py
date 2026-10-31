"""Pipeline v2 — state machine emitted to the pywebview shell.

A track progresses through these states as it flows through the v2 pipeline.
Each transition emits a JSON event to stdout (BOOT-protocol style):
    STATE:<json payload>

The pywebview shell listens via ``apollo:ingest-state`` (evaluate_js) or
``ingest.get_ingest_state()`` polling.
"""
from __future__ import annotations

import json
import sys
import threading
from collections import deque
from enum import Enum
from typing import Any, Callable, Dict, List, Optional


class TrackState(str, Enum):
    QUEUED = "QUEUED"
    STAGED = "STAGED"
    VALIDATED = "VALIDATED"
    FINGERPRINTED = "FINGERPRINTED"
    METADATA = "METADATA"
    ANALYZING = "ANALYZING"
    QUALITY = "QUALITY"
    RENAMED = "RENAMED"
    COMMITTED = "COMMITTED"
    INDEXED = "INDEXED"
    READY = "READY"
    REJECTED = "REJECTED"


# Ordered list — used by the UI to render the progress timeline.
ORDER = [s.value for s in TrackState if s not in (TrackState.REJECTED,)]

_store_lock = threading.Lock()
_tracks: Dict[str, Dict[str, Any]] = {}
_recent_ids: deque[str] = deque(maxlen=64)
_js_notifier: Optional[Callable[[Dict[str, Any]], None]] = None


def set_js_notifier(fn: Optional[Callable[[Dict[str, Any]], None]]) -> None:
    """Register a callback invoked on every ``record()`` (main process only)."""
    global _js_notifier
    _js_notifier = fn


def record(
    track_id: str,
    state: TrackState | str,
    extra: Optional[Dict[str, Any]] = None,
    *,
    emit_stdout: bool = False,
) -> Dict[str, Any]:
    """Store the latest state for bridge polling; optionally push to JS notifier."""
    st = state if isinstance(state, TrackState) else TrackState(state)
    payload: Dict[str, Any] = {"track_id": track_id, "state": st.value, "extra": extra or {}}
    with _store_lock:
        _tracks[track_id] = payload
        _recent_ids.append(track_id)
    if emit_stdout:
        emit(track_id, st, extra)
    notify = _js_notifier
    if notify is not None:
        try:
            notify(payload)
        except Exception:
            pass
    return payload


def get_snapshot(*, limit: int = 32) -> Dict[str, Any]:
    """Return recent track states for ``get_ingest_state()`` bridge polling."""
    with _store_lock:
        ids: List[str] = list(_recent_ids)[-limit:]
        tracks = [_tracks[tid] for tid in ids if tid in _tracks]
    return {"tracks": tracks, "order": ORDER}


def emit(track_id: str, state: TrackState, extra: Optional[Dict[str, Any]] = None) -> None:
    """Emit a state-machine event to stdout (consumed by tests / worker subprocess)."""
    payload = {"track_id": track_id, "state": state.value, "extra": extra or {}}
    line = "STATE:" + json.dumps(payload, ensure_ascii=False)
    try:
        print(line, flush=True)
    except Exception:
        # Never let a UI emit failure break the pipeline.
        sys.stderr.write(line + "\n")
