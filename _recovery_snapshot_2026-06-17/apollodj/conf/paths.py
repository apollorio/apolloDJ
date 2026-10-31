"""Canonical path layout for apolloDJ PRO on Windows — pt-BR premium edition.

Folder skeleton created at boot by :func:`ensure_paths` under ``~/apolloDJ/``:

    Tracks/
        Baixando/                            ← Nicotine+ active downloads (backend downloaddir)
        0. Em Análise/                       ← Intermédio — staging before pipeline commit
        Coletânea/                           ← MASTER LIBRARY (single source of truth)
        2. Duvidosos/                        ← rejected by quality gate
            1. Arquivo duvidoso/
            2. Download falhado/             ← Nicotine+ failures
            3. Falha de amplificação/        ← LUFS / headroom / clipping
        1. Relatórios/                       ← per-track PDF/HTML/CSV analyses
        3. Transferências/                   ← Nicotine+ in-progress downloads
    Playlists/                               ← unified XML + RB + Serato + CDJ
    Pendrives/                               ← USB health/speed registry
        pendrives-registrados.csv            ← history log
        drives.json                          ← live drive snapshot
        Exportados/                          ← per-drive export bundles
    Caixa de Entrada/                        ← Inbox (drops + Nicotine+ watcher)
        Nicotine/
        PlaylistImports/
    Dados/                                   ← cache + DB + analyses (FAST PATH)
        impressoes-digitais.db               ← fingerprint-first dedup DB
        espectrogramas/                      ← spectrogram + waveform PNGs
        temp_wav/                            ← pipeline tmp working files
        analises/                            ← dj_prep_pro + spectral JSONs
    Registros/                               ← all logs
        processing.log
        errors.log
        audits.log
        all_logs.csv                         ← CSV roll-up for analysis
    Relatórios/                              ← global CSV/XLSX rollups
    Configurações/                           ← config + backups + preferences
        config.ini
        backups/
        preferencias.xlsx

Compatibility note
──────────────────
All historical variable names (`TRACKS_COLETANEA_DIR`, `CACHE_DIR`, `LOGS_DIR`,
`INBOX_DIR`, `CONFIG_DIR`, etc.) are preserved — only the path *values* change.
Callers (pipeline, watcher, usb_exporter, …) keep working without edits.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Final, Optional

# Base directory: ~/apolloDJ
APOLLO_BASE: Final[Path] = Path.home() / "apolloDJ"

# ── Tracks/ ──────────────────────────────────────────────────────────────────
TRACKS_DIR: Final[Path] = APOLLO_BASE / "Tracks"
TRACKS_ANALISE_DIR: Final[Path] = TRACKS_DIR / "0. Em Análise"
TRACKS_COLETANEA_DIR: Final[Path] = TRACKS_DIR / "Coletânea"
TRACKS_DUVIDOSOS_DIR: Final[Path] = TRACKS_DIR / "2. Duvidosos"
TRACKS_DUV_ARQUIVO_DIR: Final[Path] = TRACKS_DUVIDOSOS_DIR / "1. Arquivo duvidoso"
TRACKS_DUV_DOWNLOAD_DIR: Final[Path] = TRACKS_DUVIDOSOS_DIR / "2. Download falhado"
TRACKS_DUV_AMP_DIR: Final[Path] = TRACKS_DUVIDOSOS_DIR / "3. Falha de amplificação"
TRACKS_RELATORIOS_DIR: Final[Path] = TRACKS_DIR / "1. Relatórios"
TRACKS_TRANSFERENCIAS_DIR: Final[Path] = TRACKS_DIR / "3. Transferências"
# Nicotine+ download routing (backend-only flow)
TRACKS_BAIXANDO_DIR: Final[Path] = TRACKS_DIR / "Baixando"
TRACKS_INTERMEDIIO_DIR: Final[Path] = TRACKS_ANALISE_DIR

# ── Playlists/ ───────────────────────────────────────────────────────────────
PLAYLISTS_DIR: Final[Path] = APOLLO_BASE / "Playlists"
# Master XML SSOT "heart" (Rekordbox-style export source — ApolloXMLStore).
APOLLO_LIBRARY_XML: Final[Path] = PLAYLISTS_DIR / "apollo_library.xml"

# ── Pendrives/ ───────────────────────────────────────────────────────────────
PENDRIVES_DIR: Final[Path] = APOLLO_BASE / "Pendrives"
PENDRIVES_REGISTRY_CSV: Final[Path] = PENDRIVES_DIR / "pendrives-registrados.csv"
PENDRIVES_DRIVES_JSON: Final[Path] = PENDRIVES_DIR / "drives.json"
PENDRIVES_EXPORTADOS_DIR: Final[Path] = PENDRIVES_DIR / "Exportados"
# Roadmap (f3 integration) clean aliases — same files, shorter names.
PENDRIVES_CSV: Final[Path] = PENDRIVES_REGISTRY_CSV
PENDRIVES_JSON: Final[Path] = PENDRIVES_DRIVES_JSON

# ── Caixa de Entrada/ (a.k.a. Inbox — variable name kept for backward compat) ─
INBOX_DIR: Final[Path] = APOLLO_BASE / "Caixa de Entrada"
INBOX_NICOTINE_DIR: Final[Path] = INBOX_DIR / "Nicotine"
INBOX_PLAYLIST_DIR: Final[Path] = INBOX_DIR / "PlaylistImports"

# ── Dados/ (a.k.a. Cache — single fast path for caches + DBs + analyses) ─────
CACHE_DIR: Final[Path] = APOLLO_BASE / "Dados"
TEMP_WAV_DIR: Final[Path] = CACHE_DIR / "temp_wav"
SPECTROGRAM_DIR: Final[Path] = CACHE_DIR / "espectrogramas"
ANALYSIS_CACHE_DIR: Final[Path] = CACHE_DIR / "analises"
FINGERPRINTS_DB: Final[Path] = CACHE_DIR / "impressoes-digitais.db"
# DB lives inside Dados/ (no separate Database/ folder anymore).
DB_DIR: Final[Path] = CACHE_DIR

# ── Registros/ (a.k.a. Logs) — flat files, no per-bucket sub-folders ─────────
LOGS_DIR: Final[Path] = APOLLO_BASE / "Registros"
LOGS_PROCESSING_FILE: Final[Path] = LOGS_DIR / "processing.log"
LOGS_ERRORS_FILE: Final[Path] = LOGS_DIR / "errors.log"
LOGS_AUDITS_FILE: Final[Path] = LOGS_DIR / "audits.log"
LOGS_ALL_CSV: Final[Path] = LOGS_DIR / "all_logs.csv"
# Backward-compat aliases (old callers expected per-bucket sub-dirs).
LOGS_PROCESSING_DIR: Final[Path] = LOGS_DIR
LOGS_ERRORS_DIR: Final[Path] = LOGS_DIR
LOGS_AUDITS_DIR: Final[Path] = LOGS_DIR

# ── Relatórios/ (top-level rollups, separate from Tracks/1. Relatórios) ──────
RELATORIOS_DIR: Final[Path] = APOLLO_BASE / "Relatórios"

# ── Configurações/ (a.k.a. Config) ───────────────────────────────────────────
CONFIG_DIR: Final[Path] = APOLLO_BASE / "Configurações"
CONFIG_INI_FILE: Final[Path] = CONFIG_DIR / "config.ini"
CONFIG_BACKUPS_DIR: Final[Path] = CONFIG_DIR / "backups"
PREFERENCES_XLSX: Final[Path] = CONFIG_DIR / "preferencias.xlsx"
# Mirrors JS localStorage key ``apollodj.computador.v1`` (Coletânea Library UI).
COMPUTADOR_PREFS_FILE: Final[Path] = CONFIG_DIR / "computador.v1.json"

# ── Nicotine+ / Soulseek backend (locked headless) ───────────────────────────
# Linux server equivalent of ``/secure/apollo_backend.conf``.
NICOTINE_DIR: Final[Path] = CONFIG_DIR / "nicotine"
APOLLO_BACKEND_CONF: Final[Path] = NICOTINE_DIR / "apollo_backend.conf"
NICOTINE_CREDENTIAL_FILE: Final[Path] = NICOTINE_DIR / "credential.json"
NICOTINE_DATA_HOME: Final[Path] = NICOTINE_DIR / "data"
# Legacy path kept for migration only.
NICOTINE_LEGACY_CONFIG: Final[Path] = NICOTINE_DIR / "config"


# ── Folder skeleton creation ─────────────────────────────────────────────────

_DIRS_TO_CREATE: Final[tuple[Path, ...]] = (
    APOLLO_BASE,
    TRACKS_DIR,
    TRACKS_ANALISE_DIR,
    TRACKS_COLETANEA_DIR,
    TRACKS_DUVIDOSOS_DIR,
    TRACKS_DUV_ARQUIVO_DIR,
    TRACKS_DUV_DOWNLOAD_DIR,
    TRACKS_DUV_AMP_DIR,
    TRACKS_RELATORIOS_DIR,
    TRACKS_TRANSFERENCIAS_DIR,
    TRACKS_BAIXANDO_DIR,
    PLAYLISTS_DIR,
    PENDRIVES_DIR,
    PENDRIVES_EXPORTADOS_DIR,
    INBOX_DIR,
    INBOX_NICOTINE_DIR,
    INBOX_PLAYLIST_DIR,
    CACHE_DIR,
    TEMP_WAV_DIR,
    SPECTROGRAM_DIR,
    ANALYSIS_CACHE_DIR,
    LOGS_DIR,
    RELATORIOS_DIR,
    CONFIG_DIR,
    CONFIG_BACKUPS_DIR,
    NICOTINE_DIR,
    NICOTINE_DATA_HOME,
)


def ensure_paths() -> None:
    """Create the full apolloDJ folder skeleton if missing.

    Called once at boot (``main.py``) and before any ingest operation.
    Safe to call repeatedly — every ``mkdir`` uses ``exist_ok=True``.
    """
    for d in _DIRS_TO_CREATE:
        d.mkdir(parents=True, exist_ok=True)

    # Hide the base folder on Windows (cosmetic, non-fatal).
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.kernel32.SetFileAttributesW(str(APOLLO_BASE), 2)  # HIDDEN
        except Exception:
            pass


def get_track_path(filename: str) -> Path:
    """Return full path under ``Coletânea/`` for a given canonical filename."""
    return TRACKS_COLETANEA_DIR / filename


# ── Hard-locked library root (single source of truth for the UI) ─────────────

#: The one canonical path the Computador/Library section may ever use.
LIBRARY_ROOT: Final[Path] = TRACKS_COLETANEA_DIR


def validate_library_path(path: str) -> dict:
    """Strict validation — only Coletânea (and anything inside it) is allowed.

    Called by ``IngestBridge.validate_drop_path`` before every drop, folder-add,
    or playlist reference.  Returns ``{"valid": True, "path": str(LIBRARY_ROOT)}``
    on success so callers always get the canonical resolved path back, not
    whatever the user typed.
    """
    try:
        p = Path(path).expanduser().resolve()
        root = LIBRARY_ROOT.resolve()
        if p == root or str(p).startswith(str(root) + os.sep) or str(p).startswith(str(root) + "/"):
            return {"valid": True, "path": str(root)}
        return {
            "valid": False,
            "error": (
                "Apenas a pasta ~/apolloDJ/Tracks/Coletânea é permitida "
                "como biblioteca principal."
            ),
        }
    except Exception:
        return {"valid": False, "error": "Caminho inválido."}


def get_cache_path() -> Path:
    """Return the main SHA256 cache file location (inside ``Dados/``)."""
    return CACHE_DIR / "tracks.json"


# ── Legacy `_superseeded/` resolver (works in dev + frozen exe) ──────────────

def legacy_root() -> Optional[Path]:
    """Return the directory that holds the `_superseeded/` legacy tree.

    Resolution order:
      1) PyInstaller _MEIPASS / "_legacy"          — frozen exe (bundled subset)
      2) project root / "_superseeded"             — development tree (full)
      3) None                                       — caller must handle
    """
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        p = Path(meipass) / "_legacy"
        if p.is_dir():
            return p
    here = Path(__file__).resolve()
    candidate = here.parents[3] / "_superseeded"
    if candidate.is_dir():
        return candidate
    return None


def legacy_file(*rel_parts: str) -> Optional[Path]:
    """Locate a specific file inside `_superseeded/` (or bundled `_legacy/`).

    Example::

        legacy_file("apolloDJ-exe", "core", "apollo_client.py")
        → dev:    build/_superseeded/apolloDJ-exe/core/apollo_client.py
        → frozen: <MEIPASS>/_legacy/apolloDJ-exe/core/apollo_client.py
    """
    root = legacy_root()
    if root is None:
        return None
    target = root.joinpath(*rel_parts)
    return target if target.is_file() else None
