# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

try:
    from PyInstaller.utils.hooks import collect_submodules
    _APSCHEDULER_HIDDEN = collect_submodules("apscheduler")
except Exception:
    _APSCHEDULER_HIDDEN = [
        "apscheduler",
        "apscheduler.schedulers.background",
        "apscheduler.executors.pool",
        "apscheduler.jobstores.memory",
        "apscheduler.triggers.interval",
    ]

block_cipher = None
# PyInstaller injects SPECPATH at spec-exec time; __file__ is NOT defined here.
ROOT = Path(SPECPATH).resolve()  # type: ignore[name-defined]
BUILD_ROOT = ROOT.parent          # build/   (sibling of src/)
THEME_DIR = ROOT / "theme"  # src_002/theme/  (HTML/JS/CSS shell + tabs + cdn)

# Legacy `_superseeded/` subset — only files dynamic-imported at runtime.
# Bundled into the exe under `_legacy/` so conf.paths.legacy_file() finds them.
LEGACY_BUNDLE_FILES = [
    ("apolloDJ-exe", "core", "apollo_client.py"),              # auth
    ("apolloDJ-exe", "core", "energy_analyzer.py"),            # tier-1 energy
    ("apolloDJ-exe", "pipeline", "cdj_auditor.py"),            # tier-1 CDJ preflight
    ("apolloDJ-exe", "pipeline", "dc_phase.py"),               # DC+phase fix
    ("apolloDJ-exe", "pipeline", "headroom.py"),               # tier-2 headroom
    ("core", "harmonic_mixer.py"),                             # tier-2 key
    ("core", "silence_trimmer.py"),                            # tier-1 silence trim
]
LEGACY_DATAS = []
for parts in LEGACY_BUNDLE_FILES:
    src_file = BUILD_ROOT / "_superseeded" / Path(*parts)
    if src_file.is_file():
        # Destination: _legacy/<same subpath>
        dest_dir = "_legacy/" + "/".join(parts[:-1])
        LEGACY_DATAS.append((str(src_file), dest_dir))

# Portable headless P2P engine — staged for Inno {app}/p2p and frozen _MEIPASS/p2p/
P2P_DEPLOY = ROOT / "deploy" / "p2p"
P2P_DATAS: list[tuple[str, str]] = []
if P2P_DEPLOY.is_dir():
    for item in sorted(P2P_DEPLOY.iterdir()):
        if item.is_file():
            P2P_DATAS.append((str(item), "p2p"))

a = Analysis(
    [str(ROOT / "main.py")],
    pathex=[str(ROOT)],
    binaries=[],
    datas=[
        (str(ROOT / "icon.ico"), "."),
        (str(ROOT / "icon.png"), "."),
        # Theme shell — apolloDJ.v3.html + v1/ + v2/ + v3/ + screen install/ + cdn/
        (str(THEME_DIR), "theme"),
        *LEGACY_DATAS,
        *P2P_DATAS,
    ],
    hiddenimports=[
        "apollodj",
        "apollodj.conf.constants",
        "apollodj.conf.paths",
        "apollodj.conf.atomic",
        "apollodj.boot.update_check",
        "apollodj.boot.auth_gate",
        "apollodj.boot.nicotine_autostart",
        "apollodj.boot.ready_signal",
        "apollodj.boot.funny_status",
        "apollodj.gating.features",
        "apollodj.gating.tabs",
        "apollodj.ingest.pipeline",
        "apollodj.ingest.analyzer",
        "apollodj.ingest.analyze_audio",
        "apollodj.ingest.converter",
        "apollodj.ingest.qc",
        "apollodj.ingest.audio_qc",
        "apollodj.ingest.energy_score",
        "apollodj.ingest.tagger",
        "apollodj.ingest.loudness",
        "apollodj.ingest.dc_phase",
        "apollodj.ingest.headroom",
        "apollodj.ingest.silence_trim",
        "apollodj.ingest.harmonic",
        "apollodj.ingest.downbeat",
        "apollodj.ingest.bpm_key_detection",
        "apollodj.ingest.section_detection",
        "apollodj.ingest.spectral",
        "apollodj.ingest.onset_cues",
        "apollodj.ingest.structure",
        "apollodj.ingest.state_machine",
        "apollodj.ingest.quality_gate",
        "apollodj.ingest.fingerprint",
        "apollodj.ingest.xml_db",
        "apollodj.ingest.queue_worker",
        "apollodj.ingest.queue_boot",
        "apollodj.ingest.pipeline_v2",
        "apollodj.ingest.parsers",
        "apollodj.ingest.parsers.track_model",
        "apollodj.ingest.parsers.pyrekordbox_in",
        "apollodj.ingest.parsers.serato_in",
        "apollodj.ingest.parsers.serato2rekordbox",
        "apollodj.ingest.exporters",
        "apollodj.ingest.exporters.rekordbox_xml",
        "apollodj.ingest.exporters.serato_crates",
        "apollodj.ingest.exporters.universal_cdj",
        "apollodj.ingest.exporters.sidecar_export",
        "apollodj.ingest.hotcue_smart",
        "apollodj.ingest.musicbrainz",
        "apollodj.ingest.cdj_auditor",
        "apollodj.ingest.db6_export",
        "apollodj.ingest.playlist_translate",
        "apollodj.ingest.mix_edit_parser",
        "apollodj.ingest.canonical_name",
        "apollodj.ingest.renamer",
        "apollodj.ingest.mover",
        "apollodj.ingest.approval",
        "apollodj.ingest.sidecar",
        "apollodj.ingest.watcher",
        "apollodj.ingest.dj_prep_pro",
        "apollodj.ingest.library",
        "apollodj.ingest.usb_exporter",
        "apollodj.ingest.pendrive_utils",
        "apollodj.ingest.master_xml",
        "apollodj.playback.preview",
        "apollodj.ui.waveform",
        "apollodj.bridge.ingest_bridge",
        "apollodj.bridge.tabs_bridge",
        "apollodj.bridge.update_bridge",
        "apollodj.bridge.usb_bridge",
        "apollodj.bridge.waveform_bridge",
        "apollodj.p2p.service",
        "apollodj.p2p.soulseek_client",
        "apollodj.p2p.backend_config",
        "apollodj.conf.preferences",
        "apollodj.runtime.shell_state",
        "apollodj.installer_ui.launcher",
        "pynicotine",
        "pynicotine.config",
        "pynicotine.core",
        "pynicotine.events",
        "apollodj.installer_ui.silent_runner",
        "packaging.version",
        "keyring",
        "keyring.core",
        "keyring.backends",
        "keyring.backends.Windows",
        "keyring.backends.fail",
        "keyring.backends.null",
        # Metadata read + standardized tag write (extract_advanced_metadata)
        "mutagen",
        "mutagen.easyid3",
        "mutagen.flac",
        "mutagen.id3",
        "mutagen.mp3",
        "mutagen.wave",
        "mutagen.aiff",
        # Embedded UI core (defensive — pywebview is already auto-collected)
        "webview",
        # 5-hour silent token + membership refresh (ApolloClient._start_scheduler)
        *_APSCHEDULER_HIDDEN,
        "tzlocal",
        "tzdata",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[str(ROOT / "rthooks" / "pyi_rth_apollodj_stdio.py")],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="apolloDJ",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=str(ROOT / "icon.ico"),
)
