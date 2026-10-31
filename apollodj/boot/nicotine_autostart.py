"""apolloDJ integrated Collab P2P autostart (embedded headless engine).

Single locked backend config::

    ~/apolloDJ/Configurações/nicotine/apollo_backend.conf

Launch (bundled binary only — never a separate Nicotine+ install)::

    <app>/p2p/nicotine.exe --headless --config <APOLLO_BACKEND_CONF>

Credentials persist as ``credential.json`` under ``NICOTINE_DIR`` (``NICOTINE_CREDENTIAL_FILE``).

#1 MAIN  : pynicotine in-process (``p2p.service.ensure_connected``) when installed.
#2 FALLBACK: bundled ``p2p/nicotine.exe`` subprocess + watchdog.
"""
from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Mapping, Optional

from ..conf.atomic import atomic_write_text
from ..conf.paths import (
    APOLLO_BACKEND_CONF,
    CONFIG_DIR,
    NICOTINE_CREDENTIAL_FILE,
    NICOTINE_DIR,
    TRACKS_BAIXANDO_DIR,
    TRACKS_INTERMEDIIO_DIR,
)
from ..conf.preferences import load_preferences
from ..p2p.backend_config import (
    headless_command,
    lock_config_permissions,
    migrate_legacy_config,
    write_apollo_backend_conf,
)

logger = logging.getLogger(__name__)

_CRED_FILE = NICOTINE_CREDENTIAL_FILE
_nicotine_proc: subprocess.Popen | None = None
_inbox_watcher: "InboxWatcher | None" = None

P2P_BINARY_MISSING_MSG = (
    "Motor Collab P2P não encontrado. Coloque nicotine.exe em deploy/p2p/ (dev) "
    "ou {app}/p2p/ (instalado). O apolloDJ não baixa o binário pela internet."
)


def _slug(username: str, max_len: int = 8) -> str:
    return "".join(c for c in username.lower() if c.isalnum())[:max_len]


def _is_legacy_credential(pw: str) -> bool:
    """Old date-based scheme: pw = ``{DDMMYY}{slug}.aprio`` → starts with 6 digits.

    Those passwords changed whenever the credential was regenerated (different day,
    machine or reinstall), which made Soulseek create a NEW account every time.
    We auto-upgrade them to the deterministic scheme on next login (one final
    account, then permanently stable).
    """
    return len(pw) >= 6 and pw[:6].isdigit()


def generate_nicotine_credential(username: str) -> tuple[str, str]:
    """Return (soulseek_user, soulseek_pass) — DETERMINISTIC per Apollo identity.

    The credential is a pure function of the Apollo username (a stable SHA-256
    fingerprint, **never** the wall clock), so the SAME Apollo account always maps
    to the SAME Soulseek account on every login, reinstall and machine. Soulseek
    therefore never sees a new password and never creates a duplicate account.
    Persisted to ``credential.json`` and reused while already deterministic; a
    legacy date-based credential is upgraded exactly once.
    """
    if _CRED_FILE.exists():
        try:
            data = json.loads(_CRED_FILE.read_text(encoding="utf-8"))
            user, pw = data.get("user"), data.get("pass")
            if user and pw and not _is_legacy_credential(str(pw)):
                return user, pw
        except Exception:
            pass

    import hashlib

    base = (username or "dj").strip().lower()
    slug = _slug(base) or "dj"
    # Stable fingerprint of the Apollo identity (NOT the date) → zero duplicates.
    digest = hashlib.sha256(f"apollodj::{base}::soulseek".encode("utf-8")).hexdigest()
    user = f"{slug}{digest[:4]}.aprio"   # unique + collision-resistant per Apollo user
    pw = f"{digest[4:20]}.aprio"          # deterministic password; keeps .aprio suffix
    _CRED_FILE.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_text(_CRED_FILE, json.dumps({"user": user, "pass": pw}, indent=2), encoding="utf-8")
    lock_config_permissions(_CRED_FILE)
    logger.info("Collab P2P credential determinística para '%s' → %s", username, user)
    return user, pw


def _collab_share_paths() -> list[str]:
    path = str(load_preferences().get("collaborative_share_folder") or "").strip()
    return [path] if path else []


def ensure_backend_config(username: str) -> Path:
    """Write locked apollo_backend.conf (idempotent credentials + collab share)."""
    nic_user, nic_pass = generate_nicotine_credential(username)
    migrate_legacy_config(nic_user, nic_pass)
    conf = write_apollo_backend_conf(
        nic_user,
        nic_pass,
        shared_folders=_collab_share_paths(),
    )
    return conf


def _bundled_p2p_roots() -> list[Path]:
    """Install / PyInstaller locations for the portable headless engine (no PATH lookup)."""
    roots: list[Path] = []
    if getattr(sys, "frozen", False):
        exe_parent = Path(sys.executable).resolve().parent
        roots.append(exe_parent / "p2p")
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            roots.append(Path(meipass) / "p2p")
    else:
        src_root = Path(__file__).resolve().parents[2]
        roots.append(src_root / "deploy" / "p2p")
    legacy = CONFIG_DIR.parent / "bin"
    if legacy not in roots:
        roots.append(legacy)
    return roots


def find_nicotine_binary() -> Optional[Path]:
    """Resolve bundled headless engine — never downloads, never PATH lookup."""
    override = os.environ.get("APOLLODJ_P2P_BINARY", "").strip()
    if override:
        candidate = Path(override).expanduser()
        if candidate.is_file():
            return candidate.resolve()
        logger.warning("APOLLODJ_P2P_BINARY definido mas inválido: %s", candidate)

    for base in _bundled_p2p_roots():
        for name in ("nicotine.exe", "nicotine"):
            candidate = base / name
            if candidate.is_file():
                return candidate.resolve()
    return None


_find_nicotine_binary = find_nicotine_binary


def is_nicotine_subprocess_running() -> bool:
    """True when the bundled nicotine.exe subprocess is alive."""
    global _nicotine_proc
    return _nicotine_proc is not None and _nicotine_proc.poll() is None


def get_p2p_status() -> dict[str, Any]:
    """Bundle + runtime snapshot for Collab UI / bridge polling."""
    from ..gating.features import has_nicotine_backend
    from ..p2p.soulseek_client import SoulseekClient
    from ..runtime.shell_state import get_features

    feats = get_features()
    if not has_nicotine_backend(feats) and feats.get("nicotine_access") is not True:
        return {
            "available": False,
            "binary_path": None,
            "nicotine_running": False,
            "pynicotine": False,
            "reason": "gated",
        }

    binary = find_nicotine_binary()
    pynicotine = SoulseekClient.is_available()
    available = pynicotine or binary is not None
    status: dict[str, Any] = {
        "available": available,
        "binary_path": str(binary) if binary else None,
        "pynicotine": pynicotine,
        "nicotine_running": False,
        "search_roots": [str(p) for p in _bundled_p2p_roots()],
    }

    if not available:
        status["error"] = P2P_BINARY_MISSING_MSG
        return status

    nicotine_running = is_nicotine_subprocess_running()
    if pynicotine:
        try:
            from ..p2p import service as p2p_service

            nicotine_running = nicotine_running or p2p_service._get_client().is_connected
        except Exception:
            pass
    status["nicotine_running"] = nicotine_running
    return status


def _find_supervisord() -> Optional[Path]:
    p = shutil.which("supervisord")
    return Path(p) if p else None


def _start_with_supervisor(exe: Path) -> bool:
    supervisord = _find_supervisord()
    if not supervisord:
        return False
    sup_conf = NICOTINE_DIR / "supervisord.conf"
    cmd = " ".join(headless_command(exe))
    atomic_write_text(
        sup_conf,
        "[supervisord]\n"
        "nodaemon=false\n"
        f"logfile={NICOTINE_DIR / 'supervisord.log'}\n"
        "[program:nicotine]\n"
        f"command={cmd}\n"
        "autostart=true\n"
        "autorestart=true\n"
        "stopasgroup=true\n"
        "killasgroup=true\n",
        encoding="utf-8",
    )
    try:
        subprocess.Popen(
            [str(supervisord), "-c", str(sup_conf)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        logger.info("Collab P2P via supervisor → %s", APOLLO_BACKEND_CONF)
        return True
    except Exception as exc:
        logger.debug("supervisor falhou: %s", exc)
        return False


def _start_with_popen(exe: Path) -> Optional[subprocess.Popen]:
    global _nicotine_proc
    try:
        proc = subprocess.Popen(
            headless_command(exe),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        _nicotine_proc = proc
        logger.info("Collab P2P Popen pid=%s config=%s", proc.pid, APOLLO_BACKEND_CONF)
        return proc
    except Exception as exc:
        logger.warning("Falhou ao iniciar Collab P2P: %s", exc)
        return None


def _start_watchdog(exe: Path) -> None:
    import threading

    def _watch():
        proc = _start_with_popen(exe)
        while True:
            time.sleep(10)
            if proc and proc.poll() is not None:
                logger.warning("Collab P2P exit %s — reiniciando", proc.returncode)
                proc = _start_with_popen(exe)

    threading.Thread(target=_watch, daemon=True, name="apollodj-nicotine-watchdog").start()


def _try_pynicotine_connect(username: str, timeout: float) -> bool:
    try:
        from ..p2p.soulseek_client import SoulseekClient
        from ..runtime.shell_state import set_shell_boot, get_shell_boot

        if not SoulseekClient.is_available():
            return False
        boot = get_shell_boot()
        if username and not boot.get("user"):
            boot = dict(boot)
            boot["user"] = username
            set_shell_boot(boot)
        from ..p2p import service as p2p_service

        deadline = time.time() + timeout
        while time.time() < deadline:
            if p2p_service.ensure_connected():
                logger.info("Collab P2P via pynicotine (config=%s)", APOLLO_BACKEND_CONF)
                return True
            time.sleep(0.5)
        return False
    except Exception as exc:
        logger.debug("pynicotine connect: %s", exc)
        return False


def start_nicotine(
    headless: bool = True,
    timeout: float = 8.0,
    username: str = "",
    features: dict[str, Any] | None = None,
) -> bool:
    """Bootstrap locked backend config and connect (pynicotine or CLI fallback).

    Starts only after Apollo auth with apolloDJ premium/extra membership.
    Headless only — chat, PM, and GUI are locked off in ``apollo_backend.conf``.
    """
    from ..gating.features import has_nicotine_backend

    if not username or not has_nicotine_backend(features or {}):
        logger.info("Collab P2P skipped — auth or membership not eligible")
        return False

    if username:
        ensure_backend_config(username)
        logger.debug("Backend config → %s", APOLLO_BACKEND_CONF)

    if _try_pynicotine_connect(username, timeout):
        return True

    exe = find_nicotine_binary()
    if not exe:
        logger.warning("%s", P2P_BINARY_MISSING_MSG)
        return False

    launched = _start_with_supervisor(exe)
    if not launched:
        _start_watchdog(exe)
        launched = True

    if not launched:
        return False

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            from ..p2p import service as p2p_service

            if p2p_service.ensure_connected():
                return True
        except Exception:
            pass
        time.sleep(0.4)
    logger.info("Collab P2P subprocess ativo (config=%s)", APOLLO_BACKEND_CONF)
    return APOLLO_BACKEND_CONF.is_file() and exe.is_file()


def match_nicotine_filter(meta: Mapping[str, Any]) -> bool:
    """Post-search filter — DJ quality (≥320 kbps, 3–12 min when known)."""
    if str(meta.get("type", "audio")).lower() != "audio":
        return False
    ext = str(meta.get("ext", "")).lower().lstrip(".")
    if ext not in {"mp3", "flac", "wav", "aiff", "aif"}:
        return False
    bitrate = int(meta.get("bitrate_kbps", 0) or meta.get("bitrate", 0) or 0)
    if bitrate > 0 and bitrate < 320:
        return False
    length_sec = int(meta.get("length_sec", 0) or meta.get("duration", 0) or 0)
    if length_sec > 0 and not (205 <= length_sec <= 720):
        return False
    return True


class InboxWatcher:
    """Monitors ``Tracks/Baixando`` and auto-ingests completed downloads.

    Routing chain (see ``conf/paths.py``)::

        Baixando (active dl) → Intermédio (Em Análise) → pipeline → Coletânea | Duvidosos
    """

    def __init__(self, poll_interval: float = 4.0, settle_sec: float = 8.0) -> None:
        import threading

        self._inbox = TRACKS_BAIXANDO_DIR
        self._staging = TRACKS_INTERMEDIIO_DIR
        self._poll = poll_interval
        self._settle = settle_sec
        self._seen: dict[str, int] = {}
        self._inflight: set[str] = set()
        self._max_workers = max(1, int(os.environ.get("APOLLODJ_INGEST_WORKERS", "2")))
        self._executor = ThreadPoolExecutor(
            max_workers=self._max_workers,
            thread_name_prefix="apollodj-ingest",
        )
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._thread = threading.Thread(target=self._loop, daemon=True, name="apollodj-inbox-watcher")

    def start(self) -> None:
        if not self._thread.is_alive():
            self._thread.start()
        logger.info("InboxWatcher → %s", self._inbox)

    def stop(self) -> None:
        self._stop.set()
        self._executor.shutdown(wait=False, cancel_futures=True)

    def _mark_done(self, path_key: str) -> None:
        with self._lock:
            self._inflight.discard(path_key)

    def _loop(self) -> None:
        from ..ingest.watcher import AUDIO_EXTS

        sizes_prev: dict[str, int] = {}
        stable_counts: dict[str, int] = {}

        while not self._stop.is_set():
            self._inbox.mkdir(parents=True, exist_ok=True)
            try:
                current = {
                    str(f): f.stat().st_size
                    for f in self._inbox.iterdir()
                    if f.is_file() and f.suffix.lower() in AUDIO_EXTS
                }
            except Exception:
                current = {}

            for path_str, size in current.items():
                if sizes_prev.get(path_str) == size:
                    stable_counts[path_str] = stable_counts.get(path_str, 0) + 1
                else:
                    stable_counts[path_str] = 0
                sizes_prev[path_str] = size

                needed = max(1, int(self._settle / self._poll))
                if stable_counts.get(path_str, 0) >= needed:
                    with self._lock:
                        if path_str in self._seen or path_str in self._inflight:
                            continue
                        self._seen[path_str] = size
                        self._inflight.add(path_str)

                    p = Path(path_str)
                    logger.info("Download Collab P2P pronto → %s", p.name)
                    future = self._executor.submit(self._ingest_one, p)
                    future.add_done_callback(lambda _f, key=path_str: self._mark_done(key))

            for k in set(self._seen) - set(current):
                del self._seen[k]

            self._stop.wait(self._poll)

    def _ingest_one(self, path: Path) -> None:
        from ..ingest.watcher import process_file
        import shutil

        try:
            self._staging.mkdir(parents=True, exist_ok=True)
            staged = self._staging / path.name
            if path.resolve() != staged.resolve():
                shutil.move(str(path), str(staged))
            else:
                staged = path
            logger.info("Collab P2P Baixando → Intermédio: %s", staged.name)

            from ..ingest.queue_boot import enqueue_path

            job_id = enqueue_path(str(staged))
            if job_id:
                logger.info("Collab P2P → v2 queue: %s (job=%s)", staged.name, job_id)
                return

            logger.warning("Collab P2P v2 enqueue failed — falling back to v1 watcher: %s", staged.name)
            result = process_file(staged)
            if result:
                logger.info("Collab P2P → Coletânea: %s", result.name)
            else:
                logger.warning("Collab P2P → Duvidosos: %s", staged.name)
        except Exception as exc:
            logger.error("InboxWatcher (%s): %s", path.name, exc)


def start_inbox_watcher() -> InboxWatcher:
    """Start Baixando folder monitor (idempotent; works without P2P binary)."""
    global _inbox_watcher
    if _inbox_watcher is not None and _inbox_watcher._thread.is_alive():
        return _inbox_watcher
    _inbox_watcher = InboxWatcher()
    _inbox_watcher.start()
    return _inbox_watcher
