"""
Headless Collab P2P client via pynicotine (embedded apolloDJ engine).

Optional dev dependency: ``pip install nicotine-plus`` (production uses bundled ``p2p/nicotine.exe``).
"""
from __future__ import annotations

import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

from ..conf.paths import APOLLO_BACKEND_CONF, NICOTINE_DATA_HOME
from .backend_config import wrap_search_query

logger = logging.getLogger(__name__)
_IMPORT_WARNED = False

try:
    os.environ.setdefault("NICOTINE_NO_GTK", "1")
    from pynicotine.config import config as _nc_config
    from pynicotine.core import core as _nc_core
    from pynicotine.events import events as _nc_events

    _NICOTINE_AVAILABLE = True
except ImportError:
    _NICOTINE_AVAILABLE = False
    _IMPORT_WARNED = False

_HEADLESS_COMPONENTS: set[str] = {
    "error_handler",
    "signal_handler",
    "network_thread",
    "shares",
    "users",
    "network_filter",
    "statistics",
    "search",
    "downloads",
    "transfers",
}

_SERVER_HOST = "server.slsknet.org"
_SERVER_PORT = 2242


class SoulseekClient:
    """Thread-safe headless Soulseek session."""

    def __init__(self, config_dir: str | Path | None = None) -> None:
        self._config_dir = Path(config_dir) if config_dir else APOLLO_BACKEND_CONF.parent
        self._config_file = APOLLO_BACKEND_CONF
        self._data_dir = NICOTINE_DATA_HOME
        self._data_dir.mkdir(parents=True, exist_ok=True)
        self._connected = False
        self._stop_event = threading.Event()
        self._event_loop_thread: threading.Thread | None = None
        self._pending_results: dict[int, list[dict[str, Any]]] = {}
        self._result_lock = threading.Lock()

    def connect(self, username: str, password: str) -> bool:
        if not _NICOTINE_AVAILABLE:
            global _IMPORT_WARNED
            if not _IMPORT_WARNED:
                _IMPORT_WARNED = True
                logger.warning(
                    "pynicotine ausente — use p2p/nicotine.exe no bundle ou pip install nicotine-plus (dev)"
                )
            return False
        if self._connected:
            return True
        try:
            _nc_config.set_config_file(str(self._config_file))
            _nc_config.set_data_folder(str(self._data_dir))
            if self._config_file.is_file():
                _nc_config.read_config()
            _nc_config.sections.setdefault("server", {})
            _nc_config.sections["server"]["login"] = username
            _nc_config.sections["server"]["passw"] = password
            _nc_config.sections["server"]["server"] = (_SERVER_HOST, _SERVER_PORT)
            _nc_config.sections["server"]["auto_connect_startup"] = True

            _nc_events.connect("file-search-response", self._on_file_search_response)
            _nc_core.init_components(enabled_components=_HEADLESS_COMPONENTS)
            _nc_core.start()
            _nc_core.connect()

            self._stop_event.clear()
            self._event_loop_thread = threading.Thread(
                target=self._run_event_loop,
                daemon=True,
                name="apollodj-soulseek-loop",
            )
            self._event_loop_thread.start()
            self._connected = True
            logger.info("Collab P2P conectado como %s", username)
            return True
        except Exception as exc:
            logger.error("Collab P2P connect falhou: %s", exc)
            return False

    def search(self, query: str, timeout: float = 12.0) -> list[dict[str, Any]]:
        if not _NICOTINE_AVAILABLE or not self._connected:
            return []
        query = wrap_search_query(str(query or "").strip())
        if not query:
            return []
        try:
            _nc_core.search.do_search(query, mode="global", switch_page=False)
            token = _nc_core.search.token
            with self._result_lock:
                self._pending_results[token] = []
            time.sleep(timeout)
            with self._result_lock:
                results = self._pending_results.pop(token, [])
            try:
                _nc_core.search.remove_search(token)
            except Exception:
                pass
            return results
        except Exception as exc:
            logger.error("Collab P2P search falhou: %s", exc)
            return []

    def queue_download(self, username: str, virtual_path: str) -> bool:
        if not _NICOTINE_AVAILABLE or not self._connected:
            return False
        try:
            _nc_core.transfers.download_file(username, virtual_path)
            return True
        except Exception as exc:
            logger.error("queue_download falhou: %s", exc)
            return False

    def get_downloads(self) -> list[dict[str, Any]]:
        if not _NICOTINE_AVAILABLE or not self._connected:
            return []
        try:
            transfers = getattr(_nc_core.downloads, "transfers", {})
            out: list[dict[str, Any]] = []
            for transfer in list(transfers.values()):
                username = getattr(transfer, "username", "")
                path = getattr(transfer, "virtual_path", "") or getattr(transfer, "filename", "")
                status = str(getattr(transfer, "status", "unknown")).lower()
                mapped = "active"
                if "finished" in status or "complete" in status:
                    mapped = "done"
                elif "queued" in status:
                    mapped = "queued"
                out.append({
                    "username": username,
                    "filename": Path(path).name if path else "",
                    "full_path": path,
                    "status": mapped,
                    "size_bytes": int(getattr(transfer, "size", 0) or 0),
                })
            return out
        except Exception as exc:
            logger.error("get_downloads falhou: %s", exc)
            return []

    def set_shared_folder(self, folder_path: str) -> bool:
        if not folder_path:
            return False
        folder = Path(folder_path).expanduser().resolve()
        folder.mkdir(parents=True, exist_ok=True)
        try:
            if _NICOTINE_AVAILABLE and self._connected:
                transfers = _nc_config.sections.setdefault("transfers", {})
                shared = list(transfers.get("shared") or [])
                path_str = str(folder)
                if path_str not in shared:
                    shared.append(path_str)
                transfers["shared"] = shared
                try:
                    _nc_config.write_configuration()
                    _nc_core.shares.rescan_shares()
                except Exception:
                    pass
            logger.info("Pasta compartilhada Collab P2P: %s", folder)
            return True
        except Exception as exc:
            logger.error("set_shared_folder falhou: %s", exc)
            return False

    def disconnect(self) -> None:
        if not _NICOTINE_AVAILABLE or not self._connected:
            return
        try:
            self._stop_event.set()
            _nc_core.quit()
        except Exception as exc:
            logger.error("Collab P2P disconnect: %s", exc)
        finally:
            self._connected = False

    @property
    def is_connected(self) -> bool:
        return self._connected

    @staticmethod
    def is_available() -> bool:
        return _NICOTINE_AVAILABLE

    def pause_all_downloads(self) -> int:
        """Pause active/queued transfers (headless PRO control)."""
        if not _NICOTINE_AVAILABLE or not self._connected:
            return 0
        try:
            downloads = _nc_core.downloads
            if hasattr(downloads, "pause_all"):
                downloads.pause_all()
                return len(self.get_downloads())
            paused = 0
            transfers = getattr(downloads, "transfers", {}) or {}
            for transfer_id in list(transfers.keys()):
                try:
                    if hasattr(downloads, "pause_transfer"):
                        downloads.pause_transfer(transfer_id)
                        paused += 1
                except Exception:
                    continue
            return paused
        except Exception as exc:
            logger.debug("pause_all_downloads: %s", exc)
            return 0

    def _run_event_loop(self) -> None:
        try:
            while not self._stop_event.is_set():
                if not _nc_events.process_thread_events():
                    break
                time.sleep(0.1)
        except Exception as exc:
            logger.debug("event loop encerrado: %s", exc)

    def _on_file_search_response(self, msg: Any) -> None:
        token = getattr(msg, "token", None)
        if token is None:
            return
        with self._result_lock:
            if token not in self._pending_results:
                return
            username = getattr(msg, "username", "")
            for file_info in getattr(msg, "list", None) or []:
                try:
                    virtual_path = str(file_info[0])
                    size = int(file_info[1]) if len(file_info) > 1 else 0
                    attrs = file_info[4] if len(file_info) > 4 else []
                    bitrate = int(attrs[0]) if attrs else 0
                    duration = int(attrs[2]) if len(attrs) > 2 else 0
                    self._pending_results[token].append({
                        "username": username,
                        "filename": virtual_path,
                        "full_path": virtual_path,
                        "size_bytes": size,
                        "bitrate_kbps": bitrate,
                        "length_sec": duration,
                        "free_slots": int(getattr(msg, "freeulslots", 0) or 0),
                        "speed_kbps": 0,
                    })
                except (IndexError, TypeError, ValueError):
                    continue
