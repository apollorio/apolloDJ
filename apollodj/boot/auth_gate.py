"""Auth gate — thin wrapper around the proven ApolloClient.

Returns a small dataclass with authentication state + feature flags.
Used by boot sequence and tab gating.
"""
from __future__ import annotations

from dataclasses import dataclass
import importlib.util
from pathlib import Path
from typing import Any


def _load_apollo_client_class() -> type:
    """Load ApolloClient from the frozen _superseeded source tree.

    Works in both development mode (resolves against the project `_superseeded/` tree) and frozen exe
    (resolves against sys._MEIPASS/_legacy/) via conf.paths.legacy_file().
    """
    import os

    from ..conf.paths import legacy_file

    # The read-only ApolloClient reads its REST base from APOLLO_API_BASE at
    # module-load time. Point it at the correct WordPress namespace
    # (``/wp-json/apollo/v1``) before exec, without editing _superseeded code.
    try:
        from ..conf.constants import API_BASE as _API_BASE
        os.environ.setdefault("APOLLO_API_BASE", _API_BASE)
    except Exception:
        pass

    client_path = legacy_file("apolloDJ-exe", "core", "apollo_client.py")
    if client_path is None:
        raise ImportError(
            "Cannot find _superseeded/apolloDJ-exe/core/apollo_client.py — "
            "not in dev tree and not bundled in exe (_MEIPASS/_legacy/)"
        )
    spec = importlib.util.spec_from_file_location("apollo_client_legacy", client_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Cannot load ApolloClient from {client_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    # ── Patch: the read-only client omits the required ``?app_id=`` query param
    #    on GET /dj/permissions, so production returns HTTP 400
    #    (rest_missing_callback_param) and login is denied. /app/verify already
    #    sends it. Add it here without editing the frozen _superseeded source.
    _ApolloClient = module.ApolloClient
    if not getattr(_ApolloClient, "_apollodj_perm_patch", False):
        def _fetch_dj_permissions(self, token):  # type: ignore[no-untyped-def]
            try:
                resp = module._SESSION.get(
                    f"{module.BASE_URL}/dj/permissions",
                    headers=self._auth_headers(token),
                    params={"app_id": module.APP_ID},
                    timeout=10,
                )
                if resp.status_code != 200:
                    return None
                data = module._safe_json(resp)
                return data if isinstance(data, dict) else None
            except Exception:
                return None

        _ApolloClient._fetch_dj_permissions = _fetch_dj_permissions
        _ApolloClient._apollodj_perm_patch = True
    return _ApolloClient


@dataclass(frozen=True)
class AuthResult:
    is_authenticated: bool
    username: str | None
    features: dict[str, Any]
    token: str | None = None


def perform_boot() -> AuthResult:
    """Run the full Apollo auth flow (keyring + /app/verify).

    Returns AuthResult with membership flags (apollodj, can_export, etc.).
    """
    ApolloClient = _load_apollo_client_class()
    client = ApolloClient()
    try:
        ok, user_data = client.boot()
        if not ok:
            # boot() returned (False, {}) — authentication failed but no exception
            return AuthResult(is_authenticated=False, username=None, features={})
    except Exception:
        # Network / keyring failure — treat as unauthenticated
        return AuthResult(is_authenticated=False, username=None, features={})

    # Extract user data from successful boot
    features = getattr(client, "features", {}) or {}
    username = getattr(client, "username", None)
    token = getattr(client, "_token", None)

    return AuthResult(
        is_authenticated=True,
        username=username,
        features=features,
        token=token,
    )