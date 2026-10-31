/* ════════════════════════════════════════════════════════════
   inicio.js — PAGE: Início / Painel
   Premium bento dashboard: 4 metric tiles + activity DataTable
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.inicio = function (mount) {
    mount.innerHTML = `
      <div class="pane reveal">
        <aside class="aside">
          <div class="aside-head">
            <div class="aside-title">Painel</div>
          </div>
          <div class="aside-scroll">
            <div class="tree-node selected" data-inicio-view="overview">
              <i class="ri-flashlight-line ti"></i><span>Visão geral</span>
            </div>
            <div class="tree-node" data-inicio-view="activity">
              <i class="ri-history-line ti"></i><span>Atividade recente</span>
            </div>
            <div class="tree-node" data-inicio-view="all-registers"> <!-- urgent tab changing!!!! sheet listing all registers of LOGGER -->
              <i class="ri-bar-chart-line ti"></i><span>Todos registros</span> <!-- urgent tab changing!!!! sheet listing all registers of LOGGER -->
            </div>
          </div>
        </aside>
        <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
          <div class="content-hdr">
            <span class="ch-label">PAINEL</span>
            <span class="ch-count">apollo::dj v2.0</span>
          </div>
          <div style="padding:0 16px 12px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;flex-shrink:0;">
            <div class="bento-tile">
              <div class="bt-icon"><i class="ri-music-2-line"></i></div>
              <div class="bt-val">—</div>
              <div class="bt-lbl">Faixas</div>
              <div class="bt-delta tag tag-mute">—</div>
            </div>
            <div class="bento-tile">
              <div class="bt-icon"><i class="ri-usb-line"></i></div>
              <div class="bt-val">—</div>
              <div class="bt-lbl">Pendrives</div>
              <div class="bt-delta tag tag-mute">—</div>
            </div>
            <div class="bento-tile">
              <div class="bt-icon"><i class="ri-play-circle-line"></i></div>
              <div class="bt-val">—</div>
              <div class="bt-lbl">Sessões</div>
              <div class="bt-delta tag tag-mute">—</div>
            </div>
            <div class="bento-tile">
              <div class="bt-icon"><i class="ri-server-line"></i></div>
              <div class="bt-val">—</div>
              <div class="bt-lbl">Espaço usado</div>
              <div class="bt-delta tag tag-mute">—</div>
            </div>
          </div>
          <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;">
            <div class="content-hdr" style="border-top:1px solid rgba(5,5,5,.04);">
              <span class="ch-label">ATIVIDADE</span>
              <span class="ch-count">hoje</span>
            </div>
            <section id="home-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></section>
          </div>
        </section>
      </div>`;

    /* Inject bento tile CSS once */
    if (!document.getElementById('inicio-css')) {
      const s = document.createElement('style');
      s.id = 'inicio-css';
      s.textContent = `
        .content-hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 16px 10px;flex-shrink:0;}
        .ch-label{font-family:var(--ff-mono);font-size:9px;letter-spacing:.18em;color:var(--gray-1);text-transform:uppercase;}
        .ch-count{font-family:var(--ff-mono);font-size:9px;color:var(--white-18);}
        .bento-tile{
          background:var(--white-2);border-radius:var(--r);
          padding:14px 16px;display:flex;flex-direction:column;gap:4px;
          border:1px solid rgba(5,5,5,.04);
          box-shadow:inset 0 1px 0 0 rgba(255,255,255,.9),inset 0 0 0 1px rgba(255,255,255,.4);
        }
        .bt-icon{font-size:18px;color:var(--gray-1);margin-bottom:2px;}
        .bt-val{font-size:22px;font-weight:700;color:var(--txt-heading);line-height:1;}
        .bt-lbl{font-family:var(--ff-mono);font-size:9px;letter-spacing:.12em;color:var(--gray-1);text-transform:uppercase;}
        .bt-delta{width:fit-content;margin-top:4px;}
      `;
      document.head.appendChild(s);
    }

    /* Bind aside nav nodes */
    mount.querySelectorAll('.tree-node[data-inicio-view]').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node[data-inicio-view]').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
      });
    });

    /* Activity DataTable */
    const cols = [
      { id:'k', label:'Indicador', w:'2fr',   align:'left',  sortable:true, required:true },
      { id:'v', label:'Valor',     w:'120px', align:'right', sortable:true },
      { id:'d', label:'Variação',  w:'100px', align:'right', sortable:true },
      { id:'p', label:'Quando',    w:'120px', align:'right', sortable:true }
    ];
    const rows = [
      { k:`<span class="heading">Faixas analisadas</span>`,    v:`<span class="mono">—</span>`, d:`<span class="tag tag-mute">—</span>`,      p:`<span class="mono muted">—</span>` },
      { k:`<span class="heading">Aprovadas (Q)</span>`,        v:`<span class="mono">—</span>`, d:`<span class="tag tag-mute">—</span>`,      p:`<span class="mono muted">—</span>` },
      { k:`<span class="heading">Espaço usado</span>`,         v:`<span class="mono">—</span>`, d:`<span class="tag tag-mute">—</span>`, p:`<span class="mono muted">—</span>` },
      { k:`<span class="heading">Sessões ativas</span>`,       v:`<span class="mono">—</span>`,     d:`<span class="tag tag-mute">—</span>`,         p:`<span class="mono muted">—</span>` },
      { k:`<span class="heading">Versão</span>`,               v:`<span class="mono">2.0</span>`,   d:`<span class="tag tag-ok">apollo::dj</span>`, p:`<span class="mono muted">stable</span>` }
    ];
    DataTable.create('home', document.getElementById('home-host'), cols, rows);

    /* Bento tiles — real counts from ingest.get_report_stats (Sessões stays —). */
    (function () {
      var ingest = window.pywebview && window.pywebview.api && window.pywebview.api.ingest;
      if (!ingest || typeof ingest.get_report_stats !== 'function') return;
      ingest.get_report_stats('all', 'geral').then(function (res) {
        if (!res || !res.rows) return;
        function val(name) {
          var r = res.rows.filter(function (x) { return x.k === name; })[0];
          return r ? r.v : null;
        }
        var tiles = mount.querySelectorAll('.bento-tile .bt-val');
        if (tiles[0]) tiles[0].textContent = val('Faixas na biblioteca') != null ? val('Faixas na biblioteca') : '—';
        if (tiles[1]) tiles[1].textContent = val('Pendrives registrados') != null ? val('Pendrives registrados') : '—';
        if (tiles[3]) tiles[3].textContent = val('Espaço usado') != null ? val('Espaço usado') : '—';
      }).catch(function () {});
    })();
  };

})();
