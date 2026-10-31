"""Real (non-simulated) library + workspace data for the apolloDJ shell.

Pure functions returning plain dicts (the bridge serialises to JSON). None of
them ever raise to the caller; on failure they return ``{"ok": False, ...}``.

  scan_folder(path)          → audio files inside a user "workspace" folder
  list_library(...)          → analyzed tracks in Coletânea (+ sidecars)
  report_stats(...)          → real counts derived from the filesystem
  list_computer_folders()    → COMPUTADOR section (defaults + user prefs)
  save_computer_folders(...) → persist COMPUTADOR prefs under Configurações/
  add_path_to_playlist(...)  → validate + enqueue ingest (v2 queue or v1 watcher)
"""
from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from ..conf.atomic import atomic_write_text
from ..conf.paths import (
    COMPUTADOR_PREFS_FILE,
    PENDRIVES_REGISTRY_CSV,
    TRACKS_COLETANEA_DIR,
    TRACKS_DUV_AMP_DIR,
    TRACKS_DUV_ARQUIVO_DIR,
    TRACKS_DUV_DOWNLOAD_DIR,
    ensure_paths,
)
from . import sidecar

logger = logging.getLogger(__name__)

AUDIO_EXTS = {".wav", ".flac", ".aif", ".aiff", ".mp3", ".m4a", ".aac", ".ogg"}
SCAN_CAP = 5000

_COMPUTADOR_DEFAULTS: tuple[dict[str, str], ...] = (
    {"id": "downloads", "label": "Downloads", "icon": "ri-download-2-line", "path": "~/Downloads"},
    {"id": "music", "label": "Músicas", "icon": "ri-music-2-line", "path": "~/Music"},
)


def _resolve_user_path(path_str: str) -> Path:
    return Path(path_str).expanduser().resolve()


def _default_music_path() -> str:
    """Return ~/Music, falling back to ~/Músicas on localized Windows."""
    home = Path.home()
    for candidate in (home / "Music", home / "Músicas"):
        if candidate.is_dir():
            return str(candidate)
    return str(home / "Music")


def _folder_warn(resolved: Path) -> dict[str, str] | None:
    if not resolved.exists():
        return {"msg": "Pasta não encontrada neste computador."}
    if not resolved.is_dir():
        return {"msg": "Caminho não é uma pasta válida."}
    try:
        next(resolved.iterdir())
    except PermissionError:
        return {"msg": "Sem permissão para ler esta pasta."}
    except OSError as exc:
        return {"msg": f"Não foi possível acessar a pasta ({exc})."}
    return None


def load_computer_prefs() -> dict[str, Any]:
    ensure_paths()
    if not COMPUTADOR_PREFS_FILE.is_file():
        return {}
    try:
        data = json.loads(COMPUTADOR_PREFS_FILE.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_computer_folders(prefs: dict[str, Any]) -> dict[str, Any]:
    """Persist COMPUTADOR prefs (mirrors JS ``apollodj.computador.v1``)."""
    try:
        ensure_paths()
        payload = prefs if isinstance(prefs, dict) else {}
        atomic_write_text(
            COMPUTADOR_PREFS_FILE,
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return {"ok": True}
    except Exception as exc:
        logger.warning("save_computer_folders failed: %s", exc)
        return {"ok": False, "error": str(exc)}


def list_computer_folders() -> dict[str, Any]:
    """Return COMPUTADOR folder rows for the Coletânea Library UI."""
    prefs = load_computer_prefs()
    hidden: dict[str, bool] = prefs.get("hidden") if isinstance(prefs.get("hidden"), dict) else {}
    added: list[dict] = prefs.get("added") if isinstance(prefs.get("added"), list) else []

    folders: list[dict[str, Any]] = []
    for d in _COMPUTADOR_DEFAULTS:
        path_str = _default_music_path() if d["id"] == "music" else d["path"]
        resolved = _resolve_user_path(path_str)
        folders.append({
            "id": d["id"],
            "label": d["label"],
            "icon": d["icon"],
            "path": str(resolved),
            "hidden": bool(hidden.get(d["id"], False)),
            **({"warn": warn} if (warn := _folder_warn(resolved)) else {}),
        })

    for i, entry in enumerate(added):
        if not isinstance(entry, dict):
            continue
        fid = str(entry.get("id") or f"fixa-{i}")
        path_str = str(entry.get("path") or "")
        if not path_str:
            continue
        try:
            resolved = _resolve_user_path(path_str)
        except Exception:
            resolved = Path(path_str)
        folders.append({
            "id": fid,
            "label": str(entry.get("label") or resolved.name or path_str),
            "icon": "ri-folder-2-line",
            "path": str(resolved),
            "hidden": bool(hidden.get(fid, False)),
            **({"warn": warn} if (warn := _folder_warn(resolved)) else {}),
        })

    return {"folders": folders}


def _collect_audio_paths(base: Path, *, recursive: bool = True) -> list[Path]:
    paths: list[Path] = []
    if base.is_file():
        return [base] if base.suffix.lower() in AUDIO_EXTS else []
    if not base.is_dir():
        return paths
    try:
        if recursive:
            for root, _dirs, files in os.walk(base):
                for fn in files:
                    p = Path(root) / fn
                    if p.suffix.lower() in AUDIO_EXTS:
                        paths.append(p)
                        if len(paths) >= SCAN_CAP:
                            return paths
        else:
            for p in base.iterdir():
                if p.is_file() and p.suffix.lower() in AUDIO_EXTS:
                    paths.append(p)
    except OSError as exc:
        logger.warning("_collect_audio_paths %s: %s", base, exc)
    return paths


def _run_v1_watcher(paths: list[Path]) -> None:
    from .watcher import process_file

    for p in paths:
        try:
            process_file(p)
        except Exception as exc:
            logger.warning("add_path_to_playlist watcher failed for %s: %s", p, exc)


def _try_enqueue_v2(paths: list[Path], playlist_view: str | None) -> list[str]:
    from .queue_boot import enqueue_path

    job_ids: list[str] = []
    for p in paths:
        job_id = enqueue_path(str(p), target_playlist=playlist_view)
        if job_id:
            job_ids.append(job_id)
    return job_ids


def add_path_to_playlist(path: str, playlist_view: str | None = None) -> dict[str, Any]:
    """Validate a COMPUTADOR path and enqueue ingest (non-blocking).

    Returns ``{"ok": True, "job_id": str, "warn"?: {...}}`` or
    ``{"ok": False, "error": str}``.
    """
    if not path or not str(path).strip():
        return {"ok": False, "error": "Caminho vazio."}

    try:
        resolved = _resolve_user_path(str(path).strip())
    except Exception:
        return {"ok": False, "error": "Caminho inválido."}

    if not resolved.exists():
        return {"ok": False, "error": "Arquivo ou pasta não encontrado."}

    audio_paths = _collect_audio_paths(resolved, recursive=resolved.is_dir())
    if not audio_paths:
        return {
            "ok": False,
            "error": "Nenhum arquivo de áudio suportado encontrado neste caminho.",
        }

    warn: dict[str, str] | None = None
    if len(audio_paths) >= SCAN_CAP:
        warn = {"msg": f"Mais de {SCAN_CAP} faixas; apenas as primeiras serão enfileiradas."}

    job_ids = _try_enqueue_v2(audio_paths, playlist_view)
    if not job_ids:
        batch_id = str(uuid.uuid4())
        threading.Thread(
            target=_run_v1_watcher,
            args=(audio_paths,),
            daemon=True,
            name=f"apollodj-ingest-{batch_id[:8]}",
        ).start()
        job_ids = [batch_id]

    out: dict[str, Any] = {"ok": True, "job_id": job_ids[0]}
    if len(job_ids) > 1:
        out["job_ids"] = job_ids
        out["queued"] = len(job_ids)
    if warn:
        out["warn"] = warn
    if playlist_view:
        out["playlist_view"] = playlist_view
    return out


def _fmt_duration(seconds: float | None) -> str:
    if not seconds or seconds <= 0:
        return ""
    s = int(round(seconds))
    return f"{s // 60:02d}:{s % 60:02d}"


def _read_audio_meta(path: Path) -> dict[str, Any]:
    """Best-effort tags + duration via mutagen (graceful if mutagen missing)."""
    title = artist = duration = ""
    try:
        from mutagen import File as MutagenFile  # type: ignore

        m = MutagenFile(str(path))
        if m is not None:
            if getattr(m, "info", None) is not None:
                duration = _fmt_duration(getattr(m.info, "length", 0))
            tags = getattr(m, "tags", None)
            if tags:
                def _first(*keys: str) -> str:
                    for k in keys:
                        try:
                            v = tags.get(k)
                        except Exception:
                            v = None
                        if v:
                            return str(v[0] if isinstance(v, list) else v)
                    return ""

                title = _first("TIT2", "title", "\xa9nam")
                artist = _first("TPE1", "artist", "\xa9ART")
    except Exception:
        pass
    return {"title": title, "artist": artist, "duration": duration}


def _track_obj(path: Path, *, analyzed: bool, analysis: dict | None = None) -> dict[str, Any]:
    meta = _read_audio_meta(path)
    try:
        mtime = datetime.fromtimestamp(path.stat().st_mtime).strftime("%d/%m/%y")
    except Exception:
        mtime = ""
    obj: dict[str, Any] = {
        "path": str(path),
        "name": path.name,
        "title": meta["title"] or path.stem,
        "artist": meta["artist"],
        "comment": "",
        "ext": path.suffix.lstrip(".").upper(),
        "duration": meta["duration"],
        "bpm": None,
        "key": None,
        "energy": None,
        "lufs": None,
        "quality": None,
        "date": mtime,
        "analyzed": analyzed,
    }
    if analysis:
        a = analysis
        obj["bpm"] = a.get("bpm")
        obj["key"] = a.get("key") or a.get("camelot")
        obj["energy"] = a.get("energy") if a.get("energy") is not None else a.get("energy_score")
        obj["lufs"] = a.get("lufs") if a.get("lufs") is not None else a.get("loudness_lufs")
        obj["quality"] = a.get("verdict") or a.get("quality")
    return obj


def scan_folder(path: str, *, max_files: int = SCAN_CAP) -> dict[str, Any]:
    base = Path(path)
    if not base.is_dir():
        return {"ok": False, "path": str(path), "tracks": [], "error": "not_a_folder"}
    tracks: list[dict] = []
    try:
        for root, _dirs, files in os.walk(base):
            for fn in files:
                if Path(fn).suffix.lower() in AUDIO_EXTS:
                    tracks.append(_track_obj(Path(root) / fn, analyzed=False))
                    if len(tracks) >= max_files:
                        return {"ok": True, "path": str(base), "tracks": tracks, "capped": True}
    except Exception as exc:
        return {"ok": False, "path": str(base), "tracks": tracks, "error": str(exc)}
    return {"ok": True, "path": str(base), "tracks": tracks}


def list_library(coletanea_dir: Path | None = None) -> dict[str, Any]:
    base = Path(coletanea_dir) if coletanea_dir else TRACKS_COLETANEA_DIR
    tracks: list[dict] = []
    if not base.is_dir():
        return {"ok": True, "tracks": tracks}
    try:
        for f in sorted(base.iterdir()):
            if f.is_file() and f.suffix.lower() in AUDIO_EXTS:
                sc = sidecar.read(f) or {}
                analysis = sc.get("analysis") if isinstance(sc, dict) else {}
                tracks.append(_track_obj(f, analyzed=True, analysis=analysis or {}))
    except Exception as exc:
        return {"ok": False, "tracks": tracks, "error": str(exc)}
    return {"ok": True, "tracks": tracks}


def _count_audio(d: Path) -> int:
    if not d.is_dir():
        return 0
    try:
        return sum(1 for f in d.iterdir()
                   if f.is_file() and f.suffix.lower() in AUDIO_EXTS)
    except Exception:
        return 0


def _dir_bytes(d: Path) -> int:
    total = 0
    if not d.is_dir():
        return 0
    try:
        for f in d.iterdir():
            if f.is_file() and f.suffix.lower() in AUDIO_EXTS:
                total += f.stat().st_size
    except Exception:
        pass
    return total


def _human_gb(nbytes: int) -> str:
    if nbytes <= 0:
        return "0 GB"
    return f"{nbytes / (1024 ** 3):.1f} GB"


def _pendrive_count() -> int:
    if not PENDRIVES_REGISTRY_CSV.is_file():
        return 0
    try:
        lines = [l for l in PENDRIVES_REGISTRY_CSV.read_text(encoding="utf-8").splitlines()
                 if l.strip()]
        return max(0, len(lines) - 1)  # minus header row
    except Exception:
        return 0


def report_stats(period: str = "all", module: str = "geral",
                 *, coletanea_dir: Path | None = None) -> dict[str, Any]:
    col = Path(coletanea_dir) if coletanea_dir else TRACKS_COLETANEA_DIR
    lib = _count_audio(col)
    duv = (_count_audio(TRACKS_DUV_ARQUIVO_DIR)
           + _count_audio(TRACKS_DUV_DOWNLOAD_DIR)
           + _count_audio(TRACKS_DUV_AMP_DIR))
    used = _human_gb(_dir_bytes(col))
    pend = _pendrive_count()

    def row(k: str, v: Any, d: str = "—", p: str = "total") -> dict:
        return {"k": k, "v": v, "d": d, "p": p}

    by_module = {
        "geral": [
            row("Faixas na biblioteca", lib),
            row("Reprovadas (Duvidosos)", duv),
            row("Pendrives registrados", pend),
            row("Espaço usado", used),
        ],
        "downloads": [
            row("Downloads concluídos", 0),
            row("Falhas de download", _count_audio(TRACKS_DUV_DOWNLOAD_DIR)),
        ],
        "pendrive": [
            row("Pendrives registrados", pend),
            row("Faixas na biblioteca", lib),
        ],
        "analise": [
            row("Faixas analisadas", lib),
            row("Reprovadas", duv),
        ],
        "exportar": [
            row("Exportações totais", 0),
        ],
        "conversor": [
            row("Conversões concluídas", 0),
        ],
    }
    rows = by_module.get(module, by_module["geral"])
    return {
        "ok": True,
        "module": module,
        "period": period,
        "rows": rows,
        "empty": lib == 0 and duv == 0 and pend == 0,
    }
