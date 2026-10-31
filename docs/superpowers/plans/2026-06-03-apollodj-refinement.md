# apolloDJ Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all simulated data, make the Computador "+" add/scan real workspace folders, make the Playlists "+" create groups/playlists and drag-to-playlist auto-analyze tracks into `~/apolloDJ/Tracks/Coletânea` (non-destructive copy), and show the title bar (with close) on the login/splash screen.

**Architecture:** A new pure-Python module `apollodj/ingest/library.py` exposes `scan_folder`/`list_library`/`report_stats`; four thin bridge methods on `ApolloApi` (`launcher.py`) serialize them to JSON and are mapped into `window.pyBridge`. The front consumes them via a new async-safe `ApolloStore` helper (preferences-backed persistence + bridge calls). Drag-drop on a playlist calls the existing non-destructive ingest path (`watcher.process_file` → `Coletânea`).

**Tech Stack:** Python 3.11 (stdlib + mutagen, optional), pywebview bridge (async Promise-returning JS API), vanilla JS shell (`theme/screen software/`), CSS.

**Repo note:** This tree is **not** a git repository (`git rev-parse` fails). "Checkpoint" steps below mean *verify the gate passes*, not `git commit`. If the user later runs `git init`, convert checkpoints to commits. **All paths are relative to `C:\Users\User\build\src_002\`.**

**pywebview async note:** `window.pywebview.api.*` methods (and therefore `window.pyBridge.*`) return **Promises**. All bridge reads MUST be awaited / `.then()`-ed. `ApolloStore.call()` normalizes this (`Promise.resolve(fn())` then `JSON.parse`). Existing code that does `JSON.parse(pyBridge.x())` synchronously is a latent bug that silently falls back — do not copy that pattern.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `apollodj/ingest/library.py` | Real folder scan + Coletânea listing + report counts | **Create** |
| `_test_library.py` (src_002 root) | Standalone asserts for `library.py` | **Create** |
| `registry.json` | Register `library.py` (orphan-check) | Modify |
| `apolloDJ.spec` | Register `apollodj.ingest.library` (spec-check) | Modify |
| `apollodj/installer_ui/launcher.py` | 4 bridge methods + pyBridge mapping | Modify |
| `theme/screen software/v1/shared.js` | `ApolloStore` helper + `trackRows` tolerance | Modify |
| `theme/screen software/v2/coletanea-lib.js` | Computador + Playlists from store, "+" handlers, real data source | **Rewrite** |
| `theme/screen software/v3/biblioteca-dnd.js` | Drop → ingest/add to playlist | Modify (drop fns) |
| `theme/screen software/v1/relatorios.js` | Real stats + empty state | **Rewrite** |
| `theme/screen software/v1/inicio.js` | Wire tiles to real counts | Modify |
| `theme/screen software/v3/shell-chrome.css` | Title bar visible at auth stage | Modify |
| `theme/screen software/apolloDJ.v2.html` | Zero out populated `VIEWS_IDX` | Modify |

---

## Task 1: Backend — `apollodj/ingest/library.py` (+ standalone test)

**Files:**
- Create: `apollodj/ingest/library.py`
- Create: `_test_library.py`

- [ ] **Step 1: Write the failing test** — Create `_test_library.py`:

```python
"""Standalone smoke test for apollodj.ingest.library (no pytest needed).
Run from src_002:  python _test_library.py   → exit 0 = pass, raises on failure.
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from apollodj.ingest import library  # noqa: E402


def test_scan_folder_finds_audio_recursively_and_ignores_other():
    with tempfile.TemporaryDirectory() as d:
        base = Path(d)
        (base / "a.mp3").write_bytes(b"\x00")
        (base / "b.flac").write_bytes(b"\x00")
        (base / "c.txt").write_text("nope")
        sub = base / "sub"
        sub.mkdir()
        (sub / "deep.wav").write_bytes(b"\x00")
        res = library.scan_folder(str(base))
        assert res["ok"] is True, res
        names = sorted(t["name"] for t in res["tracks"])
        assert names == ["a.mp3", "b.flac", "deep.wav"], names
        for t in res["tracks"]:
            assert t["analyzed"] is False
            assert t["bpm"] is None
            assert t["path"]


def test_scan_folder_missing_dir_returns_not_ok():
    res = library.scan_folder(str(Path(tempfile.gettempdir()) / "nope_apollo_xyz_123"))
    assert res["ok"] is False
    assert res["tracks"] == []


def test_list_library_reads_sidecar_analysis():
    with tempfile.TemporaryDirectory() as d:
        col = Path(d)
        track = col / "Artist - Title - 128 - 8A.flac"
        track.write_bytes(b"\x00")
        sc = track.with_suffix(track.suffix + ".apollodj.json")
        sc.write_text(
            json.dumps({"version": "1.0", "track": track.name,
                        "analysis": {"bpm": 128, "key": "8A", "energy": 7}}),
            encoding="utf-8",
        )
        res = library.list_library(coletanea_dir=col)
        assert res["ok"] is True and len(res["tracks"]) == 1, res
        t = res["tracks"][0]
        assert t["analyzed"] is True
        assert t["bpm"] == 128 and t["key"] == "8A" and t["energy"] == 7


def test_report_stats_counts_library():
    with tempfile.TemporaryDirectory() as d:
        col = Path(d)
        (col / "x.flac").write_bytes(b"\x00")
        (col / "y.mp3").write_bytes(b"\x00")
        res = library.report_stats(module="geral", coletanea_dir=col)
        assert res["ok"] is True
        lib_row = next(r for r in res["rows"] if r["k"] == "Faixas na biblioteca")
        assert lib_row["v"] == 2, res


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    for fn in fns:
        fn()
        print(f"PASS {fn.__name__}")
    print(f"\nOK — {len(fns)} tests passed")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python _test_library.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'apollodj.ingest.library'`

- [ ] **Step 3: Write minimal implementation** — Create `apollodj/ingest/library.py`:

```python
"""Real (non-simulated) library + workspace data for the apolloDJ shell.

Three pure functions, each returning a plain dict (the bridge serialises to
JSON). None of them ever raise to the caller; on failure they return
``{"ok": False, ...}``.

  scan_folder(path)   → audio files inside a user "workspace" folder (recursive)
  list_library(...)   → analyzed tracks in ~/apolloDJ/Tracks/Coletânea (+ sidecars)
  report_stats(...)   → real counts derived from the filesystem (no fake numbers)
"""
from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Any

from ..conf.paths import (
    PENDRIVES_REGISTRY_CSV,
    TRACKS_COLETANEA_DIR,
    TRACKS_DUV_AMP_DIR,
    TRACKS_DUV_ARQUIVO_DIR,
    TRACKS_DUV_DOWNLOAD_DIR,
)
from . import sidecar

AUDIO_EXTS = {".wav", ".flac", ".aif", ".aiff", ".mp3"}
SCAN_CAP = 5000


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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python _test_library.py`
Expected: `PASS test_list_library_reads_sidecar_analysis` … `OK — 4 tests passed` (exit 0)

- [ ] **Step 5: Checkpoint** — `library.py` compiles & tests pass. (No git; just confirm exit 0.)

---

## Task 2: Register `library.py` in registry + spec (keep audits green)

**Files:**
- Modify: `registry.json` (modules.ingest array)
- Modify: `apolloDJ.spec` (hiddenimports)

- [ ] **Step 1: Add to `registry.json`** — find the `"ingest": [` array (line ~155) and insert `"library.py",` immediately after the `"sidecar.py",` line:

Old:
```json
      "sidecar.py",
      "watcher.py",
```
New:
```json
      "sidecar.py",
      "library.py",
      "watcher.py",
```

- [ ] **Step 2: Add to `apolloDJ.spec` hiddenimports** — after the `"apollodj.ingest.sidecar",` line (~118):

Old:
```python
        "apollodj.ingest.sidecar",
        "apollodj.ingest.watcher",
```
New:
```python
        "apollodj.ingest.sidecar",
        "apollodj.ingest.library",
        "apollodj.ingest.watcher",
```

- [ ] **Step 3: Run the structure audit**

Run: `python _audit_001.py`
Expected: exit 0; section `[1] ORPHAN .py FILES` does **not** list `ingest/library.py`; section `[2] MODULES ON DISK MISSING FROM apolloDJ.spec` does **not** list `apollodj.ingest.library`.

- [ ] **Step 4: Checkpoint** — audit green with the new module registered.

---

## Task 3: Bridge methods + pyBridge mapping (`launcher.py`)

**Files:**
- Modify: `apollodj/installer_ui/launcher.py` (add 4 methods to `ApolloApi`; extend the pyBridge method list in `_inject_shell_boot`)

- [ ] **Step 1: Add bridge methods to `ApolloApi`** — insert this block right **after** the `get_app_paths` method and before `open_folder_dialog` (around line 599):

```python
    # ── Library + workspace (REAL data — no simulation) ───────────────────────

    def scan_folder(self, path: str) -> str:
        """List real audio files under a user workspace folder (recursive)."""
        from ..ingest.library import scan_folder

        try:
            return json.dumps(scan_folder(str(path)), ensure_ascii=False)
        except Exception as exc:  # never raise into JS
            return json.dumps({"ok": False, "tracks": [], "error": str(exc)})

    def list_library(self) -> str:
        """List analyzed tracks in ~/apolloDJ/Tracks/Coletânea (+ sidecars)."""
        from ..ingest.library import list_library

        try:
            return json.dumps(list_library(), ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"ok": False, "tracks": [], "error": str(exc)})

    def get_report_stats(self, period: str = "all", module: str = "geral") -> str:
        """Real report counts (filesystem-derived). No fabricated deltas."""
        from ..ingest.library import report_stats

        try:
            return json.dumps(report_stats(str(period), str(module)), ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"ok": False, "rows": [], "empty": True, "error": str(exc)})

    def ingest_track(self, path: str) -> str:
        """Non-destructive import: copy → DJ-Prep → pipeline(commit) → Coletânea.
        The original file at ``path`` is never deleted (watcher copies it into
        ``0. Em Análise`` first). Returns the resulting library Track read back
        from its sidecar so the UI can attach it to a playlist."""
        try:
            result = self.ingest.ingest_track(str(path))
        except Exception as exc:
            return json.dumps({"ok": False, "error": str(exc)})
        if not result.get("success"):
            return json.dumps({"ok": False, "error": result.get("error", "ingest_failed")})
        final = result.get("final_path")
        track = None
        if final:
            from ..ingest import sidecar as _sc
            from ..ingest.library import _track_obj

            p = Path(final)
            sc = _sc.read(p) or {}
            analysis = sc.get("analysis") if isinstance(sc, dict) else {}
            track = _track_obj(p, analyzed=True, analysis=analysis or {})
        return json.dumps({"ok": True, "final_path": final, "track": track}, ensure_ascii=False)
```

- [ ] **Step 2: Map the new methods into `window.pyBridge`** — in `_inject_shell_boot`, extend the method-name list (currently ends `...'nicotine_pause_all']`):

Old:
```python
        "'nicotine_search','nicotine_status','nicotine_download','nicotine_get_downloads','nicotine_pause_all']"
```
New:
```python
        "'nicotine_search','nicotine_status','nicotine_download','nicotine_get_downloads','nicotine_pause_all',"
        "'scan_folder','list_library','get_report_stats','ingest_track']"
```

- [ ] **Step 3: Verify import + smoke boot**

Run: `python -c "import apollodj.installer_ui.launcher as l; a=l.ApolloApi(); print(a.get_report_stats('all','geral')[:60]); print('OK')"`
Expected: prints a JSON fragment beginning `{"ok": true,` then `OK` (exit 0).

- [ ] **Step 4: Run the full smoke + functional gates**

Run: `python smoke_verify.py` then `python _audit_001_functional.py`
Expected: both exit 0 (no regressions from the added methods).

- [ ] **Step 5: Checkpoint** — bridge live, audits green.

---

## Task 4: `ApolloStore` helper + `trackRows` tolerance (`v1/shared.js`)

**Files:**
- Modify: `theme/screen software/v1/shared.js`

- [ ] **Step 1: Make `trackRows` tolerant of empty (unanalyzed) fields** — replace the `qlt:` ternary inside `window.trackRows` (currently lines ~68-70):

Old:
```javascript
    qlt: tr.q === 'ok'
      ? `<span class="tag tag-ok tag-qlt">OK</span>`
      : `<span class="tag tag-warn tag-qlt">!</span>`
```
New:
```javascript
    qlt: tr.q === 'ok'
      ? `<span class="tag tag-ok tag-qlt">OK</span>`
      : tr.q === 'warn'
        ? `<span class="tag tag-warn tag-qlt">!</span>`
        : `<span class="mono muted">—</span>`
```

- [ ] **Step 2: Append the `ApolloStore` helper** — add at the very end of `shared.js` (after the `ApolloUserPrefs.init()` block):

```javascript
/* ════════════════════════════════════════════════════════════
   ApolloStore — async-safe persistence + bridge calls
   - Preferences are loaded ONCE (async) then served synchronously from cache.
   - All pyBridge methods return Promises (pywebview); call() normalizes them.
════════════════════════════════════════════════════════════ */
window.ApolloStore = (function () {
  'use strict';
  var cache = null;
  var ready = null;

  function _bridge(name) {
    return (window.pyBridge && typeof window.pyBridge[name] === 'function')
      ? window.pyBridge[name] : null;
  }
  function _invoke(fn, args) {
    try { return Promise.resolve(fn.apply(null, args || [])); }
    catch (e) { return Promise.resolve(null); }
  }
  function init() {
    if (ready) return ready;
    var get = _bridge('get_user_preferences');
    if (get) {
      ready = _invoke(get, []).then(function (raw) {
        try { cache = JSON.parse(raw || '{}'); } catch (e) { cache = {}; }
        cache = cache || {};
        return cache;
      });
    } else {
      try { cache = JSON.parse(localStorage.getItem('apDJ_store') || '{}'); }
      catch (e) { cache = {}; }
      cache = cache || {};
      ready = Promise.resolve(cache);
    }
    return ready;
  }
  function _prefs() { return cache || (cache = {}); }
  function _persist(key, value) {
    _prefs()[key] = value;
    var set = _bridge('set_user_preference');
    if (set) { _invoke(set, [key, JSON.stringify(value)]); }
    else { try { localStorage.setItem('apDJ_store', JSON.stringify(_prefs())); } catch (e) {} }
  }
  function workspaceFolders() {
    var f = _prefs().workspace_folders;
    return Array.isArray(f) ? f : [];
  }
  function setWorkspaceFolders(list) { _persist('workspace_folders', list || []); }
  function playlistStore() {
    var s = _prefs().playlist_store || {};
    return { groups: s.groups || [], playlists: s.playlists || [], favorites: s.favorites || [] };
  }
  function setPlaylistStore(store) { _persist('playlist_store', store); }
  function call(name) {
    var fn = _bridge(name);
    if (!fn) return Promise.resolve(null);
    var args = Array.prototype.slice.call(arguments, 1);
    return _invoke(fn, args).then(function (raw) {
      if (raw == null) return null;
      if (typeof raw !== 'string') return raw;
      try { return JSON.parse(raw); } catch (e) { return null; }
    });
  }
  return {
    init: init,
    call: call,
    workspaceFolders: workspaceFolders,
    setWorkspaceFolders: setWorkspaceFolders,
    playlistStore: playlistStore,
    setPlaylistStore: setPlaylistStore,
    newId: function (p) { return (p || 'id_') + Math.random().toString(36).slice(2, 8); }
  };
})();
```

- [ ] **Step 3: Verify syntax** — Run: `node -e "new Function(require('fs').readFileSync('theme/screen software/v1/shared.js','utf8')); console.log('shared.js OK')"`
Expected: `shared.js OK` (if `node` unavailable, skip — the functional audit + manual launch covers it).

- [ ] **Step 4: Checkpoint** — `ApolloStore` available; `trackRows` neutral on empty quality.

---

## Task 5: Rewrite `v2/coletanea-lib.js` — real Computador + Playlists

**Files:**
- Modify (full rewrite): `theme/screen software/v2/coletanea-lib.js`

This removes the hardcoded folders (`Music/Downloads/Desktop/D:`) and fake playlists (`Grupo 1/2`, `Playlist A–G`), renders both sections from `ApolloStore`, wires the two "+" buttons, and feeds the table from real `scan_folder`/`list_library`. The pendrive selector (③) and DataTable engine are preserved.

- [ ] **Step 1: Replace the entire file** with:

```javascript
/* ════════════════════════════════════════════════════════════
   coletanea-lib.js — PAGE: Coletânea / Biblioteca
   ① COMPUTADOR  — pastas workspace reais da máquina (escaneadas)
   ② PLAYLISTS   — playlists/grupos persistidos; faixas reais da Coletânea
   ③ EXPORTADO NESTE PENDRIVE — pendrive selector
   NO SIMULATED DATA. Empty until the user adds folders / imports tracks.
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _usbDriveIcon(warn) {
    return '<i class="ri-usb-fill ti' + (warn ? ' pd-ico-warn' : '') + '" aria-hidden="true"></i>';
  }
  function _positionPdMenu(btn, menu) {
    if (!btn || !menu) return;
    var r = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = r.left + 'px';
    menu.style.top = (r.bottom + 3) + 'px';
    menu.style.width = Math.max(r.width, 168) + 'px';
    menu.style.right = 'auto';
    menu.style.zIndex = '9998';
  }
  function _bindPdOptEvents(menu, setSelectedFn, closeFn) {
    menu.querySelectorAll('.pd-select-opt').forEach(function (opt) {
      opt.onclick = function (e) {
        e.stopPropagation();
        setSelectedFn(opt.dataset.path, opt.dataset.label);
        if (closeFn) closeFn();
      };
    });
  }

  /* Map a bridge Track (from scan_folder / list_library) → window.T row shape. */
  function mapBridgeTrack(t) {
    return {
      title: t.title || t.name || '—',
      artist: t.artist || '',
      cmt: t.comment || '',
      gen: '',
      t: t.duration || '',
      bpm: (t.bpm != null ? t.bpm : ''),
      key: (t.key != null ? t.key : ''),
      fmt: t.ext || '',
      cl: false,
      date: t.date || '',
      q: t.quality === 'PASS' ? 'ok' : (t.quality ? 'warn' : ''),
      c: undefined,
      _local: !t.analyzed,
      _analyzed: !!t.analyzed,
      _srcPath: t.analyzed ? null : t.path,
      _libPath: t.analyzed ? t.path : null
    };
  }

  ApolloPages.coletaneaLib = function (mount) {
    /* Registered pendrives (real bridge; empty if none — no SIM). */
    function _registeredPendrives() {
      if (window.pyBridge && typeof window.pyBridge.usb_get_registered === 'function') {
        try { return JSON.parse(window.pyBridge.usb_get_registered() || '[]'); } catch (_) {}
      }
      return [];
    }
    function _pendriveMenuItems(drives) {
      if (!drives.length) return '<div class="pd-select-empty">Nenhum pendrive registrado</div>';
      return drives.map(function (d) {
        var tag = d.tag ? '<span class="pd-select-tag">' + _esc(d.tag) + '</span>' : '';
        return '<button type="button" class="pd-select-opt" role="option" data-path="' + _esc(d.path) + '" data-label="' + _esc(d.label) + '">' +
          _usbDriveIcon(!d.cdj_ok) + '<span class="pd-select-opt-label">' + _esc(d.label) + '</span>' + tag + '</button>';
      }).join('');
    }
    function _bindPendriveDropdown(mount, drivesList, onSelect) {
      var drives = drivesList;
      var wrap = mount.querySelector('#lib-pd-select-wrap');
      var btn = mount.querySelector('#lib-pd-select-btn');
      var menu = mount.querySelector('#lib-pd-select-menu');
      var labelEl = mount.querySelector('.pd-select-label');
      if (!wrap || !btn || !menu) return;
      menu.innerHTML = _pendriveMenuItems(drives);
      function setSelected(path, label) {
        wrap.dataset.value = path || '';
        wrap.classList.toggle('has-drive', !!path);
        if (labelEl) labelEl.textContent = label || 'Selecionar pendrive…';
        menu.querySelectorAll('.pd-select-opt').forEach(function (o) {
          o.classList.toggle('selected', o.dataset.path === path);
        });
        if (typeof onSelect === 'function') onSelect(path);
      }
      function closeMenu() {
        menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); wrap.classList.remove('open');
      }
      btn.onclick = function (e) {
        e.stopPropagation();
        if (menu.hidden) {
          menu.innerHTML = _pendriveMenuItems(drives);
          _bindPdOptEvents(menu, setSelected, closeMenu);
          menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); wrap.classList.add('open');
          _positionPdMenu(btn, menu);
        } else { closeMenu(); }
      };
      if (!wrap.dataset.pdBound) {
        wrap.dataset.pdBound = '1';
        document.addEventListener('click', function () { closeMenu(); });
      }
      if (drives.length) setSelected(drives[0].path, drives[0].label);
      else setSelected('', 'Selecionar pendrive…');
      return { setSelected: setSelected, refresh: function (next) {
        drives = next;
        menu.innerHTML = _pendriveMenuItems(next);
        _bindPdOptEvents(menu, setSelected, closeMenu);
        if (next.length) setSelected(next[0].path, next[0].label);
        else setSelected('', 'Selecionar pendrive…');
      }};
    }

    mount.innerHTML = `
      <div class="pane reveal">
        <aside class="aside">
          <div class="aside-head aside-head-search-only" style="padding:0 8px 8px;">
            <div class="aside-search aside-search-lib">
              <i class="ri-search-line aside-search-ico" aria-hidden="true"></i>
              <input type="text" id="aside-search-inp" class="aside-search-inp" placeholder="Buscar.." autocomplete="off" spellcheck="false">
            </div>
          </div>

          <!-- ① COMPUTADOR — pastas workspace reais -->
          <!-- @fc id=FC-S9-ASIDE-TOP stage=9 mermaid=RT1 py=ingest/library.scan_folder html=#aside-top workspace-folders -->
          <div id="aside-top" style="flex:0 0 130px;min-height:52px;overflow:hidden;display:flex;flex-direction:column;">
            <div class="sec-label first" style="flex-shrink:0;overflow:hidden;">
              <span>Computador</span>
              <div class="sl-acts">
                <i class="ri-add-line" id="ws-add" title="Adicionar pasta" style="cursor:pointer;"></i>
                <i class="ri-more-2-line" id="ws-more" title="Remover pasta selecionada" style="cursor:pointer;"></i>
              </div>
            </div>
            <div id="ws-tree" class="aside-scroll" style="flex:1;overflow-y:auto;overflow-x:hidden;"></div>
          </div>

          <div class="aside-resize-handle" id="aside-drag-wrap"><hr class="aside-drag-hr" id="aside-drag"></div>

          <!-- ② PLAYLISTS — persistidos -->
          <!-- @fc id=FC-S9-ASIDE-MID stage=9 mermaid=RT1 html=#aside-mid playlists=target-playlist -->
          <div id="aside-mid" style="flex:1;min-height:52px;overflow:hidden;display:flex;flex-direction:column;">
            <div class="sec-label first" style="flex-shrink:0;overflow:hidden;">
              <span>Playlists</span>
              <div class="sl-acts">
                <i class="ri-add-line" id="pl-add" title="Nova playlist ou grupo" style="cursor:pointer;"></i>
                <i class="ri-more-2-line"></i>
              </div>
            </div>
            <div id="pl-tree" class="aside-scroll" style="flex:1;overflow-y:auto;overflow-x:hidden;"></div>
          </div>

          <!-- ③ EXPORTADO NESTE PENDRIVE -->
          <div class="aside-resize-handle" id="aside-drag-wrap-2"><hr class="aside-drag-hr" id="aside-drag-2"></div>
          <div id="aside-bot" style="flex:0 0 auto;overflow:hidden;display:flex;flex-direction:column;">
            <div class="sec-label first" style="flex-shrink:0;overflow:hidden;">
              <span>Exportados em..</span>
              <div class="sl-acts"><i class="ri-refresh-line" id="lib-pd-refresh" title="Atualizar lista" style="cursor:pointer;"></i></div>
            </div>
            <div style="padding:0 8px 6px;">
              <div class="pd-select-wrap" id="lib-pd-select-wrap" data-value="">
                <button type="button" class="pd-select-btn" id="lib-pd-select-btn" aria-expanded="false" aria-haspopup="listbox">
                  <i class="ri-usb-fill ti pd-select-ico" aria-hidden="true"></i>
                  <span class="pd-select-label">Selecionar pendrive…</span>
                  <i class="ri-arrow-down-s-line pd-select-caret" aria-hidden="true"></i>
                </button>
                <div class="pd-select-menu" id="lib-pd-select-menu" role="listbox" hidden></div>
              </div>
            </div>
            <div id="lib-pd-list" class="aside-scroll usb-pl-scroll" aria-label="Playlists no pendrive"></div>
          </div>
        </aside>

        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;">
          <section class="content" id="biblio-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;border-radius:var(--r);"></section>
        </div>
      </div>`;

    /* ── Drag divider (COMPUTADOR ↔ PLAYLISTS) ────────────── */
    (function () {
      const asideTop = mount.querySelector('#aside-top');
      const asideMid = mount.querySelector('#aside-mid');
      const dragWrap = mount.querySelector('#aside-drag-wrap') || mount.querySelector('#aside-drag');
      if (!asideTop || !asideMid || !dragWrap) return;
      dragWrap.addEventListener('mousedown', function (e) {
        e.preventDefault();
        const asideEl = dragWrap.parentElement;
        const headH = asideEl.querySelector('.aside-head') ? asideEl.querySelector('.aside-head').offsetHeight : 0;
        const hrH = dragWrap.offsetHeight || 5;
        const totalH = asideEl.clientHeight - headH - hrH;
        const startY = e.clientY;
        const startTop = asideTop.offsetHeight;
        document.body.style.cursor = 's-resize';
        const onMove = ev => {
          const delta = ev.clientY - startY;
          const newTop = Math.max(totalH * 0.10, Math.min(totalH * 0.70, startTop + delta));
          asideTop.style.flex = `0 0 ${newTop}px`;
        };
        const onUp = () => {
          document.body.style.cursor = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    })();

    /* ── Active-table data source ─────────────────────────── */
    function setActiveTracks(list) {
      window.T = list || [];
      DataTable.instances.biblio.rows = buildLibRows();
      DataTable.render('biblio');
    }
    function loadWorkspaceFolder(path) {
      ApolloStore.call('scan_folder', path).then(function (res) {
        var tracks = (res && res.tracks ? res.tracks : []).map(mapBridgeTrack);
        setActiveTracks(tracks);
      });
    }
    function loadLibraryView(viewKey) {
      ApolloStore.call('list_library').then(function (res) {
        var all = (res && res.tracks ? res.tracks : []).map(mapBridgeTrack);
        if (!viewKey || viewKey === 'all') { setActiveTracks(all); return; }
        var store = ApolloStore.playlistStore();
        var pl = store.playlists.filter(function (p) { return p.id === viewKey; })[0];
        var fav = viewKey === 'favorites' ? store.favorites : null;
        var keep = fav || (pl ? pl.tracks : []);
        var keepSet = {};
        (keep || []).forEach(function (p) { keepSet[p] = true; });
        setActiveTracks(all.filter(function (t) { return keepSet[t._libPath]; }));
      });
    }

    /* ── ① Computador tree ────────────────────────────────── */
    function renderWorkspaceTree() {
      var host = mount.querySelector('#ws-tree');
      if (!host) return;
      var folders = ApolloStore.workspaceFolders();
      if (!folders.length) {
        host.innerHTML = '<div style="padding:8px 10px;font-size:11px;color:var(--tx2)">Adicione uma pasta com o botão +</div>';
        return;
      }
      host.innerHTML = folders.map(function (p) {
        return '<div class="tree-node ws-node" data-ws-path="' + _esc(p) + '">' +
          '<i class="ri-folder-3-line ti"></i><span title="' + _esc(p) + '">' + _esc(p) + '</span></div>';
      }).join('');
      host.querySelectorAll('.ws-node').forEach(function (n) {
        n.addEventListener('click', function () {
          mount.querySelectorAll('.tree-node').forEach(function (x) { x.classList.remove('selected'); });
          n.classList.add('selected');
          loadWorkspaceFolder(n.dataset.wsPath);
        });
      });
    }
    function addWorkspaceFolder() {
      ApolloStore.call('open_folder_dialog').then(function (picked) {
        var path = typeof picked === 'string' ? picked : (picked && picked.path) || '';
        if (!path) return;
        var folders = ApolloStore.workspaceFolders();
        if (folders.indexOf(path) === -1) {
          folders.push(path);
          ApolloStore.setWorkspaceFolders(folders);
        }
        renderWorkspaceTree();
        var node = mount.querySelector('.ws-node[data-ws-path="' + path.replace(/"/g, '\\"') + '"]');
        if (node) node.click();
        else loadWorkspaceFolder(path);
      });
    }
    function removeSelectedWorkspaceFolder() {
      var sel = mount.querySelector('#ws-tree .ws-node.selected');
      if (!sel) { if (window.App) App.toast('Selecione uma pasta para remover'); return; }
      var path = sel.dataset.wsPath;
      var folders = ApolloStore.workspaceFolders().filter(function (p) { return p !== path; });
      ApolloStore.setWorkspaceFolders(folders);
      renderWorkspaceTree();
      if (window.App) App.toast('Pasta removida');
    }

    /* ── ② Playlists tree ─────────────────────────────────── */
    function renderPlaylistTree() {
      var host = mount.querySelector('#pl-tree');
      if (!host) return;
      var store = ApolloStore.playlistStore();
      var html = '';
      html += '<div class="tree-node target-playlist" data-pl-id="" data-view="all"><i class="ri-folder-music-line ti"></i><span>Todas as faixas</span></div>';
      html += '<div class="tree-node target-playlist" data-pl-id="favorites" data-view="favorites"><i class="ri-star-line ti"></i><span>Favoritas <span class="ct">' + (store.favorites.length) + '</span></span></div>';
      var grouped = {};
      store.playlists.forEach(function (p) {
        var g = p.group || '__nogroup__';
        (grouped[g] = grouped[g] || []).push(p);
      });
      store.groups.forEach(function (g) {
        html += '<div class="tree-node tree-group-hdr" data-grp-id="' + _esc(g.id) + '"><i class="ri-arrow-down-s-line tia"></i><i class="ri-folder-3-line ti"></i><span>' + _esc(g.name) + '</span></div>';
        (grouped[g.id] || []).forEach(function (p) {
          html += '<div class="tree-node tree-group-child target-playlist" data-grp-child="' + _esc(g.id) + '" data-pl-id="' + _esc(p.id) + '" data-view="' + _esc(p.id) + '"><span class="indent-2"></span><i class="ri-play-list-line ti"></i><span>' + _esc(p.name) + ' <span class="ct">' + p.tracks.length + '</span></span></div>';
        });
      });
      (grouped.__nogroup__ || []).forEach(function (p) {
        html += '<div class="tree-node target-playlist" data-pl-id="' + _esc(p.id) + '" data-view="' + _esc(p.id) + '"><i class="ri-play-list-line ti"></i><span>' + _esc(p.name) + ' <span class="ct">' + p.tracks.length + '</span></span></div>';
      });
      host.innerHTML = html;

      host.querySelectorAll('.tree-group-hdr[data-grp-id]').forEach(function (hdr) {
        var gid = hdr.dataset.grpId;
        hdr.addEventListener('click', function () {
          var children = host.querySelectorAll('.tree-group-child[data-grp-child="' + gid + '"]');
          var arrow = hdr.querySelector('.tia');
          var open = children[0] && children[0].style.display !== 'none';
          children.forEach(function (ch) { ch.style.display = open ? 'none' : ''; });
          if (arrow) arrow.className = open ? 'ri-arrow-right-s-line tia' : 'ri-arrow-down-s-line tia';
          mount.querySelectorAll('.tree-node').forEach(function (x) { x.classList.remove('selected'); });
          hdr.classList.add('selected');
        });
      });
      host.querySelectorAll('.target-playlist[data-view]').forEach(function (n) {
        n.addEventListener('click', function () {
          mount.querySelectorAll('.tree-node').forEach(function (x) { x.classList.remove('selected'); });
          n.classList.add('selected');
          loadLibraryView(n.dataset.view);
        });
      });
    }

    function createPlaylistOrGroup() {
      var name = (window.prompt ? window.prompt('Nome da nova playlist (deixe começar com "grupo:" para criar um grupo)') : '') || '';
      name = name.trim();
      if (!name) return;
      var store = ApolloStore.playlistStore();
      if (/^grupo:/i.test(name)) {
        store.groups.push({ id: ApolloStore.newId('g_'), name: name.replace(/^grupo:/i, '').trim() || 'Novo grupo' });
      } else {
        store.playlists.push({ id: ApolloStore.newId('p_'), name: name, group: null, tracks: [] });
      }
      ApolloStore.setPlaylistStore(store);
      renderPlaylistTree();
      if (window.App) App.toast('Criado: ' + name);
    }

    /* ── DataTable ──────────────────────────────────────── */
    const libCols = TrackCols.concat([
      { id:'lufs', label:'LUFS',     w:'80px', align:'right',  sortable:true, visible:false, headerText:'LUFS' },
      { id:'head', label:'Headroom', w:'90px', align:'right',  sortable:true, visible:false, headerText:'Headroom' },
      { id:'enrg', label:'Energy',   w:'80px', align:'center', sortable:true, visible:false, headerText:'Energy 1-10' }
    ]);
    function buildLibRows() { return trackRows(); }

    DataTable.create('biblio', document.getElementById('biblio-host'), libCols, buildLibRows());

    let bibRowAttach = function () {
      const dt = document.getElementById('dt-biblio');
      if (!dt) return;
      dt.querySelectorAll('.dt-row').forEach((row, i) => {
        if (row.dataset.bibBound === '1') return;
        row.dataset.bibBound = '1';
        row.addEventListener('dblclick', () => {
          const idx = DataTable.instances.biblio._rowIdx ? DataTable.instances.biblio._rowIdx[i] : i;
          window.loadTrackToDeck && loadTrackToDeck(1, idx);
        });
      });
    };

    if (window.ApolloState) {
      ApolloState.subscribe('deck:highlight', function ({ deck, trackIdx }) {
        const dt = document.getElementById('dt-biblio');
        if (!dt) return;
        const cls = deck === 1 ? 'deck1-active' : 'deck2-active';
        if (!document.getElementById('deck-row-styles')) {
          const s = document.createElement('style');
          s.id = 'deck-row-styles';
          s.textContent = `.deck1-active{border-left:3px solid var(--primary)!important;} .deck2-active{border-left:3px solid #0ea5e9!important;}`;
          document.head.appendChild(s);
        }
        dt.querySelectorAll('.dt-row').forEach((row, i) => { row.classList.remove(cls); if (i === trackIdx) row.classList.add(cls); });
      });
    }

    const _origRender = DataTable.render.bind(DataTable);
    DataTable.render = function (id) {
      _origRender(id);
      if (id === 'biblio') { setTimeout(bibRowAttach, 0); }
    };

    /* ── Search filter (over the active T) ────────────────── */
    const inp = document.getElementById('aside-search-inp');
    if (inp) {
      setTimeout(() => inp.focus(), 0);
      inp.addEventListener('input', () => {
        const q = inp.value.trim().toLowerCase();
        if (!q) { DataTable.instances.biblio.rows = buildLibRows(); }
        else {
          DataTable.instances.biblio.rows = buildLibRows().filter(r => {
            return (r.title || '').toLowerCase().includes(q)
              || (r.artist || '').toLowerCase().includes(q)
              || String(r.bpm || '').includes(q)
              || (r.key || '').toLowerCase().includes(q);
          });
        }
        DataTable.render('biblio');
      });
    }

    /* ── "+" handlers ─────────────────────────────────────── */
    var wsAdd = mount.querySelector('#ws-add');
    if (wsAdd) wsAdd.addEventListener('click', function (e) { e.stopPropagation(); addWorkspaceFolder(); });
    var wsMore = mount.querySelector('#ws-more');
    if (wsMore) wsMore.addEventListener('click', function (e) { e.stopPropagation(); removeSelectedWorkspaceFolder(); });
    var plAdd = mount.querySelector('#pl-add');
    if (plAdd) plAdd.addEventListener('click', function (e) { e.stopPropagation(); createPlaylistOrGroup(); });

    /* Re-render playlist tree (and counts) when DnD mutates the store. */
    document.addEventListener('apollodj:playlists:changed', renderPlaylistTree);

    /* ── Pendrive selector (③) ────────────────────────────── */
    (function () {
      const listEl = mount.querySelector('#lib-pd-list');
      const refresh = mount.querySelector('#lib-pd-refresh');
      const asideBot = mount.querySelector('#aside-bot');
      let pdUi = null;
      function renderPdPlaylists(path) {
        if (!listEl) return;
        if (!path) { listEl.innerHTML = ''; return; }
        let playlists = [];
        if (window.pyBridge && typeof window.pyBridge.usb_get_exported_playlists === 'function') {
          try { playlists = JSON.parse(window.pyBridge.usb_get_exported_playlists(path) || '[]'); } catch (_) {}
        }
        listEl.innerHTML = playlists.length
          ? playlists.map(p => `<div class="tree-node usb-pl-item"><i class="ri-usb-fill ti"></i><span>${_esc(p)}</span></div>`).join('')
          : '<div class="usb-pl-empty">Nenhuma playlist exportada.</div>';
      }
      pdUi = _bindPendriveDropdown(mount, _registeredPendrives(), renderPdPlaylists);
      function openPendriveTab() {
        if (typeof App !== 'undefined' && App.goTo) App.goTo('usb', 'pendrive');
        else if (typeof App !== 'undefined') { App.switchTab('usb'); App.switchSub('pendrive'); }
      }
      if (asideBot) {
        asideBot.addEventListener('click', function (e) {
          if (e.target.closest('#lib-pd-refresh')) return;
          if (e.target.closest('#lib-pd-select-wrap, .usb-pl-item')) { e.stopPropagation(); openPendriveTab(); }
        });
      }
      if (refresh) {
        refresh.addEventListener('click', () => {
          const drives = _registeredPendrives();
          if (pdUi && pdUi.refresh) pdUi.refresh(drives);
        });
      }
    })();

    /* ── Boot: load prefs, render trees, show library ─────── */
    ApolloStore.init().then(function () {
      renderWorkspaceTree();
      renderPlaylistTree();
      loadLibraryView('all');
    });
  };
})();
```

- [ ] **Step 2: Verify syntax** — Run: `node -e "new Function(require('fs').readFileSync('theme/screen software/v2/coletanea-lib.js','utf8')); console.log('coletanea-lib.js OK')"`
Expected: `coletanea-lib.js OK` (skip if no node).

- [ ] **Step 3: Checkpoint** — file parses; no hardcoded folders/playlists remain (`grep -n "C:\\\\Users\\\\User\\\\Music\|Playlist A\|Grupo de playlists" "theme/screen software/v2/coletanea-lib.js"` returns nothing).

---

## Task 6: `v3/biblioteca-dnd.js` — drop → ingest / add to playlist

**Files:**
- Modify: `theme/screen software/v3/biblioteca-dnd.js`

- [ ] **Step 1: Replace the playlist helpers** — replace the four functions `playlistCountEl`, `syncPlaylistCount`, `addTrackToPlaylist`, `playlistLabel`, and `dropOnPlaylist` (the block from `function playlistCountEl(pl) {` through the end of `function dropOnPlaylist(...) { ... }`, currently lines ~243-296) with:

```javascript
  function resolvePlaylistTarget(el) {
    var plId = el.getAttribute('data-pl-id');
    if (plId !== null && plId !== '') return plId;        // a real playlist / favorites
    if (plId === '') return null;                          // "Todas as faixas" → not a target
    var grpId = el.getAttribute('data-grp-id');
    if (!grpId) return null;
    var store = window.ApolloStore.playlistStore();
    var inGroup = store.playlists.filter(function (p) { return p.group === grpId; });
    if (inGroup.length) return inGroup[0].id;
    var np = { id: window.ApolloStore.newId('p_'), name: 'Nova playlist', group: grpId, tracks: [] };
    store.playlists.push(np);
    window.ApolloStore.setPlaylistStore(store);
    document.dispatchEvent(new CustomEvent('apollodj:playlists:changed'));
    return np.id;
  }

  function addPathToPlaylist(plId, absPath) {
    var store = window.ApolloStore.playlistStore();
    var list = plId === 'favorites' ? store.favorites
      : (store.playlists.filter(function (p) { return p.id === plId; })[0] || {}).tracks;
    var name = plId === 'favorites' ? 'Favoritas'
      : ((store.playlists.filter(function (p) { return p.id === plId; })[0] || {}).name || 'playlist');
    if (!Array.isArray(list)) return { added: false, count: 0, name: name };
    if (list.indexOf(absPath) !== -1) return { added: false, count: list.length, name: name };
    list.push(absPath);
    window.ApolloStore.setPlaylistStore(store);
    document.dispatchEvent(new CustomEvent('apollodj:playlists:changed'));
    return { added: true, count: list.length, name: name };
  }

  function dropOnPlaylist(targetEl, meta) {
    var plId = resolvePlaylistTarget(targetEl);
    if (plId === null || typeof plId === 'undefined') return;
    var t = (window.T || [])[meta.rowIdx];
    if (!t) return;
    if (t._analyzed && t._libPath) {
      var r = addPathToPlaylist(plId, t._libPath);
      if (window.App) App.toast(r.added
        ? ('Adicionada a ' + r.name + ' (' + r.count + ')')
        : (r.name + ' — faixa já está na playlist'));
      return;
    }
    if (t._local && t._srcPath) {
      if (window.App) App.toast('Analisando ' + (t.title || meta.title) + '…');
      window.ApolloStore.call('ingest_track', t._srcPath).then(function (res) {
        if (!res || !res.ok || !res.final_path) {
          if (window.App) App.toast('Falha ao analisar ' + (t.title || meta.title));
          return;
        }
        var rr = addPathToPlaylist(plId, res.final_path);
        var nm = (res.track && res.track.title) || meta.title;
        if (window.App) App.toast('Pronto: ' + nm + ' → ' + rr.name + ' (' + rr.count + ')');
      });
      return;
    }
  }
```

- [ ] **Step 2: Extend `hitDropTarget` to accept group headers** — find inside `hitDropTarget`:

Old:
```javascript
    var pl = el.closest('#dj-sidebar .target-playlist, .aside .target-playlist');
    if (pl) return { type: 'playlist', el: pl };
```
New:
```javascript
    var pl = el.closest('#dj-sidebar .target-playlist, .aside .target-playlist, .aside .tree-group-hdr[data-grp-id]');
    if (pl) return { type: 'playlist', el: pl };
```

- [ ] **Step 3: Update the public API export** — replace the `window.BibliotecaDnD = { ... }` block at the end with:

```javascript
  window.BibliotecaDnD = {
    bindRows: bindRows,
    clearDragUi: clearDragUi,
    addPathToPlaylist: addPathToPlaylist
  };
```

- [ ] **Step 4: Verify syntax** — Run: `node -e "new Function(require('fs').readFileSync('theme/screen software/v3/biblioteca-dnd.js','utf8')); console.log('biblioteca-dnd.js OK')"`
Expected: `biblioteca-dnd.js OK` (skip if no node).

- [ ] **Step 5: Checkpoint** — drop logic references `ApolloStore` + `ingest_track`; no `VIEWS_IDX` left in the file (`grep -n VIEWS_IDX "theme/screen software/v3/biblioteca-dnd.js"` returns nothing).

---

## Task 7: Rewrite `v1/relatorios.js` — real stats + empty state

**Files:**
- Modify (full rewrite): `theme/screen software/v1/relatorios.js`

- [ ] **Step 1: Replace the entire file** with:

```javascript
/* ════════════════════════════════════════════════════════════
   relatorios.js — PAGE: Relatórios
   REAL data via pyBridge.get_report_stats(period, module).
   No fabricated numbers; "—" where there is no real source yet.
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.relatorios = function (mount) {
    mount.innerHTML = `
      <div class="pane reveal">
        <aside class="aside">
          <div class="aside-head"><div class="aside-title">Relatórios</div></div>
          <div class="aside-scroll">
            <div class="sec-label first"><span>Período</span></div>
            <div class="tree-node selected" data-rel="7d"><i class="ri-calendar-line ti"></i><span>Últimos 7 dias</span></div>
            <div class="tree-node" data-rel="30d"><i class="ri-calendar-line ti"></i><span>Este mês</span></div>
            <div class="tree-node" data-rel="q"><i class="ri-calendar-line ti"></i><span>Trimestre</span></div>
            <div class="tree-node" data-rel="y"><i class="ri-calendar-line ti"></i><span>Ano corrente</span></div>
            <div class="sec-label"><span>Módulo</span></div>
            <div class="tree-node selected" data-module="geral"><i class="ri-dashboard-line ti"></i><span>Geral</span></div>
            <div class="tree-node" data-module="downloads"><i class="ri-download-2-line ti"></i><span>Downloads</span></div>
            <div class="tree-node" data-module="pendrive"><i class="ri-usb-line ti"></i><span>pendrive.DJ</span></div>
            <div class="tree-node" data-module="conversor"><i class="ri-loop-right-line ti"></i><span>Converso-Rio</span></div>
            <div class="tree-node" data-module="exportar"><i class="ri-upload-cloud-2-line ti"></i><span>Exportações</span></div>
            <div class="tree-node" data-module="analise"><i class="ri-bar-chart-2-line ti"></i><span>Análises</span></div>
            <div class="sec-label"><span>Exportar</span></div>
            <div class="tree-node" id="rel-export-pdf"><i class="ri-file-download-line ti"></i><span>PDF</span></div>
            <div class="tree-node" id="rel-export-xls"><i class="ri-file-excel-2-line ti"></i><span>Planilha</span></div>
          </div>
        </aside>
        <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
          <div class="content-hdr">
            <span class="ch-label">RELATÓRIOS</span>
            <span class="ch-count" id="rel-period-lbl">Geral · 7 dias</span>
          </div>
          <div id="rel-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>
        </section>
      </div>`;

    const periodLabels = { '7d': '7 dias', '30d': 'este mês', 'q': 'trimestre', 'y': 'ano corrente' };
    const moduleLabels = {
      geral: 'Geral', downloads: 'Downloads', pendrive: 'pendrive.DJ',
      conversor: 'Converso-Rio', exportar: 'Exportações', analise: 'Análises'
    };
    const cols = [
      { id:'k', label:'Indicador', w:'2fr',   align:'left',  sortable:true, required:true },
      { id:'v', label:'Valor',     w:'120px', align:'right', sortable:true },
      { id:'d', label:'Variação',  w:'100px', align:'right', sortable:true },
      { id:'p', label:'Período',   w:'140px', align:'right', sortable:true }
    ];

    let currentPeriod = '7d';
    let currentModule = 'geral';

    function emptyRows() {
      return [{
        k:'<span class="muted">Sem dados ainda — processe faixas para ver relatórios.</span>',
        v:'<span class="mono muted">—</span>',
        d:'<span class="tag tag-mute">—</span>',
        p:'<span class="mono muted">—</span>'
      }];
    }
    function mapRows(res) {
      if (!res || !res.rows || !res.rows.length || res.empty) return emptyRows();
      return res.rows.map(function (r) {
        return {
          k:'<span class="heading">' + (r.k || '') + '</span>',
          v:'<span class="mono">' + (r.v != null ? r.v : '—') + '</span>',
          d:'<span class="tag tag-mute">' + (r.d != null ? r.d : '—') + '</span>',
          p:'<span class="mono muted">' + (r.p != null ? r.p : '—') + '</span>'
        };
      });
    }
    function render() {
      var lbl = document.getElementById('rel-period-lbl');
      if (lbl) lbl.textContent = (moduleLabels[currentModule] || currentModule) + ' · ' + (periodLabels[currentPeriod] || currentPeriod);
      var done = function (res) {
        var rows = mapRows(res);
        if (DataTable.instances && DataTable.instances.rel) {
          DataTable.instances.rel.rows = rows;
          DataTable.render('rel');
        } else {
          DataTable.create('rel', document.getElementById('rel-host'), cols, rows);
        }
      };
      if (window.ApolloStore) {
        ApolloStore.call('get_report_stats', currentPeriod, currentModule).then(done);
      } else {
        done(null);
      }
    }

    render();

    mount.querySelectorAll('.tree-node[data-rel]').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node[data-rel]').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
        currentPeriod = n.dataset.rel;
        render();
      });
    });
    mount.querySelectorAll('.tree-node[data-module]').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node[data-module]').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
        currentModule = n.dataset.module;
        render();
      });
    });
    const pdfBtn = document.getElementById('rel-export-pdf');
    const xlsBtn = document.getElementById('rel-export-xls');
    if (pdfBtn) pdfBtn.addEventListener('click', () => { if (window.App) App.toast('Exportação de PDF ainda não disponível'); });
    if (xlsBtn) xlsBtn.addEventListener('click', () => { if (window.App) App.toast('Exportação de planilha ainda não disponível'); });
  };
})();
```

- [ ] **Step 2: Verify syntax** — Run: `node -e "new Function(require('fs').readFileSync('theme/screen software/v1/relatorios.js','utf8')); console.log('relatorios.js OK')"`
Expected: `relatorios.js OK` (skip if no node).

- [ ] **Step 3: Checkpoint** — `grep -nE "142|128|847|798|Math.round" "theme/screen software/v1/relatorios.js"` returns nothing (no fabricated numbers).

---

## Task 8: `v1/inicio.js` — wire tiles to real counts

**Files:**
- Modify: `theme/screen software/v1/inicio.js`

- [ ] **Step 1: Append real-count wiring** — at the very end of `ApolloPages.inicio` (right after `DataTable.create('home', ...)`, before the closing `};`), add:

```javascript
    /* Fill bento tiles + activity from REAL counts (— if no source). */
    (function () {
      if (!window.ApolloStore) return;
      ApolloStore.call('get_report_stats', 'all', 'geral').then(function (res) {
        if (!res || !res.rows) return;
        function val(name) {
          var r = res.rows.filter(function (x) { return x.k === name; })[0];
          return r ? r.v : null;
        }
        var tiles = mount.querySelectorAll('.bento-tile .bt-val');
        if (tiles[0]) tiles[0].textContent = (val('Faixas na biblioteca') != null ? val('Faixas na biblioteca') : '—');
        if (tiles[1]) tiles[1].textContent = (val('Pendrives registrados') != null ? val('Pendrives registrados') : '—');
        if (tiles[3]) tiles[3].textContent = (val('Espaço usado') != null ? val('Espaço usado') : '—');
      });
    })();
```

- [ ] **Step 2: Verify syntax** — Run: `node -e "new Function(require('fs').readFileSync('theme/screen software/v1/inicio.js','utf8')); console.log('inicio.js OK')"`
Expected: `inicio.js OK` (skip if no node).

- [ ] **Step 3: Checkpoint** — tiles wired; `Sessões` tile stays `—`.

---

## Task 9: Login/splash title bar (`v3/shell-chrome.css`)

**Files:**
- Modify: `theme/screen software/v3/shell-chrome.css`

- [ ] **Step 1: Confirm the splash element id** — Run: `grep -nE "id=\"splash\"|class=\"splash" "theme/screen software/apolloDJ.v3.html"`
Expected: shows the splash container id (e.g. `#splash`). Use that id in Step 2 (the rule below targets `#splash`; adjust if the id differs).

- [ ] **Step 2: Show the chrome during the auth stage** — replace the auth-stage rule (currently `body.apollo-auth-stage #shell-chrome { display: none !important; }`, ~lines 43-47) with:

```css
/* Login + splash: show the title bar (frameless window has no OS caption,
   so this is the only way to minimize/close before login). Pinned on top. */
body.apollo-auth-stage #shell-chrome {
  display: flex !important;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10000;
}
/* Reserve the 32px bar so login/splash content isn't covered (both are
   position:fixed; inset:0). */
body.apollo-auth-stage #login-screen,
body.apollo-auth-stage #splash {
  top: 32px !important;
}
```

- [ ] **Step 3: Verify the close bridge binds at auth stage** — confirm (read) that `shell-chrome.js init()` calls `bindChromeButtons()` unconditionally (it does, ~line 86). No JS change needed.

- [ ] **Step 4: Checkpoint** — CSS shows the bar in auth stage; `window_close` bridge already exists. (Visual confirmation happens in Task 12.)

---

## Task 10: Clear populated `VIEWS_IDX` in fallback shell (`apolloDJ.v2.html`)

**Files:**
- Modify: `theme/screen software/apolloDJ.v2.html`

- [ ] **Step 1: Zero the simulated playlist membership** — replace line ~1250:

Old:
```javascript
const VIEWS_IDX={all:null,'playlist-a':[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26],'playlist-b':[4,6,10,14,17,21,25],'playlist-c':[1,3,7,11,13,15,20,22,27,31],'playlist-d':[0,9,23,32],favorites:[0,3,6,13,22,25]};
```
New:
```javascript
const VIEWS_IDX={all:null,favorites:[]};
```

- [ ] **Step 2: Checkpoint** — `grep -n "playlist-a" "theme/screen software/apolloDJ.v2.html"` returns nothing.

---

## Task 11: Final verification — gates + manual shell

**Files:** none (verification only)

- [ ] **Step 1: Run all three gates**

Run:
```
python _test_library.py
python smoke_verify.py
python _audit_001.py
python _audit_001_functional.py
```
Expected: every command exits 0. (`_audit_001` must show 0 errors with `ingest/library.py` registered.)

- [ ] **Step 2: Launch the shell and check behavior**

Run: `python main.py` then (since `main.py` opens the pywebview shell on a real desktop) interact:
1. **Login screen** shows the apolloDJ title bar; clicking **✕ (close)** closes the window before logging in; minimize/maximize work.
2. Log in (`teste` / `123456` fixture). Go to **Coletânea › Biblioteca**.
3. **Computador "+"** opens a folder picker; pick a folder with audio → it appears under Computador and its real files fill the table.
4. **Drag** a file row onto a playlist (create one first with Playlists "+") → toast `Analisando…` → `Pronto: …`; the file now exists in `%USERPROFILE%\apolloDJ\Tracks\Coletânea`; the **original file is still in its source folder**; the playlist count increments.
5. **Relatórios** and **Painel**: no fabricated numbers — show real counts (e.g. Faixas = library size) or `—`; empty state text when library is empty.
6. Close and relaunch → the workspace folder and playlist are still there (persisted to `Configurações/preferences.json`).

- [ ] **Step 3: Confirm no simulated data remains** — Run:
```
grep -rnE "Playlist A|Grupo de playlists|C:\\\\Users\\\\User\\\\Music|Math.round\\(142|Math.round\\(847" "theme/screen software/v1/relatorios.js" "theme/screen software/v2/coletanea-lib.js" "theme/screen software/apolloDJ.v2.html"
```
Expected: no matches.

- [ ] **Step 4: Final checkpoint** — all gates green + manual checklist passed. Done.

---

## Self-Review notes (author)

- **Spec coverage:** §5.1 → Tasks 7,8,10 + Task 5 (folders/playlists); §5.2 → Task 5; §5.3 → Tasks 5,6; §5.4 → Task 9; §5.5 → Tasks 1,2,3; §6 persistence → Task 4 (`ApolloStore`). All covered.
- **Type/name consistency:** bridge methods `scan_folder`/`list_library`/`get_report_stats`/`ingest_track` used identically in `launcher.py`, the pyBridge mapping, and JS `ApolloStore.call(...)`. Track shape (`path/name/title/artist/comment/ext/duration/bpm/key/energy/lufs/quality/date/analyzed`) consistent between `library._track_obj`, `mapBridgeTrack`, and the playlist membership key (`_libPath` = Coletânea abs path). Playlist store shape (`groups/playlists/favorites`, playlist `{id,name,group,tracks}`) consistent across Task 4/5/6.
- **No placeholders:** every code step is complete and runnable.
- **Async correctness:** all bridge reads go through `ApolloStore.call`/`.then`; no synchronous `JSON.parse(pyBridge.x())`.
```
