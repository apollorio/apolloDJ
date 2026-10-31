"""Central constants for apolloDJ PRO (v2.0.0).

Single source of truth for version, endpoints, and runtime identifiers.
"""
from __future__ import annotations

APP_ID = "apollodj"
APP_VERSION = "2.0.0"
USER_AGENT = f"apolloDJ/{APP_VERSION}"

# Update manifest (hosted by Apollo WP site)
UPDATES_URL = "https://dj.apollo.rio.br/updates.json"

# Nicotine+ headless bridge default
NICOTINE_PORT = 5000

# Apollo REST base — DO NOT change to the bare ``/a/v1`` form.
# VERIFIED LIVE (2026-06-02) + PHP audit (2026-06): the apollo-login plugin
# registers its REST routes under the WordPress namespace ``apollo/v1``;
# production resolves them ONLY at ``/wp-json/apollo/v1/...``:
#     POST /a/v1/app/auth            → 404 (HTML page, no REST route)
#     POST /wp-json/apollo/v1/app/auth → 200 (token issued, auth OK)
# The legacy frozen ``ApolloClient`` picks this value up via the
# ``APOLLO_API_BASE`` env var set in ``auth_gate._load_apollo_client_class``.
API_BASE = "https://apollo.rio.br/wp-json/apollo/v1"

# Token / device headers expected by registry v6.6.0
AUTH_HEADER = "X-Apollo-App-Token"
DEVICE_HEADER = "X-Apollo-Device-Id"

# Default daily limits / feature flags (fallback when server unreachable)
DEFAULT_DAILY_LIMIT = 50
DEFAULT_MIN_ACCURACY = 85