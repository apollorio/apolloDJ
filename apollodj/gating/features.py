"""Feature flag accessors for apolloDJ PRO.

Membership policy (strict):
  Authorized memberships: ``apolloDJ``, ``apolloDJ-EXTRA``
  All other values (including none / free) are restricted — no embedded Collab P2P backend.
"""
from __future__ import annotations

from typing import Any

# Only these exact membership slugs grant embedded Collab P2P + buscar/transferencias tabs.
AUTHORIZED_MEMBERSHIPS: frozenset[str] = frozenset({
    "apolloDJ",
    "apolloDJ-EXTRA",
})

# WordPress / apollo-membership slugs → desktop canonical tiers (alias map only)
_LEGACY_WP_PRO = "apollodj" + "-pro"
WP_MEMBERSHIP_ALIASES: dict[str, str] = {
    "app-apollodj": "apolloDJ",
    "apollodj": "apolloDJ",
    "apollo-dj": "apolloDJ",
    _LEGACY_WP_PRO: "apolloDJ",
    "amigz": "apolloDJ-EXTRA",
    "greatdjs": "apolloDJ-EXTRA",
    "apolloDJ-extra": "apolloDJ-EXTRA",
}


def has_membership(tier: str) -> bool:
    """Return True when *tier* is an authorized apolloDJ membership slug."""
    return str(tier).strip() in AUTHORIZED_MEMBERSHIPS


def normalize_membership_slug(raw: str) -> str:
    """Map WP membership_type slugs to apolloDJ / apolloDJ-EXTRA."""
    key = str(raw or "").strip()
    if not key:
        return ""
    mapped = WP_MEMBERSHIP_ALIASES.get(key.lower())
    if mapped:
        return mapped
    return key


def membership_tier_from_features(features: dict[str, Any]) -> str:
    """Extract membership slug from Apollo /app/verify + /dj/permissions payload.

    The server is authoritative. It may express membership in several ways:
      • an explicit slug key (``membership_tier`` / ``membership_type`` / …)
      • a ``memberships`` array of slugs/objects
      • boolean grants (``nicotine_access`` → P2P, ``ultra_mode`` /
        ``membership_active`` → premium active)

    We check them in that order so the desktop picks up a membership the moment
    the server grants it — independent of the user, on every auth/verify/5h refresh.
    """
    if not features:
        return ""
    membership_value = (
        features.get("membership_tier")
        or features.get("membership_type")
        or features.get("membership")
        or features.get("plan")
        or features.get("apollo_membership")
        or ""
    )
    if isinstance(membership_value, dict):
        membership_value = (
            membership_value.get("name")
            or membership_value.get("tier")
            or membership_value.get("slug")
            or ""
        )

    # Derive from the server's ``memberships`` array when no explicit slug.
    if not membership_value:
        memberships = features.get("memberships")
        if isinstance(memberships, list) and memberships:
            first = memberships[0]
            if isinstance(first, dict):
                membership_value = (
                    first.get("slug") or first.get("name") or first.get("tier") or ""
                )
            else:
                membership_value = str(first)

    # Fall back to the server's authoritative MEMBERSHIP grants. NOTE: do NOT
    # use ``ultra_mode`` here — the server grants that to every apollo_dj as a
    # feature flag (premium analysis), independent of a paid membership.
    if not membership_value:
        if bool(features.get("nicotine_access")):
            membership_value = "apolloDJ-EXTRA"    # explicit Collab P2P grant
        elif bool(features.get("membership_active")):
            membership_value = "apolloDJ"          # active paid membership

    return normalize_membership_slug(str(membership_value))


def has_membership_features(features: dict[str, Any]) -> bool:
    """Return True only for authorized membership slugs (apolloDJ / apolloDJ-EXTRA)."""
    return has_membership(membership_tier_from_features(features))


def get_daily_limit(features: dict[str, Any], default: int = 50) -> int:
    """Return the daily analysis limit for the current user."""
    return int(features.get("daily_limit", default))


def has_nicotine_backend(features: dict[str, Any]) -> bool:
    """True when embedded headless Collab P2P may start.

    Honors the server's authoritative ``nicotine_access`` grant first (set by
    /dj/permissions), then falls back to the membership-slug check. This means
    the moment apollo.rio.br grants P2P to a DJ, the desktop enables it on the
    next auth / verify / 5h refresh — independent of any user action.
    """
    if not features:
        return False
    # The server explicitly states P2P access per request. When the key is
    # present it is authoritative (jaque.sena: nicotine_access=False → no P2P,
    # even though she is a premium-analysis DJ). Only fall back to the
    # membership-slug check when the server didn't send the flag at all.
    val = features.get("nicotine_access")
    if val is not None:
        return bool(val)
    return has_membership_features(features)
