"""Ready signal emitter for the apolloDJ shell.

After successful auth + nicotine, this module assembles the final
payload and emits it to the frontend via the ApolloBridge.
"""
from __future__ import annotations

from typing import Any, Dict

from ..conf.constants import APP_VERSION
from ..gating.features import has_nicotine_backend


def build_ready_payload(
    auth_result: Any,
    visible_tabs: list[str],
) -> Dict[str, Any]:
    """Create the shell-ready event payload."""
    features = dict(getattr(auth_result, "features", {}) or {})
    if has_nicotine_backend(features):
        features.setdefault("nicotine_access", True)
    payload: Dict[str, Any] = {
        "version": APP_VERSION,
        "user": getattr(auth_result, "username", None),
        "features": features,
        "visible_tabs": visible_tabs,
        "timestamp": __import__("time").time(),
    }
    if has_nicotine_backend(features):
        try:
            from ..p2p.service import p2p_engine_ready

            payload["p2p_engine_ready"] = p2p_engine_ready()
        except Exception:
            payload["p2p_engine_ready"] = False
    return payload


def emit_ready(bridge: Any, payload: Dict[str, Any]) -> None:
    """Emit the ready signal through the pywebview bridge."""
    try:
        bridge._emit_js("apollo:shell-ready", payload)
    except Exception as exc:
        # In early dev the bridge may not be fully wired yet
        print("[ready_signal] Could not emit shell-ready:", exc)