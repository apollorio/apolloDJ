"""pywebview launcher for apolloDJ — main shell + installer previewer.

Theme resolution
────────────────
In dev:   src_002/theme/screen software/apolloDJ.v3.html  (source tree)
In exe:   <sys._MEIPASS>/theme/screen software/apolloDJ.v3.html  (bundled)

PyInstaller bundles `src_002/theme/` into the exe under the `theme/` resource
directory (see apolloDJ.spec datas).  `_resolve_theme_root()` finds whichever
is current.
"""
from __future__ import annotations

import functools
import http.server
import json
import os
import socket
import sys
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote

import logging
import webview

_DEBUG_LOG: list[tuple[str, str]] = []
_DEBUG_WINDOW: Any = None
_DEBUG_MAX = 500


def _push_ingest_state(payload: dict) -> None:
    """Push a v2 ingest state event to the main shell via CustomEvent."""
    try:
        win = webview.active_window()
        if win is None and webview.windows:
            win = next((w for w in webview.windows if w != _DEBUG_WINDOW), webview.windows[0])
        if win is None:
            return
        blob = json.dumps(payload, ensure_ascii=False)
        win.evaluate_js(
            f"window.dispatchEvent(new CustomEvent('apollo:ingest-state',{{detail:{blob}}}));"
        )
    except Exception:
        pass


def _boot_import_queue() -> None:
    """Start ImportQueue singleton + wire state_machine → pywebview shell."""
    from ..ingest import state_machine
    from ..ingest.queue_boot import ensure_import_queue_started

    state_machine.set_js_notifier(_push_ingest_state)
    ensure_import_queue_started()
    _push_debug_log("ImportQueue v2 pipeline wired (daemon workers)", "info")


def _resolve_theme_root() -> Path:
    """Return the directory that holds `screen install/` and `screen software/`.

    Order of resolution:
      1) PyInstaller _MEIPASS / "theme"                 — frozen exe
      2) source root / "theme"                          — src_002/theme (canonical)
      3) build root / "_superseeded/simulated-html"   — legacy fallback only
    """
    # 1) Frozen exe
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        p = Path(meipass) / "theme"
        if p.is_dir():
            return p

    # 2) Dev tree: this file is at <src_002>/apollodj/installer_ui/launcher.py
    here = Path(__file__).resolve()
    # parents[0]=installer_ui, [1]=apollodj, [2]=src_002 (not [3]=build/)
    source_root = here.parents[2]
    build_root = source_root.parent

    for candidate in (
        source_root / "theme",
        build_root / "_superseeded" / "simulated-html",
    ):
        if candidate.is_dir():
            return candidate

    raise FileNotFoundError(
        "Could not locate theme assets in frozen resources, src_002/theme, "
        "or build/_superseeded/simulated-html"
    )


THEME_ROOT = _resolve_theme_root()
INSTALL_HTML = THEME_ROOT / "screen install" / "apolloDJ-install-previewer.html"
SHELL_HTML_V3 = THEME_ROOT / "screen software" / "apolloDJ.v3.html"
SHELL_HTML_V2 = THEME_ROOT / "screen software" / "apolloDJ.v2.html"
DEBUG_CONSOLE_HTML = THEME_ROOT / "screen software" / "v3" / "debug-console.html"


def _debug_console_enabled() -> bool:
    return os.environ.get("APOLLODJ_DEBUG_CONSOLE", "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def _push_debug_log(message: str, level: str = "info") -> None:
    line = str(message or "").strip()
    if not line:
        return
    lvl = str(level or "info").lower()
    _DEBUG_LOG.append((lvl, line))
    if len(_DEBUG_LOG) > _DEBUG_MAX:
        del _DEBUG_LOG[: len(_DEBUG_LOG) - _DEBUG_MAX]
    win = _DEBUG_WINDOW
    if win is None:
        return
    try:
        win.evaluate_js(
            f"window.apolloDebugAppend({json.dumps(line)}, {json.dumps(lvl)});"
        )
    except Exception:
        pass


class _DebugLogHandler(logging.Handler):
    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
        except Exception:
            msg = record.getMessage()
        level = "err" if record.levelno >= logging.ERROR else (
            "warn" if record.levelno >= logging.WARNING else "info"
        )
        _push_debug_log(msg, level)


def _flush_debug_buffer_to_window() -> None:
    win = _DEBUG_WINDOW
    if win is None:
        return
    for lvl, line in _DEBUG_LOG[-120:]:
        try:
            win.evaluate_js(
                f"window.apolloDebugAppend({json.dumps(line)}, {json.dumps(lvl)});"
            )
        except Exception:
            break


def _open_debug_console() -> None:
    """Separate always-on-top window for live boot/login diagnostics."""
    global _DEBUG_WINDOW
    if not _debug_console_enabled():
        return
    if _DEBUG_WINDOW is not None:
        try:
            _DEBUG_WINDOW.show()
            _flush_debug_buffer_to_window()
        except Exception:
            pass
        return
    if not DEBUG_CONSOLE_HTML.is_file():
        _push_debug_log("debug-console.html missing", "err")
        return

    def _on_loaded() -> None:
        _flush_debug_buffer_to_window()

    _DEBUG_WINDOW = webview.create_window(
        "apolloDJ · console",
        DEBUG_CONSOLE_HTML.as_uri(),
        width=560,
        height=440,
        resizable=True,
        frameless=False,
        easy_drag=True,
        on_top=True,
        background_color="#0C0C0E",
    )
    try:
        _DEBUG_WINDOW.events.loaded += _on_loaded  # type: ignore[attr-defined]
    except AttributeError:
        pass
    _push_debug_log("Debug console aberta (janela separada)", "info")


def _install_debug_logging() -> None:
    root = logging.getLogger()
    for h in root.handlers:
        if isinstance(h, _DebugLogHandler):
            return
    handler = _DebugLogHandler()
    handler.setLevel(logging.DEBUG)
    handler.setFormatter(logging.Formatter("%(name)s: %(message)s"))
    root.addHandler(handler)


def _features_from_user_data(user_data: dict | None) -> dict[str, Any]:
    """ApolloClient returns a flat feature dict, not nested ``user.features``."""
    if not user_data:
        return {}
    nested = user_data.get("features")
    if isinstance(nested, dict):
        return nested
    return dict(user_data)


def _user_view_from_data(user_data: dict | None) -> dict[str, Any]:
    data = user_data or {}
    features = _features_from_user_data(data)
    return {
        "username": data.get("username") or features.get("username") or "",
        "display_name": data.get("display_name") or features.get("display_name") or "",
        "email": data.get("email") or features.get("email") or "",
        "features": features,
    }


def _pick_shell() -> Path:
    """Return the active running-shell HTML — prefers v3, falls back to v2."""
    if SHELL_HTML_V3.is_file():
        return SHELL_HTML_V3
    return SHELL_HTML_V2


def _resolve_http_serve_root(html_path: Path) -> Path:
    """Directory to expose over loopback so /icon.ico and /theme/... both resolve."""
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        return Path(meipass)
    # src_002/theme/screen software/apolloDJ.v3.html -> serve src_002 (icons + theme/)
    return html_path.parents[2]


def _start_loopback_server(serve_root: Path) -> http.server.ThreadingHTTPServer:
    handler = functools.partial(
        http.server.SimpleHTTPRequestHandler,
        directory=str(serve_root),
    )
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", 0))
    sock.listen(5)
    host, port = sock.getsockname()
    server = http.server.ThreadingHTTPServer((host, port), handler)
    server.daemon_threads = True
    server.socket = sock
    threading.Thread(
        target=server.serve_forever,
        daemon=True,
        name="apollodj-theme-http",
    ).start()
    return server


def _shell_load_url(shell: Path) -> str:
    """Load shell over http://127.0.0.1 — avoids file:// dev banner + WebView2 quirks."""
    serve_root = _resolve_http_serve_root(shell)
    rel = shell.relative_to(serve_root).as_posix()
    rel_quoted = quote(rel, safe="/")
    server = _start_loopback_server(serve_root)
    host, port = server.server_address
    return f"http://{host}:{port}/{rel_quoted}?apollo-desktop=1"


class ApolloApi:
    """Single object exposed as ``window.pywebview.api.*`` (pywebview ≥ 5).

    Each bridge is lazy-imported on first attribute access. pywebview ≥ 5 needs
    a single object whose attributes expose dotted methods — passing a dict
    of instances stopped working in that release.

    JS usage:
        ``window.pywebview.api.ingest.dj_prep_pro(path, weak, commit)``
        ``window.pywebview.api.waveform.get_track_analysis(path)``
        ``window.pywebview.api.waveform.save_cue_points(path, cues)``
        ``window.pywebview.api.usb.open_folder(drive)``
        ``window.pywebview.api.login(username, password)``
        ``window.pywebview.api.get_boot_status()``
    """

    def __init__(self) -> None:
        self._ingest = None
        self._tabs = None
        self._update = None
        self._usb = None
        self._waveform = None
        self._apollo_client = None
        self._p2p_bootstrapped = False

    # ── Sub-bridge properties ──────────────────────────────────────────────

    @property
    def ingest(self):
        if self._ingest is None:
            from ..bridge.ingest_bridge import IngestBridge
            self._ingest = IngestBridge()
        return self._ingest

    @property
    def tabs(self):
        if self._tabs is None:
            from ..bridge.tabs_bridge import TabsBridge
            self._tabs = TabsBridge()
        return self._tabs

    @property
    def update(self):
        if self._update is None:
            from ..bridge.update_bridge import UpdateBridge
            self._update = UpdateBridge()
        return self._update

    @property
    def usb(self):
        if self._usb is None:
            from ..bridge.usb_bridge import UsbBridge
            self._usb = UsbBridge()
        return self._usb

    @property
    def waveform(self):
        if self._waveform is None:
            from ..bridge.waveform_bridge import WaveformBridge
            self._waveform = WaveformBridge()
        return self._waveform

    # ── Auth methods (called directly by login screen JS) ─────────────────

    def _get_client(self):
        """Lazy-load ApolloClient (reuses instance across calls)."""
        if self._apollo_client is None:
            from ..boot.auth_gate import _load_apollo_client_class
            cls = _load_apollo_client_class()
            self._apollo_client = cls()
        return self._apollo_client

    def get_boot_status(self) -> dict:
        """Return device fingerprint + server reachability for the login log.

        Called by the login screen immediately on first display.
        Returns ``{"device_id": "abc123...", "server_online": bool}``.
        """
        try:
            client = self._get_client()
            device_id = client._device_id() if hasattr(client, "_device_id") else "unknown"
            server_online = client.health_check() if hasattr(client, "health_check") else False
            return {"device_id": device_id, "server_online": server_online}
        except Exception as exc:
            return {"device_id": "unknown", "server_online": False, "error": str(exc)}

    def debug_log(self, message: str, level: str = "info") -> dict[str, bool]:
        """Append a line to the external debug console (live surgery window)."""
        _push_debug_log(message, level)
        return {"ok": True}

    # ── Community Mural (Início › Mural) ──────────────────────────────────────

    def get_mural(self, limit: int = 20) -> list:
        """Fetch Apollo community Mural comments (graceful [] on any failure)."""
        try:
            client = self._get_client()
            if hasattr(client, "get_mural_comments"):
                return client.get_mural_comments(int(limit))
        except Exception as exc:
            _push_debug_log(f"get_mural: {exc!r}", "warn")
        return []

    def post_mural_comment(self, content: str) -> dict:
        """Post a comment to the Apollo community Mural."""
        try:
            client = self._get_client()
            if hasattr(client, "post_mural_comment"):
                return client.post_mural_comment(str(content))
            return {"ok": False, "error": "mural indisponível"}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def login(self, username: str, password: str) -> dict:
        """Authenticate user via apollo.rio.br /app/auth.

        Called by ``apolloLogin()`` in the login screen JS.
        Returns ``{"ok": true, "user": {...}}`` or ``{"ok": false, "error": "..."}``.

        Membership gating: even on successful auth, if the user's
        ``membership_tier`` is NOT in :data:`apollodj.gating.features.AUTHORIZED_MEMBERSHIPS`
        (``apolloDJ`` or ``apolloDJ-EXTRA``), the login is refused with
        a friendly "Lista Amiga" message pointing them at apollo.rio.br.

        Test-mode shortcut: ``teste / 123456`` bypasses the REST call and
        returns a deterministic mock user — used by QA + smoke tests.
        """
        from ..gating.features import has_membership_features, membership_tier_from_features

        if not username or not password:
            _push_debug_log("login: usuário ou senha vazios", "warn")
            return {"ok": False, "error": "Usuário e senha são obrigatórios"}

        _push_debug_log(f"login: tentativa user={username.strip()!r}", "info")

        # ── Offline QA fixture ONLY (synthetic, never a real DB user). Real
        #    accounts (e.g. jaque.sena) MUST authenticate against the live
        #    apollo.rio.br DB below — we never fake a real login. ────────────
        uname = username.strip().lower()
        if uname == "teste" and password == "123456":
            mock_user = {
                "username": "teste",
                "display_name": "DJ Teste",
                "email": "teste@apollo.rio.br",
                "features": {"membership_type": "apolloDJ", "nicotine_access": True,
                             "login_role_allowed": True},
                "is_test_user": True,
            }
            _push_debug_log("login: fixture offline 'teste' (QA only)", "warn")
            return self._gate_membership(mock_user)

        try:
            client = self._get_client()
            _push_debug_log(f"login: POST {getattr(client, 'BASE_URL', 'apollo')}/app/auth", "info")
            ok, user_data = client.login(username, password)
        except Exception as exc:
            _push_debug_log(f"login: exceção {exc!r}", "err")
            return {"ok": False, "error": f"Falha de conexão: {exc}"}

        if not ok:
            _push_debug_log("login: credenciais recusadas (HTTP ou token inválido)", "err")
            return {"ok": False, "error": "Login ou senha incorretos — verifique e tente novamente"}

        tier = membership_tier_from_features(_features_from_user_data(user_data))
        _push_debug_log(f"login: auth OK tier={tier!r} nicotine={user_data.get('nicotine_access')}", "ok")
        return self._gate_membership(user_data or {})

    def _active_shell_window(self) -> Any | None:
        """Return the main pywebview window, if the GUI loop is running."""
        try:
            win = webview.active_window()
            if win is not None:
                return win
        except Exception:
            pass
        return webview.windows[0] if webview.windows else None

    def window_minimize(self) -> dict[str, bool]:
        win = self._active_shell_window()
        if win is None:
            return {"ok": False}
        try:
            win.minimize()
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def window_maximize(self) -> dict[str, bool]:
        win = self._active_shell_window()
        if win is None:
            return {"ok": False}
        try:
            win.maximize()
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def window_restore(self) -> dict[str, bool]:
        win = self._active_shell_window()
        if win is None:
            return {"ok": False}
        try:
            win.restore()
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def window_toggle_maximize(self) -> dict[str, bool]:
        win = self._active_shell_window()
        if win is None:
            return {"ok": False}
        try:
            if getattr(win, "maximized", False):
                win.restore()
                maximized = False
            else:
                win.maximize()
                maximized = True
            return {"ok": True, "maximized": maximized}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def window_close(self) -> dict[str, bool]:
        win = self._active_shell_window()
        if win is None:
            return {"ok": False}
        try:
            win.destroy()
            return {"ok": True}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def _activate_collab_p2p_after_login(self, user_view: dict) -> None:
        """Wire Python shell_state + headless P2P after UI login (AUTH_REQUIRED path)."""
        from ..boot.nicotine_autostart import (
            get_p2p_status,
            start_inbox_watcher,
            start_nicotine,
        )
        from ..boot.ready_signal import build_ready_payload
        from ..gating.features import has_nicotine_backend
        from ..gating.tabs import visible_tabs
        from ..p2p.service import apply_saved_collab_folder_on_boot
        from ..runtime.shell_state import set_shell_boot

        features = dict(user_view.get("features") or {})
        username = str(user_view.get("username") or "").strip()
        auth = type(
            "_Auth",
            (),
            {"is_authenticated": True, "username": username, "features": features},
        )()
        payload = build_ready_payload(auth, visible_tabs(features))
        set_shell_boot(payload)
        _push_debug_log("login: shell_state + feature gates aplicados", "info")

        if not has_nicotine_backend(features):
            return

        p2p_status = get_p2p_status()
        if not p2p_status.get("available"):
            _push_debug_log(
                p2p_status.get("error") or "Collab P2P indisponível — binário ausente",
                "warn",
            )

        ready = start_nicotine(headless=True, username=username, features=features)
        _push_debug_log(
            f"login: Collab P2P backend {'OK' if ready else 'offline (config only)'}",
            "ok" if ready else "warn",
        )
        try:
            apply_saved_collab_folder_on_boot()
            start_inbox_watcher()
            self._p2p_bootstrapped = True
        except Exception as exc:
            _push_debug_log(f"login: inbox watcher — {exc!r}", "warn")

    def _gate_membership(self, user_data: dict) -> dict:
        """Return login response after applying the apolloDJ membership gate."""
        from ..gating.features import has_membership_features, membership_tier_from_features

        features = _features_from_user_data(user_data)
        tier = membership_tier_from_features(features)
        is_member = has_membership_features(features)
        # The server is the access authority: a real ``apollo_dj`` account with
        # ``login_role_allowed``/``role_allowed`` true is permitted into the shell
        # even without a premium membership. Premium tier (apolloDJ/-EXTRA) still
        # gates the Collab P2P backend via has_nicotine_backend downstream.
        role_allowed = bool(
            features.get("login_role_allowed", features.get("role_allowed", False))
        )
        if is_member or role_allowed:
            _push_debug_log(
                f"login: acesso OK (tier={tier or '—'} role_allowed={role_allowed} "
                f"member={is_member})",
                "ok",
            )
            user_view = _user_view_from_data(user_data)
            # Only starts the headless P2P when membership grants it (gated inside).
            self._activate_collab_p2p_after_login(user_view)
            from ..gating.tabs import visible_tabs as _visible_tabs
            tabs = _visible_tabs(features)
            _push_debug_log(f"login: visible_tabs={tabs}", "ok")
            return {"ok": True, "user": user_view, "visible_tabs": tabs}
        _push_debug_log(
            f"login: Lista Amiga — role negado, tier={tier!r} "
            f"type={features.get('membership_type')!r}",
            "warn",
        )
        return {
            "ok": False,
            "error": (
                "Seu nome não consta nessa Lista Amiga… "
                "Solicite integração como DJ no apollo.rio.br!"
            ),
            "reason": "not_apollodj_member",
            "membership_tier": tier,
        }

    def _bootstrap_p2p_once(self) -> None:
        if self._p2p_bootstrapped:
            return
        self._p2p_bootstrapped = True
        try:
            from ..p2p.service import apply_saved_collab_folder_on_boot

            apply_saved_collab_folder_on_boot()
        except Exception:
            pass

    # ── Preferences + paths (pyBridge compat — JSON strings) ─────────────────

    def get_user_preferences(self) -> str:
        from ..conf.preferences import load_preferences

        return json.dumps(load_preferences())

    def set_user_preference(self, key: str, value_json: str) -> str:
        from ..conf.preferences import load_preferences, save_preferences

        try:
            prefs = load_preferences()
            prefs[str(key)] = json.loads(value_json or "null")
            save_preferences(prefs)
            return json.dumps({"saved": True})
        except Exception as exc:
            return json.dumps({"saved": False, "error": str(exc)})

    def set_collaborative_share_folder(self, folder_path: str) -> str:
        from ..p2p.service import set_collaborative_share_folder

        return json.dumps(set_collaborative_share_folder(folder_path))

    def get_app_paths(self) -> str:
        from ..conf.paths import (
            APOLLO_BASE,
            CONFIG_DIR,
            INBOX_NICOTINE_DIR,
            RELATORIOS_DIR,
            TRACKS_BAIXANDO_DIR,
            TRACKS_COLETANEA_DIR,
            TRACKS_INTERMEDIIO_DIR,
            TRACKS_TRANSFERENCIAS_DIR,
        )

        return json.dumps({
            "root": str(APOLLO_BASE),
            "tracks": str(TRACKS_COLETANEA_DIR),
            "baixando": str(TRACKS_BAIXANDO_DIR),
            "intermedio": str(TRACKS_INTERMEDIIO_DIR),
            "transferencias": str(TRACKS_TRANSFERENCIAS_DIR),
            "corrompido": str(TRACKS_TRANSFERENCIAS_DIR / "Corrompido"),
            "preferencias": str(CONFIG_DIR),
            "relatorios": str(RELATORIOS_DIR),
            "nicotine_inbox": str(INBOX_NICOTINE_DIR),
        })

    def open_folder_dialog(self) -> str:
        win = self._active_shell_window()
        if win is None:
            return json.dumps("")
        try:
            result = win.create_file_dialog(dialog_type=20)
            return json.dumps(result[0] if result else "")
        except Exception as exc:
            return json.dumps({"error": str(exc)})

    # ── Collab P2P (Buscar + Transferências — embedded backend API) ───────────

    def nicotine_search(self, query: str) -> list[dict]:
        self._bootstrap_p2p_once()
        from ..p2p.service import nicotine_search

        return nicotine_search(query)

    def soulseek_search(self, query: str) -> list[dict]:
        return self.nicotine_search(query)

    def nicotine_download(self, result_json: str) -> dict:
        self._bootstrap_p2p_once()
        from ..p2p.service import nicotine_download

        try:
            payload = json.loads(result_json or "{}")
        except json.JSONDecodeError:
            return {"error": "invalid json"}
        if not isinstance(payload, dict):
            return {"error": "invalid result"}
        return nicotine_download(payload)

    def nicotine_get_downloads(self) -> list[dict]:
        from ..p2p.service import nicotine_get_downloads

        return nicotine_get_downloads()

    def nicotine_status(self) -> dict:
        from ..p2p.service import nicotine_status

        return nicotine_status()

    def get_p2p_status(self) -> dict:
        from ..p2p.service import get_p2p_status

        return get_p2p_status()

    def nicotine_pause_all(self) -> dict:
        from ..p2p.service import nicotine_pause_all

        return nicotine_pause_all()

    def soulseek_pause_all(self) -> dict:
        return self.nicotine_pause_all()


def _build_js_api() -> Any:
    """Construct the JS-facing bridge namespace exposed via pywebview."""
    return ApolloApi()


def _default_shell_boot_payload() -> dict:
    """Minimal boot payload for the dev shell (mirrors ``ready_signal.build_ready_payload``)."""
    from ..boot.ready_signal import build_ready_payload
    from ..gating.tabs import visible_tabs

    auth = type("_Auth", (), {"username": "dev", "features": {}})()
    return build_ready_payload(auth, visible_tabs(auth.features))


def _inject_shell_boot(window: Any, payload: dict | None = None) -> None:
    """Inject ``visible_tabs`` / ``features`` into v3 (``__APOLLO_BOOT_PAYLOAD__`` + gates)."""
    try:
        p = payload if payload is not None else _default_shell_boot_payload()
        from ..runtime.shell_state import set_shell_boot

        set_shell_boot(p)
        js_blob = json.dumps(p)
    except Exception:
        return

    script = (
        "(function(){try{var p=%s;"
        "window.__APOLLO_BOOT_PAYLOAD__=Object.assign(window.__APOLLO_BOOT_PAYLOAD__||{},p);"
        "var api=window.pywebview&&window.pywebview.api;"
        "if(api){window.pyBridge=window.pyBridge||{};"
        "['get_user_preferences','set_user_preference','set_collaborative_share_folder',"
        "'get_app_paths','open_folder_dialog','get_p2p_status',"
        "'nicotine_search','nicotine_status','nicotine_download','nicotine_get_downloads','nicotine_pause_all']"
        ".forEach(function(m){if(typeof api[m]==='function')"
        "window.pyBridge[m]=function(){return api[m].apply(api,arguments);};});}"
        "if(window.ApolloRuntime&&typeof ApolloRuntime.applyShellPayload==='function')"
        "{ApolloRuntime.applyShellPayload(p);}"
        "else if(window.App&&typeof App.applyFeatureGates==='function')"
        "{App.applyFeatureGates(p);if(typeof App.renderNav==='function')App.renderNav();"
        "if(typeof App.renderTopbar==='function')App.renderTopbar();"
        "if(typeof App._syncCtrlMode==='function')App._syncCtrlMode();"
        "if(typeof App._renderPage==='function')App._renderPage();}"
        "else{window.dispatchEvent(new CustomEvent('apollo:shell-ready',{detail:p}));}"
        "}catch(e){}})();"
    ) % js_blob

    try:
        window.evaluate_js(script)
    except Exception:
        pass

    try:
        from ..p2p.service import apply_saved_collab_folder_on_boot

        apply_saved_collab_folder_on_boot()
    except Exception:
        pass


def launch_installer() -> None:
    """Open the installer previewer UI (Inno Setup wrapper screen)."""
    if not INSTALL_HTML.is_file():
        raise FileNotFoundError(f"Installer HTML not found: {INSTALL_HTML}")
    webview.create_window(
        "apolloDJ Installer",
        INSTALL_HTML.as_uri(),
        width=900,
        height=700,
        resizable=False,
    )
    webview.start()


def launch_shell(title: str = "apolloDJ", boot_payload: dict | None = None) -> None:
    """Open the main running shell (v3.html preferred) with all bridges wired."""
    _install_debug_logging()
    _boot_import_queue()
    _open_debug_console()
    _push_debug_log("launch_shell: abrindo UI principal (frameless)", "info")

    # Kill WebView2/Edge autofill + password-manager so stale entries (e.g. a
    # previously-typed "james") never ghost into the login fields.
    os.environ.setdefault(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-features=msAutofill,AutofillServerCommunication,"
        "AutofillEnableAccountWalletStorage,PasswordManagerOnboarding,"
        "PasswordImport,PasswordManagerEnable",
    )

    shell = _pick_shell()
    if not shell.is_file():
        raise FileNotFoundError(f"Shell HTML not found in {THEME_ROOT}")

    # Open at 80% width × 95% height of the primary screen, centered.
    _win_w, _win_h, _win_x, _win_y = 1400, 900, None, None
    try:
        import ctypes

        _u = ctypes.windll.user32
        _sw, _sh = int(_u.GetSystemMetrics(0)), int(_u.GetSystemMetrics(1))
        if _sw >= 400 and _sh >= 300:
            _win_w = int(_sw * 0.80)
            _win_h = int(_sh * 0.95)
            _win_x = max(0, (_sw - _win_w) // 2)
            _win_y = max(0, (_sh - _win_h) // 2)
    except Exception:
        pass

    _win_kwargs = dict(
        js_api=_build_js_api(),
        width=_win_w,
        height=_win_h,
        min_size=(900, 600),
        resizable=True,
        frameless=True,
        easy_drag=False,
        shadow=False,
        background_color="#FFFFFF",
        text_select=True,
    )
    if _win_x is not None and _win_y is not None:
        _win_kwargs["x"] = _win_x
        _win_kwargs["y"] = _win_y
    window = webview.create_window(title, _shell_load_url(shell), **_win_kwargs)

    def _on_loaded() -> None:
        _inject_shell_boot(window, boot_payload)
        _push_debug_log("shell: HTML carregado + boot payload injetado", "ok")

    start_hook = None
    try:
        window.events.loaded += _on_loaded  # type: ignore[attr-defined]
    except AttributeError:
        def start_hook() -> None:
            def _delayed() -> None:
                time.sleep(1.0)
                if webview.windows:
                    main = next(
                        (w for w in webview.windows if w != _DEBUG_WINDOW),
                        webview.windows[0],
                    )
                    _inject_shell_boot(main, boot_payload)

            threading.Thread(target=_delayed, daemon=True).start()

    # pywebview's private_mode defaults to True → ephemeral WebView2 profile
    # (no persisted autofill/cache); combined with the autofill browser args set
    # above, stale values (e.g. "james") never ghost into the login fields.
    if start_hook is not None:
        webview.start(start_hook)
    else:
        webview.start()


def launch_desktop(boot_exit_code: int, boot_payload: dict | None = None) -> None:
    """Desktop entry after ``main.py`` bootstrap — opens the pywebview shell (no CMD UI)."""
    payload = boot_payload if boot_payload is not None else _default_shell_boot_payload()
    if boot_exit_code == 20:
        payload = dict(payload)
        payload["auth_required"] = True
    launch_shell(boot_payload=payload)
