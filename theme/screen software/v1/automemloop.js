/* ════════════════════════════════════════════════════════════
   automemloop.js — PAGE: Ferramentas / autoMEMloop
   Track selector aside + mini loop-region canvas + DataTable.
   Uses: window.SIM_LOOPS, window.SIM_WAVEDATA
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.autoMemLoop = function (mount) {
    let activeTrackIdx = 0;
    let activeLen      = 8;

    /* ── Helpers ──────────────────────────────────── */
    function parseDur(t) {
      const p = t.split(':'); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
    }

    /* ── Draw mini loop canvas ───────────────────── */
    function drawLoop() {
      const canvas = mount.querySelector('#ml-canvas');
      if (!canvas) return;
      const W = canvas.offsetWidth, H = canvas.offsetHeight || 80;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const tr  = (window.T || [])[activeTrackIdx];
      const dur = tr ? parseDur(tr.t) : 300;
      const wd  = (window.SIM_WAVEDATA || [])[activeTrackIdx] || { low:[], mid:[], high:[] };
      const N   = wd.low.length || 1;
      const bw  = W / N;

      /* Dark bg */
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      /* Low-band mini bars */
      for (let i = 0; i < N; i++) {
        const lo = wd.low[i] || 0;
        const h  = lo * H * 0.7;
        ctx.fillStyle = 'rgba(0,85,226,0.55)';
        ctx.fillRect(i * bw, (H - h) / 2, Math.max(bw - 1, 1), h);
      }

      /* Loop region overlay */
      const loop = (window.SIM_LOOPS || [])[activeTrackIdx];
      if (loop) {
        const spb      = 240 / parseFloat(tr.bpm);
        const inSec    = loop.bar * spb;
        const outSec   = (loop.bar + loop.len) * spb;
        const xIn      = (inSec  / dur) * W;
        const xOut     = (outSec / dur) * W;
        /* Blue loop region */
        ctx.fillStyle   = 'rgba(0,176,240,0.18)';
        ctx.fillRect(xIn, 0, xOut - xIn, H);
        ctx.strokeStyle = 'rgba(0,176,240,0.8)';
        ctx.lineWidth   = 1.5;
        ctx.strokeRect(xIn, 0, xOut - xIn, H);
        /* IN/OUT labels */
        ctx.fillStyle  = 'rgba(0,176,240,0.9)';
        ctx.font       = '9px monospace';
        ctx.textAlign  = 'left';
        ctx.fillText(loop.inFmt, xIn + 3, H - 4);
        ctx.textAlign  = 'right';
        ctx.fillText(loop.outFmt, xOut - 3, H - 4);
      }
    }

    /* ── Progress bar ────────────────────────────── */
    function loopPosBar(pct) {
      return `<div style="display:flex;align-items:center;gap:6px;width:100%">
        <div style="flex:1;height:3px;background:var(--white-4);border-radius:99px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:var(--primary);border-radius:99px"></div>
        </div>
        <span class="mono" style="font-size:10px;color:var(--gray-1);min-width:30px;text-align:right">${pct}%</span>
      </div>`;
    }

    /* ── Build aside track list ───────────────────── */
    function trackListHTML() {
      return (window.T || []).map((tr, i) =>
        `<div class="tree-node ${i === activeTrackIdx ? 'selected' : ''}" data-midx="${i}">
           <i class="ri-music-2-line ti" style="font-size:11px;opacity:.5;"></i>
           <span style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tr.title}</span>
         </div>`
      ).join('');
    }

    /* ── Full render ─────────────────────────────── */
    function render() {
      const tr   = (window.T || [])[activeTrackIdx];
      const loop = (window.SIM_LOOPS || [])[activeTrackIdx];
      const loopInfo = loop
        ? `<span class="mono" style="font-size:10px;color:var(--primary)">${loop.durFmt} · In: ${loop.inFmt} → Out: ${loop.outFmt}</span>`
        : `<span style="color:var(--gray-1);font-size:10px;">Nenhum loop selecionado</span>`;

      mount.innerHTML = `
        <div class="pane reveal">
          <aside class="aside">
            <div class="aside-head"><div class="aside-title">autoMEMloop</div></div>
            <div class="aside-scroll">
              <div class="sec-label first"><span>Faixa ativa</span></div>
              ${trackListHTML()}
              <div class="sec-label"><span>Tamanho do loop</span></div>
              ${[4,8,16,32].map(l =>
                `<div class="tree-node ${activeLen === l ? 'selected' : ''}" data-ml-len="${l}">
                   <i class="ri-repeat-one-line ti"></i><span>${l} bars</span>
                   ${activeLen === l ? `<span class="tag tag-ok" style="margin-left:auto;font-size:9px">ON</span>` : ''}
                 </div>`
              ).join('')}
              <div class="sec-label"><span>Ações</span></div>
              <div class="tree-node" id="ml-analyze-all" style="cursor:pointer">
                <i class="ri-play-circle-line ti" style="color:var(--primary)"></i>
                <span style="color:var(--primary);font-weight:600">Processar tudo</span>
              </div>
            </div>
          </aside>
          <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
            <div class="content-hdr">
              <span class="ch-label">${tr ? tr.title.toUpperCase() : 'MEM LOOPS AUTOMÁTICOS'}</span>
              <span class="ch-count">35 faixas</span>
            </div>
            <div style="padding:8px 14px 0;flex-shrink:0;border-bottom:1px solid var(--s3);">
              ${loopInfo}
              <div style="font-size:10px;color:var(--tx2);margin-top:4px;">Selecione uma faixa na tabela para ver ou editar o memory loop.</div>
            </div>
            <!-- DataTable -->
            <div id="memloop-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>
          </section>
        </div>`;

      /* Track selector */
      mount.querySelectorAll('.tree-node[data-midx]').forEach(n => {
        n.addEventListener('click', () => {
          activeTrackIdx = parseInt(n.dataset.midx, 10);
          render();
        });
      });

      /* Loop length selector */
      mount.querySelectorAll('.tree-node[data-ml-len]').forEach(n => {
        n.addEventListener('click', () => {
          activeLen = parseInt(n.dataset.mlLen, 10);
          render();
        });
      });

      /* Analyze all */
      const btn = mount.querySelector('#ml-analyze-all');
      if (btn) {
        btn.addEventListener('click', () => {
          const rows = DataTable.instances.memloop && DataTable.instances.memloop.rows;
          if (!rows) return;
          rows.forEach(r => { r.st = `<span class="tag tag-warn mono" style="font-size:9px">…</span>`; });
          DataTable.render('memloop');
          setTimeout(() => {
            rows.forEach(r => { r.st = `<span class="tag tag-ok">OK</span>`; });
            DataTable.render('memloop');
          }, 1100);
        });
      }

      /* DataTable */
      const cols = [
        { id:'tit',  label:'Título',   w:'1.4fr', align:'left',  sortable:true, required:true },
        { id:'art',  label:'Artista',  w:'1fr',   align:'left',  sortable:true },
        { id:'lin',  label:'Loop In',  w:'70px',  align:'right', sortable:true },
        { id:'lout', label:'Loop Out', w:'75px',  align:'right', sortable:true, visible:false },
        { id:'ldur', label:'Duração',  w:'75px',  align:'right', sortable:true },
        { id:'pos',  label:'Pos%',     w:'120px', align:'left',  sortable:true },
        { id:'st',   label:'Análise',  w:'80px',  align:'center',sortable:true }
      ];
      const rows = trackRows().map((r, i) => {
        const lp = (window.SIM_LOOPS || [])[i];
        const pct = lp ? lp.posPercent : 15 + (i * 7 % 60);
        const lin  = lp ? lp.inBar  : (4 + (i % 4) * 4) + '.0';
        const lout = lp ? lp.outBar : (4 + (i % 4) * 4 + 8) + '.0';
        const ldur = lp ? lp.durFmt : '8 bars';
        return {
          tit:  r.tit,
          art:  r.art,
          lin:  `<span class="mono">${lin}</span>`,
          lout: `<span class="mono">${lout}</span>`,
          ldur: `<span class="mono">${ldur}</span>`,
          pos:  loopPosBar(pct),
          st:   `<span class="tag tag-ok">OK</span>`
        };
      });
      DataTable.create('memloop', document.getElementById('memloop-host'), cols, rows);
    }

    render();
  };

})();
