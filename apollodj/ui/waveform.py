"""Serato-style colored waveform renderer.

Top 3 Podium:
  1. libdjwaveform compiled C lib (sub-500 ms render, frequency-coded RGB)
  2. love12-dj-waveform gradient algorithm ported to Pillow / canvas
  3. librosa + matplotlib (slow but pure-python fallback)
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict

from ..conf.paths import CACHE_DIR


def render(path: str | Path, width: int = 2500, height: int = 300) -> Dict[str, Any]:
    """Render a waveform PNG into ``Dados/espectrogramas`` and return its path."""
    src = Path(path)
    out_dir = CACHE_DIR / "spectrograms"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_png = out_dir / f"{src.stem}_{width}x{height}.png"

    if shutil.which("waveform"):
        ppm = out_dir / f"{src.stem}.ppm"
        subprocess.run(
            ["waveform", str(src), str(ppm), str(width), str(height)],
            check=True,
        )
        if shutil.which("magick") or shutil.which("convert"):
            tool = "magick" if shutil.which("magick") else "convert"
            subprocess.run([tool, str(ppm), str(out_png)], check=True)
            ppm.unlink(missing_ok=True)
            return {"engine": "libdjwaveform_c", "path": str(out_png)}
        return {"engine": "libdjwaveform_c", "path": str(ppm)}

    try:
        return _pillow_gradient(src, out_png, width, height)
    except Exception:
        pass

    return _librosa_render(src, out_png, width, height)


def _pillow_gradient(src: Path, out_png: Path, width: int, height: int) -> Dict[str, Any]:
    import numpy as np
    import soundfile as sf
    from PIL import Image, ImageDraw

    data, sr = sf.read(str(src))
    if data.ndim > 1:
        data = data.mean(axis=1)
    samples_per_bar = max(1, len(data) // width)
    bars = [
        float(abs(data[i * samples_per_bar: (i + 1) * samples_per_bar]).mean())
        for i in range(width)
    ]
    peak = max(bars) or 1.0
    img = Image.new("RGB", (width, height), (10, 12, 18))
    draw = ImageDraw.Draw(img)
    for x, amp in enumerate(bars):
        h = int((amp / peak) * (height / 2 - 2))
        r = int(255 * (amp / peak))
        g = int(80 + 120 * (1 - amp / peak))
        b = int(200 * (1 - amp / peak))
        draw.line([(x, height // 2 - h), (x, height // 2 + h)], fill=(r, g, b))
    img.save(out_png, format="PNG")
    return {"engine": "pillow_gradient", "path": str(out_png)}


def _librosa_render(src: Path, out_png: Path, width: int, height: int) -> Dict[str, Any]:
    import librosa
    import librosa.display
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    y, sr = librosa.load(str(src), sr=22050, mono=True)
    fig, ax = plt.subplots(figsize=(width / 100, height / 100), dpi=100)
    librosa.display.waveshow(y, sr=sr, ax=ax, color="#ff7a00")
    ax.axis("off")
    fig.tight_layout(pad=0)
    fig.savefig(out_png, dpi=100, bbox_inches="tight", pad_inches=0)
    plt.close(fig)
    return {"engine": "librosa_matplotlib", "path": str(out_png)}
