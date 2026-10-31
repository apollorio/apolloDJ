# apolloDJ PRO — agent entrypoint (`src_002`)

**Single source of truth for the desktop app in this workspace:** `C:/Users/User/build/src_002`

Ignore legacy `src/`, `src_001/`, and `dist_*` trees unless the user explicitly asks about archives.

## Commands and paths

All install, audit, run, and build commands use **`src_002/`** as cwd. Detailed steps: [`docs/WORKSPACE_SETUP.md`](docs/WORKSPACE_SETUP.md).

Long-form architecture (parent repo): [`../build/CLAUDE.md`](../build/CLAUDE.md) — when paths disagree, **`src_002` wins**.

## Registry and maps

| File | Role |
|------|------|
| [`registry.json`](registry.json) | Machine SSOT — modules, boot, theme preview URLs |
| [`mapped.md`](mapped.md) | Human system map (legacy sections may reference old `src/`) |
| [`apolloDJ-flowchart.md`](apolloDJ-flowchart.md) | Boot + pipeline flow |

## Skills

- **`project-setup-info-local`** (`.cursor/skills/project-setup-info-local/SKILL.md`) — editor/workspace setup; **no** `create-next-app` / `yo code` inside this tree.
- For this repo, prefer **WORKSPACE_SETUP** over generic scaffold sections in that skill.

## WordPress (local site)

Auth and membership tiers: plugins `apollo-login`, `apollo-membership` under the Local WordPress site — not shipped inside `src_002`.

## Verification before release builds

```bat
python smoke_verify.py
python _audit_001.py
python _audit_001_functional.py
```
