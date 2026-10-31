# apolloDJ — UI Theme Integration Map

Mapping between the Python UI layer (`apollodj/ui/`) and the HTML theme assets
under **`src_002/theme/`** (single canonical root — `build/theme/` retired 2026-05-20).

## Asset Paths (loaded by `installer_ui/launcher.py`)

| Screen | Asset path | Loaded by |
|--------|-----------|-----------|
| Installer previewer | `src_002/theme/screen install/apolloDJ-install-previewer.html` | `installer_ui/launcher.py` |
| Running shell | `src_002/theme/screen software/apolloDJ.v3.html` | pywebview (main window) |
| Shell fallback | `src_002/theme/screen software/apolloDJ.v2.html` | legacy preview |
| Tab modules v1 | `src_002/theme/screen software/v1/*.js` | shell loader |
| Tab modules v2 | `src_002/theme/screen software/v2/*.js` | shell loader (premium) |
| Tab modules v3 | `src_002/theme/screen software/v3/*.js` | v3 patches + DnD |
| Local CDN | `src_002/theme/cdn.apollo.rio.br/v1.0.0/` | `../cdn.apollo.rio.br/...` from HTML |

## Dev preview

```powershell
cd C:\Users\User\build\src_002\theme
python -m http.server 8765
# http://127.0.0.1:8765/screen%20software/apolloDJ.v3.html
```

## PyInstaller bundle

`apolloDJ.spec` → `(str(ROOT / "theme"), "theme")` where `ROOT` = `src_002/`.

## CSS Token Crosswalk

| Token | CSS variable | Hex / value |
|-------|-------------|-------------|
| Accent | `--ac` | `#E8820C` |
| Text primary | `--tx0` | `#FFFFFF` |
| Text secondary | `--tx1` | `#B8B8B8` |
| Text tertiary | `--tx2` | `#7A7A7A` |
| Surface 3 | `--s3` | `#1F1F1F` |
| Radius | `--r` | `20px` |
| Easing | `--ease` | `cubic-bezier(.16, 1, .3, 1)` |

## Python-side Renderers

| Module | Renders | Tier #1 | Tier #2 |
|--------|---------|---------|---------|
| `ui/waveform.py` | Serato-style RGB waveform PNG | `libdjwaveform` C lib subprocess | `wavypy` + `love12` Pillow port |

## Locale Rules (pt-BR jovem)

- Tone: informal (pista / crew language)
- DJ terms kept in English: `cue`, `load`, `cup`, `autocue`, `hotcue`, `sync`, `track`, `tracks`
