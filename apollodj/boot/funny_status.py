"""apolloDJ PRO — Sistema de Códigos Engraçados (Funny Status System).

Cada passo do boot emite ``STATUS:<code>:<mensagem>`` no stdout, com mensagens
em **pt-BR DJ vibe** que o usuário curte mas não revela o que de fato rolou
no backend. Setting ``APOLLODJ_DEBUG=true`` faz emitir ``DEV:<code>:<real>``
também — útil pra dev investigar.

Categorias por faixa de código (mil = severity bucket):
    1000-1999  Warm-up / pré-boot
    2000-2999  Auth + Apollo handshake
    3000-3999  Nicotine+ / P2P
    4000-4999  Análise de áudio
    5000-5999  Erros / quedas
    6000-6999  USB / pendrive
    7000-7999  Exportação CDJ universal
    8000-8999  Configuração / preferências
    9000-9999  Sucesso final / pronto pra tocar

Uso::

    from apollodj.boot.funny_status import emit, FunnyStatus
    emit(1001)                                  # usa user_msg da tabela
    emit(5001, hint="Tente outra cidade")       # adiciona detalhe ao final
    FunnyStatus.set_debug(True)                 # também emite DEV linhas
"""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class _Code:
    code: int
    user_msg: str           # mensagem engraçada pra UI
    dev_msg: str            # significado real pro dev
    category: str           # bucket textual


# ── Tabela canônica ──────────────────────────────────────────────────────────
# Tom: formal com leve toque DJ (aquecendo, pista, set, lista de amigos…).
# Nada de slapstick. Sarcasmo só em códigos 5xxx (erros), e ainda assim leve.
TABLE: Dict[int, _Code] = {
    # ── 1000-1999 — Warm-up ────────────────────────────────────────────────
    1000: _Code(1000, "Iniciando apolloDJ",
                "App entrypoint reached", "warmup"),
    1001: _Code(1001, "Aquecendo conexão com o servidor",
                "Server warming up / maintenance gate check", "warmup"),
    1002: _Code(1002, "Estrutura local pronta",
                "ensure_paths() created folder skeleton", "warmup"),
    1003: _Code(1003, "Versão verificada",
                "updates.json compared; current_version is fresh", "warmup"),
    1004: _Code(1004, "Cache local carregado",
                "Dados/ (ex-Cache) directory mounted + DB cache loaded", "warmup"),

    # ── 2000-2999 — Auth + Apollo ──────────────────────────────────────────
    2001: _Code(2001, "Conectando ao Apollo",
                "Auth request → apollo.rio.br /a/v1/app/auth", "auth"),
    2002: _Code(2002, "Validando token",
                "Token validation via /a/v1/app/verify", "auth"),
    2003: _Code(2003, "Sessão criada com sucesso",
                "Auth handshake OK — user data returned", "auth"),
    2004: _Code(2004, "Conferindo lista de amigos…",
                "membership_tier check (apolloDJ-* gate)", "auth"),
    2005: _Code(2005, "Login necessário",
                "AUTH_REQUIRED — login page must show", "auth"),

    # ── 3000-3999 — Nicotine+ ──────────────────────────────────────────────
    3001: _Code(3001, "Iniciando rede P2P",
                "Starting Nicotine+ headless subprocess", "p2p"),
    3002: _Code(3002, "Configurando credencial dedicada",
                "generate_nicotine_credential → DDMMYY+slug+.aprio", "p2p"),
    3003: _Code(3003, "Rede P2P disponível",
                "Nicotine+ port 5000 reachable", "p2p"),
    3004: _Code(3004, "Filtro de qualidade ativo (320 kbps+)",
                "match_nicotine_filter active — DJ-grade only", "p2p"),
    3005: _Code(3005, "Rede P2P indisponível neste plano",
                "Free tier — Nicotine+ disabled by gating", "p2p"),

    # ── 4000-4999 — Análise ────────────────────────────────────────────────
    4001: _Code(4001, "Faixa enfileirada para análise",
                "ImportQueue enqueued track", "analysis"),
    4002: _Code(4002, "Detectando BPM e tonalidade",
                "BPM/Key detection running (apolloBPK)", "analysis"),
    4003: _Code(4003, "Gerando impressão digital de áudio",
                "Fingerprint computed (chromaprint or sha256)", "analysis"),
    4004: _Code(4004, "Faixa já indexada — análise descartada",
                "Fingerprint HIT in xml_db, skipping DSP", "analysis"),
    4005: _Code(4005, "LUFS −14 aplicado, headroom estável",
                "Loudness dual-pass loudnorm complete", "analysis"),
    4006: _Code(4006, "Hotcues posicionados nas seções",
                "Smart HotCues placed at structure boundaries", "analysis"),

    # ── 5000-5999 — Erros (sarcasmo leve permitido) ───────────────────────
    5001: _Code(5001, "Servidor em manutenção — tente em instantes",
                "Maintenance mode / scheduled downtime", "error"),
    5002: _Code(5002, "Arquivo não encontrado",
                "File not found — path doesn't exist", "error"),
    5003: _Code(5003, "Credenciais inválidas",
                "Auth failed — invalid credentials", "error"),
    5004: _Code(5004, "Versão obsoleta — atualização obrigatória",
                "Mandatory update available — version lock", "error"),
    5005: _Code(5005, "Faixa reprovada pela quality gate",
                "Quality gate FAIL → routed to Duvidosos", "error"),
    5006: _Code(5006, "USB reprovado no teste de velocidade",
                "USB health check FAIL — slow write / read", "error"),
    5007: _Code(5007, "Acesso restrito — convite de DJ necessário",
                "User authenticated but not in AUTHORIZED_MEMBERSHIPS", "error"),

    # ── 6000-6999 — USB / pendrive ─────────────────────────────────────────
    6001: _Code(6001, "USB detectado — testando velocidade",
                "USB device detected — speed benchmark starting", "usb"),
    6002: _Code(6002, "USB aprovado para uso em CDJ",
                "USB health check PASS — write/read above CDJ threshold", "usb"),
    6003: _Code(6003, "Exportando para o USB",
                "Universal export → USB writing", "usb"),

    # ── 7000-7999 — Export universal ──────────────────────────────────────
    7001: _Code(7001, "Rekordbox XML gerado",
                "exporters.rekordbox_xml.write_xml() OK", "export"),
    7002: _Code(7002, "Serato crate gerada",
                "exporters.serato_crates.write_crate() OK", "export"),
    7003: _Code(7003, "Layout universal CDJ montado",
                "exporters.universal_cdj.write_universal_cdj() OK", "export"),
    7004: _Code(7004, "Sidecar JSON salvo",
                ".apollodj.json sidecar written", "export"),

    # ── 8000-8999 — Config / prefs ─────────────────────────────────────────
    8001: _Code(8001, "Configurações carregadas",
                "Configurações/config.ini loaded", "config"),
    8002: _Code(8002, "Interface v3 pronta",
                "apolloDJ.v3.html shell loaded", "config"),

    # ── 9000-9999 — Sucesso ────────────────────────────────────────────────
    9001: _Code(9001, "Sistema pronto — bom set!",
                "Boot complete — shell ready", "ready"),
    9002: _Code(9002, "Login aprovado",
                "Auth success — user authenticated", "ready"),
    9003: _Code(9003, "Coletânea sincronizada",
                "Library loaded — xml_db ready", "ready"),
}


# ── API ──────────────────────────────────────────────────────────────────────

class FunnyStatus:
    """Singleton-style controller for the funny status emitter."""
    _debug: bool = os.environ.get("APOLLODJ_DEBUG", "").lower() in ("1", "true", "yes")

    @classmethod
    def set_debug(cls, enabled: bool) -> None:
        cls._debug = bool(enabled)

    @classmethod
    def is_debug(cls) -> bool:
        return cls._debug

    @classmethod
    def get(cls, code: int) -> Optional[_Code]:
        return TABLE.get(int(code))


def emit(code: int, hint: str = "", **extra: Any) -> None:
    """Emit a funny status line to stdout for the v3 shell to render.

    Format:
        STATUS:<code>:<user_msg>[ — <hint>]
        DEV:<code>:<dev_msg>           (only if APOLLODJ_DEBUG=true)
    """
    entry = FunnyStatus.get(code)
    if entry is None:
        # Unknown code: still emit so the UI doesn't go silent.
        line = f"STATUS:{code}:Algo aconteceu, mas a tabela não sabe o quê"
        if hint:
            line += f" — {hint}"
        print(line, flush=True)
        return

    user_line = f"STATUS:{entry.code}:{entry.user_msg}"
    if hint:
        user_line += f" — {hint}"
    print(user_line, flush=True)

    if FunnyStatus._debug:
        dev_line = f"DEV:{entry.code}:{entry.dev_msg}"
        if extra:
            dev_line += f"  ::  {extra!r}"
        print(dev_line, flush=True)


def emit_safe(code: int, **kw: Any) -> None:
    """``emit`` that never raises (logs to stderr instead)."""
    try:
        emit(code, **kw)
    except Exception as exc:  # pragma: no cover
        try:
            sys.stderr.write(f"[funny_status emit failed for {code}: {exc!r}]\n")
        except Exception:
            pass


# ── CLI self-test ────────────────────────────────────────────────────────────

def _selftest() -> int:
    """Run when invoked as ``python -m apollodj.boot.funny_status`` — prints
    one example per category."""
    seen_cats: set[str] = set()
    for code, entry in sorted(TABLE.items()):
        if entry.category in seen_cats:
            continue
        seen_cats.add(entry.category)
        emit(code)
    print(f"\n[selftest] {len(TABLE)} codes loaded across {len(seen_cats)} categories.")
    return 0


if __name__ == "__main__":
    raise SystemExit(_selftest())
