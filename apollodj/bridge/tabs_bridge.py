"""Bridge exposing tab visibility to the frontend."""
from __future__ import annotations

from ..gating.tabs import visible_tabs as _visible_tabs


class TabsBridge:
    def visible_tabs(self, features: dict) -> list[str]:
        """Return the list of tabs the current user should see."""
        return _visible_tabs(features)