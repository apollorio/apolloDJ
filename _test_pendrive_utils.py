"""Standalone TDD tests for apollodj.ingest.pendrive_utils (no pytest needed).

f3 (Fight Flash Fraud) native integration — Advanced Pro Roadmap.
Run from src_002:  python _test_pendrive_utils.py   → exit 0 = pass, raises on failure.

Covers (pure / deterministic core — Phases 1-3 + 5):
  · paths.PENDRIVES_CSV / PENDRIVES_JSON aliases
  · is_valid_pendrive()        — FAT32/exFAT + removable + >1GB gate
  · get_f3_binary_path()       — env override + dir/file resolution
  · _parse_f3_result()         — f3probe + f3write/f3read text → structured dict
  · compute_health_score()     — roadmap weighted scoring (max 100)
  · recommend() / health_badge / cdj_note
  · ensure_csv_header()        — auto header creation
  · log_pendrive_test() / get_last_test() / get_drive_history()  — registry + last-5 history
  · run_f3_test_streaming()    — Popen streaming via injected fake binaries
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from apollodj.conf import paths  # noqa: E402
from apollodj.ingest import pendrive_utils as pu  # noqa: E402


# ── Sample f3 real-tool output fixtures ──────────────────────────────────────

F3PROBE_GOOD = """\
F3 probe 8.0
Copyright (C) 2010 Digirati Internet LTDA.

Good news: The device `/dev/sdb' is the real thing

Device geometry:
\t         *Usable* size: 28.83 GB (60437331 blocks)
\t     Announced size: 28.83 GB (60437331 blocks)
\t             Module: 32.00 GB (2^35 Bytes)

Probe time: 1.04s
"""

F3PROBE_FAKE = """\
F3 probe 8.0
Copyright (C) 2010 Digirati Internet LTDA.

Bad news: The device `/dev/sdb' is damaged

Device geometry:
\t         *Usable* size: 7.86 GB (16477879 blocks)
\t     Announced size: 64.00 GB (134217728 blocks)
\t             Module: 64.00 GB (2^36 Bytes)

Probe time: 920.10s
"""

F3WRITE_OK = """\
F3 write 8.0
Free space: 28.83 GB
Creating file 1.h2w ... OK!
Creating file 2.h2w ... OK!
Free space: 0.00 Byte
Average writing speed: 17.42 MB/s
"""

F3READ_OK = """\
F3 read 8.0
Validating file 1.h2w ... 2097152/        0/      0/      0
Validating file 2.h2w ... 2097152/        0/      0/      0
  Data OK: 28.83 GB (60437328 sectors)
Data LOST: 0.00 Byte (0 sectors)
\t       Corrupted: 0.00 Byte (0 sectors)
\t Slightly changed: 0.00 Byte (0 sectors)
\t     Overwritten: 0.00 Byte (0 sectors)
Average reading speed: 22.49 MB/s
"""

F3READ_BADBLOCKS = """\
F3 read 8.0
  Data OK: 20.00 GB (41943040 sectors)
Data LOST: 1.00 GB (2097152 sectors)
\t       Corrupted: 1.00 GB (2097152 sectors)
\t Slightly changed: 0.00 Byte (0 sectors)
\t     Overwritten: 0.00 Byte (0 sectors)
Average reading speed: 9.10 MB/s
"""


# ── Phase 1.2.1 — paths aliases ──────────────────────────────────────────────

def test_paths_exposes_pendrives_csv_and_json_aliases():
    assert paths.PENDRIVES_CSV == paths.PENDRIVES_REGISTRY_CSV
    assert paths.PENDRIVES_JSON == paths.PENDRIVES_DRIVES_JSON
    assert paths.PENDRIVES_CSV.name == "pendrives-registrados.csv"
    assert paths.PENDRIVES_JSON.name == "drives.json"


# ── Phase 1.1 — is_valid_pendrive ────────────────────────────────────────────

def test_is_valid_pendrive_accepts_fat32_removable_over_1gb():
    d = {"letter": "F:", "label": "USB", "size_gb": 28.8, "filesystem": "FAT32", "is_fat32": True, "removable": True}
    assert pu.is_valid_pendrive(d) is True


def test_is_valid_pendrive_accepts_exfat():
    d = {"letter": "G:", "label": "BIG", "size_gb": 64.0, "filesystem": "exFAT", "is_fat32": False, "removable": True}
    assert pu.is_valid_pendrive(d) is True


def test_is_valid_pendrive_rejects_ntfs():
    d = {"letter": "C:", "label": "OS", "size_gb": 500.0, "filesystem": "NTFS", "is_fat32": False, "removable": False}
    assert pu.is_valid_pendrive(d) is False


def test_is_valid_pendrive_rejects_tiny_drive():
    d = {"letter": "F:", "label": "TINY", "size_gb": 0.5, "filesystem": "FAT32", "is_fat32": True, "removable": True}
    assert pu.is_valid_pendrive(d) is False


def test_is_valid_pendrive_rejects_explicit_non_removable():
    d = {"letter": "D:", "label": "FIXED", "size_gb": 256.0, "filesystem": "exFAT", "is_fat32": False, "removable": False}
    assert pu.is_valid_pendrive(d) is False


# ── Phase 1.1.2 — get_f3_binary_path ─────────────────────────────────────────

def test_get_f3_binary_path_env_override_directory():
    with tempfile.TemporaryDirectory() as d:
        binp = Path(d) / ("f3probe.bat" if os.name == "nt" else "f3probe")
        binp.write_text("@echo off\n" if os.name == "nt" else "#!/bin/sh\n", encoding="utf-8")
        old = os.environ.get(pu.F3_ENV_OVERRIDE)
        os.environ[pu.F3_ENV_OVERRIDE] = d
        try:
            got = pu.get_f3_binary_path("f3probe")
            assert got is not None
            assert Path(got) == binp, got
        finally:
            if old is None:
                os.environ.pop(pu.F3_ENV_OVERRIDE, None)
            else:
                os.environ[pu.F3_ENV_OVERRIDE] = old


def test_get_f3_binary_path_missing_returns_none():
    old = os.environ.get(pu.F3_ENV_OVERRIDE)
    os.environ[pu.F3_ENV_OVERRIDE] = str(Path(tempfile.gettempdir()) / "no_such_f3_dir_xyz")
    try:
        # Tool that certainly does not exist on PATH
        assert pu.get_f3_binary_path("f3_definitely_not_installed_xyz") is None
    finally:
        if old is None:
            os.environ.pop(pu.F3_ENV_OVERRIDE, None)
        else:
            os.environ[pu.F3_ENV_OVERRIDE] = old


# ── Phase 2.2 — _parse_f3_result ─────────────────────────────────────────────

def test_parse_probe_good_is_not_fake():
    r = pu._parse_f3_result(F3PROBE_GOOD, quick=True)
    assert r["fake_detected"] is False
    assert r["recommendation"] in {"Excellent", "Usable"}


def test_parse_probe_fake_capacity_detected():
    r = pu._parse_f3_result(F3PROBE_FAKE, quick=True)
    assert r["fake_detected"] is True
    assert r["health_score"] < 50
    assert r["recommendation"] == "Do not use"


def test_parse_full_write_read_extracts_speeds():
    r = pu._parse_f3_result(F3WRITE_OK + "\n" + F3READ_OK, quick=False)
    assert r["fake_detected"] is False
    assert abs(r["write_speed_mbs"] - 17.42) < 0.01
    assert abs(r["read_speed_mbs"] - 22.49) < 0.01
    assert r["bad_blocks_count"] == 0
    assert r["health_score"] == 100
    assert r["recommendation"] == "Excellent"


def test_parse_badblocks_marks_data_lost_and_lowers_score():
    r = pu._parse_f3_result(F3WRITE_OK + "\n" + F3READ_BADBLOCKS, quick=False)
    assert r["bad_blocks_count"] > 0
    assert r["health_score"] < 80
    assert r["recommendation"] in {"Risky", "Do not use"}


# ── Phase 2/3 — compute_health_score (roadmap weighted formula) ──────────────

def test_compute_health_score_perfect():
    s = pu.compute_health_score(fake_detected=False, write_speed_mbs=20, read_speed_mbs=25, bad_blocks_count=0)
    assert s == 100


def test_compute_health_score_fake_is_zero_floor_on_capacity():
    # fake => loses the 40-point capacity block
    s = pu.compute_health_score(fake_detected=True, write_speed_mbs=20, read_speed_mbs=25, bad_blocks_count=0)
    assert s == 60  # 0 + 25 + 20 + 15


def test_compute_health_score_slow_drive():
    s = pu.compute_health_score(fake_detected=False, write_speed_mbs=10, read_speed_mbs=15, bad_blocks_count=3)
    assert s == 60  # 40 (real) + 10 (write<=15) + 10 (read<=20) + 0 (bad blocks)


# ── Phase 5.2.1 — recommend / badge / cdj_note ───────────────────────────────

def test_recommend_thresholds():
    assert pu.recommend(95, fake_detected=False) == "Excellent"
    assert pu.recommend(70, fake_detected=False) == "Usable"
    assert pu.recommend(45, fake_detected=False) == "Risky"
    assert pu.recommend(20, fake_detected=False) == "Do not use"
    assert pu.recommend(95, fake_detected=True) == "Do not use"


def test_health_badge_maps_to_traffic_light():
    assert pu.health_badge(95, fake_detected=False) == "green"
    assert pu.health_badge(60, fake_detected=False) == "yellow"
    assert pu.health_badge(20, fake_detected=False) == "red"
    assert pu.health_badge(95, fake_detected=True) == "red"


# ── Phase 3.2 / 5.3 — CSV header + logging + history ─────────────────────────

def test_ensure_csv_header_creates_file_with_header():
    with tempfile.TemporaryDirectory() as d:
        csv_path = Path(d) / "pendrives-registrados.csv"
        pu.ensure_csv_header(csv_path=csv_path)
        assert csv_path.exists()
        first = csv_path.read_text(encoding="utf-8").splitlines()[0]
        for col in ("timestamp", "drive", "health_score", "recommendation"):
            assert col in first, first


def test_log_pendrive_test_appends_csv_and_updates_json():
    with tempfile.TemporaryDirectory() as d:
        csv_path = Path(d) / "pendrives-registrados.csv"
        json_path = Path(d) / "drives.json"
        result = {
            "drive": "F:", "label": "USB", "size_gb": 28.8,
            "fake_detected": False, "write_speed_mbs": 17.4, "read_speed_mbs": 22.5,
            "bad_blocks_count": 0, "health_score": 100, "recommendation": "Excellent",
        }
        out = pu.log_pendrive_test(result, csv_path=csv_path, json_path=json_path)
        assert out["ok"] is True
        # CSV: header + one data row
        rows = csv_path.read_text(encoding="utf-8").splitlines()
        assert len(rows) == 2, rows
        # JSON snapshot keyed by drive
        snap = json.loads(json_path.read_text(encoding="utf-8"))
        assert "F:" in snap
        assert snap["F:"]["last"]["health_score"] == 100


def test_get_last_test_returns_latest_snapshot():
    with tempfile.TemporaryDirectory() as d:
        json_path = Path(d) / "drives.json"
        csv_path = Path(d) / "pendrives-registrados.csv"
        pu.log_pendrive_test(
            {"drive": "F:", "health_score": 55, "fake_detected": False, "recommendation": "Risky"},
            csv_path=csv_path, json_path=json_path)
        pu.log_pendrive_test(
            {"drive": "F:", "health_score": 100, "fake_detected": False, "recommendation": "Excellent"},
            csv_path=csv_path, json_path=json_path)
        last = pu.get_last_test("F:", json_path=json_path)
        assert last is not None
        assert last["health_score"] == 100


def test_get_last_test_unknown_drive_returns_none():
    with tempfile.TemporaryDirectory() as d:
        json_path = Path(d) / "drives.json"
        assert pu.get_last_test("Z:", json_path=json_path) is None


def test_history_keeps_only_last_five():
    with tempfile.TemporaryDirectory() as d:
        json_path = Path(d) / "drives.json"
        csv_path = Path(d) / "pendrives-registrados.csv"
        for i in range(7):
            pu.log_pendrive_test(
                {"drive": "F:", "health_score": i * 10, "fake_detected": False, "recommendation": "Usable"},
                csv_path=csv_path, json_path=json_path)
        hist = pu.get_drive_history("F:", json_path=json_path)
        assert len(hist) == 5, hist
        # newest first
        assert hist[0]["health_score"] == 60


# ── Phase 2.1 — run_f3_test_streaming via injected fake binaries ──────────────

def _make_fake_bin(folder: Path, name: str, printed: str) -> Path:
    """Write a tiny OS-native executable that prints *printed* to stdout."""
    if os.name == "nt":
        p = folder / f"{name}.bat"
        # Echo each line literally; blank lines via echo.
        body = ["@echo off"]
        for line in printed.splitlines():
            if line.strip() == "":
                body.append("echo.")
            else:
                safe = line.replace("%", "%%").replace("^", "^^").replace("&", "^&").replace("<", "^<").replace(">", "^>").replace("|", "^|")
                body.append(f"echo {safe}")
        p.write_text("\r\n".join(body) + "\r\n", encoding="utf-8")
    else:
        p = folder / name
        script = "#!/bin/sh\ncat <<'EOF'\n" + printed + "\nEOF\n"
        p.write_text(script, encoding="utf-8")
        p.chmod(0o755)
    return p


def test_run_streaming_quick_probe_collects_lines_and_result():
    with tempfile.TemporaryDirectory() as d:
        probe = _make_fake_bin(Path(d), "f3probe", F3PROBE_GOOD)
        lines: list[str] = []
        progress: list[dict] = []
        res = pu.run_f3_test_streaming(
            "F:", on_progress=progress.append, on_line=lines.append,
            quick=True, f3probe_bin=str(probe),
        )
        assert res["fake_detected"] is False
        assert res["mode"] == "quick"
        assert any("real thing" in ln for ln in lines), lines


def test_run_streaming_full_runs_write_then_read_and_scores():
    with tempfile.TemporaryDirectory() as d:
        writer = _make_fake_bin(Path(d), "f3write", F3WRITE_OK)
        reader = _make_fake_bin(Path(d), "f3read", F3READ_OK)
        progress: list[dict] = []
        res = pu.run_f3_test_streaming(
            "F:", on_progress=progress.append, quick=False,
            f3write_bin=str(writer), f3read_bin=str(reader),
        )
        assert res["mode"] == "full"
        assert abs(res["write_speed_mbs"] - 17.42) < 0.01
        assert abs(res["read_speed_mbs"] - 22.49) < 0.01
        assert res["health_score"] == 100
        # progress callback fired at least once with a speed reading
        assert any("speed_mbs" in p for p in progress), progress


if __name__ == "__main__":
    fns = [v for k, v in sorted(globals().items())
           if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {fn.__name__}: {type(exc).__name__}: {exc}")
    if failed:
        print(f"\n{failed}/{len(fns)} FAILED")
        sys.exit(1)
    print(f"\nOK — {len(fns)} tests passed")
