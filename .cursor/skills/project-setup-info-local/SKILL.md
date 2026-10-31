---
name: project-setup-info-local
description: >-
  Scaffold or configure a local VS Code / Cursor workspace (venv, extensions,
  project type). Use when opening an empty folder, starting a new side project,
  or the user asks how to set up their editor environment. Do NOT use to
  greenfield-scaffold inside apolloDJ src_002 — that tree is already populated.
---

# project-setup-info-local

## apolloDJ workspace guardrails (read first)

When the workspace root is **`C:/Users/User/build/src_002`** (or any populated `src_002` apolloDJ tree):

| Rule | Detail |
|------|--------|
| Active root | **`src_002/`** only. Ignore legacy `src/`, `src_001/`, `dist_*`, parent `build/` for commands and paths. |
| No greenfield scaffolds | **Never** run `create-next-app`, `npm create vite`, `yo code`, or MCP server generators inside `src_002`. |
| Project class | Existing **python-script** app (pywebview + theme). Use venv + `requirements.txt`, not template CLIs. |
| SSOT docs | `registry.json`, `mapped.md`, `AGENTS.md`, `docs/WORKSPACE_SETUP.md`. |
| WordPress auth | Lives in `apollo-login` / `apollo-membership` on the local site — not in `src_002`. |

For this repo, follow **apolloDJ bootstrap** below instead of generic scaffold sections.

### apolloDJ bootstrap (real setup)

```bat
cd C:\Users\User\build\src_002
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-extra.txt
```

Optional: `requirements-extra.txt` needs **MSVC Build Tools 14+** for `madmom` on Windows.

**Verification gate** (all must exit 0 before PyInstaller):

```bat
python smoke_verify.py
python _audit_001.py
python _audit_001_functional.py
```

**Dev run:**

```bat
python main.py
```

Exit `0` = OK; `10` = update lock; `20` = auth required (acceptable locally).

**UI preview** (from `registry.json` → `theme.preview`):

```bat
cd theme
python -m http.server 8765
```

Open `http://127.0.0.1:8765/screen%20software/apolloDJ.v3.html` (v2/install URLs in registry).

**Build:**

```bat
build.bat
```

Output: `dist/apolloDJ.exe` via `apolloDJ.spec`.

---

## Tool mapping (Cursor vs Copilot)

| Copilot-only | Cursor equivalent |
|--------------|-------------------|
| `copilot_runVscodeCommand` | Integrated terminal + Command Palette |
| `get_vscode_api` | Read `.vscode/settings.json`; use Python/JS extensions |
| MCP scaffold tools | Only for **new** MCP projects outside `src_002` |

Do not fail or block if Copilot-specific MCP tools are unavailable.

---

## Generic scaffolds (empty folder or explicit new project only)

Use these **only** when the user opens an **empty** directory or explicitly asks to create a **new** project **outside** `src_002`.

### python-script

1. `python -m venv .venv` and activate.
2. `pip install` deps; add `requirements.txt`.
3. `.vscode/settings.json`: `python.defaultInterpreterPath` → `.venv/Scripts/python.exe` (Windows) or `.venv/bin/python` (Unix).
4. Recommend Python extension + Pylance.

### python-package

1. Same venv as python-script.
2. `pyproject.toml` or `setup.cfg` + `src/` layout if publishing.
3. `pip install -e .` for editable install.
4. Optional: `pytest`, `ruff` in dev deps.

### next-js

```bat
npx create-next-app@latest <app-name>
cd <app-name>
npm install
npm run dev
```

Extensions: ESLint, Tailwind (if used). Not for `src_002`.

### vite

```bat
npm create vite@latest <app-name>
cd <app-name>
npm install
npm run dev
```

Not for `src_002`.

### vscode-extension

```bat
npm install -g yo generator-code
yo code
```

Pick TypeScript + `New Extension (TypeScript)`. Not for `src_002`.

### mcp-server

Greenfield MCP servers: use official MCP SDK templates in a **new** empty repo. Do not add root `mcp.json` to apolloDJ unless a real MCP server is implemented here.

---

## After setup

- Point the user to project README or `docs/WORKSPACE_SETUP.md` (apolloDJ).
- Run the project's verification commands if documented.
- Do not commit `.venv`, `node_modules`, or secrets.
