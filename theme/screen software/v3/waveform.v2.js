/* ════════════════════════════════════════════════════════════
   tab.js — PAGE: DJ Tools Pro / Estação de Preparo de Faixa
   Workstation dark OLED: Toolbar | Nav | Waveform HERO | Inspector.
   Multibanda min/max (low/mid/high) · stride zoom · beatgrid ·
   overview · grid edit · stacked · phrases · energy heatmap ·
   8 hot cues (HC_COLORS) · memory cues/loops · harmônico Camelot.
   ⚙ integra ApolloState 'deck:loaded' · App.toast · RemixIcon.
   Registro: ApolloPages.djToolsPro  (Config.tabs → page:'djToolsPro')
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  /* ── Constantes de arranjo / áudio (faixa demo) ─────────────── */
  const SR = 44100, SPP = 256, DURATION = 238.16054, BPM = 128;
  const COLS_PER_BEAT = (SR * 60 / BPM) / SPP;   // ≈ 80.75
  const COLS_PER_BAR  = COLS_PER_BEAT * 4;        // ≈ 322.99
  const TOTAL         = Math.round(DURATION * SR / SPP); // ≈ 41031
  const MIN_STRIDE = 1.0, MAX_STRIDE = 3.8;

  const barCol = b => b * COLS_PER_BAR;
  const fmt = s => { const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(2).padStart(5, '0')}`; };
  const fract = x => x - Math.floor(x);
  const rnd = i => fract(Math.sin(i * 12.9898 + 78.233) * 43758.5453);
  const noise = i => (rnd(i) + rnd(i * 1.7 + 5) + rnd(i * 0.3 + 11)) / 3;

  // section = [startBar,endBar, kick,bass,mid,high, label, color, energy]
  const SECTIONS = [
    [  0,  8, .00, .10, .22, .55, 'INTRO',   '#27d07a', 2],
    [  8, 16, .55, .30, .30, .62, 'BEAT IN', '#22d3ee', 4],
    [ 16, 32, .80, .55, .55, .70, 'GROOVE',  '#1a6fff', 5],
    [ 32, 40, .70, .45, .62, .92, 'BUILD',   '#f2c200', 7],
    [ 40, 56, .98, .92, .80, .85, 'DROP 1',  '#ff3b30', 9],
    [ 56, 64, .90, .78, .72, .80, 'MAIN',    '#ff6a00', 8],
    [ 64, 72, .05, .20, .66, .45, 'BREAK',   '#a06bff', 3],
    [ 72, 80, .60, .40, .70, .96, 'BUILD 2', '#f2c200', 8],
    [ 80, 96,1.00, .98, .86, .90, 'DROP 2',  '#ff2a2a', 10],
    [ 96,112, .92, .80, .74, .82, 'MAIN 2',  '#ff6a00', 8],
    [112,120, .55, .40, .50, .70, 'OUTRO ▼', '#22d3ee', 4],
    [120,128, .00, .08, .18, .40, 'OUTRO',   '#27d07a', 1],
  ];
  const sectionAt = bar => { for (const s of SECTIONS) if (bar >= s[0] && bar < s[1]) return s; return SECTIONS[SECTIONS.length - 1]; };
  const ramp = bar => { const s = sectionAt(bar); if (s[6] === 'BUILD' || s[6] === 'BUILD 2') { const f = (bar - s[0]) / (s[1] - s[0]); return f * f; } return 0; };

  // Pioneer-style palette — usa HC_COLORS do ecossistema se existir
  const HC_MAP = window.HC_COLORS || null;
  const PIO = HC_MAP ? Object.values(HC_MAP) : ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C2D1', '#0A84FF', '#5E5CE6', '#BF5AF2'];

  const HOTCUES = [
    { n: 1, bar: 1,   name: 'INTRO',   note: 'abre com filtro',   color: PIO[5 % PIO.length] },
    { n: 2, bar: 9,   name: 'KICK IN', note: '4 no chão',          color: PIO[3 % PIO.length] },
    { n: 3, bar: 33,  name: 'BUILD',   note: 'início do snare roll',color: PIO[2 % PIO.length] },
    { n: 4, bar: 41,  name: 'DROP 1',  note: 'groove principal',   color: PIO[0 % PIO.length] },
    { n: 5, bar: 65,  name: 'BREAK',   note: 'atmosfera · ponto de mix', color: PIO[7 % PIO.length] },
    { n: 6, bar: 73,  name: 'BUILD 2', note: 'riser + impacto',    color: PIO[1 % PIO.length] },
    { n: 7, bar: 81,  name: 'DROP 2',  note: 'PICO · energia total',color: PIO[0 % PIO.length] },
    { n: 8, bar: 113, name: 'OUTRO',   note: 'mix de saída · 32',  color: PIO[4 % PIO.length] },
  ];
  const MEMCUES = [{ bar: 17, name: 'M1' }, { bar: 57, name: 'M2' }, { bar: 97, name: 'M3' }];
  const MEMLOOPS = [
    { bar: 65,  bars: 4, name: 'Loop do Break', active: true },
    { bar: 113, bars: 8, name: 'Mix de Saída',  active: false },
  ];

  /* Note categories — luxury grayscale + accent.
     accent:true  → orange #E8820C is allowed (user annotation / warning)
     accent:false → graphite/white glass language (low/mid/high gray tones)
     onCanvas = colour used for the glass-pill bar over the DARK waveform/overview */
  const NOTE_CATS = {
    NOTA:  { label: 'NOTA',  accent: true,  onCanvas: '#E8820C',           onPill: '#E8820C' },
    MIX:   { label: 'MIX',   accent: false, onCanvas: 'rgba(255,255,255,.92)', onPill: 'rgba(0,0,0,.55)' },
    FX:    { label: 'FX',    accent: false, onCanvas: 'rgba(255,255,255,.62)', onPill: 'rgba(0,0,0,.40)' },
    VOCAL: { label: 'VOCAL', accent: false, onCanvas: 'rgba(255,255,255,.78)', onPill: 'rgba(0,0,0,.48)' },
    WARN:  { label: 'WARN',  accent: true,  onCanvas: '#E8820C',           onPill: '#E8820C' },
  };
  const NOTE_CAT_ORDER = ['NOTA', 'MIX', 'FX', 'VOCAL', 'WARN'];
  const noteCat = n => NOTE_CATS[(n && n.cat)] || NOTE_CATS.NOTA;

  // Track notes — each has { time (seconds), text, cat }; populated per-session
  const NOTES = [
    { time: 32.4,  text: 'pad quente no break @ 2:01 · mix em 8A', cat: 'MIX' },
    { time: 96.1,  text: 'energy dip — mix out here',              cat: 'WARN' },
    { time: 181.0, text: 'outro começa — crossfade 16 bar',        cat: 'NOTA' },
  ];

  // Labels for the armed "marcar" tools (stage toolbar)
  const MARK_LABEL = {
    cue: 'CLIQUE P/ MARCAR HOT CUE',
    memcue: 'CLIQUE P/ MARCAR MEMORY CUE',
    loop: 'SEGURE E ARRASTE P/ DEFINIR LOOP · IN/OUT · ou toque rápido',
    note: 'CLIQUE P/ MARCAR ANOTAÇÃO',
  };
  const LOOP_BAR_PRESETS = [2, 4, 8, 16, 32];
  const PHRASES = SECTIONS.map((s, i) => ({ i, start: s[0], end: s[1], name: s[6], color: s[7], energy: s[8] }));
  const WARP = [1, 17, 33, 41, 65, 73, 81, 97, 113];
  const TRIM = { leadEnd: 0.16, tailStart: DURATION - 1.1 };

  /* Waveform color modes — B&W · OldBlue (cyano) · RGB slice matrix */
  const WAVE_PALETTES = {
    mono:    { low: '#5c5c5c', mid: '#9a9a9a', high: '#e6e6e6' },
    oldblue: { low: '#1a3d52', mid: '#1a9fb8', high: '#2afaff' },
    rgb:     { low: '#f52323', mid: '#18f34a', high: '#353cfe' },
  };
  const RGB_SLICE_THRESHOLD = 0.25;
  /* Rekordbox RGB waveform slice matrix — RGB mode only */
  const REKORDBOX_RGB = {
    none: '#222222', low: '#f52323', mid: '#18f34a', high: '#353cfe',
    lowMid: '#d0db55', midHigh: '#2afaff', lowHigh: '#df62f7', full: '#fed8f1',
  };

  const NAV = [
    ['overview', 'Visão Geral',  'ri-dashboard-line'],
    ['beatgrid', 'Beat Grid',    'ri-grid-line'],
    ['hotcues',  'Hot Cues',     'ri-bookmark-3-line', '8'],
    ['memcues',  'Memory Cues',  'ri-flag-line',        '3'],
    ['loops',    'Memory Loops', 'ri-repeat-2-line',    '2'],
    ['phrases',  'Fraseado',     'ri-bar-chart-horizontal-line', '12'],
    ['energy',   'Energia',      'ri-pulse-line'],
    ['harmonic', 'Harmônico',    'ri-compasses-2-line'],
    ['metadata', 'Metadados',    'ri-price-tag-3-line'],
    ['export',   'Exportar',     'ri-upload-2-line'],
  ];
  const SEC_TITLE = {
    overview: ['Visão Geral', 'FAIXA'], beatgrid: ['Beat Grid', 'GRADE'], hotcues: ['Hot Cues', 'PADS'],
    memcues: ['Memory Cues', 'MEM'], loops: ['Memory Loops', 'LOOP'], phrases: ['Fraseado', 'ESTRUTURA'],
    energy: ['Energia', 'MAPA'], harmonic: ['Harmônico', 'TOM'], metadata: ['Metadados', 'TAGS'], export: ['Exportar', 'DESTINOS'],
  };

  /* ════════════════════════════════════════════════════════════
     PÁGINA
  ════════════════════════════════════════════════════════════ */
  ApolloPages.djToolsPro = function (mount) {
    // CSS lives in v3/universal.apollodj.css — no inline injection needed

    /* ── estado (uma fonte da verdade, por montagem) ─────────── */
    const state = {
      bands: null, totalCols: TOTAL, sampleRate: SR, spp: SPP, duration: DURATION, bpm: BPM,
      stride: 2.8, offsetCol: 0,
      bandVisible: { low: true, mid: true, high: true },
      layers: { bar: true, beat: true, '16th': true, phrase: true },
      editMode: false, trimMode: false, stacked: false,
      markMode: null, noteCat: 'NOTA', pos: 0,
      loopBarsPreset: 4, loopDraft: null, loopLive: null,
      loopDragging: false, _markDragged: false, _loopDownX: 0,
      beatOffset: 0, dragging: false, dragStartX: 0, dragStartOffset: 0,
      playing: false, playCol: 0, lastT: 0,
      section: 'overview', selected: null,
      waveBlendMode: 'rgb',
      track: { title: 'Midnight Aurora', artist: 'Sølform', album: 'Phosphor EP', key: '8A', keyName: 'A menor', bpm: '128.00' },
    };
    // recursos para cleanup
    const teardown = { ros: [], raf: 0, win: [], unsub: null };

    const colToTime = c => c * SPP / SR;
    const timeToCol = t => t * SR / SPP;
    const colToX = c => (c - state.offsetCol) * state.stride;
    const xToCol = x => state.offsetCol + x / state.stride;

    /* ── render do shell ─────────────────────────────────────── */
    mount.innerHTML = shellHTML();
    const root = mount.querySelector('.djpro-root');
    const q = s => root.querySelector(s);
    const qa = s => root.querySelectorAll(s);

    const stage = q('#djp-waveStage');
    const waveC = q('#djp-wave'), waveCtx = waveC.getContext('2d');
    const cueC = q('#djp-cueCanvas'), cueCtx = cueC.getContext('2d');
    const bgC = q('#djp-beatgrid'), bgCtx = bgC.getContext('2d');
    const phC = q('#djp-phraseCanvas'), phCtx = phC.getContext('2d');
    const enC = q('#djp-energyCanvas'), enCtx = enC.getContext('2d');
    const ovC = q('#djp-overviewCanvas'), ovCtx = ovC.getContext('2d');
    const ovStrip = q('#djp-overview'), ovView = q('#djp-ovView'), ovPh = q('#djp-ovPh');
    const cueTip = q('#djp-cueTip');
    const ovTip = q('#djp-ovTip');

    /* ── geração multibanda (mesmo modelo min/max da fonte) ──── */
    function generateBands() {
      const mk = () => ({ min: new Float32Array(TOTAL), max: new Float32Array(TOTAL) });
      const low = mk(), mid = mk(), high = mk();
      for (let c = 0; c < TOTAL; c++) {
        const bar = c / COLS_PER_BAR, s = sectionAt(bar), riser = ramp(bar);
        const bp = (c % COLS_PER_BEAT) / COLS_PER_BEAT;
        const beatIdx = Math.floor(c / COLS_PER_BEAT) % 4;
        const hp = (c % (COLS_PER_BEAT / 2)) / (COLS_PER_BEAT / 2);
        const sp = (c % (COLS_PER_BEAT / 4)) / (COLS_PER_BEAT / 4);
        const n = noise(c), n2 = noise(c * 2.3 + 9);
        // LOW — transiente de kick a cada tempo + corpo de sub-grave
        const kick = Math.exp(-Math.pow(bp / 0.10, 2)) * s[2];
        const bass = s[3] * (0.46 + 0.42 * n);
        const lo = Math.min(1, kick * 1.02 + bass * 0.78 + riser * 0.10);
        // MID — acordes/vox + caixa nos tempos 2 e 4
        const snare = ((beatIdx === 1 || beatIdx === 3) ? Math.exp(-Math.pow(bp / 0.12, 2)) * 0.6 : 0);
        const md = Math.min(1, s[4] * (0.40 + 0.46 * Math.abs(Math.sin(bar * 3.1 + n))) + snare * 0.5 + riser * 0.22);
        // HIGH — chimbais (8º contratempo) + shaker 16º + varredura (acentos brancos)
        const hat = Math.exp(-Math.pow((hp - 0.5) / 0.15, 2)) * 0.74;
        const six = Math.exp(-Math.pow((sp - 0.5) / 0.22, 2)) * 0.22;
        const hi = Math.min(0.92, s[5] * (0.16 + hat) + six * n2 + riser * (0.32 + 0.5 * n));
        const a = 0.86 + 0.14 * n, b = 0.82 + 0.18 * n2;
        low.max[c] = lo * a;  low.min[c] = -lo * b;
        mid.max[c] = md * b;  mid.min[c] = -md * a;
        high.max[c] = hi * a; high.min[c] = -hi * b;
      }
      return [{ name: 'low', ...low }, { name: 'mid', ...mid }, { name: 'high', ...high }];
    }

    /* ── renderers ───────────────────────────────────────────── */
    function fit(cv, self) {
      /* self=true measures the canvas itself (used by the phrase lane, whose
         canvas is intentionally taller than its 8px host so labels float above) */
      const r = (self ? cv : cv.parentElement).getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      cv.width = r.width * d; cv.height = r.height * d;
      cv.getContext('2d').setTransform(d, 0, 0, d, 0, 0);
      return { W: r.width, H: r.height };
    }
    function normBand(v) { return Math.max(0, Math.min(1, v || 0)); }
    function bandPalette() {
      return WAVE_PALETTES[state.waveBlendMode] || WAVE_PALETTES.rgb;
    }
    function sliceColorRgb(lo, mi, hi) {
      const low = normBand(lo), mid = normBand(mi), high = normBand(hi);
      const t = RGB_SLICE_THRESHOLD;
      const hasL = low > t, hasM = mid > t, hasH = high > t;
      const C = REKORDBOX_RGB;
      if (hasL && hasM && hasH) return C.full;
      if (hasL && hasH) return C.lowHigh;
      if (hasM && hasH) return C.midHigh;
      if (hasL && hasM) return C.lowMid;
      if (hasL) return C.low;
      if (hasM) return C.mid;
      if (hasH) return C.high;
      return C.none;
    }
    function sliceMono(lo, mi, hi) {
      const v = Math.max(normBand(lo), normBand(mi), normBand(hi));
      const g = Math.round(72 + v * 183);
      return `rgb(${g},${g},${g})`;
    }
    function sliceOldBlue(lo, mi, hi) {
      const v = Math.max(normBand(lo), normBand(mi), normBand(hi));
      if (v < 0.02) return '#1a2830';
      const r = Math.round(20 + v * 22);
      const g = Math.round(140 + v * 110);
      const b = Math.round(190 + v * 65);
      return `rgb(${r},${g},${b})`;
    }
    function sliceColor(lo, mi, hi) {
      const mode = state.waveBlendMode || 'rgb';
      if (mode === 'mono') return sliceMono(lo, mi, hi);
      if (mode === 'oldblue') return sliceOldBlue(lo, mi, hi);
      return sliceColorRgb(lo, mi, hi);
    }
    function sliceColorForBand(name, amp) {
      const lo = name === 'low' ? amp : 0;
      const mi = name === 'mid' ? amp : 0;
      const hi = name === 'high' ? amp : 0;
      return sliceColor(lo, mi, hi);
    }
    function syncBandDots() {
      const pal = bandPalette();
      ['low', 'mid', 'high'].forEach(b => {
        const btn = q(`#djp-bands .band-dot.${b}`);
        if (btn) { const dot = btn.querySelector('i'); if (dot) dot.style.setProperty('--band-c', pal[b]); }
      });
    }
    function syncColorVars() {
      const pal = bandPalette();
      root.style.setProperty('--low', pal.low);
      root.style.setProperty('--mid', pal.mid);
      root.style.setProperty('--high', pal.high);
    }

    /* symmetric amplitude — bottom half mirrored to top around center axis */
    function bandAmp(band, c) {
      return Math.max(Math.abs(band.max[c] || 0), Math.abs(band.min[c] || 0));
    }
    function drawMirroredCol(ctx, x, center, h) {
      const top = center - h, ht = Math.max(1, h * 2);
      ctx.fillRect(x | 0, top | 0, 1, ht);
    }

    function renderWave() {
      const { W, H } = fit(waveC);
      waveCtx.clearRect(0, 0, W, H);
      if (!state.bands) return;
      const start = Math.max(0, Math.floor(state.offsetCol));
      const end = Math.min(state.totalCols, start + Math.ceil(W / state.stride) + 3);
      const center = H / 2;
      /* mirror axis — visible center seam */
      waveCtx.fillStyle = 'rgba(255,255,255,.06)';
      waveCtx.fillRect(0, center | 0, W, 1);
      const lowBand = state.bands.find(b => b.name === 'low');
      const midBand = state.bands.find(b => b.name === 'mid');
      const highBand = state.bands.find(b => b.name === 'high');
      const pal = bandPalette();
      if (state.stacked) {
        const laneH = H / 3, order = ['low', 'mid', 'high'];
        order.forEach((name, li) => {
          if (!state.bandVisible[name]) return;
          const band = state.bands.find(b => b.name === name);
          const cy = laneH * li + laneH / 2, amp = laneH * 0.44;
          for (let c = start; c < end; c++) {
            const x = colToX(c); if (x > W) break;
            const lo = state.bandVisible.low ? bandAmp(lowBand, c) : 0;
            const mi = state.bandVisible.mid ? bandAmp(midBand, c) : 0;
            const hi = state.bandVisible.high ? bandAmp(highBand, c) : 0;
            waveCtx.fillStyle = sliceColorForBand(name, bandAmp(band, c));
            drawMirroredCol(waveCtx, x, cy, bandAmp(band, c) * amp);
          }
          waveCtx.fillStyle = 'rgba(255,255,255,.05)'; waveCtx.fillRect(0, laneH * li + laneH / 2 | 0, W, 1);
        });
      } else {
        const amp = center * 0.94;
        for (let c = start; c < end; c++) {
          const x = colToX(c); if (x > W) break;
          const lo = state.bandVisible.low ? bandAmp(lowBand, c) : 0;
          const mi = state.bandVisible.mid ? bandAmp(midBand, c) : 0;
          const hi = state.bandVisible.high ? bandAmp(highBand, c) : 0;
          const h = Math.max(lo, mi, hi) * amp;
          if (h <= 0) continue;
          waveCtx.fillStyle = sliceColor(lo, mi, hi);
          drawMirroredCol(waveCtx, x, center, h);
        }
      }
      renderCues(W, H);
    }

    /* beatgrid helpers — full bar lines (|) + colon ticks (:) */
    /* '|' = downbeat: one straight line spanning the whole block */
    function drawGridCross(ctx, x, H, color, w) {
      ctx.fillStyle = color;
      ctx.fillRect(x | 0, 0, w, H);
    }
    /* ':' = beats 2,3,4 — straight (non-curved) ticks, identical at top + bottom */
    function drawColonTick(ctx, x, H, color) {
      const len = Math.max(9, H * 0.17);
      ctx.fillStyle = color;
      ctx.fillRect(x | 0, 0, 1, len);                 // top tick
      ctx.fillRect(x | 0, (H - len) | 0, 1, len);     // bottom tick (mirror, same length)
    }
    function drawSixteenthTicks(ctx, col, cpb, W, H, color) {
      const th = Math.max(6, H * 0.11);
      const w = 1;
      for (let s = 1; s < 16; s++) {
        if (s % 4 === 0) continue;
        const sx = colToX(col + s * cpb / 4);
        if (sx < 0 || sx > W) continue;
        ctx.fillStyle = color;
        ctx.fillRect(sx | 0, 0, w, th);
        ctx.fillRect(sx | 0, H - th, w, th);
      }
    }

    function renderBeatgrid() {
      const { W, H } = fit(bgC);
      bgCtx.clearRect(0, 0, W, H);
      const cpb = COLS_PER_BEAT, edit = state.editMode;
      const first = Math.floor(state.offsetCol / cpb) - 2;
      const last = first + Math.ceil(W / (cpb * state.stride)) + 4;
      /* RED only when editing the beatgrid; white otherwise (luxury grayscale) */
      const barColor  = edit ? 'rgba(255,42,42,0.92)' : 'rgba(255,255,255,0.62)';
      const tickColor = edit ? 'rgba(255,42,42,0.62)' : 'rgba(255,255,255,0.30)';
      const sixteenthColor = edit ? 'rgba(255,42,42,0.30)' : 'rgba(255,255,255,0.16)';
      const barNumColor = edit ? 'rgba(255,90,90,0.95)' : 'rgba(255,255,255,0.42)';
      for (let beat = first; beat < last; beat++) {
        const col = beat * cpb + state.beatOffset, x = colToX(col);
        if (x < -6 || x > W + 6) continue;
        const mod4 = ((beat % 4) + 4) % 4;
        const isBar = mod4 === 0;                 // '|' → beats 1,5,9...
        const barN = Math.floor(beat / 4) + 1;
        const barEvery8 = isBar && (barN === 1 || barN % 4 === 0);

        if (!state.layers.beat && !isBar) continue;

        if (isBar) {
          /* '|' downbeat — one straight line spanning the whole block */
          drawGridCross(bgCtx, x, H, barColor, barEvery8 ? 2 : 1);
          if (state.layers.bar) {
            bgCtx.fillStyle = barNumColor;
            bgCtx.font = '300 10px "Space Mono",monospace';
            const lbl = String(barN);
            bgCtx.fillText(lbl, (x | 0) + 3, 11);
            bgCtx.save();
            bgCtx.translate((x | 0) + 3 + bgCtx.measureText(lbl).width / 2, H - 4);
            bgCtx.scale(1, -1);
            bgCtx.fillText(lbl, -bgCtx.measureText(lbl).width / 2, 0);
            bgCtx.restore();
          }
          drawSixteenthTicks(bgCtx, col, cpb, W, H, sixteenthColor);
          continue;
        }

        /* ':' beats 2,3,4,6,7,8... — straight ticks, identical top + bottom */
        drawColonTick(bgCtx, x, H, tickColor);
      }
      for (const p of PHRASES) {
        const x = colToX(barCol(p.start)); if (x < 0 || x > W) continue;
        bgCtx.fillStyle = p.color; bgCtx.globalAlpha = .8;
        bgCtx.fillRect(x | 0, 0, 2, H); bgCtx.globalAlpha = 1;
      }
    }

    function renderPhrases() {
      /* Phrase lane is exactly 8px tall; labels rendered INSIDE the strip.
         7px light, color: black (rgba(0,0,0,.82)) — no upward transform. */
      const { W, H } = fit(phC);
      phCtx.clearRect(0, 0, W, H);
      const cy = H / 2;   // vertical center of the 8px strip
      for (const p of PHRASES) {
        const x0 = colToX(barCol(p.start)), x1 = colToX(barCol(p.end));
        if (x1 < 0 || x0 > W) continue;
        const xa = Math.max(0, x0), xb = Math.min(W, x1);
        const segW = xb - xa - 1;
        if (segW <= 0) continue;
        // colored segment — full strip height
        const g = phCtx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, p.color + 'dd'); g.addColorStop(1, p.color + '99');
        phCtx.fillStyle = g;
        phCtx.fillRect(xa, 0, segW, H);
        // selected highlight
        if (state.selected && state.selected.type === 'phrase' && state.selected.i === p.i) {
          phCtx.fillStyle = 'rgba(255,255,255,.30)';
          phCtx.fillRect(xa, 0, segW, H);
        }
        // label inside strip — 8px light, black
        phCtx.save();
        phCtx.font = '300 8px "Space Grotesk",system-ui,sans-serif';
        if ('letterSpacing' in phCtx) phCtx.letterSpacing = '0.3px';
        const label = p.name.toUpperCase();
        const tw = phCtx.measureText(label).width;
        if (segW > tw + 6) {
          phCtx.fillStyle = 'rgba(0,0,0,.82)';
          phCtx.textBaseline = 'middle';
          phCtx.fillText(label, xa + (segW - tw) / 2, cy);
        }
        phCtx.restore();
      }
    }

    function energyColor(e) {
      const stops = [[10, 40, 120], [26, 111, 255], [34, 211, 238], [39, 208, 122], [242, 194, 0], [255, 106, 0], [255, 42, 42]];
      const t = Math.max(0, Math.min(1, e / 10)) * (stops.length - 1);
      const i = Math.floor(t), f = t - i, a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)];
      return `rgb(${a[0] + (b[0] - a[0]) * f | 0},${a[1] + (b[1] - a[1]) * f | 0},${a[2] + (b[2] - a[2]) * f | 0})`;
    }
    function energyAt(col) {
      const bar = col / COLS_PER_BAR, s = sectionAt(bar);
      const pulse = 0.4 * Math.abs(state.bands ? state.bands[0].max[Math.min(col | 0, TOTAL - 1)] : 0);
      return Math.max(0, Math.min(10, s[8] + pulse * 2 + ramp(bar) * 2));
    }
    function renderEnergy() {
      const { W, H } = fit(enC);
      enCtx.clearRect(0, 0, W, H);
      const start = Math.max(0, Math.floor(state.offsetCol));
      const end = Math.min(state.totalCols, start + Math.ceil(W / state.stride) + 3);
      enCtx.globalAlpha = .9;
      for (let c = start; c < end; c += 1) { const x = colToX(c); if (x > W) break;
        const e = energyAt(c); enCtx.fillStyle = energyColor(e);
        const h = 4 + (e / 10) * (H - 6); enCtx.fillRect(x | 0, H - h, Math.max(1, state.stride | 0) + 1, h); }
      enCtx.globalAlpha = 1;
      enCtx.beginPath(); enCtx.strokeStyle = 'rgba(255,255,255,.5)'; enCtx.lineWidth = 1;
      let firstP = true;
      for (let x = 0; x <= W; x += 2) { const c = xToCol(x); if (c < 0 || c >= TOTAL) { firstP = true; continue; }
        const y = H - (4 + (energyAt(c | 0) / 10) * (H - 6));
        if (firstP) { enCtx.moveTo(x, y); firstP = false; } else enCtx.lineTo(x, y); }
      enCtx.stroke();
    }

    function renderCues(W, H) {
      cueC.width = waveC.width; cueC.height = waveC.height;
      const d = window.devicePixelRatio || 1; cueCtx.setTransform(d, 0, 0, d, 0, 0);
      cueCtx.clearRect(0, 0, W, H);

      // ── Trim silence overlays ────────────────────────────────────
      const lx = colToX(timeToCol(TRIM.leadEnd)), tx = colToX(timeToCol(TRIM.tailStart));
      cueCtx.fillStyle = 'rgba(0,0,0,.50)';
      if (lx > 0) cueCtx.fillRect(0, 0, lx, H);
      if (tx < W) cueCtx.fillRect(tx, 0, W - tx, H);
      const trimC = state.trimMode ? 'rgba(232,130,12,.85)' : 'rgba(140,144,152,.65)';
      cueCtx.strokeStyle = trimC; cueCtx.lineWidth = 1; cueCtx.setLineDash([3, 3]);
      if (lx > -20 && lx < W + 20) { cueCtx.beginPath(); cueCtx.moveTo(lx, 0); cueCtx.lineTo(lx, H); cueCtx.stroke(); }
      if (tx > -20 && tx < W + 20) { cueCtx.beginPath(); cueCtx.moveTo(tx, 0); cueCtx.lineTo(tx, H); cueCtx.stroke(); }
      cueCtx.setLineDash([]);

      // ── Loop draft (drag on waveform while LOOP armed) ──
      if (state.loopDraft) {
        const c0 = Math.min(state.loopDraft.startCol, state.loopDraft.endCol);
        const c1 = Math.max(state.loopDraft.startCol, state.loopDraft.endCol);
        const x0 = colToX(c0), x1 = colToX(c1);
        if (x1 > 0 && x0 < W) {
          cueCtx.fillStyle = 'rgba(160,107,255,.22)';
          cueCtx.fillRect(x0, 0, x1 - x0, H);
          cueCtx.fillStyle = 'rgba(160,107,255,.85)';
          cueCtx.fillRect(x0, 0, 1, H); cueCtx.fillRect(x1, 0, 1, H);
          cueCtx.fillRect(x0, 0, 5, 1); cueCtx.fillRect(x1 - 4, 0, 5, 1);
        }
      }
      // ── Live IN/OUT pending loop ──
      if (state.loopLive && state.loopLive.inBar != null) {
        const inX = colToX(barCol(state.loopLive.inBar));
        const outBar = state.loopLive.outBar != null ? state.loopLive.outBar : centerCol() / COLS_PER_BAR;
        const x0 = colToX(barCol(state.loopLive.inBar));
        const x1 = colToX(barCol(outBar));
        if (x1 > x0) {
          cueCtx.fillStyle = 'rgba(39,208,122,.14)';
          cueCtx.fillRect(x0, 0, x1 - x0, H);
        }
        cueCtx.fillStyle = 'rgba(39,208,122,.9)';
        cueCtx.fillRect(inX, 0, 1, H);
        if (state.loopLive.outBar != null) cueCtx.fillRect(x1, 0, 1, H);
      }

      // ── Memory loops — faint region + crisp 1px boundary lines ──
      for (const lp of MEMLOOPS) {
        const x0 = colToX(barCol(lp.bar)), x1 = colToX(barCol(lp.bar + lp.bars));
        if (x1 < 0 || x0 > W) continue;
        const lc = lp.active ? 'rgba(39,208,122,' : 'rgba(160,107,255,';
        cueCtx.fillStyle = lc + '.10)'; cueCtx.fillRect(x0, 0, x1 - x0, H);
        // 1px boundary lines
        cueCtx.fillStyle = lc + '.80)';
        cueCtx.fillRect(x0, 0, 1, H); cueCtx.fillRect(x1, 0, 1, H);
        // Bracket caps (top only, 5px)
        cueCtx.fillRect(x0, 0, 5, 1); cueCtx.fillRect(x1 - 4, 0, 5, 1);
        // Compact label if room exists
        if (x1 - x0 > 48) {
          cueCtx.font = '200 8px "Space Mono"'; cueCtx.textBaseline = 'top';
          cueCtx.fillText(lp.bars + 'B', x0 + 5, 3);
          cueCtx.textBaseline = 'alphabetic';
        }
      }

      // ── Master anchor bar 1 — dashed gold line + upward tag ─────
      const ax = colToX(barCol(1));
      if (ax > -10 && ax < W + 10) {
        cueCtx.fillStyle = 'rgba(255,210,122,.60)';
        cueCtx.strokeStyle = 'rgba(255,210,122,.60)'; cueCtx.lineWidth = 1; cueCtx.setLineDash([2, 3]);
        cueCtx.beginPath(); cueCtx.moveTo(ax, 0); cueCtx.lineTo(ax, H); cueCtx.stroke(); cueCtx.setLineDash([]);
        // Tiny upward triangle at top
        cueCtx.fillStyle = 'rgba(255,210,122,.75)'; cueCtx.beginPath();
        cueCtx.moveTo(ax - 3, 0); cueCtx.lineTo(ax + 3, 0); cueCtx.lineTo(ax, 5); cueCtx.closePath(); cueCtx.fill();
      }

      // ── Warp markers — tiny downward triangles at top ───────────
      for (const b of WARP) {
        const x = colToX(barCol(b)); if (x < 0 || x > W) continue;
        cueCtx.fillStyle = 'rgba(255,255,255,.22)'; cueCtx.beginPath();
        cueCtx.moveTo(x - 2, 0); cueCtx.lineTo(x + 2, 0); cueCtx.lineTo(x, 4); cueCtx.closePath(); cueCtx.fill();
      }

      // ── Memory cues — 1px green line + small arrowhead at top ───
      cueCtx.font = '200 8px "Space Mono"'; cueCtx.textBaseline = 'top';
      for (const m of MEMCUES) {
        const x = colToX(barCol(m.bar)); if (x < 0 || x > W) continue;
        cueCtx.fillStyle = 'rgba(39,208,122,.85)';
        cueCtx.fillRect(x, 0, 1.5, H);
        cueCtx.beginPath(); cueCtx.moveTo(x - 4, 6); cueCtx.lineTo(x, 0); cueCtx.lineTo(x + 4, 6); cueCtx.closePath(); cueCtx.fill();
        // Short label to right
        cueCtx.fillStyle = 'rgba(39,208,122,.85)';
        cueCtx.fillText(m.name, x + 4, 2);
      }
      cueCtx.textBaseline = 'alphabetic';

      // ── Hot cues — clean line + rectangular flag ────
      cueCtx.font = '300 9px "Space Mono"'; cueCtx.textBaseline = 'middle';
      const flagH = 14, flagW = 18;
      for (const c of HOTCUES) {
        const x = colToX(barCol(c.bar)); if (x < -30 || x > W + 30) continue;
        const sel = state.selected && state.selected.type === 'hotcue' && state.selected.n === c.n;
        cueCtx.globalAlpha = sel ? 1 : 0.9;
        cueCtx.fillStyle = c.color;
        cueCtx.fillRect(x, flagH, sel ? 2 : 1.5, H - flagH);
        cueCtx.fillRect(x, 0, flagW, flagH);
        cueCtx.fillStyle = 'rgba(0,0,0,.92)'; cueCtx.fillText(String(c.n), x + 5, flagH / 2);
        if (sel) {
          cueCtx.fillStyle = c.color; cueCtx.font = '200 9px "Space Grotesk"';
          cueCtx.textBaseline = 'top'; cueCtx.fillText(c.name, x + flagW + 3, 1);
          cueCtx.font = '300 9px "Space Mono"'; cueCtx.textBaseline = 'middle';
        }
        cueCtx.globalAlpha = 1;
      }
      cueCtx.textBaseline = 'alphabetic';

      // ── Notes — category-aware glass pill + stem (matches Anotações card) ──
      for (let i = 0; i < NOTES.length; i++) {
        const n = NOTES[i];
        const x = colToX(timeToCol(n.time));
        if (x < -20 || x > W + 20) continue;
        const sel = state.selected && state.selected.type === 'note' && state.selected.i === i;
        drawOvNote(cueCtx, x, H, { cat: n.cat, sel });
      }
    }

    /** Glass-pill note marker — mirrors .note-item / .note-add-ts luxury language.
        opts = { cat: 'NOTA'|'MIX'|'FX'|'VOCAL'|'WARN', sel: bool } */
    function drawOvNote(ctx, x, H, opts) {
      const cat = NOTE_CATS[(opts && opts.cat)] || NOTE_CATS.NOTA;
      const sel = !!(opts && opts.sel);
      const pillW = 20, pillH = 14, pillY = 4, pillX = x - pillW / 2;
      const stemTop = pillY + pillH;

      // Stem — subtle graphite line (accent-tinted only for accent categories)
      ctx.fillStyle = cat.accent ? 'rgba(232,130,12,.70)' : 'rgba(255,255,255,.50)';
      ctx.fillRect(x - (sel ? 1 : 0.75), stemTop, sel ? 2 : 1.5, H - stemTop - 2);

      // Glass pill body (white, inset-shine feel via top highlight strip)
      ctx.fillStyle = 'rgba(255,255,255,.96)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(pillX, pillY, pillW, pillH, 3);
      else { ctx.rect(pillX, pillY, pillW, pillH); }
      ctx.fill();
      ctx.strokeStyle = sel ? (cat.accent ? 'rgba(232,130,12,.90)' : 'rgba(0,0,0,.32)') : 'rgba(0,0,0,.10)';
      ctx.lineWidth = sel ? 1 : 0.5;
      ctx.stroke();
      // Inset top shine
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(pillX + 1, pillY + 0.5, pillW - 2, 1);

      // Category bar — orange only for accent categories, graphite otherwise
      ctx.fillStyle = cat.onPill;
      ctx.fillRect(pillX + 1.5, pillY + 2, 2.5, pillH - 4);

      // Category glyph — first letter (crisp monospace) on the white pill
      ctx.save();
      ctx.font = '300 8px "Space Mono",monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillStyle = cat.accent ? '#E8820C' : 'rgba(0,0,0,.66)';
      ctx.fillText(cat.label.charAt(0), pillX + 1.5 + 2.5 + (pillW - 6) / 2, pillY + pillH / 2 + 0.5);
      ctx.restore();
    }

    function updateOverview() {
      const { W, H } = fit(ovC);
      ovCtx.clearRect(0, 0, W, H);
      if (!state.bands) return;
      const scale = W / state.totalCols, center = H / 2, amp = center * 0.84;

      // Phrase sections — 3px colour strip at top
      for (const p of PHRASES) {
        ovCtx.fillStyle = p.color + '66';
        ovCtx.fillRect(barCol(p.start) * scale, 0, (barCol(p.end) - barCol(p.start)) * scale, 3);
      }

      // Waveform bands — per-slice rgb / 3-band color
      const lowBand = state.bands.find(b => b.name === 'low');
      const midBand = state.bands.find(b => b.name === 'mid');
      const highBand = state.bands.find(b => b.name === 'high');
      const step = Math.max(1, Math.floor(state.totalCols / W));
      for (let c = 0; c < state.totalCols; c += step) {
        const lo = state.bandVisible.low ? bandAmp(lowBand, c) : 0;
        const mi = state.bandVisible.mid ? bandAmp(midBand, c) : 0;
        const hi = state.bandVisible.high ? bandAmp(highBand, c) : 0;
        const h = Math.max(lo, mi, hi) * amp;
        if (h <= 0) continue;
        ovCtx.fillStyle = sliceColor(lo, mi, hi);
        const x = c * scale;
        ovCtx.fillRect(x, center - h, Math.max(1, scale * step), Math.max(1, h * 2));
      }

      // ── MEMORY LOOPS — solid boundaries + label chip ─────────────
      for (const lp of MEMLOOPS) {
        const lx1 = barCol(lp.bar) * scale, lx2 = barCol(lp.bar + lp.bars) * scale;
        if (lx2 - lx1 < 0.5) continue;
        const lc = lp.active ? '#27d07a' : '#a06bff';
        ovCtx.fillStyle = lp.active ? 'rgba(39,208,122,.30)' : 'rgba(160,107,255,.30)';
        ovCtx.fillRect(lx1, 0, lx2 - lx1, H);
        ovCtx.fillStyle = 'rgba(0,0,0,.40)';
        ovCtx.fillRect(lx1 - 1, 0, 4, H); ovCtx.fillRect(lx2 - 1, 0, 4, H);
        ovCtx.fillStyle = lc;
        ovCtx.fillRect(lx1, 0, 2.5, H); ovCtx.fillRect(lx2, 0, 2.5, H);
        ovCtx.fillRect(lx1, 0, 9, 2.5); ovCtx.fillRect(lx2 - 8, 0, 9, 2.5);
        if (lx2 - lx1 > 32) {
          ovCtx.font = '200 8px "Space Mono",monospace'; ovCtx.textBaseline = 'top';
          const label = lp.bars + 'B';
          const tw = ovCtx.measureText(label).width;
          ovCtx.fillStyle = 'rgba(0,0,0,.75)'; ovCtx.fillRect(lx1 + 5, 4, tw + 6, 10);
          ovCtx.fillStyle = lc; ovCtx.fillText(label, lx1 + 8, 5);
          ovCtx.textBaseline = 'alphabetic';
        }
      }

      // ── MEMORY CUES — green line + tick ──────────────────────────
      for (const m of MEMCUES) {
        const mx = barCol(m.bar) * scale;
        ovCtx.fillStyle = 'rgba(0,0,0,.35)';
        ovCtx.fillRect(mx - 1, 0, 4, H); ovCtx.fillRect(mx - 3, 0, 9, 2.5);
        ovCtx.fillStyle = '#27d07a';
        ovCtx.fillRect(mx, 0, 2, H);
        ovCtx.fillRect(mx - 3, 0, 8, 2.5);
      }

      // ── HOT CUES — line + flag ───────────────────────────────────
      ovCtx.font = '300 8px "Space Mono",monospace';
      ovCtx.textBaseline = 'middle';
      const ovFlagH = 12, ovFlagW = 16;
      for (const c of HOTCUES) {
        const hx = barCol(c.bar) * scale;
        ovCtx.fillStyle = 'rgba(0,0,0,.35)';
        ovCtx.fillRect(hx - 0.5, 0, 3, H);
        ovCtx.fillStyle = c.color;
        ovCtx.fillRect(hx, 0, 1.5, H);
        ovCtx.fillRect(hx, 0, ovFlagW, ovFlagH);
        ovCtx.fillStyle = 'rgba(0,0,0,.92)';
        ovCtx.fillText(String(c.n), hx + 4.5, ovFlagH / 2);
      }
      ovCtx.textBaseline = 'alphabetic';

      // ── NOTES — glass pill + stem (matches Anotações card) ───────
      for (let i = 0; i < NOTES.length; i++) {
        const n = NOTES[i];
        const sel = state.selected && state.selected.type === 'note' && state.selected.i === i;
        drawOvNote(ovCtx, timeToCol(n.time) * scale, H, { cat: n.cat, sel });
      }

      const vis = stage.clientWidth / state.stride;
      ovView.style.left = (state.offsetCol / state.totalCols * W) + 'px';
      ovView.style.width = Math.min(W, (vis / state.totalCols * W)) + 'px';
      ovPh.style.left = ((state.offsetCol + vis / 2) / state.totalCols * W) + 'px';
    }

    /* ── HUD ──────────────────────────────────────────────────── */
    const enBars = q('#djp-enBars');
    function buildEnergyMeter() { enBars.innerHTML = ''; for (let i = 0; i < 10; i++) enBars.appendChild(document.createElement('i')); }
    function setEnergyMeter(e) {
      [...enBars.children].forEach((b, i) => {
        const on = i < Math.round(e); b.style.height = (30 + i * 7) + '%';
        b.style.background = on ? energyColor(i + 1) : 'rgba(5,5,5,0.07)';
        b.style.boxShadow = on ? `0 0 6px ${energyColor(i + 1)}55` : 'none';
      });
    }
    function buildProgTicks() {
      const w = q('#djp-phTicks');
      if (!w) return;
      w.innerHTML = '';
      const tip = q('#djp-tickTip');
      PHRASES.forEach((p, idx) => {
        const el = document.createElement('i');
        const pct = barCol(p.start) / TOTAL * 100;
        el.style.left = pct + '%';
        el.style.setProperty('--tc', p.color);
        el.addEventListener('mouseenter', function () {
          if (!tip) return;
          tip.innerHTML =
            `<span class="tt-dot" style="background:${p.color}"></span>` +
            `<b>${p.name.toUpperCase()}</b>` +
            `<span class="tt-sub"> · ${fmt(colToTime(barCol(p.start)))}</span>`;
          tip.style.left = pct + '%';
          tip.classList.add('show');
        });
        el.addEventListener('mouseleave', () => { if (tip) tip.classList.remove('show'); });
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const vis = stage.clientWidth / state.stride;
          state.offsetCol = barCol(p.start) - vis / 2;
          clampOffset(); renderAll();
        });
        w.appendChild(el);
      });
    }
    function updateHUD() {
      const vis = stage.clientWidth / state.stride;
      const center = state.offsetCol + vis / 2;
      const t = colToTime(center);
      state.pos = t;   // live playhead/seek time — drives "add at current position" affordances
      q('#djp-tNow').textContent = fmt(t);
      q('#djp-stTime').textContent = fmt(t);
      q('#djp-zoomLbl').textContent = state.stride.toFixed(1);
      q('#djp-stStride').textContent = state.stride.toFixed(1) + 'px';
      q('#djp-progFill').style.width = Math.max(0, Math.min(100, center / TOTAL * 100)) + '%';
      q('#djp-progPhrase').textContent = sectionAt(center / COLS_PER_BAR)[6];
      const e = Math.round(energyAt(center));
      q('#djp-enVal').textContent = e; setEnergyMeter(e);
    }
    const LOCKED_GRID_LAYERS = new Set(['16th', 'phrase']);
    function ensureLockedGridLayers() {
      LOCKED_GRID_LAYERS.forEach(l => { state.layers[l] = true; });
      qa('#djp-gridLayers button').forEach(b => {
        if (LOCKED_GRID_LAYERS.has(b.dataset.layer)) b.classList.add('is-active', 'is-locked');
      });
    }
    function renderAll() {
      ensureLockedGridLayers();
      renderPhrases(); renderBeatgrid(); renderWave(); renderEnergy(); updateOverview(); updateHUD();
    }

    /* ── Marker hit-test + hover cards (waveform + overview) ───── */
    function markerHitAtCol(col, hitPx) {
      for (const c of HOTCUES) {
        if (Math.abs(barCol(c.bar) - col) < hitPx) {
          return { type: 'hotcue', color: c.color, title: `HOT CUE ${c.n}`, name: c.name, note: c.note, sub: fmt(colToTime(barCol(c.bar))), sel: { type: 'hotcue', n: c.n } };
        }
      }
      for (let i = 0; i < NOTES.length; i++) {
        const n = NOTES[i]; const ct = noteCat(n);
        if (Math.abs(timeToCol(n.time) - col) < hitPx * 1.5) {
          return { type: 'note', color: ct.accent ? '#E8820C' : 'rgba(0,0,0,.55)', title: 'Anotação · ' + ct.label, name: n.text, sub: fmt(n.time), sel: { type: 'note', i } };
        }
      }
      for (let i = 0; i < MEMCUES.length; i++) {
        const m = MEMCUES[i];
        if (Math.abs(barCol(m.bar) - col) < hitPx) {
          return { type: 'memcue', color: '#27d07a', title: 'Memory Cue', name: m.name, sub: fmt(colToTime(barCol(m.bar))), sel: { type: 'memcue', i } };
        }
      }
      for (let i = 0; i < MEMLOOPS.length; i++) {
        const lp = MEMLOOPS[i];
        const start = barCol(lp.bar), end = barCol(lp.bar + lp.bars);
        if (col >= start - hitPx && col <= end + hitPx) {
          return { type: 'loop', color: lp.active ? '#27d07a' : '#a06bff', title: 'Memory Loop', name: lp.name, sub: `${lp.bars} bar · ${fmt(colToTime(start))}`, sel: { type: 'loop', i, bar: lp.bar } };
        }
      }
      return null;
    }
    function markerHitAtStageX(x, px = 10) {
      for (const c of HOTCUES) {
        if (Math.abs(colToX(barCol(c.bar)) - x) < px) {
          return { type: 'hotcue', color: c.color, title: `HOT CUE ${c.n}`, name: c.name, note: c.note, sub: fmt(colToTime(barCol(c.bar))), sel: { type: 'hotcue', n: c.n } };
        }
      }
      for (let i = 0; i < NOTES.length; i++) {
        const n = NOTES[i]; const ct = noteCat(n);
        if (Math.abs(colToX(timeToCol(n.time)) - x) < px * 1.3) {
          return { type: 'note', color: ct.accent ? '#E8820C' : 'rgba(0,0,0,.55)', title: 'Anotação · ' + ct.label, name: n.text, sub: fmt(n.time), sel: { type: 'note', i } };
        }
      }
      for (let i = 0; i < MEMCUES.length; i++) {
        const m = MEMCUES[i];
        if (Math.abs(colToX(barCol(m.bar)) - x) < px) {
          return { type: 'memcue', color: '#27d07a', title: 'Memory Cue', name: m.name, sub: fmt(colToTime(barCol(m.bar))), sel: { type: 'memcue', i } };
        }
      }
      for (let i = 0; i < MEMLOOPS.length; i++) {
        const lp = MEMLOOPS[i];
        const a = colToX(barCol(lp.bar)), b = colToX(barCol(lp.bar + lp.bars));
        if (x >= a - px && x <= b + px) {
          return { type: 'loop', color: lp.active ? '#27d07a' : '#a06bff', title: 'Memory Loop', name: lp.name, sub: `${lp.bars} bar · ${fmt(colToTime(barCol(lp.bar)))}`, sel: { type: 'loop', i, bar: lp.bar } };
        }
      }
      return null;
    }
    function markerTipHTML(hit) {
      const dot = `<span class="cc" style="--cc:${hit.color || '#888'}"></span>`;
      if (hit.type === 'hotcue') return `${dot}<b>${hit.title}</b> · ${hit.name}<br><span class="ct3">${hit.note} — ${hit.sub}</span>`;
      if (hit.type === 'note') return `${dot}<b>${hit.title}</b> · ${hit.sub}<br><span class="ct3">${hit.name}</span>`;
      return `${dot}<b>${hit.title}</b> · ${hit.name}<br><span class="ct3">${hit.sub} · clique para editar</span>`;
    }
    function showStageTip(hit, x, y, top) {
      if (!cueTip || !hit) return;
      cueTip.innerHTML = markerTipHTML(hit);
      cueTip.style.left = (x + 12) + 'px';
      cueTip.style.top = (y - top + 8) + 'px';
      cueTip.classList.add('show');
    }
    function showOvTip(hit, x, width) {
      if (!ovTip || !hit) return;
      ovTip.innerHTML = markerTipHTML(hit);
      ovTip.style.left = Math.min(width - 90, Math.max(45, x)) + 'px';
      ovTip.classList.add('show');
    }
    function hideTips() {
      if (cueTip) cueTip.classList.remove('show');
      if (ovTip) ovTip.classList.remove('show');
    }

    /* ── controles: zoom · drag · grid-edit · transport ──────── */
    function setStride(s) { const old = state.stride;
      state.stride = Math.max(MIN_STRIDE, Math.min(MAX_STRIDE, s));
      const centerCol = state.offsetCol + stage.clientWidth / (2 * old);
      state.offsetCol = centerCol - stage.clientWidth / (2 * state.stride);
      clampOffset(); renderAll(); }
    function clampOffset() { const vis = stage.clientWidth / state.stride;
      if (state.offsetCol < 0) state.offsetCol = 0;
      if (state.offsetCol > state.totalCols - vis) state.offsetCol = Math.max(0, state.totalCols - vis); }

    function onWin(target, type, fn, opts) { target.addEventListener(type, fn, opts); teardown.win.push([target, type, fn, opts]); }

    stage.addEventListener('mousedown', e => {
      if (state.editMode) { state._warp = true; state._wx = e.clientX; state._wb = state.beatOffset; return; }
      if (state.markMode === 'loop') {
        const r = stage.getBoundingClientRect();
        const col = xToCol(e.clientX - r.left);
        state.loopDragging = true;
        state._markDragged = false;
        state._loopDownX = e.clientX;
        state.loopDraft = { startCol: col, endCol: col };
        return;
      }
      state.dragging = true; state.dragStartX = e.clientX; state.dragStartOffset = state.offsetCol;
    });
    onWin(window, 'mousemove', e => {
      if (state._warp) { state.beatOffset = state._wb + (e.clientX - state._wx) / state.stride; renderAll(); return; }
      if (state.loopDragging && state.loopDraft) {
        const r = stage.getBoundingClientRect();
        state.loopDraft.endCol = xToCol(e.clientX - r.left);
        if (Math.abs(e.clientX - state._loopDownX) > 5) state._markDragged = true;
        renderAll();
        return;
      }
      if (state.dragging) { state.offsetCol = state.dragStartOffset - (e.clientX - state.dragStartX) / state.stride; clampOffset(); renderAll(); }
    });
    onWin(window, 'mouseup', () => {
      if (state.loopDragging) {
        const draft = state.loopDraft;
        state.loopDragging = false;
        if (draft && state.markMode === 'loop' && state._markDragged) {
          const b0 = draft.startCol / COLS_PER_BAR;
          const b1 = draft.endCol / COLS_PER_BAR;
          const startBar = snapBar(Math.min(b0, b1));
          let bars = Math.max(1, snapBar(Math.max(b0, b1)) - startBar);
          if (bars < 1) bars = state.loopBarsPreset || 4;
          addLoop(bars, startBar);
        }
        state.loopDraft = null;
        renderAll();
      }
      state.dragging = false; state._warp = false;
    });
    stage.addEventListener('wheel', e => { e.preventDefault();
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) setStride(state.stride * (e.deltaY < 0 ? 1.12 : 0.89));
      else { state.offsetCol += e.deltaX / state.stride; clampOffset(); renderAll(); }
    }, { passive: false });

    stage.addEventListener('click', e => {
      if (state.dragging || state._warp) return;
      if (state._markDragged) { state._markDragged = false; return; }
      const r = stage.getBoundingClientRect(); const x = e.clientX - r.left;
      const hit = markerHitAtStageX(x);
      if (hit) { selectEntity(hit.sel); return; }
      const col = xToCol(x);
      // Armed "marcar" tool → create a new marker at this position (snapped to bar)
      if (state.markMode) { handleMarkAdd(state.markMode, col); return; }
      const vis = stage.clientWidth / state.stride; state.offsetCol = col - vis / 2; clampOffset();
      state.playCol = col; renderAll();
    });
    stage.addEventListener('mousemove', e => {
      if (state.dragging) { hideTips(); return; }
      const r = stage.getBoundingClientRect(); const x = e.clientX - r.left;
      const hit = markerHitAtStageX(x);
      if (hit) showStageTip(hit, x, e.clientY, r.top);
      else if (cueTip) cueTip.classList.remove('show');
    });
    stage.addEventListener('mouseleave', () => { if (cueTip) cueTip.classList.remove('show'); });

    ovStrip.addEventListener('click', e => {
      const r = ovStrip.getBoundingClientRect();
      const x = e.clientX - r.left;
      const frac = x / r.width;
      const col = frac * state.totalCols;
      const HIT_PX = Math.max(6, state.totalCols / r.width * 6);
      const hit = markerHitAtCol(col, HIT_PX);
      if (hit) { selectEntity(hit.sel); return; }
      const vis = stage.clientWidth / state.stride;
      state.offsetCol = frac * state.totalCols - vis / 2;
      clampOffset(); renderAll();
    });

    ovStrip.addEventListener('mousemove', e => {
      const r = ovStrip.getBoundingClientRect();
      const x = e.clientX - r.left;
      const col = (x / r.width) * state.totalCols;
      const HIT_PX = Math.max(6, state.totalCols / r.width * 6);
      const hit = markerHitAtCol(col, HIT_PX);
      if (hit) showOvTip(hit, x, r.width);
      else if (ovTip) ovTip.classList.remove('show');
    });
    ovStrip.addEventListener('mouseleave', () => { if (ovTip) ovTip.classList.remove('show'); });

    q('#djp-zoomIn').onclick = () => setStride(state.stride * 1.7);
    q('#djp-zoomOut').onclick = () => setStride(state.stride / 1.7);
    q('#djp-shiftL').onclick = () => { state.beatOffset -= COLS_PER_BEAT * 0.05; renderAll(); };
    q('#djp-shiftR').onclick = () => { state.beatOffset += COLS_PER_BEAT * 0.05; renderAll(); };
    q('#djp-btnReset').onclick = () => { state.offsetCol = 0; state.beatOffset = 0; state.stride = 2.8; renderAll(); };
    const colorSel = q('#djp-colorMode');
    if (colorSel) colorSel.addEventListener('change', () => {
      state.waveBlendMode = colorSel.value;
      renderAll();
      syncBandDots();
      syncColorVars();
    });
    syncBandDots();
    syncColorVars();
    q('#djp-btnEdit').onclick = function () { state.editMode = !state.editMode; this.classList.toggle('is-active', state.editMode);
      stage.classList.toggle('editing', state.editMode);
      const block = q('.djp-wave-grid-block'); if (block) block.classList.toggle('editing', state.editMode);
      renderAll(); };
    q('#djp-btnTrim').onclick = function () { state.trimMode = !state.trimMode; this.classList.toggle('is-active', state.trimMode); renderAll(); };
    q('#djp-btnStacked').onclick = function () { state.stacked = !state.stacked; this.classList.toggle('is-active', state.stacked); renderAll(); };
    qa('#djp-bands .band-dot').forEach(d => d.onclick = () => { const b = d.dataset.band;
      state.bandVisible[b] = !state.bandVisible[b]; d.classList.toggle('off', !state.bandVisible[b]); d.classList.toggle('is-active', state.bandVisible[b]); renderAll(); });
    qa('#djp-gridLayers button').forEach(b => b.onclick = () => {
      const l = b.dataset.layer;
      if (LOCKED_GRID_LAYERS.has(l)) return;
      state.layers[l] = !state.layers[l];
      b.classList.toggle('is-active', state.layers[l]);
      renderAll();
    });
    ensureLockedGridLayers();
    /* Marcar tools — arm/disarm one of cue/memcue/loop/note (mutually exclusive) */
    function commitLiveLoop() {
      if (!state.loopLive || state.loopLive.inBar == null || state.loopLive.outBar == null) return;
      const a = Math.min(state.loopLive.inBar, state.loopLive.outBar);
      const b = Math.max(state.loopLive.inBar, state.loopLive.outBar);
      const bars = Math.max(1, snapBar(b) - snapBar(a));
      addLoop(bars, snapBar(a));
      state.loopLive = null;
    }
    function wireLoopExtras() {
      const extras = q('#djp-loopExtras');
      if (!extras) return;
      extras.querySelectorAll('[data-loop-bars]').forEach(b => {
        b.onclick = (e) => {
          e.stopPropagation();
          state.loopBarsPreset = +b.dataset.loopBars;
          syncMarkTools();
          addLoop(state.loopBarsPreset, centerBar());
        };
      });
      extras.querySelectorAll('[data-loop-act]').forEach(b => {
        b.onclick = (e) => {
          e.stopPropagation();
          const act = b.dataset.loopAct;
          if (act === 'in') {
            state.loopLive = state.loopLive || {};
            state.loopLive.inBar = snapBar(centerBar());
            toast('Loop IN · comp. ' + state.loopLive.inBar);
          } else if (act === 'out') {
            if (!state.loopLive) state.loopLive = {};
            state.loopLive.outBar = snapBar(centerBar());
            commitLiveLoop();
            toast('Loop registrado');
          } else if (act === 'exit') {
            state.loopLive = null;
            state.loopDraft = null;
            toast('Loop cancelado');
          }
          syncMarkTools();
          renderAll();
        };
      });
    }
    qa('#djp-markTools button[data-mark]').forEach(b => b.onclick = () => {
      const m = b.dataset.mark;
      state.markMode = state.markMode === m ? null : m;
      if (state.markMode !== 'loop') { state.loopDraft = null; state.loopLive = null; }
      syncMarkTools();
      if (state.markMode) toast(MARK_LABEL[state.markMode]);
    });
    wireLoopExtras();

    const playIco = q('#djp-playIco');
    q('#djp-btnPlay').onclick = function () { state.playing = !state.playing; this.classList.toggle('is-active', state.playing);
      playIco.className = state.playing ? 'ri-pause-fill' : 'ri-play-fill';
      if (state.playing) { state.lastT = performance.now(); state.playCol = state.offsetCol + stage.clientWidth / (2 * state.stride); loop(); } };
    function loop() {
      if (!state.playing) return;
      const now = performance.now(); const dt = (now - state.lastT) / 1000; state.lastT = now;
      state.playCol += dt * SR / SPP;
      if (state.playCol >= TOTAL) state.playCol = 0;
      const vis = stage.clientWidth / state.stride; state.offsetCol = state.playCol - vis / 2; clampOffset(); renderAll();
      teardown.raf = requestAnimationFrame(loop);
    }

    /* ── navegação + inspetor ─────────────────────────────────── */
    const navEl = q('#djp-nav');
    NAV.forEach(([id, label, ic, ct]) => {
      const b = document.createElement('button'); b.dataset.sec = id;
      b.innerHTML = `<span class="ic"><i class="${ic}"></i></span>${label}${ct ? `<span class="ct">${ct}</span>` : ''}`;
      b.onclick = () => { state.section = id; state.selected = null; syncNav(); renderInspector();
        if (id === 'phrases') { state.layers.phrase = true; const pb = q('[data-layer="phrase"]'); if (pb) pb.classList.add('is-active'); }
        renderAll(); };
      navEl.appendChild(b);
    });
    function syncNav() {
      const counts = { hotcues: HOTCUES.length, memcues: MEMCUES.length, loops: MEMLOOPS.length };
      qa('#djp-nav button').forEach(b => {
        b.classList.toggle('is-active', b.dataset.sec === state.section);
        const c = counts[b.dataset.sec];
        if (c == null) return;
        let ct = b.querySelector('.ct');
        if (!ct) { ct = document.createElement('span'); ct.className = 'ct'; b.appendChild(ct); }
        ct.textContent = c;
      });
    }

    function jumpToBar(bar) { const vis = stage.clientWidth / state.stride; state.offsetCol = barCol(bar) - vis / 2; clampOffset(); }
    function jumpToTime(t) {
      const col = timeToCol(t);
      const vis = stage.clientWidth / state.stride;
      state.offsetCol = col - vis / 2;
      clampOffset();
      state.pos = t;
    }
    function scrollInspectorToSelection() {
      const el = inspBody.querySelector('.cue-row.sel, .note-item.sel, .phrase-item.is-sel, .pad.is-active');
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    function selectEntity(sel) {
      state.selected = sel;
      if (sel.type === 'hotcue') { state.section = 'hotcues'; jumpToBar(HOTCUES.find(h => h.n === sel.n).bar); }
      else if (sel.type === 'loop') { state.section = 'loops'; jumpToBar(sel.bar); }
      else if (sel.type === 'memcue') { state.section = 'memcues'; jumpToBar(MEMCUES[sel.i].bar); }
      else if (sel.type === 'note') { state.section = 'overview'; jumpToTime(NOTES[sel.i].time); }
      else if (sel.type === 'phrase') { state.section = 'phrases'; }
      syncNav(); renderInspector(); renderAll();
      requestAnimationFrame(scrollInspectorToSelection);
    }

    /* ════════════════════════════════════════════════════════════
       SIMULATED DJ EDITING TOOLS — add / delete markers live
       Every mutation re-renders waveform + overview + inspector and
       reuses selectEntity() so the editor card opens on the new item.
    ════════════════════════════════════════════════════════════ */
    const centerCol = () => state.offsetCol + stage.clientWidth / (2 * state.stride);
    const centerBar = () => centerCol() / COLS_PER_BAR;
    const snapBar   = b => Math.max(0, Math.round(b));

    /* ── HOT CUES ─────────────────────────────────────────────── */
    function addHotCue(bar) {
      bar = snapBar(bar);
      if (HOTCUES.length >= 8) { toast('Máximo de 8 hot cues'); return; }
      const used = new Set(HOTCUES.map(h => h.n));
      let n = 1; while (used.has(n)) n++;
      const hc = { n, bar, name: 'CUE ' + n, note: '', color: PIO[(n - 1) % PIO.length] };
      HOTCUES.push(hc);
      HOTCUES.sort((a, b) => a.bar - b.bar);
      buildPads();
      toast('Hot cue ' + n + ' marcado · comp. ' + bar);
      selectEntity({ type: 'hotcue', n });
    }
    function deleteHotCue(n) {
      const i = HOTCUES.findIndex(h => h.n === n);
      if (i < 0) return;
      HOTCUES.splice(i, 1);
      state.selected = null;
      buildPads();
      toast('Hot cue ' + n + ' removido');
      syncNav(); renderInspector(); renderAll();
    }

    /* ── MEMORY CUES ──────────────────────────────────────────── */
    function addMemCue(bar) {
      bar = snapBar(bar);
      const m = { bar, name: 'M' + (MEMCUES.length + 1) };
      MEMCUES.push(m);
      MEMCUES.sort((a, b) => a.bar - b.bar);
      toast('Memory cue ' + m.name + ' · comp. ' + bar);
      selectEntity({ type: 'memcue', i: MEMCUES.indexOf(m) });
    }
    function deleteMemCue(i) {
      if (i < 0 || i >= MEMCUES.length) return;
      MEMCUES.splice(i, 1);
      state.selected = null;
      toast('Memory cue removido');
      syncNav(); renderInspector(); renderAll();
    }

    /* ── MEMORY LOOPS ─────────────────────────────────────────── */
    function addLoop(bars, bar) {
      bar = snapBar(bar == null ? centerBar() : bar);
      const lp = { bar, bars, name: bars + 'B Loop', active: false };
      MEMLOOPS.push(lp);
      MEMLOOPS.sort((a, b) => a.bar - b.bar);
      toast('Loop de ' + bars + ' compassos · comp. ' + bar);
      selectEntity({ type: 'loop', i: MEMLOOPS.indexOf(lp), bar });
    }
    function deleteLoop(i) {
      if (i < 0 || i >= MEMLOOPS.length) return;
      MEMLOOPS.splice(i, 1);
      state.selected = null;
      toast('Loop removido');
      syncNav(); renderInspector(); renderAll();
    }

    /* ── NOTES ────────────────────────────────────────────────── */
    function addNoteAt(time, cat) {
      const n = { time: Math.max(0, +time || 0), text: '', cat: cat || state.noteCat || 'NOTA' };
      NOTES.push(n);
      NOTES.sort((a, b) => a.time - b.time);
      const i = NOTES.indexOf(n);
      selectEntity({ type: 'note', i });
      requestAnimationFrame(() => { const inp = inspBody.querySelector('#note-item-' + i + ' .note-text'); if (inp) { inp.focus(); inp.select(); } });
    }

    /* ── Mark-tool click router + toolbar sync ────────────────── */
    function handleMarkAdd(mode, col) {
      if (mode === 'cue')         addHotCue(col / COLS_PER_BAR);
      else if (mode === 'memcue') addMemCue(col / COLS_PER_BAR);
      else if (mode === 'loop')   addLoop(state.loopBarsPreset || 4, col / COLS_PER_BAR);
      else if (mode === 'note')   addNoteAt(colToTime(col));
    }
    function syncMarkTools() {
      const seg = q('#djp-markTools');
      qa('#djp-markTools button[data-mark]').forEach(b => b.classList.toggle('is-armed', b.dataset.mark === state.markMode));
      if (seg) {
        seg.classList.toggle('is-loop-mode', state.markMode === 'loop');
        const extras = q('#djp-loopExtras');
        if (extras) extras.setAttribute('aria-hidden', state.markMode === 'loop' ? 'false' : 'true');
      }
      qa('#djp-loopExtras [data-loop-bars]').forEach(b => {
        b.classList.toggle('is-active', +b.dataset.loopBars === state.loopBarsPreset);
      });
      stage.classList.toggle('arming', !!state.markMode);
      const badge = q('#djp-markBadge');
      if (badge) badge.textContent = state.markMode ? MARK_LABEL[state.markMode] : '';
    }

    const inspBody = q('#djp-inspBody');
    const STARS = n => `<div class="stars">${Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'ri-star-fill' : 'ri-star-line'}"></i>`).join('')}</div>`;
    const card = (h, body, extra = '') => `<div class="card${extra ? ' ' + extra : ''}"><div class="card-h">${h}</div>${body}</div>`;
    const prop = (k, v, ac) => `<div class="prop"><span class="k">${k}</span><span class="v ${ac ? 'ac' : ''}">${v}</span></div>`;

    function renderInspector() {
      /* inspTitle stays "Workspace" (set in shellHTML); inspSub holds tb-actions buttons — never overwrite */
      const R = { overview: inspOverview, beatgrid: inspBeatgrid, hotcues: inspHotcues, memcues: inspMemcues,
        loops: inspLoops, phrases: inspPhrases, energy: inspEnergy, harmonic: inspHarmonic, metadata: inspMetadata, export: inspExport };
      inspBody.innerHTML = (R[state.section] || inspOverview)();
      /* cuepads live inside inspOverview — rebuild them after innerHTML swap */
      const padsEl = q('#djp-cuePads'); if (padsEl) buildPads();
      bindInspector();
      /* highlight save button when an editor card is active */
      q('#djp-btnSave')?.classList.toggle('has-edits', !!state.selected);
    }
    function inspChecklist() {
      const items = [['Analisado', 1, '128 BPM'], ['Beatgrid travado', 1, '⌂ comp. 1'], ['Tom detectado', 1, '8A'],
        ['Ganho ajustado', 1, '−0.8 dB'], ['Hot cues', 1, '8 / 8'], ['Fraseado', 1, '12'], ['Memory loops', 1, '2'],
        ['Silêncio aparado', 0, 'revisar'], ['Tagueado', 1, 'cor · ★4'], ['Exportado', 0, 'pendente']];
      return `<div class="checklist">${items.map(([l, d, meta]) => `
        <div class="chk ${d ? 'done' : 'warn'}"><span class="box">${d ? '<i class="ri-check-line"></i>' : ''}</span>
        <span class="lb">${l}</span><span class="meta">${meta}</span></div>`).join('')}</div>`;
    }
    function noteTag(cat, i) {
      const ct = NOTE_CATS[cat] || NOTE_CATS.NOTA;
      return `<button class="note-tag${ct.accent ? ' is-ac' : ''}" data-cat="${cat}"${i != null ? ` data-note="${i}"` : ''} title="Categoria — clique para alterar">${ct.label}</button>`;
    }
    function inspOverview() {
      const notesHTML = NOTES.length ? NOTES.map((n, i) => {
        const sel = state.selected && state.selected.type === 'note' && state.selected.i === i;
        return `
        <div class="note-item${sel ? ' sel' : ''}" data-note="${i}" id="note-item-${i}">
          <button class="note-ts" data-note="${i}" title="Ir para ${fmt(n.time)} — clique para navegar">${fmt(n.time)}</button>
          ${noteTag(n.cat || 'NOTA', i)}
          <input class="input note-text" value="${(n.text || '').replace(/"/g, '&quot;')}" data-note="${i}" placeholder="Escreva a anotação…">
          <button class="note-del" data-note="${i}" title="Excluir nota"><i class="ri-close-line"></i></button>
        </div>`; }).join('') : `<p class="note-empty">Nenhuma anotação ainda. Escolha uma categoria, escreva abaixo e toque ＋ — ou arme <b>NOTA</b> na barra e clique na waveform.</p>`;

      const catChips = NOTE_CAT_ORDER.map(c => {
        const ct = NOTE_CATS[c];
        return `<button class="note-cat${ct.accent ? ' is-ac' : ''}${state.noteCat === c ? ' sel' : ''}" data-setcat="${c}" title="Categoria ${ct.label}">${ct.label}</button>`;
      }).join('');

      const selHint = state.selected ? '' : `<div class="insp-guide"><b>Anotações</b> — escreva no campo (entra no <b>tempo atual</b> da agulha) ou arme <b>NOTA</b> na barra e clique na waveform. Cada nota tem categoria, horário (clique p/ navegar) e texto editável.</div>`;

      return selHint + `<div class="insp-workspace-grid">`
        + card('<i class="ri-chat-quote-line"></i> Anotações',
          `<div class="note-list">${notesHTML}</div>`
          + `<div class="note-add">`
          + `<div class="note-add-top">`
          + `<span class="note-add-ts" id="djp-noteTs" title="Tempo atual da agulha — a nota entra aqui"><i class="ri-time-line"></i>${fmt(state.pos)}</span>`
          + `<div class="note-cats" id="djp-noteCats">${catChips}</div>`
          + `</div>`
          + `<div class="note-add-bot">`
          + `<input class="input" id="djp-noteInput" placeholder="Nova anotação no tempo atual…">`
          + `<button class="abtn primary" id="djp-noteAddBtn" title="Adicionar anotação"><i class="ri-add-line"></i></button>`
          + `</div>`
          + `</div>`,
          'card--notes')
        + `<section class="insp-flex-col">`
        + `<div class="cuepads" id="djp-cuePads"></div>`
        + card('CHECKLIST DE PREPARO', inspChecklist())
        + `</section>`
        + `</div>`;
    }
    function inspBeatgrid() {
      return card('GRADE', prop('BPM', '128.00', 1) + prop('Detectado', '127.98') + prop('Modo', 'Fixo · 4/4') +
        prop('Âncora master', '⌂ Comp. 1 · 0:00.00', 1) + prop('Beat offset', state.beatOffset.toFixed(2) + ' col') + prop('Snap', '1/4 de tempo'))
        + card('BPM MULTI-ZONA',
          `<div class="phrase-list">
            <div class="phrase-item"><span class="bar bar--grn"></span><span class="nm">Zona 1 · faixa inteira</span><span class="rng">128.00 ⌂</span></div>
            <div class="phrase-item is-dimmed"><span class="bar bar--ct4"></span><span class="nm">+ adicionar zona</span><span class="rng">warp</span></div>
          </div>`)
        + card('PRECISÃO',
          `<div class="prop"><span class="k">Precisão da grade</span><span class="v ac">98.6%</span></div>
           <div class="accbar accbar--tight"><i class="accbar-fill accbar-fill--986"></i></div>
           <div class="prop"><span class="k">Drift no outro</span><span class="v">−1.4 ms</span></div>
           <div class="prop"><span class="k">Confiança</span><span class="v">alta</span></div>`)
        + card('AJUSTE', `<div class="flex-gap-6"><button class="abtn ghost flex-1" data-nudge="-1">◄ −5%</button><button class="abtn ghost flex-1" data-nudge="1">+5% ►</button></div>`);
    }
    function inspHotcues() {
      const rows = HOTCUES.length ? HOTCUES.map(c => { const sel = state.selected && state.selected.type === 'hotcue' && state.selected.n === c.n;
          return `<div class="cue-row ${sel ? 'sel' : ''}" data-cue="${c.n}"><span class="pn">${c.n}</span><span class="sw2" style="--sw2:${c.color}"></span>
            <span class="nm">${c.name}</span><span class="tm">${fmt(colToTime(barCol(c.bar)))}</span></div>`; }).join('')
        : '<p class="note-empty">Nenhum hot cue. Toque o botão abaixo ou arme <b>CUE</b> na barra e clique na waveform.</p>';
      return card(`HOT CUES · ${HOTCUES.length}/8`,
        `<div class="phrase-list">${rows}</div>`
        + `<div class="edit-actions"><button class="abtn" id="djp-addCue"${HOTCUES.length >= 8 ? ' disabled' : ''}><i class="ri-add-line"></i>Marcar hot cue no tempo atual</button></div>`)
        + (state.selected && state.selected.type === 'hotcue' ? inspCueEditor()
          : card('COMO MARCAR', '<div class="hint-ct3">Arme <b>CUE</b> na barra acima e clique na waveform, ou toque <b>Marcar hot cue no tempo atual</b>. Selecione um cue para editar nome, cor e comentário.</div>'));
    }
    function inspCueEditor() {
      const c = HOTCUES.find(h => h.n === state.selected.n);
      if (!c) return '';
      return card(`EDITAR · CUE ${c.n}`,
        `<div class="field"><label>NOME</label><input class="input" id="djp-cueName" value="${(c.name || '').replace(/"/g, '&quot;')}" placeholder="Nome do cue…"></div>
         <div class="field"><label>COMENTÁRIO</label><input class="input" id="djp-cueNote" value="${(c.note || '').replace(/"/g, '&quot;')}" placeholder="Comentário…"></div>
         <div class="field"><label>COR PIONEER</label><div class="swatches">${PIO.map(col => `<span class="sw ${col === c.color ? 'sel' : ''}" style="--sw:${col}"></span>`).join('')}</div></div>
         ${prop('Posição', fmt(colToTime(barCol(c.bar))) + ' · comp. ' + c.bar, 1)}${prop('Tipo', 'Cue / Memory')}${prop('Quantize', 'snap 1/1')}
         <div class="edit-actions"><button class="abtn danger" data-del-cue="${c.n}"><i class="ri-delete-bin-line"></i>Excluir Cue ${c.n}</button></div>
         <div class="insp-guide">As alterações são salvas automaticamente · clique <b>Salvar</b> no topo ou <b>Excluir</b> para remover.</div>`);
    }
    function inspMemcues() {
      const rows = MEMCUES.length ? MEMCUES.map((m, i) => {
        const sel = state.selected && state.selected.type === 'memcue' && state.selected.i === i;
        return `<div class="cue-row${sel ? ' sel' : ''}" data-memcue="${i}"><span class="sw2 sw2--grn"></span><span class="nm">${m.name}</span>
        <span class="tm">${fmt(colToTime(barCol(m.bar)))} · comp. ${m.bar}</span></div>`; }).join('')
        : '<p class="note-empty">Nenhum memory cue. Toque o botão abaixo ou arme <b>MEM</b> na barra e clique na waveform.</p>';
      const sm = state.selected && state.selected.type === 'memcue' ? MEMCUES[state.selected.i] : null;
      return card('MEMORY CUES', `<div class="phrase-list">${rows}</div>`
        + `<div class="edit-actions"><button class="abtn" id="djp-addMemcue"><i class="ri-add-line"></i>Marcar memory cue no tempo atual</button></div>`)
        + (sm ? card(`EDITAR · ${sm.name}`,
          `<div class="field"><label>NOME</label><input class="input" id="djp-memcueName" value="${(sm.name || '').replace(/"/g, '&quot;')}" placeholder="Nome…"></div>`
          + prop('Posição', fmt(colToTime(barCol(sm.bar))), 1) + prop('Compasso', sm.bar)
          + `<div class="edit-actions"><button class="abtn danger" id="djp-memcueDel"><i class="ri-delete-bin-line"></i>Excluir memory cue</button></div>`)
          : card('COMO MARCAR', '<div class="hint-ct3">Arme <b>MEM</b> na barra e clique na waveform, ou toque <b>Marcar memory cue no tempo atual</b>. Clique em um para renomear ou excluir.</div>'))
        + card('AUTO', prop('Origem', 'limites de fraseado') + prop('Estratégia', 'snap no downbeat') + prop('Total', MEMCUES.length + ' marcados'));
    }
    function inspLoops() {
      const rows = MEMLOOPS.length ? MEMLOOPS.map((l, i) => {
        const sel = state.selected && state.selected.type === 'loop' && state.selected.i === i;
        return `<div class="cue-row${sel ? ' sel' : ''}" data-loop="${i}"><span class="sw2 ${l.active ? 'sw2--grn' : 'sw2--pur'}"></span>
        <span class="nm">${l.name}</span><span class="tm">${l.bars} bar · ${fmt(colToTime(barCol(l.bar)))}</span>
        <span class="toggle ml-6 ${l.active ? 'on' : ''}" data-loop-idx="${i}"></span>
        <button class="abtn danger abtn--row-del" data-del-loop="${i}">✕</button></div>`; }).join('')
        : '<p class="note-empty">Nenhum loop registrado. Use os botões acima.</p>';
      const sl = state.selected && state.selected.type === 'loop' ? MEMLOOPS[state.selected.i] : null;
      return card('REGISTRAR LOOP',
          `<div class="hint-ct3">Cria um memory loop no <b>tempo atual</b> da agulha (${fmt(state.pos)} · comp. ${snapBar(centerBar())}). Escolha o tamanho:</div>`
          + `<div class="loop-reg">${[1, 2, 4, 8, 16].map(n => `<button class="abtn ghost" data-reg-loop="${n}">${n}<small>bar</small></button>`).join('')}</div>`)
        + card('MEMORY LOOPS', `<div class="phrase-list">${rows}</div>`)
        + (sl ? card(`EDITAR · ${sl.name}`,
            `<div class="field"><label>NOME</label><input class="input" id="djp-loopName" value="${(sl.name || '').replace(/"/g, '&quot;')}" placeholder="Nome do loop…"></div>`
            + `<div class="field"><label>DURAÇÃO · COMPASSOS</label><div class="loop-reg loop-reg--len">${[1, 2, 4, 8, 16].map(n => `<button class="abtn ghost${sl.bars === n ? ' is-active' : ''}" data-loop-len="${n}">${n}</button>`).join('')}</div></div>`
            + prop('Início', fmt(colToTime(barCol(sl.bar))) + ' · comp. ' + sl.bar, 1) + prop('Ativo', sl.active ? 'sim' : 'não', sl.active ? 1 : 0)
            + `<div class="edit-actions"><button class="abtn danger" id="djp-loopDel"><i class="ri-delete-bin-line"></i>Excluir loop</button></div>`)
          : card('COMO EDITAR', '<div class="hint-ct3">Registre um loop acima, ou clique na região roxa/verde na waveform/overview para selecionar e editar (nome, duração, ativar, excluir).</div>'));
    }
    function inspPhrases() {
      return card('ESTRUTURA · 12 FRASES', `<div class="phrase-list">${PHRASES.map(p => {
        const sel = state.selected && state.selected.type === 'phrase' && state.selected.i === p.i;
        return `<div class="phrase-item ${sel ? 'sel is-sel' : ''}" data-phrase="${p.i}">
          <span class="bar" style="--bar:${p.color}"></span><span class="nm">${p.name}</span>
          <span class="rng">comp. ${p.start + 1}–${p.end} · E${p.energy}</span></div>`; }).join('')}</div>`)
        + card('ANÁLISE DE FRASEADO', prop('Modelo', 'apollo phrase v3') + prop('Compassos', '127') + prop('Tam. frase', '8 compassos') + prop('Drops', '2') + prop('Breaks', '1'));
    }
    function inspEnergy() {
      return card('CURVA DE ENERGIA', `<div class="energy-curve"><canvas id="djp-enCurve"></canvas></div>`)
        + card('POR FRASE', `<div class="phrase-list">${PHRASES.map(p => `
          <div class="phrase-item"><span class="bar" style="--bar:${energyColor(p.energy)}"></span>
          <span class="nm">${p.name}</span><span class="rng" style="--rng:${energyColor(p.energy)}">E ${p.energy}/10</span></div>`).join('')}</div>`)
        + card('PICOS', prop('Energia máx.', 'DROP 2 · E10', 1) + prop('Mais baixa', 'OUTRO · E1') + prop('Média', '5.8') + prop('Drop em', '2:42 / comp. 81'));
    }
    function inspHarmonic() {
      const ring = ['1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A', '12A'];
      const cx = 75, cy = 75, r = 58;
      const seg = ring.map((k, i) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; const x = cx + Math.cos(a) * r; const y = cy + Math.sin(a) * r;
        const cur = k === '8A'; const good = ['7A', '9A'].includes(k);
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${cur ? 9 : 6}" fill="${cur ? '#E8820C' : good ? '#27d07a' : 'rgba(5,5,5,0.08)'}" stroke="${cur ? '#E8820C' : 'rgba(5,5,5,0.12)'}" stroke-width="1"/>
          <text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="7" fill="${cur ? '#fff' : 'rgba(5,5,5,0.5)'}" text-anchor="middle" font-family="Space Mono">${k}</text>`; }).join('');
      return card('CAMELOT', `<div class="harm"><div class="wheel"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="68" fill="none" stroke="#15171c"/>${seg}</svg>
        <div class="ctr"><div class="text-center"><b>8A</b><span>A menor</span></div></div></div>
        <div class="compat"><span class="kk same">8A igual</span><span class="kk good">7A −1</span><span class="kk good">9A +1</span><span class="kk good">8B rel</span></div></div>`)
        + card('MIXAGEM HARMÔNICA', prop('Tom', '8A · A menor', 1) + prop('Camelot', '8A') + prop('Open Key', '1m') + prop('Confiança', '97%') + prop('Boost de energia', '→ 9A (+1)'));
    }
    function inspMetadata() {
      const tags = [['Título', 'Midnight Aurora'], ['Artista', 'Sølform'], ['Álbum', 'Phosphor EP'], ['Gênero', 'Melodic Techno'],
        ['BPM', '128.00'], ['Tom', '8A'], ['Ano', '2026'], ['Selo', 'Aurora Trax'], ['ISRC', 'BRAP62600118'],
        ['Bitrate', '1411 kbps'], ['Sample rate', '44.1 kHz'], ['Bit depth', '16-bit'], ['Arquivo', 'midnight_aurora.flac'],
        ['Caminho', 'Tracks/Coletânea/'], ['Fingerprint', 'chromaprint ✓'], ['Sidecar', '.apollodj.json ✓']];
      return card('TAGS DO ARQUIVO', tags.map(([k, v]) => prop(k, v)).join(''))
        + card('APOLLO', prop('Pipeline', 'v2 · atômico') + prop('Quality gate', 'PASS · 94/100', 1) + prop('Origem', 'P2P · verificado') + prop('Status', 'Coletânea', 1));
    }
    function inspExport() {
      const tg = [['Rekordbox XML', 'Pioneer CDJ nativo · cues+grade+loops', 1], ['Serato Crate', '.crate + markers', 1],
        ['USB / DJ Music', 'pronto p/ CDJ-3000 · Pendrives/', 1], ['apolloDJ sidecar', '.apollodj.json', 1], ['Engine DJ', 'export denon', 0]];
      return card('DESTINOS', tg.map(([t, s, on]) => `<div class="exp-target"><div class="flex-1"><div class="tg">${t}</div><div class="sm">${s}</div></div><span class="toggle ${on ? 'on' : ''}"></span></div>`).join(''))
        + card('CHECKLIST DE PREPARO', inspChecklist())
        + `<button class="btn-full" id="djp-doExport">EXPORTAR · 0% DUPLICAÇÃO</button>`;
    }
    function bindInspector() {
      inspBody.querySelectorAll('[data-cue]').forEach(el => el.onclick = () => selectEntity({ type: 'hotcue', n: +el.dataset.cue }));
      inspBody.querySelectorAll('[data-memcue]').forEach(el => el.onclick = () => selectEntity({ type: 'memcue', i: +el.dataset.memcue }));
      inspBody.querySelectorAll('[data-loop]').forEach(el => el.onclick = (e) => {
        if (e.target.closest('.toggle')) return;
        const i = +el.dataset.loop;
        selectEntity({ type: 'loop', i, bar: MEMLOOPS[i].bar });
      });
      inspBody.querySelectorAll('.note-item').forEach(el => el.onclick = (e) => {
        if (e.target.closest('.note-del') || e.target.closest('.note-text') || e.target.closest('.note-ts') || e.target.closest('.note-tag')) return;
        selectEntity({ type: 'note', i: +el.dataset.note });
      });
      inspBody.querySelectorAll('[data-phrase]').forEach(el => el.onclick = () => { state.selected = { type: 'phrase', i: +el.dataset.phrase };
        jumpToBar(PHRASES[+el.dataset.phrase].start); renderInspector(); renderAll(); });
      inspBody.querySelectorAll('.sw').forEach(sw => sw.onclick = () => { const p = sw.parentElement;
        p.querySelectorAll('.sw').forEach(s => s.classList.remove('sel')); sw.classList.add('sel');
        if (state.selected && state.selected.type === 'hotcue') { HOTCUES.find(h => h.n === state.selected.n).color = sw.style.getPropertyValue('--sw').trim(); renderAll(); } });
      inspBody.querySelectorAll('.toggle').forEach(t => t.onclick = () => {
        t.classList.toggle('on');
        if (t.dataset.loopIdx !== undefined) { MEMLOOPS[+t.dataset.loopIdx].active = t.classList.contains('on'); renderAll(); }
      });
      inspBody.querySelectorAll('[data-nudge]').forEach(b => b.onclick = () => { state.beatOffset += (+b.dataset.nudge) * COLS_PER_BEAT * 0.05; renderAll(); renderInspector(); });
      const ex = q('#djp-doExport'); if (ex) ex.onclick = () => { ex.textContent = '✓ EXPORTADO · Rekordbox + Serato + USB'; ex.classList.add('done'); toast('Exportado · 0% duplicação'); };
      const ec = q('#djp-enCurve'); if (ec) drawEnergyCurve(ec);

      /* ── Hot cue editing ───────────────────────────────────── */
      const addCueBtn = q('#djp-addCue'); if (addCueBtn) addCueBtn.onclick = () => addHotCue(centerBar());
      const cueName = q('#djp-cueName'); if (cueName) cueName.oninput = function () {
        if (state.selected && state.selected.type === 'hotcue') { const c = HOTCUES.find(h => h.n === state.selected.n); if (c) { c.name = this.value; renderAll(); } } };
      const cueNote = q('#djp-cueNote'); if (cueNote) cueNote.oninput = function () {
        if (state.selected && state.selected.type === 'hotcue') { const c = HOTCUES.find(h => h.n === state.selected.n); if (c) c.note = this.value; } };
      /* data-del-cue — editor card delete button (uses cue number, not element id) */
      inspBody.querySelectorAll('[data-del-cue]').forEach(b => b.onclick = () => {
        const n = +b.dataset.delCue;
        const i = HOTCUES.findIndex(h => h.n === n);
        if (i < 0) return;
        HOTCUES.splice(i, 1);
        state.selected = null;
        state.section = 'hotcues';
        buildPads(); toast('Hot cue ' + n + ' removido');
        syncNav(); renderInspector(); renderAll();
      });

      /* ── Memory cue editing ────────────────────────────────── */
      const addMemBtn = q('#djp-addMemcue'); if (addMemBtn) addMemBtn.onclick = () => addMemCue(centerBar());
      const memName = q('#djp-memcueName'); if (memName) memName.oninput = function () {
        if (state.selected && state.selected.type === 'memcue' && MEMCUES[state.selected.i]) { MEMCUES[state.selected.i].name = this.value; renderAll(); } };
      const memDel = q('#djp-memcueDel'); if (memDel) memDel.onclick = () => { if (state.selected && state.selected.type === 'memcue') deleteMemCue(state.selected.i); };

      /* ── Memory loop editing ───────────────────────────────── */
      inspBody.querySelectorAll('[data-reg-loop]').forEach(b => b.onclick = () => addLoop(+b.dataset.regLoop));
      const loopName = q('#djp-loopName'); if (loopName) loopName.oninput = function () {
        if (state.selected && state.selected.type === 'loop' && MEMLOOPS[state.selected.i]) { MEMLOOPS[state.selected.i].name = this.value; renderAll(); } };
      inspBody.querySelectorAll('[data-loop-len]').forEach(b => b.onclick = () => {
        if (state.selected && state.selected.type === 'loop' && MEMLOOPS[state.selected.i]) { MEMLOOPS[state.selected.i].bars = +b.dataset.loopLen; renderAll(); renderInspector(); } });
      const loopDel = q('#djp-loopDel'); if (loopDel) loopDel.onclick = () => { if (state.selected && state.selected.type === 'loop') deleteLoop(state.selected.i); };
      /* data-del-loop — per-row delete buttons in loop list */
      inspBody.querySelectorAll('[data-del-loop]').forEach(b => b.onclick = (e) => {
        e.stopPropagation();
        const i = +b.dataset.delLoop;
        if (i < 0 || i >= MEMLOOPS.length) return;
        MEMLOOPS.splice(i, 1);
        state.selected = null;
        toast('Loop removido');
        syncNav(); renderInspector(); renderAll();
      });

      /* ── Note interactions ──────────────────────────────────── */
      // Navigate to timestamp on note-ts click
      inspBody.querySelectorAll('.note-ts').forEach(btn => btn.onclick = (e) => {
        e.stopPropagation();
        const idx = +btn.dataset.note;
        if (NOTES[idx]) selectEntity({ type: 'note', i: idx });
      });
      // Cycle note category by clicking its tag chip
      inspBody.querySelectorAll('.note-item .note-tag').forEach(btn => btn.onclick = (e) => {
        e.stopPropagation();
        const idx = +btn.dataset.note;
        if (!NOTES[idx]) return;
        const cur = NOTE_CAT_ORDER.indexOf(NOTES[idx].cat || 'NOTA');
        NOTES[idx].cat = NOTE_CAT_ORDER[(cur + 1) % NOTE_CAT_ORDER.length];
        renderAll(); renderInspector();
      });
      // Edit note text inline
      inspBody.querySelectorAll('.note-text').forEach(inp => inp.oninput = function () {
        const idx = +this.dataset.note;
        if (NOTES[idx]) NOTES[idx].text = this.value;
      });
      // Delete note
      inspBody.querySelectorAll('.note-del').forEach(btn => btn.onclick = () => {
        const idx = +btn.dataset.note;
        NOTES.splice(idx, 1);
        state.selected = null;
        renderAll(); renderInspector();
      });
      // Add-row category selector
      inspBody.querySelectorAll('#djp-noteCats .note-cat').forEach(btn => btn.onclick = () => {
        state.noteCat = btn.dataset.setcat;
        inspBody.querySelectorAll('#djp-noteCats .note-cat').forEach(b => b.classList.toggle('sel', b === btn));
      });
      // Add note at current playhead time, in the selected category
      const noteInput = q('#djp-noteInput');
      const noteAddBtn = q('#djp-noteAddBtn');
      const noteTs = q('#djp-noteTs');
      if (noteAddBtn && noteInput) {
        noteAddBtn.onclick = () => {
          const text = noteInput.value.trim();
          if (!text) { noteInput.focus(); return; }
          const n = { time: state.pos, text, cat: state.noteCat || 'NOTA' };
          NOTES.push(n);
          NOTES.sort((a, b) => a.time - b.time);
          noteInput.value = '';
          state.selected = { type: 'note', i: NOTES.indexOf(n) };
          renderAll(); renderInspector();
        };
        noteInput.addEventListener('keydown', e => { if (e.key === 'Enter') noteAddBtn.click(); });
      }
      // Keep timestamp badge in sync with playhead (single timer — no leak)
      if (noteTs) {
        if (state._noteTsTimer) clearInterval(state._noteTsTimer);
        state._noteTsTimer = setInterval(() => {
          const el = q('#djp-noteTs');
          if (!el) { clearInterval(state._noteTsTimer); state._noteTsTimer = null; return; }
          el.innerHTML = '<i class="ri-time-line"></i>' + fmt(state.pos);
        }, 250);
      }
    }
    function drawEnergyCurve(cv) {
      const r = cv.parentElement.getBoundingClientRect(); const d = window.devicePixelRatio || 1;
      cv.width = r.width * d; cv.height = r.height * d; const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
      const W = r.width, H = r.height; c.clearRect(0, 0, W, H);
      for (let x = 0; x < W; x++) { const bar = (x / W) * 127; const e = sectionAt(bar)[8] + ramp(bar) * 2;
        c.fillStyle = energyColor(e); c.fillRect(x, H - (e / 12 * H), 1, H); }
      c.beginPath(); c.strokeStyle = '#fff'; c.lineWidth = 1.5;
      for (let x = 0; x < W; x++) { const bar = (x / W) * 127; const y = H - ((sectionAt(bar)[8] + ramp(bar) * 2) / 12 * H);
        x === 0 ? c.moveTo(x, y) : c.lineTo(x, y); } c.stroke();
    }

    /* ── hot cue pad row ──────────────────────────────────────── */
    function buildPads() {
      const w = q('#djp-cuePads'); if (!w) return; w.innerHTML = '';
      HOTCUES.forEach(c => { const p = document.createElement('div'); p.className = 'pad'; p.style.setProperty('--pc', c.color);
        p.innerHTML = `<div class="num"><i style="--pc-dot:${c.color}"></i>HOT CUE ${c.n}</div><div class="nm">${c.name}</div><div class="tm">${fmt(colToTime(barCol(c.bar)))} · comp. ${c.bar}</div>`;
        p.onclick = () => selectEntity({ type: 'hotcue', n: c.n }); w.appendChild(p); });
    }
    function syncPads() { const w = q('#djp-cuePads'); if (!w) return; [...w.children].forEach((p, i) =>
      p.classList.toggle('is-active', state.selected && state.selected.type === 'hotcue' && state.selected.n === HOTCUES[i].n)); }

    /* ── feedback de ações (App.toast + flash) ────────────────── */
    function toast(m) { if (window.App && typeof App.toast === 'function') App.toast(m); }
    function flash(btn, txt, then) {
      const o = btn.innerHTML; btn.innerHTML = txt; btn.style.pointerEvents = 'none';
      setTimeout(() => { btn.innerHTML = o; btn.style.pointerEvents = ''; if (then) then(); }, 1000);
    }
    q('#djp-btnAnalyze').onclick = function () { toast('Analisando faixa…'); flash(this, '<i class="ri-loader-4-line"></i> Analisando…'); };
    q('#djp-btnAutoPrep').onclick = function () { toast('Auto-preparando…'); flash(this, '<i class="ri-magic-line"></i> Preparando…', () => { state.section = 'hotcues'; syncNav(); renderInspector(); }); };
    q('#djp-btnSave').onclick = function () { toast('Faixa salva na Coletânea'); flash(this, '<i class="ri-check-line"></i> Salvo'); };
    q('#djp-btnExport').onclick = function () { state.section = 'export'; syncNav(); renderInspector(); };

    /* ── integração ApolloState (faixa carregada no deck) ─────── */
    if (window.ApolloState && typeof ApolloState.subscribe === 'function') {
      const onLoaded = ({ deck, track, analysis }) => {
        if (deck && deck !== 1) return;
        if (track) {
          state.track.title  = track.title  || track.t || state.track.title;
          state.track.artist = track.artist || track.a || state.track.artist;
          if (track.album) state.track.album = track.album;
          if (track.key)   { state.track.key = track.key; state.track.keyName = track.key; }
          q('#djp-trkTitle').textContent  = state.track.title;
          q('#djp-trkArtist').textContent = state.track.artist + (state.track.album ? ' — ' + state.track.album : '');
          if (track.fmt) q('#djp-fmtChip').textContent = track.fmt;
          if (track.key) q('#djp-keyVal').textContent  = track.key;
        }
        if (analysis) {
          if (analysis.bpm) {
            state.track.bpm = String(analysis.bpm) + '.00';
            q('#djp-bpmInt').textContent = analysis.bpm;
          }
          /* sync hot cues from Python analysis */
          if (Array.isArray(analysis.hotcues) && analysis.hotcues.length) {
            HOTCUES.length = 0;
            const bpm = analysis.bpm || BPM;
            analysis.hotcues.forEach((hc, i) => {
              const bar = hc.bar != null ? hc.bar
                : (hc.time != null ? Math.round(hc.time * bpm / 60 / 4) : (i + 1) * 8);
              HOTCUES.push({ n: i + 1, bar, name: hc.label || hc.type || ('CUE ' + (i + 1)), note: hc.note || '', color: hc.color || PIO[i % PIO.length] });
            });
            buildPads();
          }
          /* sync memory loops from Python analysis */
          if (Array.isArray(analysis.loops) && analysis.loops.length) {
            MEMLOOPS.length = 0;
            analysis.loops.forEach(lp => MEMLOOPS.push({
              bar: lp.bar || 0, bars: lp.bars || lp.length || 4,
              name: lp.name || 'Loop', active: lp.active !== false,
            }));
          }
        }
        syncNav();
        renderInspector();
        renderAll();
        toast('Faixa carregada: ' + state.track.title);
      };
      try { teardown.unsub = ApolloState.subscribe('deck:loaded', onLoaded); } catch (e) { /* noop */ }
    }

    /* ── Python bridge: window.djProLoad(track, analysis) ────── */
    window.djProLoad = function (track, analysis) {
      if (window.ApolloState && typeof ApolloState.emit === 'function') {
        try { ApolloState.emit('deck:loaded', { deck: 1, track: track || {}, analysis: analysis || {} }); } catch (e) {}
      }
    };
    if (!window.loadTrackToDeck) {
      window.loadTrackToDeck = function (deck, idx) {
        const tracks = window.T || window.__APOLLO_TRACKS__ || [];
        const t = tracks[idx];
        if (!t) { if (window.App && App.toast) App.toast('Nenhuma faixa no índice ' + idx); return; }
        window.djProLoad(
          { title: t.title || t.t, artist: t.artist || t.a, album: t.album, fmt: t.fmt, key: t.key },
          t.analysis || {}
        );
      };
    }

    /* ── boot ─────────────────────────────────────────────────── */
    state.bands = generateBands();
    buildEnergyMeter(); buildProgTicks();
    /* renderInspector creates #djp-cuePads (inside inspOverview) and calls buildPads() internally */
    syncNav(); syncMarkTools(); renderInspector(); syncPads();
    q('#djp-tTot').textContent = fmt(DURATION);
    // wrap renderInspector p/ sincronizar pads
    const _renderInspector = renderInspector;
    renderInspector = function () { _renderInspector(); syncPads(); };

    setTimeout(() => {
      renderAll(); renderInspector();
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => renderAll());
        [q('.djp-wave-grid-block'), stage, ovStrip, q('#djp-phraseLane'), q('#djp-energyLane')].forEach(el => el && ro.observe(el));
        teardown.ros.push(ro);
      }
    }, 40);

    /* ── cleanup (regra Apollo: sem vazamento de observers) ───── */
    ApolloPages.djToolsPro._teardown = teardown;
  };

  /* ── cleanup chamado pelo router ao trocar de página ───────── */
  ApolloPages.djToolsPro.cleanup = function () {
    const td = this._teardown; if (!td) return;
    try { td.ros.forEach(r => r.disconnect()); } catch (e) {}
    if (td.raf) cancelAnimationFrame(td.raf);
    try { td.win.forEach(([t, ty, fn, o]) => t.removeEventListener(ty, fn, o)); } catch (e) {}
    if (typeof td.unsub === 'function') { try { td.unsub(); } catch (e) {} }
    this._teardown = null;
  };

  /* ════════════════════════════════════════════════════════════
     SHELL HTML
  ════════════════════════════════════════════════════════════ */
  function shellHTML() {
    return `
    <div class="djpro-root">

      <!-- ══ TOOLBAR ══ -->
      <div class="djp-toolbar">
        <div class="tb-sect">
          <div class="art"><span class="ring"></span></div>
          <div class="trk">
            <div class="t1" id="djp-trkTitle">Midnight Aurora</div>
            <div class="t2" id="djp-trkArtist">Sølform — Phosphor EP</div>
            <div class="chips">
              <span class="chip flac" id="djp-fmtChip">FLAC</span>
              <span class="chip">44.1k · 1411kbps</span>
              <span class="chip ok">ANALISADO</span>
            </div>
          </div>
        </div>
        <div class="tb-sect">
          <div class="bigstat"><div class="lab">BPM</div><div class="val"><span id="djp-bpmInt">128</span><small>.00</small></div><div class="sub">1 zona · âncora ⌂1</div></div>
          <div class="bigstat key"><div class="lab">TOM</div><div class="val" id="djp-keyVal">8A</div><div class="sub">A menor</div></div>
        </div>
        <div class="tb-sect">
          <div class="energy-meter">
            <div class="lab"><span>ENERGIA</span><b id="djp-enVal">7</b></div>
            <div class="em-bars" id="djp-enBars"></div>
          </div>
        </div>
        <div class="tb-sect tb-sect--grow">
            <div class="progwrap">
            <div class="progmeta"><b id="djp-tNow">0:00.00</b><span id="djp-progPhrase">INTRO</span><b id="djp-tTot">3:58.16</b></div>
            <div class="progbar"><div class="ph-ticks" id="djp-phTicks"></div><div class="fill" id="djp-progFill"></div><div class="tick-tip" id="djp-tickTip" aria-hidden="true"></div></div>
          </div>
        </div>
      </div>

      <!-- ══ FIXED-TOP — full-width waveform band (spans above sidebar) ══ -->
      <section id="fixed-top">
        <div class="djp-fixed-top">

          <div class="stage-bar">
            <div class="waveform-color-wrap">
              <span class="waveform-color-lbl">WF</span>
              <select class="waveform-color-sel" id="djp-colorMode" title="Modo de cor da waveform">
                <option value="mono">B&amp;W</option>
                <option value="oldblue">OldBlue</option>
                <option value="rgb" selected>RGB</option>
              </select>
            </div>
            <div class="bands" id="djp-bands">
              <button class="band-dot low is-active" data-band="low"><i></i>LOW</button>
              <button class="band-dot mid is-active" data-band="mid"><i></i>MID</button>
              <button class="band-dot high is-active" data-band="high"><i></i>HIGH</button>
            </div>
            <div class="seg" id="djp-gridLayers">
              <button data-layer="bar" class="is-active">BAR</button>
              <button data-layer="beat" class="is-active">BEAT</button>
              <button data-layer="16th" class="is-active is-locked">16º</button>
              <button data-layer="phrase" class="is-active is-locked">FRASE</button>
            </div>
            <div class="seg seg--mark" id="djp-markTools" title="Marcar — clique para armar uma ferramenta, depois clique na waveform para criar o marcador">
              <button data-mark="cue" title="Marcar Hot Cue na waveform"><i class="ri-bookmark-3-line"></i>CUE</button>
              <button data-mark="memcue" title="Marcar Memory Cue na waveform"><i class="ri-flag-line"></i>MEM</button>
              <div class="mark-loop-extras" id="djp-loopExtras" aria-hidden="true">
                <button type="button" class="loop-extra" data-loop-act="in" title="Loop In no playhead">IN</button>
                <button type="button" class="loop-extra" data-loop-act="out" title="Loop Out no playhead">OUT</button>
                <button type="button" class="loop-extra" data-loop-act="exit" title="Cancelar loop em edição">EXIT</button>
                ${LOOP_BAR_PRESETS.map(n => `<button type="button" class="loop-extra" data-loop-bars="${n}" title="Loop ${n} compassos no playhead">${n}</button>`).join('')}
              </div>
              <button data-mark="loop" title="Memory Loop — arraste na waveform ou use IN/OUT"><i class="ri-repeat-2-line"></i>LOOP</button>
              <button data-mark="note" title="Marcar Anotação na waveform"><i class="ri-chat-1-line"></i>NOTA</button>
            </div>
            <button class="tool" id="djp-btnStacked" title="Waveform empilhada"><i class="ri-stack-line"></i></button>
            <div class="sp"></div>
            <button class="tool" id="djp-zoomOut">−</button>
            <span class="zoomlbl">zoom <b id="djp-zoomLbl">2.8</b>px</span>
            <button class="tool" id="djp-zoomIn">+</button>
            <button class="tool" id="djp-shiftL" title="Nudge grade ◄">◄</button>
            <button class="tool" id="djp-shiftR" title="Nudge grade ►">►</button>
            <button class="tool" id="djp-btnReset">RESET</button>
          </div>

          <div class="lane phrase-lane" id="djp-phraseLane"><canvas id="djp-phraseCanvas"></canvas></div>

          <div class="djp-wave-wrap">
            <div class="djp-wave-grid-block">
              <div class="lane grid-lane"><canvas id="djp-beatgrid"></canvas></div>
              <div class="wave-stage" id="djp-waveStage">
                <canvas id="djp-wave"></canvas>
                <canvas id="djp-cueCanvas"></canvas>
                <div class="center-line"></div>
                <div class="edit-badge">◆ EDITAR GRADE — arraste p/ warp · ◄► nudge da âncora</div>
                <div class="mark-badge" id="djp-markBadge"></div>
                <div class="cue-tip" id="djp-cueTip"></div>
              </div>
              <div class="playhead"></div>
            </div>
          </div>

          <!-- Overview — composite: energy heatmap (z:0) behind overview canvas (z:1) -->
          <div class="overview" id="djp-overview">
            <div class="lane energy-lane" id="djp-energyLane"><canvas id="djp-energyCanvas"></canvas><span class="tag">ENERGIA</span></div>
            <canvas id="djp-overviewCanvas"></canvas>
            <div class="ov-view" id="djp-ovView"><span class="ov-cap-l"></span><span class="ov-cap-r"></span></div>
            <div class="ov-ph" id="djp-ovPh"></div>
            <!-- DOM tooltip — shown on hover over markers in the overview -->
            <div class="ov-tip" id="djp-ovTip" aria-hidden="true"></div>
          </div>

        </div>
      </section>
      <!-- ══ END FIXED-TOP ══ -->

      <!-- ══ WORKSTATION — sidebar + scrollable workspace ══ -->
      <div class="djp-work">

        <!-- Sidebar bento card -->
        <aside class="djp-sidebar">
          <div class="side-h">PREPARAÇÃO</div>
          <nav class="djp-nav" id="djp-nav"></nav>
          <div class="side-foot">
            <div class="gridacc">
              <div class="row"><span>Precisão da Grade</span><b>98.6%</b></div>
              <div class="accbar"><i class="accbar-fill accbar-fill--986"></i></div>
              <div class="row row--small"><span>apolloBPK · KS-key · LUFS</span><span>v3</span></div>
            </div>
          </div>
        </aside>

        <section class="djp-center">
          <!-- Scrollable workspace body -->
          <div class="djp-scroll-body">
            <aside class="djp-inspector">

              <!-- Header: title "Workspace" + action buttons on the right -->
              <div class="insp-h">
                <span class="ti" id="djp-inspTitle">Workspace</span>
                <span id="djp-inspSub">
                  <div class="tb-actions">
                    <button class="tool" id="djp-btnPlay" title="Play/Pause"><i class="ri-play-fill" id="djp-playIco"></i></button>
                    <button class="tool" id="djp-btnEdit" title="Ajustar grade"><i class="ri-edit-2-line"></i></button>
                    <button class="tool" id="djp-btnAnalyze" title="Analisar faixa"><i class="ri-pulse-line"></i></button>
                    <button class="tool" id="djp-btnAutoPrep" title="Auto Prep"><i class="ri-magic-line"></i></button>
                    <button class="tool" id="djp-btnTrim" title="Aparar silêncio"><i class="ri-scissors-cut-line"></i></button>
                    <button class="abtn insp-save-btn" id="djp-btnSave" title="Salvar edições"><i class="ri-save-3-line"></i></button>
                    <button class="abtn primary" id="djp-btnExport" title="Exportar"><i class="ri-upload-2-line"></i></button>
                  </div>
                </span>
              </div>

              <!-- Body: filled dynamically by renderInspector() -->
              <div class="insp-body" id="djp-inspBody"></div>

            </aside>
          </div>
        </section>

      </div>
      <!-- ══ END WORKSTATION ══ -->

      <!-- ══ STATUS BAR ══ -->
      <div class="djp-status">
        <div class="it"><span class="led g"></span><span class="ready">PRONTO</span></div>
        <div class="it">motor <b>apolloBPK 3.1</b></div>
        <div class="it ac">grade <b>98.6%</b></div>
        <div class="it">ganho <b>−0.8 dB</b></div>
        <div class="it">LUFS <b>−7.2</b></div>
        <div class="it">pico <b>−0.3 dBTP</b></div>
        <div class="sp"></div>
        <div class="it"><span class="led o"></span>cues <b>8/8</b></div>
        <div class="it">loops <b>2</b></div>
        <div class="it">stride <b id="djp-stStride">2.8px</b></div>
        <div class="it"><b id="djp-stTime">0:00.00</b> / <b>3:58.16</b></div>
        <div class="it">Coletânea/midnight_aurora.flac · apolloDJ.v3</div>
      </div>

    </div>`;
  }

  function injectCSS() {
    // All .djpro-root CSS consolidated into v3/universal.apollodj.css
    if (document.getElementById('djpro-css')) return;
    // no-op — external stylesheet is authoritative
  }
})();
