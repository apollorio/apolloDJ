# PyInstaller runtime hook — executes before main.py is loaded.
# Windowed one-file exes (console=False): sys.stdout / sys.stderr are often None.
# Only replace when missing — never call .reconfigure or .buffer (fragile on Windows).
import io
import os
import sys

def _open_stdio(name: str) -> io.TextIOWrapper:
    """Windowed exe: recover fd 1/2 when parent redirected (test_exe / CI)."""
    fd = 1 if name == "stdout" else 2
    try:
        return os.fdopen(os.dup(fd), "w", encoding="utf-8", errors="replace", buffering=1)
    except OSError:
        return io.TextIOWrapper(
            open(os.devnull, "wb", buffering=0),
            encoding="utf-8",
            errors="replace",
            line_buffering=True,
        )


_boot_capture = os.environ.get("APOLLODJ_BOOT_ONLY") == "1" or os.environ.get(
    "APOLLODJ_TEST_STDIO"
) == "1"

for _n in ("stdout", "stderr"):
    if getattr(sys, _n, None) is None:
        stream = _open_stdio(_n) if _boot_capture else io.TextIOWrapper(
            open(os.devnull, "wb", buffering=0),
            encoding="utf-8",
            errors="replace",
            line_buffering=True,
        )
        setattr(sys, _n, stream)
