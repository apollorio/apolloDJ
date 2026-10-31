"""Pipeline v2 — bounded ImportQueue + ProcessPool worker.

Architecture:
    UI thread (pywebview)
        │ enqueue_import(file, playlist)
        ▼
    ImportQueue (bounded; backpressure when full)
        │ N workers = max(1, cpu_count - 1)
        ▼
    ProcessPoolExecutor (true parallelism — bypass GIL for DSP)
        │ each worker runs apollodj.ingest.pipeline_v2.run_v2(file, playlist)
        ▼
    Result callbacks → state_machine.emit → pywebview shell

The UI thread NEVER blocks: enqueue returns immediately with a track_id.
A single drop of 200 files queues all 200 and processes ``N`` simultaneously.
"""
from __future__ import annotations

import logging
import os
import queue
import threading
import uuid
from concurrent.futures import Future, ProcessPoolExecutor
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

_MAX_QUEUE_SIZE = 1024  # bounded — prevents memory bomb on 100k-track drop
_DEFAULT_WORKERS = max(1, (os.cpu_count() or 2) - 1)


@dataclass
class ImportTask:
    track_id: str
    source_path: str
    target_playlist: Optional[str] = None
    extra: dict = field(default_factory=dict)


class ImportQueue:
    """Bounded queue + ProcessPool dispatcher. Singleton per process."""

    _instance: "ImportQueue | None" = None
    _instance_lock = threading.Lock()

    @classmethod
    def get(cls) -> "ImportQueue":
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def __init__(self, max_workers: int = _DEFAULT_WORKERS, max_queue_size: int = _MAX_QUEUE_SIZE) -> None:
        self._queue: "queue.Queue[ImportTask]" = queue.Queue(maxsize=max_queue_size)
        self._max_workers = max_workers
        self._executor: Optional[ProcessPoolExecutor] = None
        self._dispatch_thread: Optional[threading.Thread] = None
        self._stop = threading.Event()
        self._on_done: Optional[Callable[[ImportTask, Any], None]] = None

    # ── lifecycle ─────────────────────────────────────────────────────────

    def start(self, on_done: Optional[Callable[[ImportTask, Any], None]] = None) -> None:
        if self._dispatch_thread is not None:
            return
        self._on_done = on_done
        self._executor = ProcessPoolExecutor(max_workers=self._max_workers)
        self._dispatch_thread = threading.Thread(
            target=self._dispatch_loop, daemon=True, name="apollodj-import-dispatch"
        )
        self._dispatch_thread.start()
        logger.info("ImportQueue started: workers=%d max_queue=%d", self._max_workers, self._queue.maxsize)

    def stop(self, wait: bool = True) -> None:
        self._stop.set()
        if self._executor is not None:
            self._executor.shutdown(wait=wait)
            self._executor = None
        self._dispatch_thread = None

    # ── enqueue ───────────────────────────────────────────────────────────

    def enqueue(self, source_path: str, target_playlist: Optional[str] = None, **extra: Any) -> str:
        """Queue an import task. Returns track_id immediately (non-blocking)."""
        task = ImportTask(
            track_id=str(uuid.uuid4()),
            source_path=source_path,
            target_playlist=target_playlist,
            extra=extra,
        )
        try:
            self._queue.put_nowait(task)
        except queue.Full:
            logger.warning("ImportQueue full (size=%d) — dropping %s", self._queue.maxsize, source_path)
            raise
        return task.track_id

    def status(self) -> dict[str, Any]:
        """Lightweight queue snapshot for bridge polling."""
        running = (
            self._dispatch_thread is not None
            and self._dispatch_thread.is_alive()
        )
        return {
            "running": running,
            "pending": self._queue.qsize(),
            "max_queue": self._queue.maxsize,
            "workers": self._max_workers,
        }

    # ── dispatch ──────────────────────────────────────────────────────────

    def _dispatch_loop(self) -> None:
        while not self._stop.is_set():
            try:
                task = self._queue.get(timeout=0.5)
            except queue.Empty:
                continue
            if self._executor is None:
                continue
            fut: Future = self._executor.submit(_run_worker, task.source_path, task.target_playlist)
            fut.add_done_callback(lambda f, t=task: self._on_complete(t, f))

    def _on_complete(self, task: ImportTask, fut: Future) -> None:
        result: Any
        try:
            result = fut.result()
        except Exception as exc:
            logger.exception("Worker failed for %s: %s", task.source_path, exc)
            result = {"verdict": "FAIL", "error": repr(exc)}
        if self._on_done:
            try:
                self._on_done(task, result)
            except Exception:
                logger.exception("on_done callback raised for %s", task.track_id)


def _run_worker(source_path: str, target_playlist: Optional[str]) -> dict:
    """Top-level worker entrypoint (must be picklable for ProcessPool)."""
    from apollodj.ingest.pipeline_v2 import run_v2
    return run_v2(source_path, target_playlist=target_playlist)
