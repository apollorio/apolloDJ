/* ════════════════════════════════════════════════════════════
   controladora.js — PAGE: Controladora / DJ Controller  (PRO)
   Refactor do controladora.js base → controlador completo:
   ▸ dual waveform com scroll, beatgrid, hotcues e loop ao vivo
   ▸ jog wheels giratórios (drag p/ scratch) + transport CUE/PLAY/SYNC
   ▸ pitch fader (KEY LOCK + RANGE) e BPM em tempo real
   ▸ performance pads 4×2 com modos HOT CUE · LOOP · ROLL · SLICER
   ▸ mixer: TRIM · HI/MID/LOW · FILTER · fader · VU · CUE de fone
   ▸ master + crossfader (curva) + BEAT FX (echo/reverb/filter…)
   ⚙ painel: MIDI mapping + Saída de Áudio.
   Base respeitada: ApolloPages.controladora · tokens --c* em .ctrl-root
   · HC_COLORS · ApolloState 'deck:loaded' · AnalysisStore · SIM_WAVEDATA
   · App.toast · RemixIcon ri-* · Space Grotesk/Mono. + cleanup().
   Registro: ApolloPages.controladora (Config.tabs → page:'controladora')
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.controladora = function (mount) {
    const HC = window.HC_COLORS || { A: '#FF2D37', B: '#FF9F1C', C: '#CAFF00', D: '#00FF7F', E: '#00B0F0', F: '#2563EB', G: '#9B4F96', H: '#FF00FF' };
    const HCV = Object.values(HC);
    const ACC = { 1: 'var(--cdA)', 2: 'var(--cdB)' };
    const RAW_ACC = { 1: '#E8820C', 2: '#0ea5e9' };
    const toast = m => { if (window.App && typeof App.toast === 'function') App.toast(m); };

    /* ── Helpers (base) ───────────────────────────── */
    function parseDur(t) { const p = String(t || '0:00').split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); }
    const fmt = s => { s = Math.max(0, s | 0); const m = (s / 60) | 0; return m + ':' + String(s % 60).padStart(2, '0'); };

    /* ── Modelo de waveform (usa SIM_WAVEDATA, senão sintetiza) ── */
    const COLS_SEC = 36, BEATS_ON_SCREEN = 16;
    function genWave(seed, dur) {
      const N = Math.floor(dur * COLS_SEC);
      const low = new Float32Array(N), mid = new Float32Array(N), high = new Float32Array(N);
      const frac = x => x - Math.floor(x);
      const rnd = i => frac(Math.sin((i + seed * 91.7) * 12.9898) * 43758.5453);
      const nz = i => (rnd(i) + rnd(i * 1.7 + 5) + rnd(i * 0.3 + 11)) / 3;
      for (let c = 0; c < N; c++) {
        const bar = c / (COLS_SEC * 2);                 // ~2s por compasso @120
        const sect = Math.floor(bar / 8) % 4;
        const drive = [0.25, 0.7, 1, 0.5][sect];
        const bp = frac(c / (COLS_SEC / 2));            // fase de tempo
        const kick = Math.exp(-Math.pow(bp / 0.12, 2)) * drive;
        const n = nz(c), n2 = nz(c * 2.3 + 9);
        low[c] = Math.min(1, kick * 1.05 + drive * (0.35 + 0.4 * n) * 0.7);
        mid[c] = Math.min(1, drive * (0.4 + 0.45 * Math.abs(Math.sin(bar * 3 + n))));
        high[c] = Math.min(0.9, drive * (0.18 + 0.6 * Math.abs(Math.sin(bp * 6.28))) * (0.6 + 0.5 * n2));
      }
      return { low, mid, high, N };
    }
    function deckWaveFromSim(idx) {
      const wd = (idx != null && window.SIM_WAVEDATA) ? window.SIM_WAVEDATA[idx] : null;
      if (wd && wd.low && wd.low.length) {
        const N = wd.low.length;
        const mk = a => { const f = new Float32Array(N); for (let i = 0; i < N; i++) f[i] = Math.abs(a[i] || 0); return f; };
        return { low: mk(wd.low), mid: mk(wd.mid || wd.low), high: mk(wd.mid || wd.low), N };
      }
      return null;
    }

    /* ── Estado por deck ──────────────────────────── */
    const D = {
      1: deckState(1, 'Midnight Aurora', 'Sølform', '8A', 128, 238, 0),
      2: deckState(2, 'Neon Tide', 'Kavari', '9A', 126, 210, 7),
    };
    function deckState(num, title, artist, key, bpm, dur, seed) {
      return {
        num, title, artist, key, baseBpm: bpm, bpm, dur, trackIdx: null,
        wave: deckWaveFromSim(null) || genWave(seed, dur),
        pos: 0, playing: false, pitch: 0, range: 8, keyLock: true, jog: 0,
        cue: 0, loop: { on: false, startBeat: 0, bars: 4 }, padMode: 'HOTCUE',
        phones: num === 1, hotcues: defaultCues(),
      };
    }
    function defaultCues() {
      return [
        { beat: 0, color: HCV[5 % HCV.length] }, { beat: 32, color: HCV[3 % HCV.length] },
        { beat: 64, color: HCV[0 % HCV.length] }, { beat: 128, color: HCV[7 % HCV.length] },
        { beat: 160, color: HCV[1 % HCV.length] }, { beat: 256, color: HCV[0 % HCV.length] },
        { beat: 320, color: HCV[4 % HCV.length] }, { beat: 384, color: HCV[6 % HCV.length] },
      ];
    }
    const PAD_MODES = [
      ['HOTCUE', 'HOT CUE', 'var(--co)'], ['LOOP', 'LOOP', 'var(--cloop)'],
      ['ROLL', 'ROLL', 'var(--croll)'], ['SLICER', 'SLICER', 'var(--cslice)'],
    ];
    const FX_LIST = ['Echo', 'Reverb', 'Filter', 'Flanger', 'Roll', 'Bitcrush'];
    const DIVS = ['1/4', '1/2', '1', '2', '4'];
    const fx = { name: 'Echo', div: 2, depth: 0.5, on: false, assign: 'MST' };
    let xfader = 50, masterBpm = 128;

    const teardown = { ros: [], raf: 0, win: [], unsub: null, running: false };
    function onWin(t, ty, fn, o) { t.addEventListener(ty, fn, o); teardown.win.push([t, ty, fn, o]); }

    /* ════════════════════════════════════════════════
       BUILDERS de HTML
    ════════════════════════════════════════════════ */
    function knob(id, label, val, color) {
      const a = -140 + val * 280;
      return `<div class="ctrl-knob" id="${id}" data-val="${val}">
        <svg width="42" height="42" viewBox="0 0 42 42" class="ctrl-knob-svg">
          <circle cx="21" cy="21" r="17" fill="var(--ce)" stroke="var(--cl)" stroke-width="1.5"/>
          ${Array.from({ length: 11 }, (_, i) => { const t = -140 + i * 28; const rad = t * Math.PI / 180;
            return `<line x1="${21 + 18 * Math.sin(rad)}" y1="${21 - 18 * Math.cos(rad)}" x2="${21 + 20 * Math.sin(rad)}" y2="${21 - 20 * Math.cos(rad)}" stroke="var(--cx)" stroke-width="1"/>`; }).join('')}
          <line class="ind" x1="21" y1="21" x2="21" y2="6" stroke="${color || 'var(--co)'}" stroke-width="2.4" stroke-linecap="round" transform="rotate(${a},21,21)"/>
          <circle cx="21" cy="21" r="3.5" fill="var(--cx)"/>
        </svg><span class="ctrl-knob-label">${label}</span></div>`;
    }
    function vuBar(id) {
      return `<div class="ctrl-vu" id="${id}">${Array.from({ length: 14 }, (_, i) =>
        `<i class="vu-seg ${i < 6 ? 'vu-ok' : i < 11 ? 'vu-mid' : 'vu-hot'}"></i>`).join('')}</div>`;
    }
    function padGrid(num) {
      return `<div class="ctrl-pads" id="pads${num}">${Array.from({ length: 8 }, (_, i) =>
        `<button class="perf-pad" data-deck="${num}" data-pad="${i}"><b>${i + 1}</b><span></span></button>`).join('')}</div>`;
    }
    function deckCol(num) {
      const d = D[num], label = num === 1 ? 'A' : 'B', side = num === 1 ? 'left' : 'right';
      const trans = `
        <div class="deck-transport">
          <button class="t-btn cue" id="cue${num}" title="CUE"><i class="ri-record-circle-line"></i>CUE</button>
          <button class="t-btn play" id="play${num}" title="PLAY/PAUSE"><i class="ri-play-fill" id="playI${num}"></i></button>
          <button class="t-btn sync" id="sync${num}" title="SYNC"><i class="ri-rhythm-line"></i>SYNC</button>
          <button class="t-btn master" id="mst${num}" title="MASTER">MST</button>
        </div>`;
      const tempo = `
        <div class="deck-tempo">
          <div class="tempo-head"><span>PITCH</span><b id="pitch${num}">+0.0%</b></div>
          <input type="range" class="tempo-fader" id="tempo${num}" min="-100" max="100" value="0" data-deck="${num}">
          <div class="tempo-foot">
            <button class="mini" id="keylock${num}" title="KEY LOCK"><i class="ri-key-2-line"></i>LOCK</button>
            <button class="mini" id="range${num}" title="RANGE">±<b id="rangeV${num}">8</b></button>
          </div>
        </div>`;
      const loop = `
        <div class="deck-loop">
          <span class="lbl">AUTO LOOP</span>
          <div class="loop-sizes">${[0.25, 0.5, 1, 2, 4, 8].map(b =>
            `<button class="loop-b" data-deck="${num}" data-bars="${b}">${b < 1 ? '1/' + (1 / b) : b}</button>`).join('')}</div>
          <div class="loop-act">
            <button class="loop-b io" id="loopin${num}">IN</button>
            <button class="loop-b io" id="loopout${num}">OUT</button>
            <button class="loop-b io" id="reloop${num}"><i class="ri-repeat-2-line"></i></button>
          </div>
        </div>`;
      const head = `
        <div class="deck-head" style="--da:${ACC[num]}">
          <span class="deck-tag">DECK ${label}</span>
          <div class="dh-main">
            <div class="dh-title" id="dt${num}-title">${d.title}</div>
            <div class="dh-artist" id="dt${num}-artist">${d.artist}</div>
          </div>
          <div class="dh-stats">
            <span class="st"><i>BPM</i><b id="dt${num}-bpm">${d.bpm.toFixed(1)}</b></span>
            <span class="st"><i>TOM</i><b id="dt${num}-key">${d.key}</b></span>
            <span class="st"><i>TEMPO</i><b id="dt${num}-time">0:00</b></span>
          </div>
        </div>`;
      const jog = `
        <div class="deck-jog-wrap">
          <svg class="deck-jog" id="jog${num}" viewBox="0 0 150 150" style="--da:${ACC[num]}">
            <circle cx="75" cy="75" r="71" fill="#0c0c0e" stroke="var(--cl)" stroke-width="2"/>
            <circle cx="75" cy="75" r="60" fill="#141416" stroke="#1c1c1e" stroke-width="1"/>
            <g id="jogspin${num}">
              ${Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; const on = i % 6 === 0;
                return `<line x1="${75 + 50 * Math.cos(a)}" y1="${75 + 50 * Math.sin(a)}" x2="${75 + 58 * Math.cos(a)}" y2="${75 + 58 * Math.sin(a)}" stroke="${on ? RAW_ACC[num] : '#2e2e30'}" stroke-width="${on ? 2 : 1}"/>`; }).join('')}
              <line x1="75" y1="22" x2="75" y2="40" stroke="${RAW_ACC[num]}" stroke-width="3" stroke-linecap="round"/>
            </g>
            <circle cx="75" cy="75" r="34" fill="#0a0a0c" stroke="#1a1a1c"/>
            <circle id="jogpos${num}" cx="75" cy="75" r="46" fill="none" stroke="${RAW_ACC[num]}" stroke-width="3"
              stroke-dasharray="289" stroke-dashoffset="289" transform="rotate(-90,75,75)" opacity=".9"/>
            <text x="75" y="80" text-anchor="middle" fill="${RAW_ACC[num]}" font-size="16" font-family="'Space Mono',monospace" font-weight="700">${label}</text>
          </svg>
        </div>`;
      const perf = `
        <div class="deck-perf">
          <div class="pad-modes" id="padmodes${num}">${PAD_MODES.map(m =>
            `<button class="pm ${m[0] === 'HOTCUE' ? 'on' : ''}" data-deck="${num}" data-mode="${m[0]}" style="--pc:${m[2]}">${m[1]}</button>`).join('')}</div>
          ${padGrid(num)}
        </div>`;
      // ordem espelhada: deck B começa pelo lado oposto
      const inner = num === 1
        ? head + jog + trans + tempo + loop + perf
        : head + jog + trans + tempo + loop + perf;
      return `<section class="ctrl-deck deck-${side}" id="deck${num}">${inner}</section>`;
    }
    function fxUnit() {
      return `
      <div class="fx-unit">
        <div class="fx-head"><span>BEAT FX</span>
          <select class="fx-sel" id="fxName">${FX_LIST.map(f => `<option ${f === fx.name ? 'selected' : ''}>${f}</option>`).join('')}</select>
        </div>
        <div class="fx-divs" id="fxDivs">${DIVS.map((dv, i) =>
          `<button class="fx-div ${i === fx.div ? 'on' : ''}" data-div="${i}">${dv}</button>`).join('')}</div>
        <div class="fx-body">
          ${knob('fxDepth', 'DEPTH', fx.depth, 'var(--co)')}
          <div class="fx-assign" id="fxAssign">
            ${['CH1', 'CH2', 'MST'].map(a => `<button class="fa ${a === fx.assign ? 'on' : ''}" data-a="${a}">${a}</button>`).join('')}
          </div>
        </div>
        <button class="fx-on" id="fxOn"><i class="ri-flashlight-line"></i> FX OFF</button>
      </div>`;
    }
    function chanStrip(num) {
      const label = num === 1 ? 'A' : 'B';
      return `
      <div class="chan" id="chan${num}" style="--da:${ACC[num]}">
        <span class="chan-lbl">CH ${label}</span>
        ${knob('trim' + num, 'TRIM', 0.6, ACC[num])}
        ${knob('hi' + num, 'HI', 0.5)}
        ${knob('mid' + num, 'MID', 0.5)}
        ${knob('low' + num, 'LOW', 0.5)}
        ${knob('flt' + num, 'FILTER', 0.5, 'var(--cloop)')}
        ${vuBar('vu' + num)}
        <button class="phones-btn ${num === 1 ? 'on' : ''}" id="ph${num}" title="CUE de fone"><i class="ri-headphone-line"></i></button>
        <div class="chan-fader-wrap"><input type="range" class="chan-fader" id="cf${num}" min="0" max="100" value="82" orient="vertical"></div>
      </div>`;
    }
    function masterCol() {
      return `
      <div class="master-col">
        <div class="master-bpm"><span>BPM MESTRE</span><b id="masterBpm">${masterBpm.toFixed(1)}</b></div>
        ${knob('masterVol', 'MASTER', 0.8, 'var(--co)')}
        ${knob('boothVol', 'BOOTH', 0.7)}
        <div class="phones-sect">
          <span class="lbl">PHONES</span>
          ${knob('phMix', 'MIX', 0.5)}
          ${knob('phLvl', 'LEVEL', 0.6)}
        </div>
        <button class="ctrl-btn settings" id="ctrl-settings-btn" title="MIDI + Áudio"><i class="ri-settings-3-line"></i></button>
      </div>`;
    }
    function crossfader() {
      return `
      <div class="xfader-row">
        <span class="xf-end" style="color:var(--cdA)">A</span>
        <input type="range" class="xfader" id="xfader" min="0" max="100" value="50">
        <span class="xf-end" style="color:var(--cdB)">B</span>
        <div class="xf-curve" id="xfCurve" title="Curva do crossfader"><i class="ri-line-chart-line"></i></div>
      </div>`;
    }
    function settingsPanel() {
      const rows = [['Crossfader', 'Ch1 CC7'], ['Jog A', 'Ch1 CC31'], ['Jog B', 'Ch2 CC31'], ['Pad A1', 'Ch1 CC36'], ['EQ Hi A', 'Ch1 CC23'], ['Beat FX', 'Ch1 CC40']];
      return `
      <div id="ctrl-settings-panel" class="settings-panel">
        <div class="sp-head"><span>Configurações</span><button class="ctrl-btn" id="ctrl-settings-close"><i class="ri-close-line"></i></button></div>
        <div class="sp-grid">
          <div><div class="sp-t">MIDI Mapping</div>${rows.map(([k, v]) =>
            `<div class="sp-row"><span>${k}</span><span class="mut">${v}</span></div>`).join('')}</div>
          <div><div class="sp-t">Saída de Áudio</div>
            <select class="sp-sel"><option>Pioneer DJM-A9</option><option>Saída Integrada</option><option>Denon X1850</option></select>
            <div class="sp-sl"><span>Headphone Mix</span><input type="range" min="0" max="100" value="50"></div>
            <div class="sp-sl"><span>Master Gain</span><input type="range" min="0" max="100" value="75"></div>
            <div class="sp-sl"><span>Latência</span><input type="range" min="0" max="100" value="20"></div>
          </div>
        </div>
      </div>`;
    }

    /* ── Render do shell ──────────────────────────── */
    injectCSS();
    mount.innerHTML = `
      <div class="ctrl-root reveal">
        <div class="ctrl-waves">
          <div class="cw-deck"><span class="cw-tag" style="color:var(--cdA)">A</span><canvas id="wave1"></canvas></div>
          <div class="cw-beatline"><div class="cw-ph"></div></div>
          <div class="cw-deck"><span class="cw-tag" style="color:var(--cdB)">B</span><canvas id="wave2"></canvas></div>
        </div>
        <div class="ctrl-board">
          ${deckCol(1)}
          <div class="ctrl-mixer">
            ${fxUnit()}
            <div class="mixer-strips">
              ${chanStrip(1)}
              ${masterCol()}
              ${chanStrip(2)}
            </div>
            ${crossfader()}
          </div>
          ${deckCol(2)}
        </div>
        ${settingsPanel()}
      </div>`;

    const root = mount.querySelector('.ctrl-root');
    const q = s => root.querySelector(s), qa = s => root.querySelectorAll(s);

    /* ── Waveform: desenho com scroll/beatgrid/cues/loop ──────── */
    const WC = { low: 'var(--cwave-low)', mid: 'var(--cwave-mid)', high: 'var(--cwave-high)' };
    function resolveVar(name, el) { return getComputedStyle(el).getPropertyValue(name).trim(); }
    function drawWave(num) {
      const cv = q('#wave' + num); if (!cv) return;
      const r = cv.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      cv.width = r.width * dpr; cv.height = r.height * dpr;
      const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = r.width, H = r.height, cy = H / 2;
      ctx.clearRect(0, 0, W, H);
      const d = D[num], wv = d.wave;
      const secScreen = BEATS_ON_SCREEN * 60 / d.bpm;
      const t0 = d.pos - secScreen / 2;
      const colAt = t => t * COLS_SEC;
      const cLow = resolveVar('--cwave-low', root) || 'rgba(0,85,226,.6)';
      const cMid = resolveVar('--cwave-mid', root) || 'rgba(242,170,60,.5)';
      const cHigh = resolveVar('--cwave-high', root) || 'rgba(255,255,255,.55)';
      // loop region
      if (d.loop.on) {
        const ls = d.loop.startBeat * 60 / d.bpm, le = ls + d.loop.bars * 4 * 60 / d.bpm;
        const x0 = (ls - t0) / secScreen * W, x1 = (le - t0) / secScreen * W;
        ctx.fillStyle = 'rgba(14,165,233,.14)'; ctx.fillRect(x0, 0, x1 - x0, H);
        ctx.strokeStyle = 'rgba(14,165,233,.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, H); ctx.moveTo(x1, 0); ctx.lineTo(x1, H); ctx.stroke();
      }
      // beatgrid
      const beatSec = 60 / d.bpm;
      const firstBeat = Math.floor(t0 / beatSec) - 1;
      for (let bi = firstBeat; ; bi++) {
        const t = bi * beatSec, x = (t - t0) / secScreen * W;
        if (x > W + 2) break; if (x < -2) continue;
        const isBar = ((bi % 4) + 4) % 4 === 0;
        ctx.fillStyle = isBar ? 'rgba(255,255,255,.30)' : 'rgba(255,255,255,.10)';
        ctx.fillRect(x | 0, 0, 1, isBar ? H : H * 0.4);
      }
      // bands
      const amp = cy * 0.92;
      for (let x = 0; x < W; x++) {
        const t = t0 + (x / W) * secScreen; const c = colAt(t);
        if (c < 0 || c >= wv.N) continue;
        const ci = c | 0;
        const lo = wv.low[ci], mi = wv.mid[ci], hi = wv.high[ci];
        ctx.fillStyle = cLow; ctx.fillRect(x, cy - lo * amp, 1, lo * amp * 2);
        ctx.fillStyle = cMid; ctx.fillRect(x, cy - mi * amp * 0.7, 1, mi * amp * 1.4);
        ctx.fillStyle = cHigh; ctx.fillRect(x, cy - hi * amp * 0.5, 1, hi * amp);
      }
      // hotcues
      d.hotcues.forEach((hc, i) => {
        const t = hc.beat * beatSec, x = (t - t0) / secScreen * W;
        if (x < -10 || x > W + 10) return;
        ctx.fillStyle = hc.color; ctx.fillRect(x - 1, 0, 2, H);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 12, 0); ctx.lineTo(x, 9); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = '700 8px "Space Mono"'; ctx.fillText(i + 1, x + 2, 7);
      });
      // playhead central
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    }
    function drawAllWaves() { drawWave(1); drawWave(2); }

    /* ── Loop de animação (jog/scroll/VU) ──────────── */
    let lastT = 0;
    function tick(now) {
      if (!teardown.running) return;
      const dt = lastT ? (now - lastT) / 1000 : 0; lastT = now;
      let anyPlaying = false;
      [1, 2].forEach(num => {
        const d = D[num];
        if (d.playing) {
          anyPlaying = true;
          if (!(d.loop.on)) d.pos += dt;
          else { // mantém dentro do loop
            d.pos += dt; const ls = d.loop.startBeat * 60 / d.bpm, le = ls + d.loop.bars * 4 * 60 / d.bpm;
            if (d.pos >= le) d.pos = ls;
          }
          if (d.pos >= d.dur) d.pos = 0;
          d.jog = (d.jog + dt * 280 * (1 + d.pitch / 100)) % 360;
          const g = q('#jogspin' + num); if (g) g.setAttribute('transform', `rotate(${d.jog},75,75)`);
          const ring = q('#jogpos' + num); if (ring) ring.setAttribute('stroke-dashoffset', 289 * (1 - (d.pos / d.dur)));
          const te = q('#dt' + num + '-time'); if (te) te.textContent = fmt(d.pos);
          // VU pelo nível atual
          const c = (d.pos * COLS_SEC) | 0; const lvl = Math.min(1, (d.wave.low[c] || 0) * 0.7 + (d.wave.mid[c] || 0) * 0.3 + 0.1);
          setVU(num, lvl * (q('#cf' + num) ? q('#cf' + num).value / 100 : 1));
        } else setVU(num, 0);
      });
      drawAllWaves();
      if (anyPlaying) teardown.raf = requestAnimationFrame(tick);
      else { teardown.running = false; teardown.raf = 0; }
    }
    function startLoop() { if (!teardown.running) { teardown.running = true; lastT = 0; teardown.raf = requestAnimationFrame(tick); } }
    function setVU(num, lvl) {
      const vu = q('#vu' + num); if (!vu) return;
      const segs = vu.children, n = segs.length, lit = Math.round(lvl * n);
      for (let i = 0; i < n; i++) segs[i].classList.toggle('on', i < lit);
    }

    /* ── Knobs (drag vertical) ─────────────────────── */
    let dragKnob = null, dragFader = null;
    qa('.ctrl-knob').forEach(k => {
      k.addEventListener('mousedown', e => { dragKnob = { el: k, y: e.clientY, v: parseFloat(k.dataset.val) }; e.preventDefault(); });
    });
    onWin(window, 'mousemove', e => {
      if (dragKnob) {
        let v = dragKnob.v + (dragKnob.y - e.clientY) * 0.006; v = Math.max(0, Math.min(1, v));
        dragKnob.el.dataset.val = v.toFixed(3);
        const ind = dragKnob.el.querySelector('.ind'); if (ind) ind.setAttribute('transform', `rotate(${-140 + v * 280},21,21)`);
      }
      if (dragFader) { /* faders usam range nativo; nada aqui */ }
    });
    onWin(window, 'mouseup', () => {
      if (dragKnob) { const id = dragKnob.el.id; if (id === 'fxDepth') fx.depth = parseFloat(dragKnob.el.dataset.val); dragKnob = null; }
    });

    /* ── Jog: drag p/ scratch/nudge ────────────────── */
    [1, 2].forEach(num => {
      const jog = q('#jog' + num); if (!jog) return;
      let active = null;
      jog.addEventListener('mousedown', e => { active = { x: e.clientX, pos: D[num].pos }; jog.classList.add('grab'); e.preventDefault(); startLoop(); });
      onWin(window, 'mousemove', e => { if (!active) return; const d = D[num];
        d.pos = Math.max(0, Math.min(d.dur, active.pos - (e.clientX - active.x) * 0.012));
        d.jog = (d.jog - (e.clientX - active.x) * 0.6); drawAllWaves();
        const g = q('#jogspin' + num); if (g) g.setAttribute('transform', `rotate(${d.jog},75,75)`); });
      onWin(window, 'mouseup', () => { if (active) { active = null; jog.classList.remove('grab'); } });
    });

    /* ── Waves: click p/ posicionar, wheel p/ nudge ──── */
    [1, 2].forEach(num => {
      const cv = q('#wave' + num); if (!cv) return;
      cv.addEventListener('click', e => { const d = D[num]; const r = cv.getBoundingClientRect();
        const secScreen = BEATS_ON_SCREEN * 60 / d.bpm; const t0 = d.pos - secScreen / 2;
        d.pos = Math.max(0, Math.min(d.dur, t0 + ((e.clientX - r.left) / r.width) * secScreen)); drawWave(num); startLoop(); });
    });

    /* ── Transport ─────────────────────────────────── */
    [1, 2].forEach(num => {
      const d = D[num];
      q('#play' + num).addEventListener('click', function () {
        d.playing = !d.playing; this.classList.toggle('on', d.playing);
        q('#playI' + num).className = d.playing ? 'ri-pause-fill' : 'ri-play-fill';
        toast(`Deck ${num === 1 ? 'A' : 'B'} — ${d.playing ? 'PLAY' : 'PAUSE'}`);
        if (d.playing) startLoop();
      });
      q('#cue' + num).addEventListener('click', () => { d.pos = d.cue; drawWave(num); toast(`Deck ${num === 1 ? 'A' : 'B'} — CUE`); startLoop(); });
      q('#sync' + num).addEventListener('click', function () {
        const other = D[num === 1 ? 2 : 1]; d.bpm = other.bpm; d.pitch = (d.bpm / d.baseBpm - 1) * 100;
        this.classList.add('on'); setTimeout(() => this.classList.remove('on'), 600);
        q('#dt' + num + '-bpm').textContent = d.bpm.toFixed(1); q('#pitch' + num).textContent = (d.pitch >= 0 ? '+' : '') + d.pitch.toFixed(1) + '%';
        const tf = q('#tempo' + num); if (tf) tf.value = Math.max(-100, Math.min(100, d.pitch / d.range * 100));
        toast(`Deck ${num === 1 ? 'A' : 'B'} — SYNC ${d.bpm.toFixed(1)} BPM`); drawWave(num);
      });
      q('#mst' + num).addEventListener('click', function () {
        qa('.t-btn.master').forEach(b => b.classList.remove('on')); this.classList.add('on');
        masterBpm = d.bpm; q('#masterBpm').textContent = masterBpm.toFixed(1); toast(`Master = Deck ${num === 1 ? 'A' : 'B'}`);
      });
    });

    /* ── Pitch fader + key lock + range ────────────── */
    [1, 2].forEach(num => {
      const d = D[num];
      q('#tempo' + num).addEventListener('input', function () {
        d.pitch = (this.value / 100) * d.range; d.bpm = d.baseBpm * (1 + d.pitch / 100);
        q('#pitch' + num).textContent = (d.pitch >= 0 ? '+' : '') + d.pitch.toFixed(1) + '%';
        q('#dt' + num + '-bpm').textContent = d.bpm.toFixed(1); drawWave(num);
      });
      q('#keylock' + num).addEventListener('click', function () { d.keyLock = !d.keyLock; this.classList.toggle('on', d.keyLock); toast(`Deck ${num === 1 ? 'A' : 'B'} — Key Lock ${d.keyLock ? 'ON' : 'OFF'}`); });
      if (d.keyLock) q('#keylock' + num).classList.add('on');
      q('#range' + num).addEventListener('click', function () { const seq = [6, 8, 10, 16]; d.range = seq[(seq.indexOf(d.range) + 1) % seq.length]; q('#rangeV' + num).textContent = d.range; });
    });

    /* ── Pad modes + performance pads ──────────────── */
    function paintPads(num) {
      const d = D[num], mode = PAD_MODES.find(m => m[0] === d.padMode);
      qa('#pads' + num + ' .perf-pad').forEach((p, i) => {
        const span = p.querySelector('span'); p.style.setProperty('--pc', mode[2]);
        if (d.padMode === 'HOTCUE') { span.textContent = ['INTRO', 'BUILD', 'DROP', 'BREAK', 'VOX', 'FILL', 'PEAK', 'OUT'][i]; p.style.setProperty('--pc', d.hotcues[i] ? d.hotcues[i].color : mode[2]); }
        else if (d.padMode === 'LOOP') span.textContent = [0.25, 0.5, 1, 2, 4, 8, 16, 32][i] + ' bar';
        else if (d.padMode === 'ROLL') span.textContent = '1/' + [16, 8, 4, 2, 1, 1, 1, 1][i];
        else span.textContent = 'SLICE ' + (i + 1);
      });
    }
    [1, 2].forEach(num => {
      paintPads(num);
      qa('#padmodes' + num + ' .pm').forEach(b => b.addEventListener('click', function () {
        D[num].padMode = this.dataset.mode; qa('#padmodes' + num + ' .pm').forEach(x => x.classList.remove('on')); this.classList.add('on'); paintPads(num);
      }));
      qa('#pads' + num + ' .perf-pad').forEach(pad => pad.addEventListener('click', function () {
        const d = D[num], i = +this.dataset.pad;
        if (d.padMode === 'HOTCUE' && d.hotcues[i]) { d.pos = d.hotcues[i].beat * 60 / d.bpm; drawWave(num); toast(`Deck ${num === 1 ? 'A' : 'B'} — Hot Cue ${i + 1}`); startLoop(); }
        else if (d.padMode === 'LOOP') { const bars = [0.25, 0.5, 1, 2, 4, 8, 16, 32][i]; d.loop = { on: true, startBeat: Math.round(d.pos / (60 / d.bpm)), bars }; toast(`Deck ${num === 1 ? 'A' : 'B'} — Loop ${bars} bar`); drawWave(num); }
        else toast(`Deck ${num === 1 ? 'A' : 'B'} — ${d.padMode} ${i + 1}`);
        this.classList.add('hit'); setTimeout(() => this.classList.remove('hit'), 140);
      }));
    });

    /* ── Auto loop / in-out / reloop ───────────────── */
    [1, 2].forEach(num => {
      qa('.loop-b[data-deck="' + num + '"][data-bars]').forEach(b => b.addEventListener('click', function () {
        const d = D[num], bars = parseFloat(this.dataset.bars);
        d.loop = { on: true, startBeat: Math.round(d.pos / (60 / d.bpm)), bars };
        qa('.loop-b[data-deck="' + num + '"][data-bars]').forEach(x => x.classList.remove('on')); this.classList.add('on');
        toast(`Deck ${num === 1 ? 'A' : 'B'} — Loop ${bars < 1 ? '1/' + (1 / bars) : bars} bar`); drawWave(num);
      }));
      q('#loopin' + num).addEventListener('click', () => { D[num].loop.startBeat = Math.round(D[num].pos / (60 / D[num].bpm)); D[num].loop.on = true; q('#loopin' + num).classList.add('on'); drawWave(num); });
      q('#loopout' + num).addEventListener('click', () => { const d = D[num]; const cur = Math.round(d.pos / (60 / d.bpm)); d.loop.bars = Math.max(0.25, (cur - d.loop.startBeat) / 4); d.loop.on = true; q('#loopout' + num).classList.add('on'); drawWave(num); });
      q('#reloop' + num).addEventListener('click', function () { const d = D[num]; d.loop.on = !d.loop.on; this.classList.toggle('on', d.loop.on); if (d.loop.on) d.pos = d.loop.startBeat * 60 / d.bpm; toast(`Deck ${num === 1 ? 'A' : 'B'} — ${d.loop.on ? 'Reloop' : 'Loop exit'}`); drawWave(num); });
    });

    /* ── Mixer: faders / xfader / phones ───────────── */
    qa('.chan-fader').forEach(f => f.addEventListener('input', () => { /* nível refletido no VU via tick */ }));
    q('#xfader').addEventListener('input', function () { xfader = +this.value; });
    q('#xfCurve').addEventListener('click', function () { this.classList.toggle('sharp'); toast('Curva do crossfader: ' + (this.classList.contains('sharp') ? 'sharp' : 'smooth')); });
    [1, 2].forEach(num => q('#ph' + num).addEventListener('click', function () { D[num].phones = !D[num].phones; this.classList.toggle('on', D[num].phones); }));

    /* ── Beat FX ───────────────────────────────────── */
    q('#fxName').addEventListener('change', function () { fx.name = this.value; q('#fxOn').classList.contains('on') && toast('FX: ' + fx.name); });
    qa('#fxDivs .fx-div').forEach(b => b.addEventListener('click', function () { fx.div = +this.dataset.div; qa('#fxDivs .fx-div').forEach(x => x.classList.remove('on')); this.classList.add('on'); }));
    qa('#fxAssign .fa').forEach(b => b.addEventListener('click', function () { fx.assign = this.dataset.a; qa('#fxAssign .fa').forEach(x => x.classList.remove('on')); this.classList.add('on'); }));
    q('#fxOn').addEventListener('click', function () { fx.on = !fx.on; this.classList.toggle('on', fx.on); this.innerHTML = `<i class="ri-flashlight-line"></i> FX ${fx.on ? 'ON' : 'OFF'}`; toast(`Beat FX ${fx.name} ${fx.on ? 'ON' : 'OFF'} · ${DIVS[fx.div]} · ${fx.assign}`); });

    /* ── Settings panel ────────────────────────────── */
    const sBtn = q('#ctrl-settings-btn'), panel = q('#ctrl-settings-panel'), sClose = q('#ctrl-settings-close');
    let settingsOpen = false;
    if (sBtn && panel) sBtn.addEventListener('click', () => { settingsOpen = !settingsOpen; panel.classList.toggle('open', settingsOpen); });
    if (sClose && panel) sClose.addEventListener('click', () => { settingsOpen = false; panel.classList.remove('open'); });

    /* ── ApolloState: faixa carregada no deck ──────── */
    if (window.ApolloState && typeof ApolloState.subscribe === 'function') {
      const onLoaded = ({ deck, track, analysis }) => {
        const d = D[deck]; if (!d) return;
        if (track) { d.title = track.title || track.t || d.title; d.artist = track.artist || d.artist; if (track.key) d.key = track.key;
          q('#dt' + deck + '-title').textContent = d.title; q('#dt' + deck + '-artist').textContent = d.artist; if (track.key) q('#dt' + deck + '-key').textContent = track.key;
          d.trackIdx = (track.idx != null ? track.idx : d.trackIdx);
          const wv = deckWaveFromSim(d.trackIdx); if (wv) d.wave = wv;
          // hotcues do AnalysisStore
          if (window.AnalysisStore && d.trackIdx != null) { const an = AnalysisStore.get(d.trackIdx);
            if (an && an.hotcues && an.hotcues.length) d.hotcues = an.hotcues.slice(0, 8).map((c, i) => ({ beat: (c.time || 0) * (d.bpm / 60), color: c.color || HCV[i % HCV.length] })); }
          paintPads(deck);
        }
        if (analysis && analysis.bpm) { d.baseBpm = analysis.bpm; d.bpm = analysis.bpm * (1 + d.pitch / 100); q('#dt' + deck + '-bpm').textContent = d.bpm.toFixed(1); }
        drawWave(deck); toast(`Deck ${deck === 1 ? 'A' : 'B'}: ${d.artist} – ${d.title}`);
      };
      try { teardown.unsub = ApolloState.subscribe('deck:loaded', onLoaded); } catch (e) { /* noop */ }
    }

    /* ── Boot: desenha após layout + ResizeObserver ── */
    setTimeout(() => {
      drawAllWaves();
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => drawAllWaves());
        qa('.cw-deck').forEach(el => ro.observe(el)); teardown.ros.push(ro);
      }
    }, 40);

    ApolloPages.controladora._teardown = teardown;
  };

  /* ── cleanup chamado pelo router ao trocar de página ─ */
  ApolloPages.controladora.cleanup = function () {
    const td = this._teardown; if (!td) return;
    td.running = false;
    if (td.raf) cancelAnimationFrame(td.raf);
    try { td.ros.forEach(r => r.disconnect()); } catch (e) {}
    try { td.win.forEach(([t, ty, fn, o]) => t.removeEventListener(ty, fn, o)); } catch (e) {}
    if (typeof td.unsub === 'function') { try { td.unsub(); } catch (e) {} }
    this._teardown = null;
  };

  /* ════════════════════════════════════════════════
     CSS — injetado uma vez · tokens dark em .ctrl-root
     (mesma convenção/ids do controladora.js base)
  ════════════════════════════════════════════════ */
  function injectCSS() {
    if (document.getElementById('ctrl-css')) return;
    const s = document.createElement('style');
    s.id = 'ctrl-css';
    s.textContent = `
    .ctrl-root{
      --cd:#000; --cs:#0a0b0d; --cb:#111316; --ce:#15171b; --cl:#23262c; --cl2:#2e323a;
      --cc:#e7e9ec; --cm:#8b929b; --cf:#5b626b; --cx:#3a3f47;
      --co: var(--ac, var(--primary, #E8820C)); --co2:#ffa238;
      --co-a15: color-mix(in srgb, var(--co) 15%, transparent);
      --co-a28: color-mix(in srgb, var(--co) 28%, transparent);
      --co-a40: color-mix(in srgb, var(--co) 40%, transparent);
      --cloop:#0ea5e9; --croll:#a06bff; --cslice:#f43f5e;
      --cwave-low: rgba(26,111,255,.85); --cwave-mid: rgba(242,170,60,.8); --cwave-high: rgba(255,255,255,.55);
      --cdA: var(--co); --cdB:#0ea5e9;
      --rr:12px; --rr-sm:8px; --rr-xs:5px; --pill:999px;
      --disp:'Space Grotesk',system-ui,sans-serif; --mono:'Space Mono',ui-monospace,monospace;
      --t:.18s cubic-bezier(.16,1,.3,1);
      position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;
      background:radial-gradient(120% 90% at 50% -10%,#0a0b0e,#000 60%);
      color:var(--cc);font-family:var(--disp);font-size:13px;overflow:hidden;padding:8px;
      user-select:none;-webkit-font-smoothing:antialiased;
    }
    .ctrl-root *{box-sizing:border-box;margin:0;padding:0}
    .ctrl-root button{font-family:inherit;color:inherit;cursor:pointer;border:0;background:none}
    .ctrl-root i[class^="ri-"],.ctrl-root i[class*=" ri-"]{font-style:normal;line-height:1}
    .ctrl-root .mut{color:var(--cf)}

    /* ── WAVES ── */
    .ctrl-root .ctrl-waves{flex:0 0 auto;display:flex;flex-direction:column;gap:2px;background:#040506;border:1px solid var(--cl);border-radius:var(--rr);padding:6px;position:relative}
    .ctrl-root .cw-deck{position:relative;height:62px;background:#070809;border-radius:var(--rr-sm);overflow:hidden}
    .ctrl-root .cw-deck canvas{position:absolute;inset:0;width:100%;height:100%;cursor:pointer}
    .ctrl-root .cw-tag{position:absolute;top:4px;left:7px;font-family:var(--mono);font-weight:700;font-size:11px;z-index:2;opacity:.8}
    .ctrl-root .cw-beatline{height:3px;position:relative}
    .ctrl-root .cw-ph{position:absolute;left:50%;top:-64px;height:130px;width:2px;background:linear-gradient(180deg,#fff8,#fff,#fff8);transform:translateX(-50%);box-shadow:0 0 8px #fff7}

    /* ── BOARD ── */
    .ctrl-root .ctrl-board{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 256px minmax(0,1fr);gap:8px}
    .ctrl-root .ctrl-deck{background:linear-gradient(180deg,#0a0b0e,#08090b);border:1px solid var(--cl);border-radius:var(--rr);padding:11px;display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto}

    .ctrl-root .deck-head{display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--cl);padding-bottom:9px}
    .ctrl-root .deck-tag{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:1px;color:#000;background:var(--da);padding:3px 8px;border-radius:var(--rr-xs)}
    .ctrl-root .dh-main{flex:1;min-width:0}
    .ctrl-root .dh-title{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ctrl-root .dh-artist{font-size:11px;color:var(--cm)}
    .ctrl-root .dh-stats{display:flex;gap:12px}
    .ctrl-root .dh-stats .st{display:flex;flex-direction:column;align-items:flex-end}
    .ctrl-root .dh-stats .st i{font-style:normal;font-size:8px;letter-spacing:1px;color:var(--cf)}
    .ctrl-root .dh-stats .st b{font-family:var(--mono);font-size:15px;color:var(--da)}

    .ctrl-root .deck-jog-wrap{display:flex;justify-content:center}
    .ctrl-root .deck-jog{width:150px;height:150px;cursor:grab}
    .ctrl-root .deck-jog.grab{cursor:grabbing}

    .ctrl-root .deck-transport{display:grid;grid-template-columns:1fr 1.3fr 1fr .7fr;gap:6px}
    .ctrl-root .t-btn{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;height:42px;border-radius:var(--rr-sm);background:linear-gradient(180deg,#16181d,#0d0f13);border:1px solid var(--cl2);color:var(--cm);font-size:9px;font-weight:700;letter-spacing:.5px;transition:var(--t);box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}
    .ctrl-root .t-btn i{font-size:16px}
    .ctrl-root .t-btn:hover{color:var(--cc);border-color:var(--cl2)}
    .ctrl-root .t-btn.play.on{background:linear-gradient(180deg,#27d07a,#16a059);color:#012;border-color:#3ee894}
    .ctrl-root .t-btn.cue{color:var(--co2)}
    .ctrl-root .t-btn.sync.on{background:var(--co-a28);color:var(--co2);border-color:var(--co-a40)}
    .ctrl-root .t-btn.master.on{background:#ff2a2a22;color:#ff6a6a;border-color:#ff2a2a55}

    .ctrl-root .deck-tempo{display:flex;flex-direction:column;gap:5px}
    .ctrl-root .tempo-head{display:flex;justify-content:space-between;font-size:9px;letter-spacing:1px;color:var(--cf)}
    .ctrl-root .tempo-head b{font-family:var(--mono);color:var(--co2)}
    .ctrl-root .tempo-fader{width:100%;accent-color:var(--da);cursor:pointer}
    .ctrl-root .tempo-foot{display:flex;gap:6px}
    .ctrl-root .mini{flex:1;display:flex;align-items:center;justify-content:center;gap:4px;height:24px;border-radius:var(--rr-xs);background:#0c0e12;border:1px solid var(--cl2);color:var(--cf);font-size:9px;font-weight:700;letter-spacing:.5px;transition:var(--t)}
    .ctrl-root .mini i{font-size:12px}
    .ctrl-root .mini.on{color:var(--co2);border-color:var(--co-a40);background:var(--co-a15)}

    .ctrl-root .deck-loop{display:flex;flex-direction:column;gap:5px}
    .ctrl-root .deck-loop .lbl,.ctrl-root .fx-head span,.ctrl-root .chan-lbl,.ctrl-root .phones-sect .lbl,.ctrl-root .master-bpm span{font-size:8px;letter-spacing:1.4px;color:var(--cf);font-weight:700}
    .ctrl-root .loop-sizes,.ctrl-root .loop-act{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}
    .ctrl-root .loop-act{grid-template-columns:1fr 1fr 1fr}
    .ctrl-root .loop-b{height:26px;border-radius:var(--rr-xs);background:#0c0e12;border:1px solid var(--cl2);color:var(--cf);font-size:10px;font-family:var(--mono);transition:var(--t)}
    .ctrl-root .loop-b:hover{color:var(--cloop);border-color:#0ea5e955}
    .ctrl-root .loop-b.on{color:var(--cloop);border-color:#0ea5e9;background:#0ea5e918}
    .ctrl-root .loop-b.io{font-weight:700}

    .ctrl-root .deck-perf{display:flex;flex-direction:column;gap:6px}
    .ctrl-root .pad-modes{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
    .ctrl-root .pm{height:24px;border-radius:var(--rr-xs);background:#0c0e12;border:1px solid var(--cl2);color:var(--cf);font-size:9px;font-weight:700;letter-spacing:.4px;transition:var(--t)}
    .ctrl-root .pm.on{color:#000;background:var(--pc);border-color:var(--pc)}
    .ctrl-root .ctrl-pads{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
    .ctrl-root .perf-pad{position:relative;height:46px;border-radius:var(--rr-sm);background:linear-gradient(180deg,#14161b,#0c0e12);border:1px solid var(--cl2);display:flex;flex-direction:column;align-items:flex-start;justify-content:space-between;padding:5px 7px;transition:var(--t);overflow:hidden}
    .ctrl-root .perf-pad b{font-family:var(--mono);font-size:9px;color:var(--cf)}
    .ctrl-root .perf-pad span{font-size:10px;font-weight:600;color:var(--cc)}
    .ctrl-root .perf-pad::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--pc,#444);opacity:.9}
    .ctrl-root .perf-pad:hover{border-color:var(--cl2);filter:brightness(1.15)}
    .ctrl-root .perf-pad.hit{transform:scale(.94);filter:brightness(1.6)}

    /* ── MIXER ── */
    .ctrl-root .ctrl-mixer{background:linear-gradient(180deg,#0c0d10,#08090b);border:1px solid var(--cl);border-radius:var(--rr);padding:10px;display:flex;flex-direction:column;gap:10px;min-height:0;overflow:auto}
    .ctrl-root .fx-unit{display:flex;flex-direction:column;gap:7px;border-bottom:1px solid var(--cl);padding-bottom:10px}
    .ctrl-root .fx-head{display:flex;align-items:center;justify-content:space-between}
    .ctrl-root .fx-sel,.ctrl-root .sp-sel{background:#0c0e12;border:1px solid var(--cl2);border-radius:var(--rr-xs);color:var(--cc);font-size:11px;font-family:var(--mono);padding:4px 6px}
    .ctrl-root .fx-divs{display:grid;grid-template-columns:repeat(5,1fr);gap:3px}
    .ctrl-root .fx-div{height:22px;border-radius:var(--rr-xs);background:#0c0e12;border:1px solid var(--cl2);color:var(--cf);font-size:9px;font-family:var(--mono);transition:var(--t)}
    .ctrl-root .fx-div.on{color:var(--co2);border-color:var(--co-a40);background:var(--co-a15)}
    .ctrl-root .fx-body{display:flex;align-items:center;justify-content:space-around;gap:6px}
    .ctrl-root .fx-assign{display:flex;flex-direction:column;gap:3px}
    .ctrl-root .fa{height:18px;padding:0 8px;border-radius:var(--rr-xs);background:#0c0e12;border:1px solid var(--cl2);color:var(--cf);font-size:9px;font-family:var(--mono);transition:var(--t)}
    .ctrl-root .fa.on{color:var(--co2);border-color:var(--co-a40)}
    .ctrl-root .fx-on{height:30px;border-radius:var(--rr-sm);background:#0c0e12;border:1px solid var(--cl2);color:var(--cf);font-size:10px;font-weight:700;letter-spacing:.5px;display:flex;align-items:center;justify-content:center;gap:6px;transition:var(--t)}
    .ctrl-root .fx-on i{font-size:14px}
    .ctrl-root .fx-on.on{background:linear-gradient(180deg,var(--co2),var(--co));color:#1a0d00;border-color:#ffb55a}

    .ctrl-root .mixer-strips{flex:1;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;min-height:0}
    .ctrl-root .chan,.ctrl-root .master-col{display:flex;flex-direction:column;align-items:center;gap:7px}
    .ctrl-root .chan{border-left:1px solid transparent;border-right:1px solid transparent}
    .ctrl-root .chan-lbl{color:var(--da)!important}
    .ctrl-root .ctrl-knob{display:flex;flex-direction:column;align-items:center;cursor:grab}
    .ctrl-root .ctrl-knob:active{cursor:grabbing}
    .ctrl-root .ctrl-knob-svg{display:block}
    .ctrl-root .ctrl-knob-label{font-size:8px;color:var(--cf);font-family:var(--mono);letter-spacing:.5px;margin-top:1px}
    .ctrl-root .ctrl-vu{display:flex;flex-direction:column-reverse;gap:2px;height:56px;width:14px;align-items:center;background:#070809;border-radius:3px;padding:3px;border:1px solid var(--cl)}
    .ctrl-root .vu-seg{width:8px;height:3px;border-radius:1px;background:#1b1d22;transition:background .05s}
    .ctrl-root .vu-seg.vu-ok.on{background:#22c55e}.ctrl-root .vu-seg.vu-mid.on{background:#f59e0b}.ctrl-root .vu-seg.vu-hot.on{background:#ef4444}
    .ctrl-root .phones-btn{width:30px;height:26px;border-radius:var(--rr-xs);background:#0c0e12;border:1px solid var(--cl2);color:var(--cf);transition:var(--t)}
    .ctrl-root .phones-btn i{font-size:14px}
    .ctrl-root .phones-btn.on{color:var(--co2);border-color:var(--co-a40);background:var(--co-a15)}
    .ctrl-root .chan-fader-wrap{flex:1;display:flex;justify-content:center;align-items:stretch;min-height:80px}
    .ctrl-root .chan-fader{-webkit-appearance:slider-vertical;appearance:auto;writing-mode:vertical-lr;direction:rtl;width:30px;accent-color:var(--da);cursor:pointer}

    .ctrl-root .master-col{justify-content:flex-start}
    .ctrl-root .master-bpm{display:flex;flex-direction:column;align-items:center;background:#070809;border:1px solid var(--cl);border-radius:var(--rr-sm);padding:6px 10px;width:100%}
    .ctrl-root .master-bpm b{font-family:var(--mono);font-size:22px;font-weight:700;color:var(--co2)}
    .ctrl-root .phones-sect{display:flex;flex-direction:column;align-items:center;gap:5px;border-top:1px solid var(--cl);padding-top:8px;width:100%}
    .ctrl-root .ctrl-btn{background:var(--cb);border:1px solid var(--cl2);border-radius:var(--rr-sm);color:var(--cm);padding:7px 10px;font-size:14px;transition:var(--t)}
    .ctrl-root .ctrl-btn:hover{color:var(--co2);border-color:var(--co-a40)}
    .ctrl-root .ctrl-btn.settings{width:100%;margin-top:auto}

    .ctrl-root .xfader-row{display:flex;align-items:center;gap:10px;border-top:1px solid var(--cl);padding-top:10px}
    .ctrl-root .xf-end{font-family:var(--mono);font-weight:700;font-size:13px}
    .ctrl-root .xfader{flex:1;accent-color:var(--cc);cursor:pointer}
    .ctrl-root .xf-curve{width:28px;height:24px;display:grid;place-items:center;border-radius:var(--rr-xs);background:#0c0e12;border:1px solid var(--cl2);color:var(--cf);cursor:pointer}
    .ctrl-root .xf-curve.sharp{color:var(--co2);border-color:var(--co-a40)}

    /* ── SETTINGS PANEL ── */
    .ctrl-root .settings-panel{display:none;position:absolute;left:8px;right:8px;bottom:8px;z-index:20;background:#0c0d10;border:1px solid var(--cl);border-radius:var(--rr);padding:14px;box-shadow:0 -16px 40px -16px #000}
    .ctrl-root .settings-panel.open{display:block}
    .ctrl-root .sp-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    .ctrl-root .sp-head span{font-size:11px;font-family:var(--mono);color:var(--cm);letter-spacing:1px;text-transform:uppercase}
    .ctrl-root .sp-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    .ctrl-root .sp-t{font-size:9px;font-family:var(--mono);color:var(--cf);letter-spacing:1px;text-transform:uppercase;margin-bottom:7px}
    .ctrl-root .sp-row{display:flex;justify-content:space-between;font-size:10px;font-family:var(--mono);color:var(--cm);padding:4px 0;border-bottom:1px solid var(--ce)}
    .ctrl-root .sp-sel{width:100%}
    .ctrl-root .sp-sl{margin-top:8px;font-size:9px;color:var(--cf);font-family:var(--mono)}
    .ctrl-root .sp-sl span{display:block;margin-bottom:3px}
    .ctrl-root .sp-sl input{width:100%;accent-color:var(--co)}

    @media (max-width:1100px){.ctrl-root .ctrl-board{grid-template-columns:1fr}.ctrl-root .ctrl-mixer{order:3}}
    `;
    document.head.appendChild(s);
  }
})();