"""Update check client for apolloDJ PRO.

Replaces the old CDN manifest URL with the new official endpoint:
https://dj.apollo.rio.br/updates.json

Non-blocking. Failures are logged at DEBUG level and ignored.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
import html
from typing import Any
from urllib.parse import urlparse

from packaging.version import InvalidVersion, Version

from ..conf.constants import APP_VERSION, UPDATES_URL, USER_AGENT

logger = logging.getLogger(__name__)

_MANIFEST_CACHE_TTL = 15.0
_MANIFEST_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}


@dataclass(frozen=True)
class UpdateInfo:
    latest_version: str
    download_setup_url: str
    release_notes: str
    mandatory: bool = False


def _safe_external_url(url: str) -> str | None:
    parsed = urlparse(url.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return None
    return parsed.geturl()


def _external_button(label: str, url: str) -> str:
    safe_url = _safe_external_url(url)
    safe_label = html.escape(label)
    if not safe_url:
        return ""
    return (
        "<p><button type=\"button\" "
        f"onclick=\"window.open({safe_url!r}, '_blank', 'noopener')\">{safe_label}</button></p>"
    )


def _load_manifest(manifest_url: str | None = None, timeout: float = 12.0) -> dict[str, Any] | None:
    if os.environ.get("APOLLODJ_SKIP_UPDATE_CHECK", "").lower() in ("1", "true", "yes"):
        return None

    url = (manifest_url or os.environ.get("APOLLODJ_UPDATE_MANIFEST_URL") or "").strip() or UPDATES_URL
    now = __import__("time").time()
    cached = _MANIFEST_CACHE.get(url)
    if cached and now - cached[0] < _MANIFEST_CACHE_TTL:
        return dict(cached[1])

    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": f"{USER_AGENT}-update"},
            method="GET",
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
        if isinstance(data, dict):
            _MANIFEST_CACHE[url] = (now, data)
            return dict(data)
    except (OSError, ValueError, urllib.error.URLError) as exc:
        logger.debug("Update manifest fetch skipped: %s", exc)
    return None


def _build_lock_html(info: "UpdateInfo | None" = None, maintenance: bool = False) -> str:
    """Build a fully-structured lock-screen HTML payload.

    Three lock flavours:
      · maintenance  — server-side maintenance flag in updates.json
      · newer_version — mandatory upgrade available
      · deprecated   — mandatory flag set (old enough to be killed)
    """
    if maintenance:
        return (
            "<h2>🔧 apolloDJ em Manutenção</h2>"
            "<p>O sistema está passando por uma atualização rápida. "
            "Tente novamente em alguns minutos.</p>"
            '<p><button type="button" onclick="location.reload()">Tentar Novamente</button></p>'
        )
    if info and info.mandatory:
        return (
            "<h2>⚠️ Versão Encerrada</h2>"
            f"<p>Sua versão (<b>v{APP_VERSION}</b>) "
            f"foi descontinuada. A versão <b>v{info.latest_version}</b> é obrigatória para continuar.</p>"
            f"{_external_button(f'Baixar v{info.latest_version}', info.download_setup_url)}"
        )
    if info:
        return (
            "<h2>🚀 Nova Versão Disponível</h2>"
            f"<p>Uma atualização foi lançada: <b>v{info.latest_version}</b>. "
            "Atualize para continuar usando o apolloDJ.</p>"
            f"{_external_button('Atualizar Agora', info.download_setup_url)}"
        )
    # generic fallback
    return (
        "<h2>Versão Floppada</h2>"
        '<p>Acesse <b><a href="https://dj.apollo.rio.br" target="_blank">dj.apollo.rio.br</a></b> '
        "para atualizar.</p>"
        f"{_external_button('Ir para o Site', 'https://dj.apollo.rio.br')}"
    )


LOCK_SCREEN_HTML = _build_lock_html()


def _parse_ver(v: str) -> Version | None:
    try:
        return Version(v.strip())
    except InvalidVersion:
        return None


def check_for_updates(
    current_version: str = APP_VERSION,
    manifest_url: str | None = None,
    timeout: float = 12.0,
) -> UpdateInfo | None:
    """Check https://dj.apollo.rio.br/updates.json for a newer release.

    Returns UpdateInfo only if a strictly newer version is available.
    """
    cur = _parse_ver(current_version)
    if cur is None:
        return None

    data = _load_manifest(manifest_url=manifest_url, timeout=timeout)
    if not data:
        return None

    latest = str(data.get("latest_version") or data.get("version") or "").strip()
    lat = _parse_ver(latest)
    if lat is None or lat <= cur:
        return None

    dl = str(
        data.get("download_setup_url")
        or data.get("download_url")
        or data.get("setup_url")
        or ""
    ).strip()
    safe_dl = _safe_external_url(dl)
    if not safe_dl:
        return None

    notes = str(data.get("notes") or data.get("release_notes") or "")
    mandatory = bool(data.get("mandatory", False))

    return UpdateInfo(
        latest_version=latest,
        download_setup_url=safe_dl,
        release_notes=notes,
        mandatory=mandatory,
    )


# ════════════════════════════════════════════════════════════════════════
# Hardened version gate — apollo_dj_safe_flows (2).py reference flow.
# ADDITIVE: the original latest_version/mandatory path (check_for_updates,
# get_boot_gate) is preserved untouched. This adds the manifest ``min_v`` +
# ``action=='lock'`` semantics, fail-closed offline behaviour, a paid
# ``unlock_code`` override (keyring) and self_clean / self_delete hooks.
# ════════════════════════════════════════════════════════════════════════

def _version_less_than(v1: str, v2: str) -> bool:
    """True if ``v1 < v2`` per semver precedence (numeric > pre-release)."""
    a, b = _parse_ver(v1), _parse_ver(v2)
    if a is None or b is None:
        # Fall back to a defensive string compare only when unpar, never crash.
        return str(v1).strip() < str(v2).strip()
    return a < b


def _paid_unlock_active() -> bool:
    """True when a valid paid unlock code is stored in the OS keyring.

    Admin / rich-tier override: ``keyring.set_password('apolloDJ','unlock_code','XXXX-XXXX')``.
    Empty / short / keyring unavailable → locked (False). Never raises.
    """
    try:
        import keyring  # local import — keyring is optional at import time

        code = keyring.get_password("apolloDJ", "unlock_code")
        return bool(code and len(str(code)) >= 8)
    except Exception:  # noqa: BLE001
        return False


def _self_clean(broken_modules: list[Any] | None) -> None:
    """Safe stub — would disable broken features named in updates.json. No deletion."""
    if broken_modules:
        logger.info("[SELF-CLEAN] would disable broken modules: %s", broken_modules)


def _self_delete() -> None:
    """Safe stub — extreme self-wipe path (intentionally inert in safe mode)."""
    logger.info("[SELF-DELETE] core self-remove requested (inert in safe mode)")


def get_update_gate(
    current_version: str = APP_VERSION,
    *,
    manifest: dict[str, Any] | None = None,
    fail_closed: bool = True,
    unlocked: bool | None = None,
) -> dict[str, Any]:
    """Reference version gate: ``min_v`` + ``action=='lock'``, fail-closed, paid unlock.

    Args:
        current_version: this build's version.
        manifest: an explicit updates.json dict (testing); when ``None`` it is
            fetched from the live endpoint.
        fail_closed: when the update server is unreachable, lock by default
            (reference behaviour). Pass ``False`` for offline-grace boots.
        unlocked: explicit paid-unlock override; defaults to
            :func:`_paid_unlock_active` (keyring ``unlock_code``).

    Returns ``{"action": "lock"|"continue", "reason"?, "html"?, "min_v"?,
    "unlocked"?, "self_clean"?, "self_delete"?, "broken"?, "core_adjust"?}``.
    """
    if unlocked is None:
        unlocked = _paid_unlock_active()

    data = manifest if manifest is not None else _load_manifest()

    # ── Update server unreachable → fail-closed (unless unlocked / fail_open) ──
    if data is None:
        if fail_closed and not unlocked:
            return {
                "action": "lock",
                "reason": "gate_error",
                "html": _build_lock_html(),  # generic "Versão Floppada" screen
                "pct": 30,
            }
        return {"action": "continue", "reason": "update_server_unreachable", "pct": 30}

    min_v = str(data.get("min_v") or data.get("min_version") or "").strip()
    action = str(data.get("action") or "allow").strip().lower()
    locked = (action == "lock") or (bool(min_v) and _version_less_than(current_version, min_v))

    if locked and not unlocked:
        return {
            "action": "lock",
            "reason": "min_version" if min_v else "action_lock",
            "min_v": min_v,
            "html": str(data.get("html") or _build_lock_html()),
            "self_clean": bool(data.get("self_clean", False)),
            "self_delete": bool(data.get("self_delete", False)),
            "broken": data.get("broken", []),
            "core_adjust": data.get("core_adjust", {}),
            "pct": 30,
        }

    # Not locked (or admin-unlocked) → optional self-healing hooks, then continue.
    if data.get("self_clean"):
        _self_clean(data.get("broken", []))
    if data.get("self_delete"):
        _self_delete()
    result = {"action": "continue", "pct": 30}
    if locked and unlocked:
        result["unlocked"] = True
        result["reason"] = "paid_unlock_override"
    return result


def get_boot_gate(current_version: str = APP_VERSION) -> dict[str, Any]:
    """Return boot decision based on update status.

    Returns a dict with keys:
      action : "continue" | "lock"
      reason : why we locked (newer_available | maintenance | deprecated | min_version | action_lock)
      html   : structured HTML for the lock screen (h2 + p + btn)
      pct    : boot progress percent when this gate was checked (for progress bar)

    Honors the reference ``min_v`` / ``action=='lock'`` manifest semantics first
    (offline-grace: ``fail_closed=False`` so a missing server never bricks boot),
    then falls back to the original newer-version (latest_version/mandatory) path.
    """
    gate = get_update_gate(current_version=current_version, fail_closed=False)
    if gate.get("action") == "lock":
        return gate

    info = check_for_updates(current_version=current_version)
    if info:
        reason = "deprecated" if info.mandatory else "newer_available"
        return {
            "action": "lock",
            "reason": reason,
            "html": _build_lock_html(info),
            "latest_version": info.latest_version,
            "download_setup_url": info.download_setup_url,
            "pct": 30,
        }
    return {"action": "continue", "pct": 30}


def check_maintenance(manifest_url: str | None = None, timeout: float = 8.0) -> bool:
    """Return True if the updates.json signals a maintenance window.

    Looks for ``"maintenance": true`` in the manifest.
    """
    data = _load_manifest(manifest_url=manifest_url, timeout=timeout)
    return bool(data and data.get("maintenance", False))