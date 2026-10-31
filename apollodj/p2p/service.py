"""apolloDJ Collab P2P service — search/download + collab share folder."""
from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any

from ..boot.nicotine_autostart import (
    P2P_BINARY_MISSING_MSG,
    ensure_backend_config,
    generate_nicotine_credential,
    match_nicotine_filter,
)
from ..conf.paths import INBOX_NICOTINE_DIR, NICOTINE_DIR, TRACKS_BAIXANDO_DIR
from ..conf.preferences import load_preferences, save_preferences
from ..gating.features import has_nicotine_backend
from ..runtime.shell_state import get_features, get_username
from .soulseek_client import SoulseekClient

logger = logging.getLogger(__name__)

_client: SoulseekClient | None = None
_connect_lock = threading.Lock()


def p2p_allowed() -> bool:
    feats = get_features()
    if has_nicotine_backend(feats):
        return True
    return feats.get("nicotine_access") is True


def _get_client() -> SoulseekClient:
    global _client
    if _client is None:
        _client = SoulseekClient(NICOTINE_DIR)
    return _client


def ensure_connected() -> bool:
    if not p2p_allowed():
        return False
    if not SoulseekClient.is_available():
        from ..boot.nicotine_autostart import _find_nicotine_binary

        if not _find_nicotine_binary():
            logger.warning("%s", P2P_BINARY_MISSING_MSG)
        return False
    client = _get_client()
    if client.is_connected:
        return True
    with _connect_lock:
        if client.is_connected:
            return True
        user = get_username()
        if not user:
            return False
        ensure_backend_config(user)
        nic_user, nic_pass = generate_nicotine_credential(user)
        return client.connect(nic_user, nic_pass)


def _normalize_row(raw: dict[str, Any]) -> dict[str, Any]:
    path = str(raw.get("full_path") or raw.get("filename") or "")
    name = Path(path).name or path
    ext = Path(name).suffix.lower().lstrip(".")
    return {
        "id": f"{raw.get('username', '')}:{path}",
        "username": str(raw.get("username", "")),
        "filename": name,
        "full_path": path,
        "ext": ext,
        "size_bytes": int(raw.get("size_bytes") or raw.get("size") or 0),
        "speed_kbps": int(raw.get("speed_kbps") or 0),
        "free_slots": int(raw.get("free_slots") or 0),
        "bitrate_kbps": int(raw.get("bitrate_kbps") or raw.get("bitrate") or 0),
        "length_sec": int(raw.get("length_sec") or raw.get("duration") or 0),
    }


def _passes_filter(row: dict[str, Any]) -> bool:
    meta = {
        "type": "audio",
        "ext": row.get("ext", ""),
        "bitrate_kbps": row.get("bitrate_kbps", 0),
        "length_sec": row.get("length_sec", 0),
    }
    return match_nicotine_filter(meta)


def get_p2p_status() -> dict[str, Any]:
    """Bridge-facing P2P bundle + runtime status."""
    from ..boot.nicotine_autostart import get_p2p_status as _status

    return _status()


def nicotine_status() -> dict[str, Any]:
    if not p2p_allowed():
        return {"running": False, "connected": False, "queue_size": 0, "reason": "gated"}
    client = _get_client()
    connected = client.is_connected
    if not connected:
        connected = ensure_connected()
    downloads = client.get_downloads() if connected else []
    return {
        "running": SoulseekClient.is_available(),
        "connected": connected,
        "queue_size": len(downloads),
        "active": sum(1 for d in downloads if d.get("status") == "active"),
    }


def nicotine_search(query: str) -> list[dict[str, Any]]:
    if not p2p_allowed():
        return []
    q = str(query or "").strip()
    if not q:
        return []
    # Preserve remix, hyphens, spaces — network query uses the raw string.
    if len(q) < 2:
        return []
    if not ensure_connected():
        return []
    raw = _get_client().search(q, timeout=14.0)
    rows = [_normalize_row(r) for r in raw]
    filtered = [r for r in rows if _passes_filter(r)]
    logger.info(
        "Collab P2P '%s': %d brutos -> %d apos filtro DJ",
        q[:80],
        len(rows),
        len(filtered),
    )
    return filtered[:100]


def nicotine_download(result: dict[str, Any]) -> dict[str, Any]:
    if not p2p_allowed():
        return {"error": "access denied"}
    if not ensure_connected():
        return {"error": "not connected"}
    username = str(result.get("username", "")).strip()
    path = str(result.get("full_path") or result.get("filename", "")).strip()
    if not username or not path:
        return {"error": "missing peer or path"}
    ok = _get_client().queue_download(username, path)
    if not ok:
        return {"error": "download failed"}
    return {"ok": True, "filename": Path(path).name, "username": username}


def nicotine_get_downloads() -> list[dict[str, Any]]:
    if not p2p_allowed():
        return []
    if not ensure_connected():
        return []
    return _get_client().get_downloads()


def set_collaborative_share_folder(folder_path: str) -> dict[str, Any]:
    value = str(folder_path or "").strip()
    if value:
        Path(value).expanduser().mkdir(parents=True, exist_ok=True)
    prefs = load_preferences()
    prefs["collaborative_share_folder"] = value
    save_preferences(prefs)
    if value and p2p_allowed():
        user = get_username()
        if user:
            ensure_backend_config(user)
        ensure_connected()
        _get_client().set_shared_folder(value)
    return {
        "saved": True,
        "collaborative_share_folder": value,
        "download_dir": str(TRACKS_BAIXANDO_DIR),
    }


def apply_saved_collab_folder_on_boot() -> None:
    """Wire persisted collab folder into Collab P2P shares when premium boots."""
    path = str(load_preferences().get("collaborative_share_folder") or "").strip()
    if not path or not p2p_allowed():
        return
    user = get_username()
    if user:
        ensure_backend_config(user)
    if ensure_connected():
        _get_client().set_shared_folder(path)


def nicotine_pause_all() -> dict[str, Any]:
    if not p2p_allowed():
        return {"ok": False, "paused": 0, "reason": "gated"}
    if not ensure_connected():
        return {"ok": False, "paused": 0, "reason": "not connected"}
    paused = _get_client().pause_all_downloads()
    return {"ok": True, "paused": paused}


def p2p_engine_ready() -> bool:
    """True when Collab P2P can serve search/download (connected or bundled subprocess)."""
    if not p2p_allowed():
        return False
    if SoulseekClient.is_available():
        client = _get_client()
        if client.is_connected:
            return True
        return ensure_connected()
    from ..boot.nicotine_autostart import _find_nicotine_binary

    return _find_nicotine_binary() is not None
