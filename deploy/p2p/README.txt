apolloDJ — embedded Collab P2P bundle (build staging)
=====================================================

STEP 6 (Python roadmap): drop the portable headless engine here BEFORE
PyInstaller / Inno Setup. apolloDJ never downloads this binary from the internet.

Required artifact
-----------------
  nicotine.exe          — headless-capable Nicotine+ build (Windows)
                          Expected exact filename: nicotine.exe
                          Linux/mac dev fallback name: nicotine (same folder)

Optional template (not required at runtime):
  apollo_backend.conf   — runtime config is always written to:
                          ~/apolloDJ/Configurações/nicotine/apollo_backend.conf

Where to place it
-----------------
  Dev / source tree:
    src_002/deploy/p2p/nicotine.exe

  Frozen PyInstaller one-file:
    _MEIPASS/p2p/nicotine.exe   (via pyinstaller_datas from this folder)

  Installed Inno layout:
    {app}/p2p/nicotine.exe

Override (dev/CI only):
  set APOLLODJ_P2P_BINARY=C:\path\to\nicotine.exe

Version notes
-------------
  • Use a Nicotine+ build that supports --headless --config (3.x+).
  • Tested target: Nicotine+ 3.3.x portable headless (bundled with apolloDJ 2.0.0).
  • Do NOT ship the full Nicotine+ GUI installer — only this single portable exe.
  • Alternative for dev: pip install nicotine-plus (pynicotine in-process); production
    builds should still bundle nicotine.exe for users without Python deps.

Launch argv (internal — not user-facing)
----------------------------------------
  nicotine.exe --headless --config <APOLLO_BACKEND_CONF>

Runtime behaviour without binary
--------------------------------
  • Boot continues; Buscar/Transferências tabs stay visible for premium members.
  • get_p2p_status() returns available=false + user-facing error string.
  • InboxWatcher still monitors ~/apolloDJ/Tracks/Baixando for manual drops.
  • Search/download APIs return empty / error until binary or pynicotine is present.

Policy
------
  Search + download + share collab folder only. No GUI, chat, PM, or separate
  product mentions in the apolloDJ shell.
