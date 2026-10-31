"""Bridge for update status and release notes.

Also exposes boot lock-screen decision for "Versão Floppada" mode.
"""
from __future__ import annotations

from ..boot.update_check import check_for_updates, get_boot_gate


class UpdateBridge:
    def check_now(self) -> dict:
        info = check_for_updates()
        if info:
            return {
                "update_available": True,
                "version": info.latest_version,
                "url": info.download_setup_url,
                "notes": info.release_notes,
                "mandatory": info.mandatory,
            }
        return {"update_available": False}

    def boot_gate(self) -> dict:
        """Return boot decision (continue or lock-screen)."""
        return get_boot_gate()