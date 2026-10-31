# apolloDJ PRO — workspace setup (`src_002`)

Local developer guide for the Windows desktop app (Python + pywebview + theme). For end-to-end product flow, see [APOLLODJ_FULL_FLOW.md](APOLLODJ_FULL_FLOW.md).

## Prerequisites

| Requirement | Notes |
|-------------|--------|
| Python 3.11+ | Matches CI / PyInstaller target |
| Microsoft WebView2 | Runtime for pywebview shell |
| ffmpeg on PATH | Ingest pipeline (convert, QC, loudness) |
| MSVC Build Tools 14+ | Optional; required to `pip install madmom` (Ultra tier / BeatNet) |

## First-time setup

From `C:\Users\User\build\src_002`:

```bat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-extra.txt
```

Core deps are in `requirements.txt`. Ultra Accuracy engines need `requirements-extra.txt`.

VS Code / Cursor: open **`src_002`** as the folder root so `.vscode/settings.json` picks up `.venv`.

## Verification gate

All three must exit **0** before a PyInstaller build:

```bat
python smoke_verify.py
python _audit_001.py
python _audit_001_functional.py
```

## Run and build

| Action | Command |
|--------|---------|
| Dev smoke / shell payload | `python main.py` — exit `20` = auth required is OK locally |
| One-shot build | `build.bat` |
| Manual PyInstaller | `python -m PyInstaller --noconfirm apolloDJ.spec` |
| Output | `dist/apolloDJ.exe` |

Dry pipeline (no file moves):

```python
from apollodj.ingest.pipeline import run
run("path/to/track.wav", commit=False)
```

## UI dev server

Theme assets are served locally (CDN junction documented in `registry.json` → `theme.preview`):

```bat
cd theme
python -m http.server 8765
```

| Screen | URL |
|--------|-----|
| App v3 | http://127.0.0.1:8765/screen%20software/apolloDJ.v3.html |
| App v2 | http://127.0.0.1:8765/screen%20software/apolloDJ.v2.html |
| Install preview | http://127.0.0.1:8765/screen%20install/apolloDJ-install-previewer.html |

## Agent / Cursor

- [`AGENTS.md`](../AGENTS.md) — SSOT pointer for agents
- [`.cursor/skills/project-setup-info-local/SKILL.md`](../.cursor/skills/project-setup-info-local/SKILL.md) — setup skill with apolloDJ guardrails

## What not to do

- Do **not** run `npm create`, `create-next-app`, `yo code`, or MCP greenfield scaffolds inside `src_002` — the tree is already the full app.
- Do **not** treat parent `build/CLAUDE.md` paths using `src/` as cwd; use `src_002/`.
- `.venv` and any `node_modules` under `theme/` are local dependencies only — do not commit them.

## Related docs

- [APOLLODJ_FULL_FLOW.md](APOLLODJ_FULL_FLOW.md) — product / pipeline narrative
- [`registry.json`](../registry.json) — machine registry
- [`mapped.md`](../mapped.md) — human map
