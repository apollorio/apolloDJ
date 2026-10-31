# apolloDJ PRO — full system flow (T=0 → runtime)

> **Canonical machine map:** [`../registry.json`](../registry.json)  
> **Human companion:** [`../mapped.md`](../mapped.md)  
> **UI shell (v3):** `build/theme/screen software/apolloDJ.v3.html`  
> **Last synced:** 2026-05-23

This document is the **single mega-flowchart** for “moment 0” (installed app) through every major feature path. Use it for onboarding, installer wiring, and bridge audits.

---

## 0. What already existed (search result)

| Artifact | Scope | Gap |
|----------|--------|-----|
| [`mapped.md`](../mapped.md) §4–7 | 6-stage pipeline, routing, USB, power-stacks | No install → WebView → tab UX chain |
| [`registry.json`](../registry.json) `boot_flow` | 4 boot steps | No UI / ingest / export subgraph |
| [`main.py`](../main.py) | Boot order + exit codes | CLI smoke only, no shell |
| [`STRICT_AUDIT_STRUCTURE_2026.md`](../../_inventory%20apolloDJ/STRICT_AUDIT_STRUCTURE_2026.md) §6 | Registry ↔ map authority | Not runtime feature flow |
| [`ingest/watcher.py`](../apollodj/ingest/watcher.py) | Auto-ingest comment block | Single-file path only |

**Conclusion:** prepare **`src/docs/APOLLODJ_FULL_FLOW.md`** (this file) as the merged flowchart.

---

## 1. Master flow — installed app → user session

```mermaid
flowchart TB
  subgraph install [T0 Install and first launch]
    Inno[Inno Setup installer]
    EXE[dist/apolloDJ.exe PyInstaller]
    Silent[silent_runner.py optional /SILENT]
    Paths[ensure_paths ~/apolloDJ skeleton]
    Inno --> EXE
    Silent --> EXE
    EXE --> Paths
  end

  subgraph boot [Boot sequence main.py]
    U0[step_00 update_check updates.json]
    Lock{Newer version?}
    Floppada[Versao Floppada lock HTML exit 10]
    U1[step_01 auth_gate ApolloClient]
    AuthOK{Authenticated?}
    AuthFail[AUTH_REQUIRED exit 20]
    U2[step_02 nicotine_autostart headless]
    U3[step_03 ready_signal JSON payload]
    U0 --> Lock
    Lock -->|yes| Floppada
    Lock -->|no| U1
    U1 --> AuthOK
    AuthOK -->|no| AuthFail
    AuthOK -->|yes| U2
    U2 --> U3
  end

  subgraph shell [pywebview shell WebView2]
    HTML[apolloDJ.v3.html theme]
    Splash[Splash screen]
    Login[Login apollo.rio.br]
    App[App controller tabs subtabs]
    Gate[gating/tabs visible_tabs]
    U3 --> HTML
    HTML --> Splash --> Login --> App
    U3 --> Gate
    Gate --> App
  end

  subgraph bridges [JS to Python bridge]
    IB[IngestBridge ingest dj_prep_pro]
    TB[TabsBridge visible_tabs]
    UB[UpdateBridge check boot_gate]
    App --> IB
    App --> TB
    App --> UB
  end

  Paths --> U0
  install --> boot
  boot --> shell
```

**Exit codes (`main.py`):** `0` ready · `10` update lock · `20` auth required

---

## 2. Auth + feature gating

```mermaid
flowchart LR
  subgraph auth [apollo.rio.br apollo-login]
    Keyring[Windows keyring token]
    Verify[GET /a/v1/app/verify]
    Features[membership features dict]
    Keyring --> Verify --> Features
  end

  subgraph gating [apollodj.gating]
    Premium{apolloDJ-* premium?}
    AllTabs[ALL_TABS 18 modules]
    FreeTabs[hide colab-share transferencias]
    DailyLimit[get_daily_limit]
    Features --> Premium
    Premium -->|yes| AllTabs
    Premium -->|no| FreeTabs
    Features --> DailyLimit
  end

  subgraph ui [Shell nav Config]
    Nav[5 main tabs]
    Sub[subtabs ApolloPages mount]
    AllTabs --> Nav
    FreeTabs --> Nav
    Nav --> Sub
  end
```

**Premium-gated tabs:** `colab-share`, `transferencias` ([`gating/tabs.py`](../apollodj/gating/tabs.py))

---

## 3. UI tab map (v3 shell ↔ ApolloPages)

Main nav → subtabs → `ApolloPages.*` module (v1/v2 JS, read-only from Python perspective):

| Main tab | Subtabs | Page key | Module |
|----------|---------|----------|--------|
| **Início** | Painel, Mural, Preferências | `inicio`, `mural`, `userPreferences` | v1 |
| **Coletânea** | Biblioteca, Analisador, Collab.share, Transferências, Buscar, Relatórios | `coletaneaLib`, `analisador`, `colabShare`, `transferencias`, `buscar`, `relatorios` | v2 + v1 |
| **DJ Prep** | Pipeline | `prep` | v1 |
| **Ferramentas** | pendrive.DJ, pendrive.PRO, Converso-Rio, autoHotCUE, autoMEMloop, Waveform, Exportar | `pendriveDj`, `usbPro`, `conversoRio`, `autoHotCue`, `autoMemLoop`, `waveform`, `exportar` | v1 |
| **Controladora** | Controladora | `controladora` | v1 |

**v3-only UX layer:** `v3/v3-patches.js` + `v3/biblioteca-dnd.js` (Biblioteca DnD, row ctx, compact tables) — does not replace Python ingest.

**Also loaded (parity / future):** `editor-tags.js`, `ajuste-som.js`, simulated-data stubs per tab.

---

## 4. Ingest — every path into the pipeline

```mermaid
flowchart TB
  subgraph triggers [Ingest triggers]
    DnD[HTML5 drag-drop IngestBridge]
    Folder[IngestBridge ingest_folder]
    Inbox[~/apolloDJ/Inbox watcher]
    Nicotine[nicotine_autostart P2P downloads]
    PrepUI[DJ Prep tab prep.js]
    PrepPro[IngestBridge dj_prep_pro]
  end

  subgraph staging [Staging]
    Analise[Tracks/0. Em Analise copy]
    triggers --> Analise
  end

  subgraph prepopt [Optional pre-chain dj_prep_pro]
    S01[silence_trim]
    S02[headroom M-Igashi binary]
    S03[loudness dual-pass -14 LUFS]
    S04[BPM Key podium]
    S05[hotcue_smart]
    S06[canonical rename]
    S01 --> S02 --> S03 --> S04 --> S05 --> S06
  end

  subgraph pipe [6-stage pipeline.run]
    P01[01 converter decode_to_wav]
    P02[02 audio_qc ebur128 astats]
    P03[03 analyzer harmonic structure energy hotcue]
    P04[04 musicbrainz tagger]
    P05[05 mix_edit_parser canonical_name]
    P06[06 cdj_auditor approval sidecar]
    P01 --> P02 --> P03 --> P04 --> P05 --> P06
  end

  subgraph route [Routing verdict]
    Pass[PASS to Tracks/Coletanea]
    FailQ[FAIL quality Duvidosos/1]
    FailDl[FAIL download Duvidosos/2]
    FailAmp[FAIL amplification Duvidosos/3]
  end

  Analise --> prepopt
  prepopt --> pipe
  Analise --> pipe
  P06 --> Pass
  P06 --> FailQ
  P06 --> FailDl
  P06 --> FailAmp
```

**Rule ([`watcher.py`](../apollodj/ingest/watcher.py)):** auto-ingest always runs **full** pipeline with `commit=True` — no partial analysis on drop.

**Dry mode:** `pipeline.run(..., commit=False)` — safe preview, no moves (dev / UI preview).

---

## 5. Podium pattern (every engine tries 1st → falls back)

Each stage uses **Top-3+ Podium** ([`mapped.md`](../mapped.md) §2, [`registry.json`](../registry.json) `podium.features`):

| Feature | 1st | 2nd | 3rd+ |
|---------|-----|-----|------|
| BPM | libraz/bpm-detector | BeatNet | legacy hybrid → librosa |
| Key | bpm-detector NewKeyDetector | harmonic_mixer | librosa KS |
| QC | ffmpeg ebur128+astats | pyloudnorm | pydub |
| Loudness | ffmpeg dual-pass loudnorm | ffmpeg-normalize | single-pass / pyloudnorm |
| Headroom | M-Igashi Rust binary | legacy headroom.py | ffmpeg alimiter |
| Structure | bpm-detector structure | madmom downbeats | librosa segments |
| HotCues | structure+energy | quantizer +8 | 16-bar grid |
| Metadata | musicbrainzngs | acoustid | filename regex |
| Tags | mutagen | analyze-tag-songs | ffmpeg metadata |
| Waveform UI | libdjwaveform C | Pillow love12 | librosa matplotlib |
| Auth | ApolloClient token | wp-api-client | config.ini 24h grace |

Missing `requirements-extra.txt` libs → **silent step-down**, app never hard-crashes (priority C).

---

## 6. USB export (user-triggered)

```mermaid
flowchart LR
  User[User selects playlist + USB]
  Colet[Tracks/Coletanea source of truth]
  USB[usb_exporter unified XML]
  DB6[db6_export Rekordbox DB6 ANLZ]
  Trans[playlist_translate]
  M3U[M3U M3U8]
  RB[rekordbox.xml]
  TK[traktor.nml]
  SE[serato.crate.json]
  User --> Colet --> USB
  USB --> DB6
  USB --> Trans
  Trans --> M3U
  Trans --> RB
  Trans --> TK
  Trans --> SE
```

---

## 7. Background services at runtime

```mermaid
flowchart TB
  Nicotine[nicotine-plus headless CLI]
  Filter[filter: audio 320kbps+ 205-720s]
  InboxDl[Inbox/Nicotine downloads]
  Watcher[Inbox folder watcher]
  Process[watcher.process_file]
  Nicotine --> Filter --> InboxDl --> Watcher --> Process
```

---

## 8. Build / deploy chain (not runtime, but T=0 origin)

```mermaid
flowchart LR
  Src[src/apollodj + main.py]
  Req[requirements.txt core]
  Extra[requirements-extra.txt optional]
  Bat[build.bat]
  Spec[apolloDJ.spec PyInstaller]
  Dist[dist/apolloDJ.exe]
  Inno[Inno Setup installer]
  Updates[dj.apollo.rio.br/updates.json]
  Src --> Bat
  Req --> Bat
  Extra -.-> Bat
  Bat --> Spec --> Dist --> Inno
  Updates --> boot
```

**Theme assets:** `build/theme/screen software/apolloDJ.v3.html` + `v1/` + `v2/` + `cdn.apollo.rio.br/` bundled as PyInstaller `datas`.

---

## 9. Power-stacks (composed workflows)

From [`registry.json`](../registry.json) `stacks`:

| Stack | Use case | Module chain |
|-------|----------|--------------|
| **A** Full CDJ prep | Club-ready library | silence_trim → loudness → analyzer → harmonic → tagger → db6_export |
| **B** Ultra accuracy | Max precision | madmom analyzer → bpm-detector structure → ANLZ → libdjwaveform |
| **C** Smart hotcues | CDJ cue points | structure → downbeats → energy → hotcue_smart → db6_export |
| **D** Metadata repair | Tag fixes | tagger scan → musicbrainz → tagger write → analyzer → audio_qc |
| **E** Nicotine discovery | P2P ingest | nicotine_autostart → audio_qc → quick analyzer → tagger → approval |
| **F** pywebview UI | Desktop shell | launcher → bridge/* → playback/preview → ui/waveform |

---

## 10. Quick reference — storage layout

```
~/apolloDJ/
├── Tracks/
│   ├── 0. Em Analise/          ← staging on ingest
│   ├── Coletanea/              ← MASTER (PASS)
│   └── 2. Duvidosos/
│       ├── 1. Arquivo duvidoso/
│       ├── 2. Download falhado/
│       └── 3. Falha de amplificação/
├── Playlists/apolloDJ/         ← unified XML
├── Inbox/                      ← Nicotine + imports
├── Cache/                      ← temp_wav, spectrograms
├── Logs/
└── Database/                   ← tracks.db, fingerprints.db
```

---

## 11. Maintenance

When adding a feature:

1. Wire module under `apollodj/` and list in `registry.json` → `modules`
2. Add podium row in `registry.json` → `podium.features` + row in `mapped.md` §2
3. If UI-facing: register `ApolloPages.*` in v1/v2 JS + `Config` in v3.html + optional `gating/tabs.py`
4. If ingest-related: extend §4 diagram + ensure `watcher.process_file` or `IngestBridge` exposes it
5. Update **this file** §3 or §4 subgraph
