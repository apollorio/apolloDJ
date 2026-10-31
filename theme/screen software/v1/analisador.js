/* ════════════════════════════════════════════════════════════
   analisador.js — PAGE: Ferramentas / Analisador
   Full BPM · Key · LUFS · Headroom · Energy · CDJ validation
   Backend: APO [BTS] / APO [BNT] / APO [MAD] / APO [OKS] / APO [FFN] / APO [MTG]
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.analisador = function (mount) {
    /* ── compute summary tiles from AnalysisStore ─── */
    const all    = Object.values(AnalysisStore.getAll());
    const total  = all.length;
    const done   = all.filter(a => a.status === 'ok').length;
    const warns  = all.filter(a => a.status === 'warn').length;
    const avgLufs = (all.reduce((s, a) => s + a.lufs, 0) / total).toFixed(1);
    const avgHead = (all.reduce((s, a) => s + a.headroom, 0) / total).toFixed(1);

    mount.innerHTML = `
      <div class="pane reveal" style="flex-direction:column;gap:0;overflow:hidden;">

        <!-- Bento tiles row -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 16px 0;flex-shrink:0;">
          <div class="vidro" style="border-radius:var(--r);padding:16px 18px;">
            <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Analisadas</div>
            <div class="heading" style="font-size:28px;line-height:1;">${done}</div>
            <div style="font-size:11px;color:var(--gray-1);margin-top:4px;">de ${total} faixas</div>
          </div>
          <div class="vidro" style="border-radius:var(--r);padding:16px 18px;">
            <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">LUFS médio</div>
            <div class="heading" style="font-size:28px;line-height:1;">${avgLufs}</div>
            <div style="font-size:11px;color:var(--gray-1);margin-top:4px;">alvo: −14 LUFS</div>
          </div>
          <div class="vidro" style="border-radius:var(--r);padding:16px 18px;">
            <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Headroom médio</div>
            <div class="heading" style="font-size:28px;line-height:1;">+${avgHead}</div>
            <div style="font-size:11px;color:var(--gray-1);margin-top:4px;">dBTP · alvo: −1</div>
          </div>
          <div class="vidro" style="border-radius:var(--r);padding:16px 18px;">
            <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Conflitos CDJ</div>
            <div class="heading" style="font-size:28px;line-height:1;color:${warns > 0 ? 'var(--primary)' : 'inherit'}">${warns}</div>
            <div style="font-size:11px;color:var(--gray-1);margin-top:4px;">para corrigir</div>
          </div>
        </div>

        <!-- Main pane -->
        <div class="pane" style="flex:1;overflow:hidden;margin:12px 0 0;padding:0;">
          <aside class="aside">
            <div class="aside-head"><div class="aside-title">Analisador</div></div>
            <div class="aside-scroll">
              <div class="tree-node selected" id="an-filter-all">
                <i class="ri-bar-chart-2-line ti"></i><span>Todas as faixas <span class="ct">${total}</span></span>
              </div>
              <div class="tree-node" id="an-filter-ok">
                <i class="ri-check-line ti"></i><span>Aprovadas <span class="ct">${done}</span></span>
              </div>
              <div class="tree-node" id="an-filter-warn">
                <i class="ri-error-warning-line ti"></i><span>Com aviso <span class="ct">${warns}</span></span>
              </div>
              <div class="sec-label"><span>Precisão BPM</span><span class="sec-hint">confiança do sistema</span></div>
              <div class="tree-node an-model active-model" data-model="beat_this">
                <i class="ri-cpu-line ti"></i><span>APO [BTS]</span>
                <span class="tag tag-ok" style="margin-left:auto;font-size:9px" title="Precisão estimada">97%</span>
              </div>
              <div class="tree-node an-model" data-model="BeatNet">
                <i class="ri-cpu-line ti"></i><span>APO [BNT]</span>
                <span class="tag tag-mute" style="margin-left:auto;font-size:9px" title="Precisão estimada">94%</span>
              </div>
              <div class="tree-node an-model" data-model="madmom">
                <i class="ri-cpu-line ti"></i><span>APO [MAD]</span>
                <span class="tag tag-mute" style="margin-left:auto;font-size:9px" title="Precisão estimada">90%</span>
              </div>
              <div class="sec-label"><span>Ações</span></div>
              <div class="tree-node" id="an-run-all" style="cursor:pointer;">
                <i class="ri-play-circle-line ti" style="color:var(--primary)"></i>
                <span style="color:var(--primary);font-weight:600">Iniciar análise</span>
              </div>
              <div class="tree-node" id="an-stop" style="cursor:pointer;display:none;">
                <i class="ri-stop-circle-line ti"></i>
                <span>Parar</span>
              </div>
            </div>
          </aside>
          <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
            <div class="content-hdr">
              <span class="ch-label">ANÁLISE DE FAIXAS</span>
              <span class="ch-count" id="an-count">${total} faixas</span>
            </div>
            <div id="an-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>
          </section>
        </div>
      </div>`;

    /* ── Aside nav ─────────────────────────────────── */
    mount.querySelectorAll('.tree-node').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
      });
    });

    /* ── Filter helper ─────────────────────────────── */
    function buildRows(filterFn) {
      const store = AnalysisStore.getAll();
      return (window.T || []).map((tr, i) => {
        const an = store[i];
        if (!an) return null;
        if (filterFn && !filterFn(an)) return null;
        const lufsTag  = an.lufs > -12 ? 'tag-warn' : 'tag-ok';
        const hrOk     = an.headroom >= 2;
        const cdj      = an.cdj_ok  ? `<span class="tag tag-ok">OK</span>` : `<span class="tag tag-err">!</span>`;
        return {
          tit:   `<span class="heading">${tr.title}</span>`,
          art:   `<span style="color:var(--gray-1)">${tr.artist}</span>`,
          bpm:   `<span class="mono">${an.bpm}</span>`,
          key:   `<span class="tag tag-mute mono" style="font-size:9px">${tr.key}</span>`,
          lufs:  `<span class="tag ${lufsTag} mono" style="font-size:10px">${an.lufs}</span>`,
          head:  `<span class="mono" style="color:${hrOk?'inherit':'var(--primary)'}">${an.headroom>0?'+':''}${an.headroom}</span>`,
          enrg:  `<span class="mono">${an.energy}/10</span>`,
          conf:  `<span class="mono" style="font-size:10px;color:${an.conf>=93?'inherit':'var(--primary)'}">${an.conf}%</span>`,
          mod:   `<span class="mono" style="font-size:10px">${an.model}</span>`,
          cdj,
        };
      }).filter(Boolean);
    }

    const cols = [
      { id:'tit',  label:'Título',     w:'1.4fr', align:'left',   sortable:true, required:true },
      { id:'art',  label:'Artista',    w:'1fr',   align:'left',   sortable:true },
      { id:'bpm',  label:'BPM',        w:'65px',  align:'right',  sortable:true },
      { id:'key',  label:'Key',        w:'60px',  align:'center', sortable:true },
      { id:'lufs', label:'LUFS',       w:'70px',  align:'right',  sortable:true },
      { id:'head', label:'Headroom',   w:'80px',  align:'right',  sortable:true, visible:false },
      { id:'enrg', label:'Energy',     w:'70px',  align:'right',  sortable:true },
      { id:'conf', label:'Conf%',      w:'65px',  align:'right',  sortable:true, visible:false },
      { id:'mod',  label:'Modelo',     w:'90px',  align:'left',   sortable:true, visible:false },
      { id:'cdj',  label:'CDJ',        w:'60px',  align:'center', sortable:true },
    ];
    DataTable.create('an', document.getElementById('an-host'), cols, buildRows());

    /* ── Filter buttons ────────────────────────────── */
    const filterBtns = { all: null, ok: a => a.status === 'ok', warn: a => a.status === 'warn' };
    ['all','ok','warn'].forEach(key => {
      const btn = mount.querySelector('#an-filter-' + key);
      if (btn) btn.addEventListener('click', () => {
        DataTable.instances.an.rows = buildRows(filterBtns[key]);
        DataTable.render('an');
      });
    });

    /* ── Analyze all animation ─────────────────────── */
    const runBtn  = mount.querySelector('#an-run-all');
    const stopBtn = mount.querySelector('#an-stop');
    let running = false;
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        if (running) return;
        running = true;
        stopBtn && (stopBtn.style.display = '');
        const rows = DataTable.instances.an && DataTable.instances.an.rows;
        if (!rows) return;
        rows.forEach(r => { r.cdj = `<span class="tag tag-warn" style="font-size:9px">…</span>`; });
        DataTable.render('an');
        setTimeout(() => {
          rows.forEach((r, i) => {
            const an = AnalysisStore.get(i);
            r.cdj = an && an.cdj_ok ? `<span class="tag tag-ok">OK</span>` : `<span class="tag tag-err">!</span>`;
          });
          DataTable.render('an');
          running = false;
          stopBtn && (stopBtn.style.display = 'none');
        }, 1400);
      });
    }

    /* ── Row right-click: Re-analyze / Export XML / Load Deck ─ */
    const anRowCtx = document.getElementById('an-row-ctx') || (() => {
      const el = document.createElement('div');
      el.id = 'an-row-ctx';
      el.className = 'ctx';
      el.style.cssText = 'min-width:180px;z-index:9999;';
      document.body.appendChild(el);
      return el;
    })();

    function attachAnRowCtx() {
      const dt = document.getElementById('dt-an');
      if (!dt) return;
      dt.querySelectorAll('.dt-row').forEach((row, i) => {
        row.addEventListener('contextmenu', e => {
          e.preventDefault();
          anRowCtx.innerHTML = `
            <div class="ctx-head">Faixa ${i + 1}</div>
            <div class="ctx-item" onclick="loadTrackToDeck(1,${i});document.getElementById('an-row-ctx').classList.remove('show')">
              <i class="ri-skip-forward-line" style="margin-right:6px;opacity:.6"></i>Deck 1
            </div>
            <div class="ctx-item" onclick="loadTrackToDeck(2,${i});document.getElementById('an-row-ctx').classList.remove('show')">
              <i class="ri-skip-forward-line" style="margin-right:6px;opacity:.6"></i>Deck 2
            </div>
            <div class="ctx-item" onclick="document.getElementById('an-row-ctx').classList.remove('show')">
              <i class="ri-refresh-line" style="margin-right:6px;opacity:.6"></i>Analisar novamente
            </div>
            <div class="ctx-item" onclick="document.getElementById('an-row-ctx').classList.remove('show')">
              <i class="ri-file-code-line" style="margin-right:6px;opacity:.6"></i>Exportar XML
            </div>`;
          anRowCtx.classList.add('show');
          anRowCtx.style.left = Math.min(e.pageX, window.innerWidth  - 210) + 'px';
          anRowCtx.style.top  = Math.min(e.pageY, window.innerHeight - 180) + 'px';
        });
      });
    }
    attachAnRowCtx();

    /* ── analisador:load — single track detail view ─── */
    ApolloState.subscribe('analisador:load', function ({ idx, track }) {
      const an = AnalysisStore.get(idx);
      if (!an || !track) return;
      const host = document.getElementById('an-host');
      if (!host) return;

      const lufsTag  = an.lufs > -12 ? 'tag-warn' : 'tag-ok';
      const cues     = (an.hotcues || []);
      const cueChips = cues.map(c => {
        const color = c.color || (window.HC_COLORS && c.label ? window.HC_COLORS[c.label] : '#aaa');
        return `<span style="display:inline-flex;align-items:center;gap:3px;padding:3px 8px;border-radius:99px;background:${color}20;border:1px solid ${color}50;margin:2px;">
          <span style="width:6px;height:6px;border-radius:50%;background:${color};display:inline-block;"></span>
          <span style="font-size:9px;font-family:monospace;color:${color};font-weight:700">${c.label}</span>
          <span style="font-size:9px;color:var(--gray-1)">${c.type || 'CUE'}</span>
        </span>`;
      }).join('');

      host.innerHTML = `
        <div style="padding:16px;display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="tag tag-ok" style="font-size:10px">Faixa ${idx + 1}</span>
            <span class="heading" style="font-size:16px">${track.title}</span>
            <span style="color:var(--gray-1)">${track.artist}</span>
          </div>
          <!-- Big stats row -->
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">
            <div class="vidro" style="border-radius:var(--r);padding:12px 14px;">
              <div style="font-size:9px;font-family:var(--ff-mono);color:var(--gray-1);text-transform:uppercase;margin-bottom:4px;">BPM</div>
              <div class="heading mono" style="font-size:20px">${an.bpm}</div>
            </div>
            <div class="vidro" style="border-radius:var(--r);padding:12px 14px;">
              <div style="font-size:9px;font-family:var(--ff-mono);color:var(--gray-1);text-transform:uppercase;margin-bottom:4px;">Key</div>
              <div class="heading mono" style="font-size:20px">${track.key}</div>
            </div>
            <div class="vidro" style="border-radius:var(--r);padding:12px 14px;">
              <div style="font-size:9px;font-family:var(--ff-mono);color:var(--gray-1);text-transform:uppercase;margin-bottom:4px;">LUFS</div>
              <div class="heading mono" style="font-size:20px"><span class="tag ${lufsTag}">${an.lufs}</span></div>
            </div>
            <div class="vidro" style="border-radius:var(--r);padding:12px 14px;">
              <div style="font-size:9px;font-family:var(--ff-mono);color:var(--gray-1);text-transform:uppercase;margin-bottom:4px;">Energy</div>
              <div class="heading mono" style="font-size:20px">${an.energy}/10</div>
            </div>
            <div class="vidro" style="border-radius:var(--r);padding:12px 14px;">
              <div style="font-size:9px;font-family:var(--ff-mono);color:var(--gray-1);text-transform:uppercase;margin-bottom:4px;">CDJ</div>
              <div style="font-size:20px">${an.cdj_ok ? '<span class="tag tag-ok">OK</span>' : '<span class="tag tag-err">!</span>'}</div>
            </div>
          </div>
          <!-- Mini info row -->
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span class="mono" style="font-size:11px;color:var(--gray-1);">Conf: <b style="color:inherit">${an.conf}%</b></span>
            <span class="mono" style="font-size:11px;color:var(--gray-1);">Modelo: <b style="color:inherit">${an.model}</b></span>
            <span class="mono" style="font-size:11px;color:var(--gray-1);">SR: <b style="color:inherit">${an.sr} Hz</b></span>
            <span class="mono" style="font-size:11px;color:var(--gray-1);">Headroom: <b style="color:inherit">${an.headroom > 0 ? '+' : ''}${an.headroom} dBTP</b></span>
            <span class="mono" style="font-size:11px;color:var(--gray-1);">Formato: <b style="color:inherit">${track.fmt}</b></span>
          </div>
          <!-- Hot cue chips -->
          ${cues.length ? `<div><div style="font-size:9px;font-family:var(--ff-mono);color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Hot Cues</div><div>${cueChips}</div></div>` : ''}
          <!-- Back button -->
          <button class="btn-primary" style="align-self:flex-start;margin-top:4px;" id="an-back-btn">
            <i class="ri-arrow-left-line"></i> Voltar à lista
          </button>
        </div>`;

      const backBtn = document.getElementById('an-back-btn');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          DataTable.create('an', document.getElementById('an-host'), [], buildRows());
          /* recreate with full cols */
          DataTable.create('an', document.getElementById('an-host'), cols, buildRows());
          attachAnRowCtx();
        });
      }
    });

    /* ── analisador:playlist — batch progress table ─── */
    ApolloState.subscribe('analisador:playlist', function ({ viewKey, ids }) {
      const host = document.getElementById('an-host');
      if (!host) return;

      const trackList = ids
        ? ids.map(i => ({ idx: i, tr: (window.T || [])[i] })).filter(x => x.tr)
        : (window.T || []).map((tr, i) => ({ idx: i, tr }));

      /* Build progress table rows */
      const progRows = trackList.map(({ idx, tr }) => ({
        tit:  `<span class="heading" style="font-size:12px">${tr.title}</span>`,
        art:  `<span style="color:var(--gray-1);font-size:11px">${tr.artist}</span>`,
        prog: `<div style="width:0%;height:3px;background:var(--primary);border-radius:99px;transition:width .4s ease;" data-prog="${idx}"></div>`,
        bpm:  `<span class="mono" id="an-pbpm-${idx}">—</span>`,
        key:  `<span class="mono" id="an-pkey-${idx}">—</span>`,
        st:   `<span class="tag tag-warn" id="an-pst-${idx}" style="font-size:9px">…</span>`
      }));

      const progCols = [
        { id:'tit',  label:'Faixa',     w:'2fr',  align:'left',  sortable:false, required:true },
        { id:'art',  label:'Artista',   w:'1.2fr', align:'left', sortable:false },
        { id:'prog', label:'Progresso', w:'200px', align:'left', sortable:false },
        { id:'bpm',  label:'BPM',       w:'60px',  align:'right',sortable:false },
        { id:'key',  label:'Key',       w:'55px',  align:'center',sortable:false },
        { id:'st',   label:'Status',    w:'70px',  align:'center',sortable:false }
      ];
      DataTable.create('an-batch', host, progCols, progRows);

      /* Animate progress bars sequentially */
      trackList.forEach(({ idx }, li) => {
        setTimeout(() => {
          const bar = document.querySelector(`[data-prog="${idx}"]`);
          if (bar) {
            bar.style.width = '0%';
            requestAnimationFrame(() => { bar.style.width = '100%'; });
          }
        }, li * 120);

        setTimeout(() => {
          const an = AnalysisStore.get(idx);
          const bpmEl = document.getElementById('an-pbpm-' + idx);
          const keyEl = document.getElementById('an-pkey-' + idx);
          const stEl  = document.getElementById('an-pst-'  + idx);
          const tr    = (window.T || [])[idx];
          if (bpmEl && an) bpmEl.textContent = an.bpm;
          if (keyEl && tr) keyEl.textContent = tr.key;
          if (stEl)  stEl.outerHTML = an && an.cdj_ok
            ? `<span class="tag tag-ok" id="an-pst-${idx}">OK</span>`
            : `<span class="tag tag-warn" id="an-pst-${idx}">!</span>`;
        }, li * 120 + 460);
      });
    });
  };

})();
