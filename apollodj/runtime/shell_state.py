"""In-process shell boot state (features, user) for pywebview API gating."""
from __future__ import annotations

from typing import Any

_payload: dict[str, Any] = {}


def set_shell_boot(payload: dict[str, Any] | None) -> None:
    global _payload
    _payload = dict(payload or {})


def get_shell_boot() -> dict[str, Any]:
    return dict(_payload)


def get_features() -> dict[str, Any]:
    feats = _payload.get("features")
    return dict(feats) if isinstance(feats, dict) else {}


def get_username() -> str:
    user = _payload.get("user")
    if isinstance(user, str):
        return user
    if isinstance(user, dict):
        return str(user.get("username") or user.get("login") or "")
    return str(user or "")
