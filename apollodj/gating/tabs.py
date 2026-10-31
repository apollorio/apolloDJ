"""Single source of truth for visible tabs in the apolloDJ shell.

Tab policy (PRO): any authenticated DJ sees the full app (BASE_TABS); the
Collab P2P slugs ``buscar`` + ``transferencias`` are added only when membership
grants P2P. Unauthenticated / role-denied users see ``inicio`` only.
No chat, rooms, or PM slugs.

v3 shell mapping (``apolloDJ.v3.html`` ``Config.tabs`` → slug):
  * **coletanea** subtab ``buscar`` → page ``colabShare`` (``v2/colab-share.js``).
"""
from __future__ import annotations

from typing import List

# P2P search + download queue — sole nicotine UI surface (no chat/PM/rooms).
NICOTINE_FLOW_TABS: List[str] = ["buscar", "transferencias"]

# Canonical ordered list (registry / spec / audits — not always all visible at runtime).
ALL_TABS: List[str] = [
    "inicio",
    "coletanea-lib",
    "prep",
    "analisador",
    "autohotcue",
    "automemloop",
    "waveform",
    "exportar",
    "pendrive-dj",   # merged: was pendrive.DJ + pendrive.PRO — now one Pendrive tab
    "controladora",
    "ajuste-som",
    "converso-rio",
    "apollo-box",
    "relatorios",
    "user-preferences",
    "buscar",
    "transferencias",
]

GATED_TABS = frozenset(NICOTINE_FLOW_TABS)

UNAUTHORIZED_TABS: List[str] = ["inicio"]

# Full app surface available to any authenticated DJ — everything EXCEPT the
# Collab P2P slugs (buscar/transferencias), which stay membership-gated.
BASE_TABS: List[str] = [t for t in ALL_TABS if t not in NICOTINE_FLOW_TABS]


def nicotine_download_flow_tabs() -> List[str]:
    """Return the two slugs for the backend-only nicotine search/download flow."""
    return NICOTINE_FLOW_TABS.copy()


def visible_tabs(features: dict) -> List[str]:
    """Return tab slugs the current user may see at runtime.

    Policy (plan-aligned — registry §14 full app + mapped §15 P2P gating):
      * authenticated DJ (server ``login_role_allowed`` / ``role_allowed``) OR a
        member → the **full app** (``BASE_TABS``);
      * with Collab P2P granted (membership / ``nicotine_access``) → also
        ``buscar`` + ``transferencias``;
      * unknown / unauthenticated / role-denied → ``inicio`` only.
    """
    from .features import has_membership_features, has_nicotine_backend

    feats = features or {}
    member = has_membership_features(feats)
    role_allowed = bool(feats.get("login_role_allowed", feats.get("role_allowed", False)))

    if not (member or role_allowed):
        return UNAUTHORIZED_TABS.copy()

    tabs = BASE_TABS.copy()
    if member or has_nicotine_backend(feats):
        tabs += NICOTINE_FLOW_TABS
    return tabs
