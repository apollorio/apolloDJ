"""Extract [Mix/Edit] information from filename or metadata tags.

Used to build the canonical filename: Artist - Title [Mix/Edit] - BPM - Key.ext
"""
from __future__ import annotations

import re
from typing import Optional

# Common mix/edit suffixes we care about
MIX_PATTERNS = [
    r"\[(Extended Mix|Radio Edit|Club Mix|Original Mix|Dub Mix|VIP Mix|Instrumental|Acapella)\]",
    r"\((Extended Mix|Radio Edit|Club Mix|Original Mix|Dub Mix|VIP Mix|Instrumental|Acapella)\)",
    r"(Extended Mix|Radio Edit|Club Mix|Original Mix|Dub Mix|VIP Mix)",
]


def extract(filename: str, mutagen_tags: Optional[dict] = None) -> Optional[str]:
    """Return a clean mix/edit label if found, otherwise None."""
    # 1. Try filename first (most reliable for DJs)
    for pattern in MIX_PATTERNS:
        m = re.search(pattern, filename, re.IGNORECASE)
        if m:
            label = m.group(1) or m.group(0).strip("[]()")
            return label.title()

    # 2. Fallback to common mutagen tags
    if mutagen_tags:
        for key in ("version", "subtitle", "remixer", "mixname"):
            val = mutagen_tags.get(key)
            if val and isinstance(val, str):
                for pattern in MIX_PATTERNS:
                    m = re.search(pattern, val, re.IGNORECASE)
                    if m:
                        label = m.group(1) or m.group(0).strip("[]()")
                        return label.title()

    return None