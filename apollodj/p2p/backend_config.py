"""Locked apolloDJ Collab P2P headless config (embedded engine).

Launch (canonical)::

    nicotine.exe --headless --config <APOLLO_BACKEND_CONF>

Every search from the app is wrapped with::

    audio minbitrate:320 mbr:320

so MP3 stays ≥320 kbps; FLAC/WAV/AIFF pass via ``audio`` + Quality column.
"""
from __future__ import annotations

import logging
import os
import stat
from pathlib import Path
from typing import Iterable

from ..conf.atomic import atomic_write_text
from ..conf.paths import (
    APOLLO_BACKEND_CONF,
    INBOX_NICOTINE_DIR,
    NICOTINE_DATA_HOME,
    NICOTINE_DIR,
    NICOTINE_LEGACY_CONFIG,
    TRACKS_BAIXANDO_DIR,
)

logger = logging.getLogger(__name__)

# P2P search suffix — backend-enforced on every query.
APOLLO_SEARCH_FILTER = "audio minbitrate:320 mbr:320"

# Bitrate filter for result pane (backup to query suffix).
_FILTER_BR = [">=320"]
_FILTER_TYPE = ["audio"]


def wrap_search_query(user_query: str) -> str:
    """Append locked DJ filter tokens; preserve remix, hyphens, spaces."""
    q = str(user_query or "").strip()
    if not q:
        return ""
    low = q.lower()
    if "minbitrate:" in low and "mbr:" in low:
        return q
    if low.endswith(APOLLO_SEARCH_FILTER):
        return q
    return f"{q} {APOLLO_SEARCH_FILTER}"


def lock_config_permissions(path: Path) -> None:
    """Best-effort chmod 600 (Unix) / owner-only (Windows)."""
    try:
        if os.name == "nt":
            os.chmod(path, stat.S_IREAD | stat.S_IWRITE)
        else:
            os.chmod(path, stat.S_IRUSR | stat.S_IWUSR)
    except Exception as exc:
        logger.debug("lock_config_permissions: %s", exc)


def headless_command(exe: str | Path) -> list[str]:
    """CLI argv for ``nicotine --headless --config …``."""
    return [str(exe), "--headless", "--config", str(APOLLO_BACKEND_CONF)]


def _apply_locked_sections(
    sections: dict,
    *,
    user: str,
    password: str,
    shared_folders: Iterable[str],
) -> None:
    """Mutate a pynicotine-style config ``sections`` dict in-place."""
    server = sections.setdefault("server", {})
    server["login"] = user
    server["passw"] = password
    server["server"] = ("server.slsknet.org", 2242)
    server["auto_connect_startup"] = True
    server["autojoin"] = []
    server["private_chatrooms"] = False
    # No public chat rooms; private PMs ignored via empty autojoin + headless (no chat UI).
    server["ignorelist"] = list(server.get("ignorelist") or [])

    transfers = sections.setdefault("transfers", {})
    transfers["downloaddir"] = str(TRACKS_BAIXANDO_DIR)
    transfers["uploadslots"] = max(int(transfers.get("uploadslots") or 0), 3)
    transfers["useupslots"] = True
    transfers["rescanonstartup"] = True
    shared = list(transfers.get("shared") or [])
    for folder in shared_folders:
        p = str(Path(folder).expanduser().resolve())
        if p and p not in shared:
            shared.append(p)
    transfers["shared"] = shared

    searches = sections.setdefault("searches", {})
    searches["enablefilters"] = True
    searches["filters_visible"] = False
    searches["filterbr"] = list(_FILTER_BR)
    searches["filtertype"] = list(_FILTER_TYPE)
    searches["min_search_chars"] = 2
    searches["private_search_results"] = False

    logging_sec = sections.setdefault("logging", {})
    logging_sec["debug"] = False
    logging_sec["privatechat"] = False
    logging_sec["chatrooms"] = False

    notifications = sections.setdefault("notifications", {})
    notifications["notification_popup_private_message"] = False
    notifications["notification_popup_chatroom"] = False
    notifications["notification_popup_chatroom_mention"] = False

    ui = sections.setdefault("ui", {})
    ui["trayicon"] = False
    ui["startup_hidden"] = True


def write_apollo_backend_conf(
    user: str,
    password: str,
    *,
    shared_folders: Iterable[str] | None = None,
) -> Path:
    """Write (or patch) the single locked backend config; return its path."""
    NICOTINE_DIR.mkdir(parents=True, exist_ok=True)
    NICOTINE_DATA_HOME.mkdir(parents=True, exist_ok=True)
    TRACKS_BAIXANDO_DIR.mkdir(parents=True, exist_ok=True)

    folders = list(shared_folders or [])

    try:
        from pynicotine.config import config as nc_config

        nc_config.set_config_file(str(APOLLO_BACKEND_CONF))
        nc_config.set_data_folder(str(NICOTINE_DATA_HOME))
        if APOLLO_BACKEND_CONF.is_file():
            nc_config.read_config()
        _apply_locked_sections(nc_config.sections, user=user, password=password, shared_folders=folders)
        nc_config.write_configuration()
        lock_config_permissions(APOLLO_BACKEND_CONF)
        logger.info("apollo_backend.conf escrito (pynicotine) → %s", APOLLO_BACKEND_CONF)
        return APOLLO_BACKEND_CONF
    except ImportError:
        pass

    # Fallback when only the ``nicotine`` CLI is installed (no pynicotine import).
    shared_line = ", ".join(str(Path(f).resolve()) for f in folders if f)
    text = (
        "[server]\n"
        f"login = {user}\n"
        f"passw = {password}\n"
        "server = server.slsknet.org, 2242\n"
        "auto_connect_startup = True\n"
        "autojoin = \n"
        "private_chatrooms = False\n"
        "auto_join_public_chat = False\n"
        "[transfers]\n"
        f"downloaddir = {TRACKS_BAIXANDO_DIR.as_posix()}\n"
        "uploadslots = 3\n"
        "useupslots = True\n"
        f"sharedfolders = {shared_line}\n"
        "[searches]\n"
        "enablefilters = True\n"
        "filters_visible = False\n"
        "filterbr = >=320\n"
        "filtertype = audio\n"
        "min_search_chars = 2\n"
        "[logging]\n"
        "debug = False\n"
        "privatechat = False\n"
        "chatrooms = False\n"
    )
    atomic_write_text(APOLLO_BACKEND_CONF, text, encoding="utf-8")
    lock_config_permissions(APOLLO_BACKEND_CONF)
    logger.info("apollo_backend.conf escrito (INI fallback) → %s", APOLLO_BACKEND_CONF)
    return APOLLO_BACKEND_CONF


def migrate_legacy_config(user: str, password: str) -> None:
    """One-time: if old ``config`` exists, regenerate apollo_backend.conf."""
    if APOLLO_BACKEND_CONF.is_file():
        return
    if NICOTINE_LEGACY_CONFIG.is_file():
        write_apollo_backend_conf(user, password)
