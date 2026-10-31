"""Pipeline v2 — Quality Gate.

Weighted score in [0, 100]. Tracks below the threshold (default 80) stay in
``00 Em análise/`` (borderline) or move to ``01 Rejected/`` (hard fail).

Weights (sum = 100):
    duration            10   — too short / too long is suspicious
    clipping            25   — distortion is fatal for DJ playback
    bitrate             20   — under 192 kbps is a quality red flag
    analysis_confidence 25   — BPM / key confidence from analyzer tier
    corruption          20   — decode errors / silence beyond limits
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict


WEIGHTS: Dict[str, float] = {
    "duration": 10.0,
    "clipping": 25.0,
    "bitrate": 20.0,
    "analysis_confidence": 25.0,
    "corruption": 20.0,
}
THRESHOLD: float = 80.0


@dataclass(frozen=True)
class QualityResult:
    score: float            # 0.0 .. 100.0
    passed: bool
    breakdown: Dict[str, float]
    reasons: list[str]
    warn: Dict[str, str] | None = None  # club-playability (non-blocking yellow badge)


def _score_duration(seconds: float) -> float:
    """Reward 2:30 — 12:00, penalise extremes."""
    if seconds <= 0:
        return 0.0
    if 150.0 <= seconds <= 720.0:
        return 1.0
    if 60.0 <= seconds < 150.0:
        return 0.7
    if 30.0 <= seconds < 60.0:
        return 0.4
    return 0.0


def _score_clipping(clipping_ratio: float) -> float:
    """0.0 = none, 1.0 = clipped everywhere. Lower is better."""
    if clipping_ratio <= 0.001:
        return 1.0
    if clipping_ratio <= 0.01:
        return 0.6
    if clipping_ratio <= 0.05:
        return 0.2
    return 0.0


def _score_bitrate(kbps: float) -> float:
    if kbps >= 320:
        return 1.0
    if kbps >= 256:
        return 0.85
    if kbps >= 192:
        return 0.65
    if kbps >= 128:
        return 0.3
    return 0.0


def _score_analysis_confidence(conf: float) -> float:
    return max(0.0, min(1.0, float(conf)))


def _score_corruption(corruption_flag: bool | float) -> float:
    """Boolean or [0,1]. False/0.0 = no corruption."""
    if isinstance(corruption_flag, bool):
        return 0.0 if corruption_flag else 1.0
    return max(0.0, 1.0 - float(corruption_flag))


def club_playability_warn(
    metrics: Dict[str, Any],
    *,
    prep_steps: Dict[str, Any] | None = None,
    qc: Dict[str, Any] | None = None,
    cdj_audit: Dict[str, Any] | None = None,
) -> Dict[str, str] | None:
    """Return ``{"msg": "..."}`` when a track has club-risk flags (UI yellow badge).

    Unlike :func:`score`, this does not block ingest — it surfaces borderline issues
    (clipping, low bitrate, loudness/headroom prep gaps, CDJ incompatibility).
    """
    flags: list[str] = []

    clipping = float(metrics.get("clipping", metrics.get("clipping_ratio", 0)) or 0)
    if clipping > 0.001:
        flags.append("clipping detectado")
    if metrics.get("corruption"):
        flags.append("possível corrupção de áudio")

    kbps = float(metrics.get("bitrate", metrics.get("bitrate_kbps", 0)) or 0)
    if 0 < kbps < 320:
        flags.append(f"bitrate baixo ({int(kbps)} kbps)")

    if qc:
        if qc.get("qc") == "FAIL":
            for r in (qc.get("reasons") or [])[:2]:
                flags.append(str(r).replace("_", " "))
        lufs = qc.get("lufs")
        if lufs is not None and not (-24.0 <= float(lufs) <= -6.0):
            flags.append(f"LUFS fora da faixa club ({float(lufs):.1f})")
        if qc.get("clipping"):
            flags.append("true-peak / clipping no QC")

    if prep_steps:
        head = prep_steps.get("02_headroom") or {}
        loud = prep_steps.get("03_loudness") or {}
        if head.get("skipped") or head.get("error"):
            flags.append("headroom / Gain EQ incompleto")
        if loud.get("skipped") or loud.get("error"):
            flags.append("normalização LUFS incompleta")

    if cdj_audit is not None and not cdj_audit.get("cdj_ok", True):
        detail = (cdj_audit.get("reasons") or ["compatibilidade CDJ"])[:1]
        flags.append(str(detail[0]))

    if not flags:
        return None
    unique: list[str] = []
    seen: set[str] = set()
    for f in flags:
        if f not in seen:
            seen.add(f)
            unique.append(f)
    return {"msg": "; ".join(unique[:3])}


#: Minimum f3 health score that still permits a USB export.
USB_EXPORT_MIN_SCORE: float = 40.0


def check_usb_health(usb_result: Dict[str, Any], *, audio_score: float | None = None) -> Dict[str, Any]:
    """Decide whether a USB export may proceed, given an f3 test result.

    *usb_result* is a :func:`apollodj.ingest.pendrive_utils.run_f3_test_streaming`
    dict (``fake_detected`` / ``health_score`` / ``bad_blocks_count`` /
    ``available`` …). Returns::

        {
          "export_allowed": bool,
          "usb_health_score": int,
          "badge": "green"|"yellow"|"red",
          "reasons": [str, ...],
          "combined_score": float,   # only when audio_score is given
        }

    Rules (priority A — never silently ship a bad pendrive):
      · counterfeit capacity (``fake_detected``)      → blocked.
      · health score below :data:`USB_EXPORT_MIN_SCORE` → blocked.
      · f3 not installed (``available is False``)      → allowed (graceful;
        the speed-benchmark gate in :func:`usb_exporter.usb_health_check`
        remains the #2 fallback), but flagged in ``reasons``.
    """
    fake = bool(usb_result.get("fake_detected"))
    score_val = int(usb_result.get("health_score", 0) or 0)
    available = usb_result.get("available", True)
    bad_blocks = int(usb_result.get("bad_blocks_count", 0) or 0)

    reasons: list[str] = []
    allowed = True

    if available is False:
        reasons.append("teste f3 indisponível — usando benchmark de velocidade")
    else:
        if fake:
            allowed = False
            reasons.append("capacidade falsa detectada")
        if score_val < USB_EXPORT_MIN_SCORE:
            allowed = False
            reasons.append(f"saúde do pendrive baixa ({score_val}/100)")
        if bad_blocks > 0:
            reasons.append("blocos defeituosos / perda de dados")

    out: Dict[str, Any] = {
        "export_allowed": allowed,
        "usb_health_score": score_val,
        "badge": usb_result.get("health_status") or ("red" if (fake or score_val < 50) else "green"),
        "reasons": reasons,
    }
    if audio_score is not None:
        out["combined_score"] = round((score_val + float(audio_score)) / 2.0, 1)
    return out


def score(metrics: Dict[str, Any], *, threshold: float = THRESHOLD) -> QualityResult:
    """Compute the weighted quality score for a track.

    Args:
        metrics: Dict with keys ``duration``, ``clipping``, ``bitrate``,
            ``analysis_confidence``, ``corruption``. Missing keys score as 0.
        threshold: Pass threshold (default 80.0).

    Returns:
        :class:`QualityResult` with score, pass flag, breakdown, and reasons.
    """
    raw = {
        "duration": _score_duration(float(metrics.get("duration", 0))),
        "clipping": _score_clipping(float(metrics.get("clipping", 0))),
        "bitrate": _score_bitrate(float(metrics.get("bitrate", 0))),
        "analysis_confidence": _score_analysis_confidence(metrics.get("analysis_confidence", 0)),
        "corruption": _score_corruption(metrics.get("corruption", False)),
    }
    breakdown = {k: round(raw[k] * WEIGHTS[k], 2) for k in WEIGHTS}
    total = round(sum(breakdown.values()), 2)
    reasons: list[str] = [k for k, v in raw.items() if v < 0.5]
    warn = club_playability_warn(metrics)
    return QualityResult(
        score=total,
        passed=total >= threshold,
        breakdown=breakdown,
        reasons=reasons,
        warn=warn,
    )
