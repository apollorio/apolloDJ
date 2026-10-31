/* ════════════════════════════════════════════════════════════
   exportar.js — PAGE: Ferramentas / Exportar
   CDJ / Rekordbox XML export pipeline with red-flag validation
   Backend ref: APO [PRK] / APO [FFN] / APO [MTG]
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.exportar = function (mount) {

    function buildRows(animating) {
      const store = AnalysisStore.getAll();
      return (window.T || []).map((tr, i) => {
        const an = store[i];
        if (!an) return null;
        const lufsOk = an.lufs <= -12 && an.lufs >= -18;
        const srOk   = an.sr === 44100;
        const tpOk   = an.tp <= -1;
        const cdjOk  = an.cdj_ok;
        if (animating) {
          return {
            tit:   `<span class="heading">${tr.title}</span>`,
            art:   `<span style="color:var(--gray-1)">${tr.artist}</span>`,
            cues:  `<span class="mono">…</span>`,
            loops: `<span class="mono">…</span>`,
            lufs:  `<span class="tag tag-warn" style="font-size:9px">…</span>`,
            sr:    `<span class="tag tag-warn" style="font-size:9px">…</span>`,
            st:    `<span class="tag tag-warn" style="font-size:9px">…</span>`,
          };
        }
        return {
          tit:   `<span class="heading">${tr.title}</span>`,
          art:   `<span style="color:var(--gray-1)">${tr.artist}</span>`,
          cues:  `<span class="mono">${an.hotcues ? an.hotcues.length : 0}</span>`,
          loops: `<span class="mono">1</span>`,
          lufs:  `<span class="tag ${lufsOk?'tag-ok':'tag-warn'} mono" style="font-size:10px">${an.lufs}</span>`,
          sr:    `<span class="tag ${srOk?'tag-ok':'tag-warn'} mono" style="font-size:10px">${srOk?'44.1':'48'} kHz</span>`,
          st:    `<span class="tag ${cdjOk?'tag-ok':'tag-err'}">${cdjOk?'OK':'!'}</span>`,
        };
      }).filter(Boolean);
    }

    /* Summary tiles */
    const store  = AnalysisStore.getAll();
    const all    = Object.values(store);
    const ready  = all.filter(a => a.cdj_ok).length;
    const warns  = all.length - ready;
    const cues   = all.reduce((s, a) => s + (a.hotcues ? a.hotcues.length : 0), 0);
    const loops  = all.length;

    mount.innerHTML = `
      <div class="pane reveal" style="flex-direction:column;overflow:hidden;gap:0;">
        <!-- Bento tiles -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 16px 0;flex-shrink:0;">
          <div class="vidro" style="border-radius:var(--r);padding:16px 18px;text-align:center;">
            <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Prontas CDJ</div>
            <div class="heading" style="font-size:28px;line-height:1;">${ready}</div>
            <span class="tag tag-ok" style="margin-top:6px;font-size:9px">de ${all.length}</span>
          </div>
          <div class="vidro" style="border-radius:var(--r);padding:16px 18px;text-align:center;">
            <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Hot Cues</div>
            <div class="heading" style="font-size:28px;line-height:1;">${cues}</div>
            <span class="tag tag-mute" style="margin-top:6px;font-size:9px">mapeados</span>
          </div>
          <div class="vidro" style="border-radius:var(--r);padding:16px 18px;text-align:center;">
            <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Mem Loops</div>
            <div class="heading" style="font-size:28px;line-height:1;">${loops}</div>
            <span class="tag tag-mute" style="margin-top:6px;font-size:9px">configurados</span>
          </div>
          <div class="vidro" style="border-radius:var(--r);padding:16px 18px;text-align:center;">
            <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Com Aviso</div>
            <div class="heading" style="font-size:28px;line-height:1;color:${warns>0?'var(--primary)':'inherit'}">${warns}</div>
            <span class="tag ${warns>0?'tag-warn':'tag-ok'}" style="margin-top:6px;font-size:9px">${warns>0?'Corrigir':'Tudo certo'}</span>
          </div>
        </div>

        <!-- Main pane -->
        <div class="pane" style="flex:1;overflow:hidden;margin:12px 0 0;padding:0;">
          <aside class="aside">
            <div class="aside-head"><div class="aside-title">Exportar</div></div>
            <div class="aside-scroll">
              <div class="sec-label first"><span>Destino</span></div>
              <div class="tree-node selected" data-exp="cdj3000">
                <i class="ri-disc-line ti"></i><span>CDJ-3000</span>
                <span class="tag tag-ok" style="margin-left:auto;font-size:9px">USB</span>
              </div>
              <div class="tree-node" data-exp="cdj2000">
                <i class="ri-disc-line ti"></i><span>CDJ-2000NXS2</span>
              </div>
              <div class="tree-node" data-exp="cdj-universal">
                <i class="ri-disc-line ti"></i><span>CDJ Universal</span>
                <span class="tag tag-mute" style="margin-left:auto;font-size:9px">any</span>
              </div>
              <div class="tree-node" data-exp="rb-xml">
                <i class="ri-file-code-line ti"></i><span>Rekordbox XML</span>
              </div>
              <div class="tree-node" data-exp="serato">
                <i class="ri-music-2-line ti"></i><span>Serato DJ Pro</span>
                <span class="tag tag-mute" style="margin-left:auto;font-size:9px">crate</span>
              </div>
              <div class="tree-node" data-exp="m3u">
                <i class="ri-play-list-2-line ti"></i><span>M3U Playlist</span>
              </div>

              <div class="sec-label"><span>Configurações</span></div>
              <div class="tree-node selected" id="exp-lufs-on">
                <i class="ri-sound-module-line ti"></i><span>LUFS −14 enforce</span>
                <span class="tag tag-ok" style="margin-left:auto;font-size:9px">ON</span>
              </div>
              <div class="tree-node selected" id="exp-sr-on">
                <i class="ri-equalizer-line ti"></i><span>44.1 kHz enforce</span>
                <span class="tag tag-ok" style="margin-left:auto;font-size:9px">ON</span>
              </div>
              <div class="tree-node selected" id="exp-tp-on">
                <i class="ri-bar-chart-grouped-line ti"></i><span>True Peak −1 dBTP</span>
                <span class="tag tag-ok" style="margin-left:auto;font-size:9px">ON</span>
              </div>

              <div class="sec-label"><span>Ações</span></div>
              <div class="tree-node" id="exp-run-btn" style="cursor:pointer;">
                <i class="ri-export-line ti" style="color:var(--primary)"></i>
                <span style="color:var(--primary);font-weight:600">Exportar para CDJ</span>
              </div>
              <div class="tree-node" id="exp-fix-btn" style="cursor:pointer;">
                <i class="ri-tools-line ti"></i>
                <span>Corrigir avisos</span>
              </div>
            </div>
          </aside>
          <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
            <div class="content-hdr">
              <span class="ch-label">VALIDAÇÃO CDJ</span>
              <span class="ch-count">${all.length} faixas</span>
            </div>
            <div id="exp-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>
          </section>
        </div>
      </div>`;

    /* ── DataTable ──────────────────────────────────── */
    const cols = [
      { id:'tit',  label:'Título',      w:'1.4fr', align:'left',   sortable:true, required:true },
      { id:'art',  label:'Artista',     w:'1fr',   align:'left',   sortable:true },
      { id:'cues', label:'Hot Cues',    w:'75px',  align:'right',  sortable:true },
      { id:'loops',label:'Loops',       w:'60px',  align:'right',  sortable:true },
      { id:'lufs', label:'LUFS',        w:'70px',  align:'right',  sortable:true },
      { id:'sr',   label:'Sample Rate', w:'90px',  align:'center', sortable:true },
      { id:'st',   label:'CDJ',         w:'60px',  align:'center', sortable:true },
    ];
    DataTable.create('exp', document.getElementById('exp-host'), cols, buildRows(false));

    /* ── Aside node select ───────────────────────────── */
    const EXP_LABELS = {
      'cdj3000':     'CDJ-3000 — Rekordbox USB',
      'cdj2000':     'CDJ-2000NXS2 — Rekordbox USB',
      'cdj-universal': 'CDJ Universal — USB (any Pioneer)',
      'rb-xml':      'Rekordbox XML',
      'serato':      'Serato DJ Pro — Crate',
      'm3u':         'M3U Playlist',
    };
    const expLabel = mount.querySelector('.ch-label');
    mount.querySelectorAll('.tree-node[data-exp]').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node[data-exp]').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
        if (expLabel) expLabel.textContent = EXP_LABELS[n.dataset.exp] || 'VALIDAÇÃO';
      });
    });

    /* ── Export animation ────────────────────────────── */
    const runBtn = mount.querySelector('#exp-run-btn');
    if (runBtn) {
      runBtn.addEventListener('click', () => {
        DataTable.instances.exp.rows = buildRows(true);
        DataTable.render('exp');
        setTimeout(() => {
          DataTable.instances.exp.rows = buildRows(false);
          DataTable.render('exp');
          attachExpRowCtx();
        }, 1600);
      });
    }

    /* Fix warns */
    const fixBtn = mount.querySelector('#exp-fix-btn');
    if (fixBtn) {
      fixBtn.addEventListener('click', () => {
        /* Simulate: mark all cdj_ok */
        const s = AnalysisStore.getAll();
        Object.keys(s).forEach(k => { s[k].cdj_ok = true; });
        DataTable.instances.exp.rows = buildRows(false);
        DataTable.render('exp');
        attachExpRowCtx();
      });
    }

    /* ── Row right-click ─────────────────────────────── */
    const expCtx = document.getElementById('exp-row-ctx') || (() => {
      const el = document.createElement('div');
      el.id = 'exp-row-ctx';
      el.className = 'ctx';
      el.style.cssText = 'min-width:180px;z-index:9999;';
      document.body.appendChild(el);
      return el;
    })();

    function attachExpRowCtx() {
      const dt = document.getElementById('dt-exp');
      if (!dt) return;
      dt.querySelectorAll('.dt-row').forEach((row, i) => {
        row.addEventListener('contextmenu', e => {
          e.preventDefault();
          expCtx.innerHTML = `
            <div class="ctx-head">Faixa ${i + 1}</div>
            <div class="ctx-item" onclick="loadTrackToDeck(1,${i});document.getElementById('exp-row-ctx').classList.remove('show')">
              <i class="ri-skip-forward-line" style="margin-right:6px;opacity:.6"></i>Deck 1
            </div>
            <div class="ctx-item" onclick="document.getElementById('exp-row-ctx').classList.remove('show')">
              <i class="ri-tools-line" style="margin-right:6px;opacity:.6"></i>Corrigir agora
            </div>
            <div class="ctx-item" onclick="document.getElementById('exp-row-ctx').classList.remove('show')">
              <i class="ri-eye-off-line" style="margin-right:6px;opacity:.6"></i>Ignorar
            </div>
            <div class="ctx-item" onclick="document.getElementById('exp-row-ctx').classList.remove('show')">
              <i class="ri-export-line" style="margin-right:6px;opacity:.6"></i>Exportar somente esta
            </div>`;
          expCtx.classList.add('show');
          expCtx.style.left = Math.min(e.pageX, window.innerWidth  - 210) + 'px';
          expCtx.style.top  = Math.min(e.pageY, window.innerHeight - 200) + 'px';
        });
      });
    }
    attachExpRowCtx();
  };

})();
