/* ════════════════════════════════════════════════════════════
   waveform.js — PAGE: Ferramentas / Waveform
   Pro canvas waveform visualizer: beat grid, hot cues, loop region,
   playhead, spectral bars, zoom/scroll, deck state integration.
   Backend ref: APO [LDW]
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.waveform = function (mount) {
    mount.innerHTML = `
      <div class="pane reveal">
        <aside class="aside">
          <div class="aside-head"><div class="aside-title">Waveform</div></div>
          <div class="aside-scroll">
            <div class="sec-label first"><span>Deck ativo</span></div>
            <div class="tree-node selected" id="wf-deck1">
              <i class="ri-play-circle-line ti"></i><span>Deck 01</span>
            </div>
            <div class="tree-node" id="wf-deck2">
              <i class="ri-play-circle-line ti"></i><span>Deck 02</span>
            </div>

            <div class="sec-label"><span>Zoom</span></div>
            <div class="tree-node selected" id="wf-z1" data-zoom="1">
              <i class="ri-zoom-in-line ti"></i><span>1× completo</span>
            </div>
            <div class="tree-node" id="wf-z2" data-zoom="2">
              <i class="ri-zoom-in-line ti"></i><span>2× detalhe</span>
            </div>
            <div class="tree-node" id="wf-z4" data-zoom="4">
              <i class="ri-zoom-in-line ti"></i><span>4× fino</span>
            </div>

            <div class="sec-label"><span>Hot Cues</span></div>
            <div id="wf-cue-list" style="padding:4px 0 2px;"></div>
            <div class="tree-node" id="wf-add-cue" style="cursor:pointer;">
              <i class="ri-add-circle-line ti" style="color:var(--primary)"></i>
              <span style="color:var(--primary)">Adicionar Hot Cue</span>
            </div>

            <div class="sec-label"><span>Memory Loop</span></div>
            <div style="padding:8px 12px;font-size:11px;font-family:var(--ff-mono);color:var(--gray-1);" id="wf-loop-info">
              Loop: <span id="wf-li">—</span> → <span id="wf-lo">—</span>
            </div>

            <div class="sec-label"><span>Modo</span></div>
            <div class="btn-row" style="padding:4px 12px 8px;display:flex;gap:8px;flex-wrap:wrap;">
              <button type="button" class="btn-secondary btn-sm" id="wf-mode-classic"><i class="ri-bar-chart-grouped-line"></i> Apollo Clássico</button>
              <button type="button" class="btn-secondary btn-sm" id="wf-mode-cdj"><i class="ri-record-circle-line"></i> CDJ / Pioneer</button>
            </div>
          </div>
        </aside>
        <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
          <!-- Beatgrid ruler strip (CDJ-style) -->
          <div id="wf-beatgrid-strip" style="height:22px;background:var(--wf-ruler-bg,#040404);flex-shrink:0;overflow:hidden;position:relative;border-radius:var(--r) var(--r) 0 0;">
            <canvas id="wf-beatgrid" style="position:absolute;inset:0;width:100%;height:100%;"></canvas>
          </div>
          <!-- DJ Prep metadata strip -->
          <div id="wf-djprep" style="display:flex;align-items:center;gap:12px;padding:10px 16px 6px;flex-shrink:0;border-bottom:1px solid var(--white-4);">
            <span class="mono" style="font-size:10px;color:var(--gray-1);">Carregue uma faixa</span>
          </div>
          <div class="content-hdr" style="padding-top:8px;">
            <span class="ch-label" id="wf-track-label">WAVEFORM</span>
            <span class="ch-count" id="wf-track-info">nenhuma faixa</span>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;padding:4px 12px 10px;gap:6px;">
            <!-- Overview bar -->
            <canvas id="wf-overview" style="width:100%;height:28px;border-radius:8px;display:block;"></canvas>
            <!-- Main waveform -->
            <canvas id="wf-canvas" style="width:100%;flex:1;border-radius:var(--r);display:block;cursor:crosshair;"></canvas>
            <!-- Playhead time + hotcue legend -->
            <div style="display:flex;justify-content:space-between;align-items:center;padding:0 2px;">
              <span class="mono muted" style="font-size:10px;" id="wf-elapsed">00:00</span>
              <span class="mono muted" style="font-size:10px;" id="wf-remain">−00:00</span>
            </div>
            <div id="wf-cue-legend" style="display:flex;flex-wrap:wrap;gap:4px;"></div>
          </div>
        </section>
      </div>`;

    /* ── State ─────────────────────────────────────── */
    /* Inject waveform canvas tokens once (readable via getComputedStyle) */
    if (!document.getElementById('wf-css')) {
      const _s = document.createElement('style');
      _s.id = 'wf-css';
      _s.textContent = ':root{--wf-bg:#0a0a0a;--wf-cdj-bg:#000000;--wf-loop:#0ea5e9;}';
      document.head.appendChild(_s);
    }
    /* Read design tokens once (canvas can't use CSS vars natively) */
    const _root    = document.documentElement;
    const _primary = getComputedStyle(_root).getPropertyValue('--ac').trim() || getComputedStyle(_root).getPropertyValue('--primary').trim() || '#E8820C';
    const _wfBg    = getComputedStyle(_root).getPropertyValue('--wf-bg').trim()     || '#0a0a0a';
    const _wfCdjBg = getComputedStyle(_root).getPropertyValue('--wf-cdj-bg').trim() || '#000000';
    /* Pre-computed alpha variants for canvas (canvas ctx can't use color-mix) */
    const _wfLoopA = 'rgba(14,165,233,0.14)';  /* loop region fill   */
    const _wfLoopB = 'rgba(14,165,233,0.68)';  /* loop region stroke */

    /* ── Global preferences shim (localStorage ↔ optional pyBridge) ── */
    if (!window.ApolloPrefs) {
      window.ApolloPrefs = {
        get(k, d) {
          try {
            if (window.pyBridge && typeof window.pyBridge.get_user_preferences === 'function') {
              const p = JSON.parse(window.pyBridge.get_user_preferences() || '{}');
              return k in p ? p[k] : d;
            }
          } catch(e) {}
          const v = localStorage.getItem('apDJ_pref_' + k);
          return v !== null ? JSON.parse(v) : d;
        },
        set(k, v) {
          localStorage.setItem('apDJ_pref_' + k, JSON.stringify(v));
          try {
            if (window.pyBridge && typeof window.pyBridge.set_user_preference === 'function')
              window.pyBridge.set_user_preference(k, JSON.stringify(v));
          } catch(e) {}
        }
      };
    }
    let wfMode = window.ApolloPrefs.get('wf_mode', 'classic');

    let activeDeck    = 1;
    let zoomLevel     = 1;
    let scrollOffset  = 0;    /* 0–1 fraction */
    let isDragging    = false;
    let dragStartX    = 0;
    let dragStartOff  = 0;
    let animFrame     = null;
    let playPos       = 0;    /* 0–1 playhead fraction */
    let playing       = false;

    function getTrack() {
      const idx = ApolloState.state['deck' + activeDeck].track;
      return idx !== null ? { tr: window.T[idx], an: AnalysisStore.get(idx), idx } : null;
    }

    /* ── Canvas rendering ──────────────────────────── */
    const canvas   = mount.querySelector('#wf-canvas');
    const overview = mount.querySelector('#wf-overview');

    function genBars(seed, count) {
      const bars = [];
      let s = seed || 1;
      for (let i = 0; i < count; i++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        bars.push(0.15 + ((s & 0xFF) / 255) * 0.85);
      }
      return bars;
    }

    function drawMain(tr, an) {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      canvas.width  = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, W, H);

      /* Dark background — wavypy style */
      ctx.fillStyle = _wfBg;
      ctx.fillRect(0, 0, W, H);

      /* Use SIM_WAVEDATA for per-track spectral bands */
      const tData = getTrack();
      const wd   = (window.SIM_WAVEDATA || [])[(tData ? tData.idx : 0)] || { low:[], mid:[], high:[] };
      const BARS = Math.max(wd.low.length, Math.floor(W / 3) * zoomLevel);
      /* Fall back to genBars when SIM_WAVEDATA not present */
      const lowB  = wd.low.length  ? wd.low  : genBars((tr ? tr.bpm : 128) + 0, BARS);
      const midB  = wd.mid.length  ? wd.mid  : genBars((tr ? tr.bpm : 128) + 1, BARS);
      const highB = wd.high.length ? wd.high : genBars((tr ? tr.bpm : 128) + 2, BARS);

      const visibleBars = Math.max(1, Math.floor(BARS / zoomLevel));
      const startBar    = Math.floor(scrollOffset * (BARS - visibleBars));
      const barW        = W / visibleBars;

      /* wavypy color scheme: low=blue, mid=amber, high=white */
      const LAYERS = [
        { arr: lowB,  frac: 0.55, color: 'rgba(0,85,226,0.82)'   },
        { arr: midB,  frac: 0.38, color: 'rgba(242,170,60,0.72)' },
        { arr: highB, frac: 0.20, color: 'rgba(255,255,255,0.55)' },
      ];

      for (let li = 0; li < LAYERS.length; li++) {
        const layer = LAYERS[li];
        ctx.fillStyle = layer.color;
        for (let i = 0; i < visibleBars; i++) {
          const b    = layer.arr[startBar + i] || 0;
          const h    = b * H * layer.frac;
          const x    = i * barW;
          const yTop = (H - h) / 2;
          ctx.fillRect(x + 0.5, yTop, Math.max(barW - 1, 1), h);
        }
      }

      /* Beat grid ticks */
      if (an) {
        const bpm     = an.bpm || 128;
        const secPerB = 60 / bpm;
        const totalSec = 360; /* assume 6 min */
        const totalBars = Math.floor(totalSec / secPerB);
        ctx.save();
        for (let b = 0; b < totalBars; b++) {
          const frac   = b / totalBars;
          const xGlobal = frac * BARS;
          if (xGlobal < startBar || xGlobal > startBar + visibleBars) continue;
          const x = ((xGlobal - startBar) / visibleBars) * W;
          const isPhrase   = b % 64 === 0;
          const isDownbeat = b % 4  === 0;
          ctx.strokeStyle = isPhrase   ? _primary + 'e6' :
                            isDownbeat ? _primary + '66' : 'rgba(0,0,0,0.12)';
          ctx.lineWidth   = isPhrase   ? 2   : isDownbeat ? 1 : 0.5;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        ctx.restore();

        /* Hot cue markers — HC_COLORS with label triangles */
        if (an.hotcues) {
          an.hotcues.forEach(cue => {
            /* Support both {bar} (legacy) and {time} (SIM_HOTCUES) */
            const bpmV    = an.bpm || 128;
            const spb     = 240 / bpmV;
            const totalSec = 360;
            const cueFrac  = cue.time != null
              ? cue.time / totalSec
              : (cue.bar * spb) / totalSec;
            const xGlobal = cueFrac * BARS;
            if (xGlobal < startBar || xGlobal > startBar + visibleBars) return;
            const x = ((xGlobal - startBar) / visibleBars) * W;
            const hcColor = cue.color || (window.HC_COLORS && cue.label ? window.HC_COLORS[cue.label] : _primary);
            ctx.save();
            ctx.fillStyle   = hcColor;
            ctx.strokeStyle = hcColor;
            /* Vertical line */
            ctx.globalAlpha = 0.65;
            ctx.lineWidth   = 1.5;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
            /* Triangle */
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.moveTo(x - 7, 0); ctx.lineTo(x + 7, 0); ctx.lineTo(x, 13); ctx.closePath();
            ctx.fill();
            /* Label */
            if (cue.label) {
              ctx.fillStyle = '#000';
              ctx.font      = 'bold 8px monospace';
              ctx.textAlign = 'center';
              ctx.fillText(cue.label, x, 10);
            }
            ctx.restore();
          });
        }

        /* Loop region */
        if (an.loop) {
          const liFrac   = an.loop.bar / 128;
          const loDur    = an.loop.len  / 128;
          const xLi = ((liFrac * BARS - startBar) / visibleBars) * W;
          const xLo = (((liFrac + loDur) * BARS - startBar) / visibleBars) * W;
          if (xLo > 0 && xLi < W) {
            ctx.save();
            ctx.fillStyle   = _wfLoopA;
            ctx.fillRect(xLi, 0, xLo - xLi, H);
            ctx.strokeStyle = _wfLoopB;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(xLi, 0, xLo - xLi, H);
            ctx.restore();
          }
          /* Update aside loop info */
          const liEl = mount.querySelector('#wf-li');
          const loEl = mount.querySelector('#wf-lo');
          if (liEl) liEl.textContent = an.loop.bar + '.0';
          if (loEl) loEl.textContent = (an.loop.bar + an.loop.len) + '.0';
        }
      }

      /* Playhead */
      const phX = ((playPos * BARS - startBar) / visibleBars) * W;
      if (phX >= 0 && phX <= W) {
        ctx.save();
        ctx.strokeStyle = _primary;
        ctx.lineWidth   = 2;
        ctx.shadowColor = _primary + '99';
        ctx.shadowBlur  = 8;
        ctx.beginPath(); ctx.moveTo(phX, 0); ctx.lineTo(phX, H); ctx.stroke();
        /* playhead triangle at top */
        ctx.shadowBlur = 0;
        ctx.fillStyle = _primary;
        ctx.beginPath();
        ctx.moveTo(phX - 5, 0); ctx.lineTo(phX + 5, 0); ctx.lineTo(phX, 9); ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      /* Beatgrid ruler canvas */
      const bgCanvas = mount.querySelector('#wf-beatgrid');
      if (bgCanvas) {
        const bgW = bgCanvas.parentElement.clientWidth;
        const bgH = bgCanvas.parentElement.clientHeight;
        bgCanvas.width = bgW; bgCanvas.height = bgH;
        const bgCtx = bgCanvas.getContext('2d');
        bgCtx.clearRect(0, 0, bgW, bgH);
        if (an) {
          const bpmV   = an.bpm || 128;
          const totalSec = 360;
          const secPerB  = 60 / bpmV;
          const totalBeats = Math.floor(totalSec / secPerB);
          const tickH = [bgH, bgH * 0.70, bgH * 0.50, bgH * 0.34];
          const alpha  = [1.0, 0.65, 0.42, 0.25];
          bgCtx.textBaseline = 'alphabetic';
          for (let b = 0; b < totalBeats; b++) {
            const frac   = b / totalBeats;
            const xGlobal = frac * BARS;
            if (xGlobal < startBar || xGlobal > startBar + visibleBars) continue;
            const x    = ((xGlobal - startBar) / visibleBars) * bgW;
            const inBar = b % 4;
            const h = tickH[inBar], a = alpha[inBar];
            if (inBar === 0) {
              bgCtx.fillStyle = 'rgba(255,42,42,0.90)';
              bgCtx.fillRect(x | 0, 0, 1, bgH);
              const bar = Math.floor(b / 4) + 1;
              bgCtx.fillStyle = 'rgba(255,60,60,0.80)';
              bgCtx.font = 'bold 8px monospace';
              bgCtx.fillText(String(bar), (x | 0) + 2, bgH - 2);
            } else {
              bgCtx.fillStyle = `rgba(255,255,255,${a})`;
              bgCtx.fillRect(x | 0, bgH - h, 1, h);
            }
          }
        }
      }
    }

    function drawOverview(tr, an) {
      const W = overview.offsetWidth;
      const H = overview.offsetHeight || 28;
      overview.width  = W;
      overview.height = H;
      const ctx = overview.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      /* Dark bg */
      ctx.fillStyle = _wfBg;
      ctx.fillRect(0, 0, W, H);
      const idx  = getTrack() ? getTrack().idx : 0;
      const wd   = (window.SIM_WAVEDATA || [])[idx] || {};
      const lowB = wd.low && wd.low.length ? wd.low : genBars(tr ? tr.bpm : 128, W);
      /* Render scaled to W */
      const scale = lowB.length / W;
      for (let i = 0; i < W; i++) {
        const b = lowB[Math.floor(i * scale)] || 0;
        const h = b * H * 0.75;
        ctx.fillStyle = 'rgba(0,85,226,0.55)';
        ctx.fillRect(i, (H - h) / 2, 1, h);
      }
      /* viewport rect */
      const vFrac = 1 / zoomLevel;
      ctx.fillStyle = _primary + '1a';
      ctx.fillRect(scrollOffset * (1 - vFrac) * W, 0, vFrac * W, H);
      ctx.strokeStyle = _primary + '80';
      ctx.lineWidth = 1;
      ctx.strokeRect(scrollOffset * (1 - vFrac) * W, 0, vFrac * W, H);
    }

    function drawMainCDJ(tr, an) {
      /* CDJ / Pioneer mode: 1px-wide bars, asymmetric bands, red downbeats */
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      canvas.width  = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      /* CDJ-style canvas background */
      ctx.fillStyle = _wfCdjBg;
      ctx.fillRect(0, 0, W, H);

      const tData = getTrack();
      const wd    = (window.SIM_WAVEDATA || [])[(tData ? tData.idx : 0)] || { low:[], mid:[], high:[] };
      const BARS  = Math.max(wd.low.length, Math.floor(W / 3) * zoomLevel);
      const lowB  = wd.low.length  ? wd.low  : genBars((tr ? tr.bpm : 128) + 0, BARS);
      const midB  = wd.mid.length  ? wd.mid  : genBars((tr ? tr.bpm : 128) + 1, BARS);
      const highB = wd.high.length ? wd.high : genBars((tr ? tr.bpm : 128) + 2, BARS);

      const visibleBars = Math.max(1, Math.floor(BARS / zoomLevel));
      const startBar    = Math.floor(scrollOffset * (BARS - visibleBars));
      const stride      = W / visibleBars;
      const center      = H / 2;

      /* CDJ band scheme: Pioneer XDJ-style 1px vertical bars, asymmetric above/below */
      const CDJ_BANDS = [
        { arr: lowB,  maxF: 0.55, minF: 0.40, color: 'rgba(26,111,255,0.88)'  },
        { arr: midB,  maxF: 0.38, minF: 0.27, color: 'rgba(242,170,60,0.78)'  },
        { arr: highB, maxF: 0.20, minF: 0.14, color: 'rgba(255,255,255,0.92)' },
      ];
      for (const band of CDJ_BANDS) {
        ctx.fillStyle = band.color;
        for (let i = 0; i < visibleBars; i++) {
          const b    = band.arr[startBar + i] || 0;
          const hTop = b * H * band.maxF;
          const hBot = b * H * band.minF;
          const x    = (i * stride) | 0;
          /* above center */
          ctx.fillRect(x, (center - hTop) | 0, 1, Math.max(1, hTop | 0));
          /* below center (narrower — Pioneer asymmetric look) */
          ctx.fillRect(x, center | 0, 1, Math.max(1, hBot | 0));
        }
      }

      /* CDJ beat grid — red downbeats + bar numbers + sub-beat ticks */
      if (an) {
        const bpm      = an.bpm || 128;
        const totalSec = 360;
        const totalBars = Math.floor(totalSec / (60 / bpm));
        ctx.save();
        for (let b = 0; b < totalBars; b++) {
          const frac    = b / totalBars;
          const xGlobal = frac * BARS;
          if (xGlobal < startBar || xGlobal > startBar + visibleBars) continue;
          const x      = ((xGlobal - startBar) / visibleBars) * W;
          const isDown = b % 4 === 0;
          const isHalf = b % 4 === 2;
          ctx.fillStyle = isDown ? 'rgba(255,42,42,0.90)'
                        : isHalf ? 'rgba(255,255,255,0.30)'
                        :          'rgba(255,255,255,0.14)';
          const tH = isDown ? H : isHalf ? H * 0.55 : H * 0.30;
          ctx.fillRect(x | 0, H - tH, 1, tH);
          if (isDown) {
            ctx.fillStyle = 'rgba(255,80,80,0.85)';
            ctx.font      = 'bold 8px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(String(Math.floor(b / 4) + 1), (x | 0) + 2, H - 3);
          }
        }
        ctx.restore();

        /* Hot cue markers — same logic as drawMain */
        if (an.hotcues) {
          an.hotcues.forEach(cue => {
            const bpmV    = an.bpm || 128;
            const spb     = 240 / bpmV;
            const cueFrac = cue.time != null
              ? cue.time / 360
              : (cue.bar * spb) / 360;
            const xGlobal = cueFrac * BARS;
            if (xGlobal < startBar || xGlobal > startBar + visibleBars) return;
            const x       = ((xGlobal - startBar) / visibleBars) * W;
            const hcColor = cue.color || (window.HC_COLORS && cue.label ? window.HC_COLORS[cue.label] : _primary);
            ctx.save();
            ctx.fillStyle   = hcColor;
            ctx.strokeStyle = hcColor;
            ctx.globalAlpha = 0.65;
            ctx.lineWidth   = 1.5;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.moveTo(x - 7, 0); ctx.lineTo(x + 7, 0); ctx.lineTo(x, 13); ctx.closePath();
            ctx.fill();
            if (cue.label) {
              ctx.fillStyle = '#000';
              ctx.font      = 'bold 8px monospace';
              ctx.textAlign = 'center';
              ctx.fillText(cue.label, x, 10);
            }
            ctx.restore();
          });
        }

        /* Loop region */
        if (an.loop) {
          const liFrac = an.loop.bar / 128;
          const loDur  = an.loop.len  / 128;
          const xLi = ((liFrac * BARS - startBar) / visibleBars) * W;
          const xLo = (((liFrac + loDur) * BARS - startBar) / visibleBars) * W;
          if (xLo > 0 && xLi < W) {
            ctx.save();
            ctx.fillStyle   = _wfLoopA;
            ctx.fillRect(xLi, 0, xLo - xLi, H);
            ctx.strokeStyle = _wfLoopB;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(xLi, 0, xLo - xLi, H);
            ctx.restore();
          }
        }
      }

      /* White playhead — CDJ style with ▼ top + ▲ bottom triangles */
      const phX = ((playPos * BARS - startBar) / visibleBars) * W;
      if (phX >= 0 && phX <= W) {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 2;
        ctx.beginPath(); ctx.moveTo(phX, 0); ctx.lineTo(phX, H); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        /* ▼ top */
        ctx.beginPath();
        ctx.moveTo(phX - 5, 0); ctx.lineTo(phX + 5, 0); ctx.lineTo(phX, 9);
        ctx.closePath(); ctx.fill();
        /* ▲ bottom */
        ctx.beginPath();
        ctx.moveTo(phX - 5, H); ctx.lineTo(phX + 5, H); ctx.lineTo(phX, H - 9);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      /* Beatgrid ruler canvas — shared with classic mode */
      const bgCanvas = mount.querySelector('#wf-beatgrid');
      if (bgCanvas) {
        const bgW = bgCanvas.parentElement.clientWidth;
        const bgH = bgCanvas.parentElement.clientHeight;
        bgCanvas.width = bgW; bgCanvas.height = bgH;
        const bgCtx = bgCanvas.getContext('2d');
        bgCtx.clearRect(0, 0, bgW, bgH);
        if (an) {
          const bpmV       = an.bpm || 128;
          const totalSec   = 360;
          const secPerB    = 60 / bpmV;
          const totalBeats = Math.floor(totalSec / secPerB);
          const tickH = [bgH, bgH * 0.70, bgH * 0.50, bgH * 0.34];
          const alpha  = [1.0, 0.65, 0.42, 0.25];
          bgCtx.textBaseline = 'alphabetic';
          for (let b = 0; b < totalBeats; b++) {
            const frac    = b / totalBeats;
            const xGlobal = frac * BARS;
            if (xGlobal < startBar || xGlobal > startBar + visibleBars) continue;
            const x    = ((xGlobal - startBar) / visibleBars) * bgW;
            const inBar = b % 4;
            if (inBar === 0) {
              bgCtx.fillStyle = 'rgba(255,42,42,0.90)';
              bgCtx.fillRect(x | 0, 0, 1, bgH);
              bgCtx.fillStyle = 'rgba(255,60,60,0.80)';
              bgCtx.font = 'bold 8px monospace';
              bgCtx.fillText(String(Math.floor(b / 4) + 1), (x | 0) + 2, bgH - 2);
            } else {
              bgCtx.fillStyle = `rgba(255,255,255,${alpha[inBar]})`;
              bgCtx.fillRect(x | 0, bgH - tickH[inBar], 1, tickH[inBar]);
            }
          }
        }
      }
    }

    function parseDur(t) {
      const p = t.split(':');
      return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }

    function redraw() {
      const t = getTrack();
      if (!t) {
        /* empty state */
        const ctx = canvas.getContext('2d');
        canvas.width  = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        if (ctx) {
          ctx.fillStyle = _wfBg;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.font = '12px var(--ff-mono)';
          ctx.textAlign = 'center';
          ctx.fillText('Carregue uma faixa no Deck ' + activeDeck, canvas.width / 2, canvas.height / 2);
        }
        const prep = mount.querySelector('#wf-djprep');
        if (prep) prep.innerHTML = `<span class="mono" style="font-size:10px;color:var(--gray-1);">Carregue uma faixa no Deck ${activeDeck}</span>`;
        return;
      }
      if (wfMode === 'cdj') drawMainCDJ(t.tr, t.an); else drawMain(t.tr, t.an);
      drawOverview(t.tr, t.an);

      /* Update aside cue list */
      const cueList = mount.querySelector('#wf-cue-list');
      if (cueList && t.an && t.an.hotcues) {
        cueList.innerHTML = t.an.hotcues.map((c) => {
          const color = c.color || (window.HC_COLORS && c.label ? window.HC_COLORS[c.label] : _primary);
          return `<div class="tree-node" style="font-size:11px;">
             <i class="ri-flag-line ti" style="color:${color}"></i>
             <span>${c.label} — ${c.type || ''}</span>
           </div>`;
        }).join('');
      }

      /* Update labels */
      const lbl = mount.querySelector('#wf-track-label');
      const inf = mount.querySelector('#wf-track-info');
      if (lbl) lbl.textContent = t.tr.title.toUpperCase();
      if (inf) inf.textContent = `${t.tr.bpm} BPM · ${t.tr.key} · ${t.tr.t}`;

      /* DJ Prep metadata strip */
      const prep = mount.querySelector('#wf-djprep');
      if (prep && t.an) {
        const bpm    = t.an.bpm || t.tr.bpm;
        const beats  = Math.round(bpm * parseDur(t.tr.t) / 60);
        const offset = ((7 * (t.idx + 1)) % 124 / 1000).toFixed(3);
        prep.innerHTML = [
          `<span class="mono" style="font-size:11px;color:var(--txt-heading);font-weight:600">BPM <span style="color:var(--primary)">${bpm}</span></span>`,
          `<span class="mono muted" style="font-size:10px">${beats} beats</span>`,
          `<span class="mono" style="font-size:10px;color:var(--gray-1);">offset <span style="color:var(--txt-heading)">${offset}s</span></span>`,
          `<span class="tag tag-mute mono" style="font-size:9px">${t.tr.key}</span>`,
          `<span class="mono muted" style="font-size:10px">${t.an.sr} Hz</span>`,
          `<span class="tag ${t.an.cdj_ok ? 'tag-ok' : 'tag-warn'}" style="font-size:9px">CDJ ${t.an.cdj_ok ? 'OK' : '!'}</span>`,
          `<span class="mono muted" style="font-size:10px">${t.an.lufs} LUFS</span>`,
        ].join('');
      } else if (prep) {
        prep.innerHTML = `<span class="mono" style="font-size:10px;color:var(--gray-1);">Carregue uma faixa no Deck ${activeDeck}</span>`;
      }

      /* Hotcue legend chips */
      const legend = mount.querySelector('#wf-cue-legend');
      if (legend && t.an && t.an.hotcues) {
        legend.innerHTML = t.an.hotcues.map(c => {
          const color = c.color || (window.HC_COLORS && c.label ? window.HC_COLORS[c.label] : _primary);
          return `<div style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:99px;background:${color}20;border:1px solid ${color}45;">
            <span style="width:7px;height:7px;border-radius:50%;background:${color};display:inline-block;"></span>
            <span style="font-size:9px;font-family:monospace;color:${color};font-weight:700">${c.label || '·'}</span>
            ${c.type ? `<span style="font-size:9px;color:var(--gray-1)">${c.type}</span>` : ''}
          </div>`;
        }).join('');
      } else if (legend) { legend.innerHTML = ''; }
    }

    /* ── Zoom controls ─────────────────────────────── */
    [1, 2, 4].forEach(z => {
      const btn = mount.querySelector(`#wf-z${z}`);
      if (btn) btn.addEventListener('click', () => {
        zoomLevel = z;
        mount.querySelectorAll('[data-zoom]').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        redraw();
      });
    });

    /* ── Deck selector ─────────────────────────────── */
    ['wf-deck1','wf-deck2'].forEach((id, di) => {
      const btn = mount.querySelector('#' + id);
      if (btn) btn.addEventListener('click', () => {
        activeDeck = di + 1;
        mount.querySelectorAll('#wf-deck1,#wf-deck2').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        scrollOffset = 0;
        playPos = 0;
        redraw();
      });
    });

    /* ── Canvas scroll (drag) ──────────────────────── */
    canvas.addEventListener('mousedown', e => {
      isDragging = true; dragStartX = e.clientX; dragStartOff = scrollOffset;
      canvas.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx   = (e.clientX - dragStartX) / canvas.offsetWidth;
      const vFrac = 1 / zoomLevel;
      scrollOffset = Math.max(0, Math.min(1 - vFrac, dragStartOff - dx));
      redraw();
    });
    document.addEventListener('mouseup', () => {
      isDragging = false;
      canvas.style.cursor = 'crosshair';
    });

    /* Mousewheel zoom */
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      zoomLevel = Math.max(1, Math.min(4, zoomLevel + (e.deltaY < 0 ? 1 : -1)));
      mount.querySelectorAll('[data-zoom]').forEach(b => b.classList.remove('selected'));
      const zBtn = mount.querySelector(`[data-zoom="${zoomLevel}"]`);
      if (zBtn) zBtn.classList.add('selected');
      redraw();
    }, { passive: false });

    /* Click overview to seek */
    overview.addEventListener('click', e => {
      const rect = overview.getBoundingClientRect();
      scrollOffset = Math.max(0, Math.min(1 - 1 / zoomLevel, (e.clientX - rect.left) / rect.width));
      redraw();
    });

    /* ── ApolloState subscriptions ─────────────────── */
    ApolloState.subscribe('deck:loaded', function ({ deck }) {
      if (deck !== activeDeck) return;
      playPos = 0; scrollOffset = 0;
      redraw();
    });

    /* ── Waveform mode toggle ──────────────────────────────────── */
    const _modeClassicBtn = mount.querySelector('#wf-mode-classic');
    const _modeCDJBtn     = mount.querySelector('#wf-mode-cdj');
    function _applyWfMode(m) {
      wfMode = m;
      window.ApolloPrefs.set('wf_mode', m);
      if (_modeClassicBtn) _modeClassicBtn.classList.toggle('is-active', m === 'classic');
      if (_modeCDJBtn)     _modeCDJBtn.classList.toggle('is-active', m === 'cdj');
      redraw();
    }
    _applyWfMode(wfMode); /* apply persisted selection on mount */
    if (_modeClassicBtn) _modeClassicBtn.addEventListener('click', () => _applyWfMode('classic'));
    if (_modeCDJBtn)     _modeCDJBtn.addEventListener('click',     () => _applyWfMode('cdj'));

    setTimeout(redraw, 50);

    /* ── Resize observer ───────────────────────────── */
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => redraw());
      ro.observe(canvas);
    }
  };

})();
