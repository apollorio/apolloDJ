/* ════════════════════════════════════════════════════════════
   autohotcue.js — PAGE: Ferramentas / autoHotCUE
   Batch hot cue analysis: track selector aside + waveform canvas
   with 8 colored HC_COLORS triangles + interactive cue editing +
   DataTable for all 35 tracks.
   Uses: window.SIM_HOTCUES, window.HC_COLORS, window.SIM_WAVEDATA
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.autoHotCue = function (mount) {
    let activeTrackIdx = 0;
    let activePhrase   = 16;
    const cues         = [];   /* live cue array for active track */

    /* ── Helpers ──────────────────────────────────── */
    function parseDur(t) {
      const p = t.split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }
    function secPerBar(bpm) { return 240 / parseFloat(bpm); }

    /* ── Load cues from SIM_HOTCUES ──────────────── */
    function loadCues(idx) {
      cues.length = 0;
      const src = (window.SIM_HOTCUES || [])[idx] || [];
      src.forEach(c => cues.push({ label: c.label, type: c.type, time: c.time, color: c.color }));
    }

    /* ── Build aside track list ───────────────────── */
    function trackListHTML() {
      return (window.T || []).map((tr, i) =>
        `<div class="tree-node ${i === activeTrackIdx ? 'selected' : ''}" data-tidx="${i}">
           <i class="ri-music-2-line ti" style="font-size:11px;opacity:.5;"></i>
           <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tr.title}</span>
         </div>`
      ).join('');
    }

    /* ── Canvas draw ─────────────────────────────── */
    function drawCanvas() {
      const canvas = mount.querySelector('#hc-canvas');
      if (!canvas) return;
      const W = canvas.offsetWidth, H = canvas.offsetHeight || 200;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const tr  = (window.T || [])[activeTrackIdx];
      const dur = tr ? parseDur(tr.t) : 300;

      /* Dark background */
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      /* 3-band spectral bars from SIM_WAVEDATA */
      const wd = (window.SIM_WAVEDATA || [])[activeTrackIdx] || { low:[], mid:[], high:[] };
      const N  = wd.low.length || 1;
      const bw = W / N;

      for (let i = 0; i < N; i++) {
        const x = i * bw;
        const lo = (wd.low[i]  || 0);
        const mi = (wd.mid[i]  || 0);
        const hi = (wd.high[i] || 0);
        /* Low (bass) — blue, from center out */
        const lh = lo * H * 0.55;
        ctx.fillStyle = 'rgba(0,85,226,0.80)';
        ctx.fillRect(x, (H - lh) / 2, Math.max(bw - 1, 1), lh);
        /* Mid — amber, narrower */
        const mh = mi * H * 0.35;
        ctx.fillStyle = 'rgba(242,170,60,0.70)';
        ctx.fillRect(x, (H - mh) / 2, Math.max(bw - 1, 1), mh);
        /* High — white, thin */
        const hh = hi * H * 0.18;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillRect(x, (H - hh) / 2, Math.max(bw - 1, 1), hh);
      }

      /* Beat grid ticks */
      if (tr) {
        const spb = secPerBar(tr.bpm);
        const totalBars = Math.ceil(dur / spb);
        ctx.save();
        for (let b = 0; b < totalBars; b++) {
          const x = (b / totalBars) * W;
          const isPhr = b % 64 === 0;
          const isDb  = b % 4  === 0;
          ctx.strokeStyle = isPhr ? 'rgba(255,255,255,0.35)' : isDb ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
          ctx.lineWidth   = isPhr ? 1.5 : 0.5;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        }
        ctx.restore();
      }

      /* Hotcue triangles */
      cues.forEach(c => {
        const x = (c.time / dur) * W;
        ctx.save();
        ctx.fillStyle   = c.color;
        ctx.strokeStyle = c.color;
        /* Vertical line full height */
        ctx.globalAlpha = 0.7;
        ctx.lineWidth   = 1.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
        /* Downward triangle at top */
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(x - 7, 0); ctx.lineTo(x + 7, 0); ctx.lineTo(x, 13); ctx.closePath();
        ctx.fill();
        /* Label */
        ctx.fillStyle = '#000';
        ctx.font      = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(c.label, x, 10);
        ctx.restore();
      });

      /* Refresh cue legend chips below canvas */
      const legend = mount.querySelector('#hc-legend');
      if (legend) {
        legend.innerHTML = cues.map(c =>
          `<div class="hc-cue-chip" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:99px;background:${c.color}20;border:1px solid ${c.color}50;margin:2px;cursor:pointer;" data-cue="${c.label}" data-cue-time="${c.time}">
             <span style="width:8px;height:8px;border-radius:50%;background:${c.color};display:inline-block;"></span>
             <span style="font-size:10px;font-family:monospace;color:${c.color};font-weight:700">${c.label}</span>
             <span style="font-size:9px;color:var(--gray-1)">${c.type}</span>
             <span style="font-size:9px;font-family:monospace;color:var(--white-18)">${c.time.toFixed(1)}s</span>
           </div>`
        ).join('');
      }
    }

    /* ── Main render ─────────────────────────────── */
    function render() {
      loadCues(activeTrackIdx);
      const tr = (window.T || [])[activeTrackIdx];

      mount.innerHTML = `
        <div class="pane reveal">
          <aside class="aside">
            <div class="aside-head"><div class="aside-title">autoHotCUE</div></div>
            <div class="aside-scroll">
              <div class="sec-label first"><span>Faixa ativa</span></div>
              ${trackListHTML()}
              <div class="sec-label"><span>Frase</span></div>
              <div class="btn-row" style="padding:4px 12px 8px;display:flex;gap:8px;flex-wrap:wrap;">
                <button type="button" class="btn-secondary btn-sm${activePhrase === 16 ? ' is-active' : ''}" id="hc-phrase16" data-phrase="16">16 bars</button>
                <button type="button" class="btn-secondary btn-sm${activePhrase === 32 ? ' is-active' : ''}" id="hc-phrase32" data-phrase="32">32 bars</button>
              </div>
              <div class="sec-label"><span>Precisão BPM</span><span class="sec-hint">confiança</span></div>
              <div class="tree-node selected">
                <i class="ri-cpu-line ti"></i><span>APO [BTS]</span>
                <span class="tag tag-ok" style="margin-left:auto;font-size:9px" title="Precisão estimada">97%</span>
              </div>
              <div class="tree-node">
                <i class="ri-cpu-line ti"></i><span>APO [BNT]</span>
                <span class="tag tag-mute" style="margin-left:auto;font-size:9px" title="Precisão estimada">94%</span>
              </div>
              <div class="sec-label"><span>Ações</span></div>
              <div class="tree-node" id="hc-analyze-all" style="cursor:pointer">
                <i class="ri-play-circle-line ti" style="color:var(--primary)"></i>
                <span style="color:var(--primary);font-weight:600">Analisar tudo</span>
              </div>
            </div>
          </aside>
          <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
            <div class="content-hdr">
              <span class="ch-label">${tr ? tr.title.toUpperCase() : 'HOT CUES AUTOMÁTICOS'}</span>
              <span class="ch-count" id="hc-count">${cues.length} hot cues</span>
            </div>
            <div class="hc-wave-panel" style="padding:0 12px 6px;flex-shrink:0;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 0 4px;">
                <span style="font-size:10px;color:var(--tx2);font-family:var(--ff-mono);letter-spacing:.08em;">WAVEFORM · clique para posicionar cue · clique no chip para apagar</span>
                <button type="button" class="btn-secondary btn-sm" id="hc-add-btn" title="Adicionar hot cue"><i class="ri-add-line"></i></button>
              </div>
              <canvas id="hc-canvas" style="width:100%;height:min(42vh,280px);min-height:240px;border-radius:var(--r);display:block;cursor:crosshair;"></canvas>
              <div id="hc-legend" style="display:flex;flex-wrap:wrap;padding:6px 0 0;gap:2px;"></div>
            </div>
            <!-- DataTable -->
            <div id="hotcue-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>
          </section>
        </div>`;

      /* ── Track selector ──────────────────────── */
      mount.querySelectorAll('.tree-node[data-tidx]').forEach(n => {
        n.addEventListener('click', () => {
          activeTrackIdx = parseInt(n.dataset.tidx, 10);
          render();
        });
      });

      /* ── Phrase toggle ───────────────────────── */
      ['16','32'].forEach(p => {
        const btn = mount.querySelector(`#hc-phrase${p}`);
        if (btn) btn.addEventListener('click', () => { activePhrase = parseInt(p, 10); render(); });
      });

      /* ── Analyze all ─────────────────────────── */
      const analyzeBtn = mount.querySelector('#hc-analyze-all');
      if (analyzeBtn) {
        analyzeBtn.addEventListener('click', () => {
          const rows = DataTable.instances.hotcue && DataTable.instances.hotcue.rows;
          if (!rows) return;
          rows.forEach(r => { r.st = `<span class="tag tag-warn mono" style="font-size:9px">…</span>`; });
          DataTable.render('hotcue');
          setTimeout(() => {
            rows.forEach(r => { r.st = `<span class="tag tag-ok">OK</span>`; });
            DataTable.render('hotcue');
          }, 1200);
        });
      }

      /* ── Canvas click → add cue ─────────────── */
      setTimeout(() => {
        const canvas = mount.querySelector('#hc-canvas');
        if (!canvas) return;
        drawCanvas();

        function addCueAtFraction(frac, noteType) {
          const tr = (window.T || [])[activeTrackIdx];
          if (!tr) return;
          const dur  = parseDur(tr.t);
          const time = parseFloat((frac * dur).toFixed(2));
          const used   = new Set(cues.map(c => c.label));
          const LABELS = ['A','B','C','D','E','F','G','H'];
          const newLbl = LABELS.find(l => !used.has(l));
          if (!newLbl) return;
          const HC = window.HC_COLORS || {};
          const type = noteType || 'CUE';
          cues.push({ label: newLbl, type, time, color: HC[newLbl] || '#FF2D37' });
          cues.sort((a, b) => a.time - b.time);
          drawCanvas();
          const cnt = mount.querySelector('#hc-count');
          if (cnt) cnt.textContent = cues.length + ' hot cues';
        }

        function deleteCueAtFraction(frac) {
          const tr = (window.T || [])[activeTrackIdx];
          if (!tr || !cues.length) return;
          const dur = parseDur(tr.t);
          const clickTime = frac * dur;
          let closest = 0, minDist = Infinity;
          cues.forEach((c, i) => { const d = Math.abs(c.time - clickTime); if (d < minDist) { minDist = d; closest = i; } });
          cues.splice(closest, 1);
          drawCanvas();
        }

        canvas.addEventListener('click', e => {
          const rect = canvas.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          if (e.shiftKey) {
            const note = window.prompt('Nota pessoal para este ponto (opcional):', 'Nota');
            addCueAtFraction(frac, note ? 'NOTE' : 'CUE');
            return;
          }
          addCueAtFraction(frac, 'CUE');
        });

        canvas.addEventListener('contextmenu', e => {
          e.preventDefault();
          const rect = canvas.getBoundingClientRect();
          const frac = (e.clientX - rect.left) / rect.width;
          deleteCueAtFraction(frac);
        });

        const addBtn = mount.querySelector('#hc-add-btn');
        if (addBtn) {
          addBtn.addEventListener('click', () => addCueAtFraction(0.25, 'CUE'));
        }

        const legendEl = mount.querySelector('#hc-legend');
        if (legendEl) {
          legendEl.addEventListener('click', ev => {
            const chip = ev.target.closest('.hc-cue-chip');
            if (!chip) return;
            const lbl = chip.dataset.cue;
            const idx = cues.findIndex(c => c.label === lbl);
            if (idx >= 0) { cues.splice(idx, 1); drawCanvas(); }
          });
        }

        /* Resize observer */
        if (typeof ResizeObserver !== 'undefined') {
          new ResizeObserver(() => drawCanvas()).observe(canvas);
        }
      }, 30);

      /* ── DataTable ──────────────────────────── */
      const cols = [
        { id:'tit',  label:'Título',   w:'1.6fr', align:'left',  sortable:true, required:true },
        { id:'art',  label:'Artista',  w:'1fr',   align:'left',  sortable:true },
        { id:'cues', label:'Hot Cues', w:'80px',  align:'right', sortable:true },
        { id:'conf', label:'Conf%',    w:'70px',  align:'right', sortable:true },
        { id:'mod',  label:'Modelo',   w:'90px',  align:'left',  sortable:true, visible:false },
        { id:'st',   label:'Análise',  w:'80px',  align:'center',sortable:true }
      ];
      const rows = trackRows().map((r, i) => {
        const an    = AnalysisStore.get(i);
        const cueN  = (window.SIM_HOTCUES || [])[i] ? (window.SIM_HOTCUES[i]).length : (an ? an.hotcues.length : 0);
        const conf  = an ? an.conf : 92;
        const mod   = an ? an.model : 'beat_this';
        return {
          tit:  r.tit,
          art:  r.art,
          cues: `<span class="mono">${cueN}</span>`,
          conf: `<span class="mono" style="color:${conf >= 93 ? 'inherit' : 'var(--primary)'}">${conf}%</span>`,
          mod:  `<span class="mono" style="font-size:10px">${mod}</span>`,
          st:   i % 3 === 2 ? `<span class="tag tag-warn">!</span>` : `<span class="tag tag-ok">OK</span>`
        };
      });
      DataTable.create('hotcue', document.getElementById('hotcue-host'), cols, rows);
    }

    render();
  };

})();
