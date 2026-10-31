"""Shell boot wiring for ImportQueue + ingest state exposure to pywebview."""
from __future__ import annotations

import logging
from typing import Any, Optional

from . import state_machine
from .queue_worker import ImportQueue, ImportTask

logger = logging.getLogger(__name__)


def _on_task_done(task: ImportTask, result: Any) -> None:
    """Main-process callback when a ProcessPool worker finishes ``run_v2``."""
    res = result if isinstance(result, dict) else {}
    verdict = str(res.get("verdict") or "FAIL")
    tid = str(res.get("track_id") or task.track_id)
    st = "READY" if verdict in ("PASS", "PASS_DEDUP", "PASS_WARN") else "REJECTED"
    extra: dict[str, Any] = {
        "verdict": verdict,
        "source": task.source_path,
        "target_playlist": task.target_playlist,
        "job_id": task.track_id,
    }
    for key in ("reason", "existing_track", "fingerprint", "warn"):
        if key in res and res[key] is not None:
            extra[key] = res[key]
    if "warn" not in extra:
        qstage = (res.get("stages") or {}).get("07_quality") or {}
        club = qstage.get("club_warn")
        if club:
            extra["warn"] = club
        elif st == "REJECTED":
            score = qstage.get("score")
            if score is not None:
                extra["warn"] = {"msg": f"Qualidade abaixo do limite ({float(score):.0f}/100)"}
            elif res.get("reason"):
                extra["warn"] = {"msg": str(res["reason"])}
    state_machine.record(tid, st, extra, emit_stdout=True)


def ensure_import_queue_started() -> ImportQueue:
    """Start the singleton ImportQueue (idempotent). Called at shell launch."""
    iq = ImportQueue.get()
    if iq._dispatch_thread is None:
        iq.start(on_done=_on_task_done)
        logger.info("ImportQueue wired at shell boot")
    return iq


def enqueue_path(
    source_path: str,
    target_playlist: Optional[str] = None,
    **extra: Any,
) -> Optional[str]:
    """Enqueue one audio file; returns queue job id or ``None`` on failure."""
    try:
        iq = ensure_import_queue_started()
        job_id = iq.enqueue(source_path, target_playlist=target_playlist, **extra)
        state_machine.record(
            job_id,
            state_machine.TrackState.QUEUED,
            {"source": source_path, "target_playlist": target_playlist},
            emit_stdout=True,
        )
        try:
            from ..boot.funny_status import emit as funny_emit

            funny_emit(4001)
        except Exception:
            pass
        return job_id
    except Exception as exc:
        logger.warning("enqueue_path failed for %s: %s", source_path, exc)
        return None


def get_ingest_state() -> dict[str, Any]:
    """Return queue status + recent track states for JS polling.

    Each track entry may include ``extra.warn`` (club-playability yellow badge)
    when quality gate flagged issues or the job was REJECTED.
    """
    snap = state_machine.get_snapshot()
    snap["queue"] = ImportQueue.get().status()
    return snap
