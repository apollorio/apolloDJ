# updates.json specification

Endpoint: `https://dj.apollo.rio.br/updates.json`

Used at boot before auth. If a newer version exists, app shows the
"Versão Floppada" lock screen and blocks execution.

## Required keys

```json
{
  "latest_version": "2.0.0",
  "min_supported_version": "1.0.0",
  "download_setup_url": "https://dj.apollo.rio.br/releases/apolloDJ-Setup-v2.0.0.exe",
  "sha256": "<setup_sha256>",
  "release_notes": "Stable PRO release.",
  "released_at": "2026-05-19T18:00:00Z",
  "mandatory": false
}
```

## Boot behavior

- Newer version found: `boot/update_check.py:get_boot_gate()` returns:
  - `action = "lock"`
  - lockscreen HTML payload (`Versão Floppada`)
- Up-to-date or fetch failure:
  - `action = "continue"`

## Hosting note

Recommended implementation on WordPress:
- Static file served from site root: `/updates.json`
- Or REST endpoint proxy returning equivalent JSON.
