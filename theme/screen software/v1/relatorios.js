/* ════════════════════════════════════════════════════════════
   relatorios.js — PAGE: Transferências / Relatórios
   All Apollo module reports: downloads, pendrive.DJ,
   Converso-Rio, exportações, análises — with period picker
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.relatorios = function (mount) {
    mount.innerHTML = `
      <div class="pane reveal">
        <aside class="aside">
          <div class="aside-head"><div class="aside-title">Relatórios</div></div>
          <div class="aside-scroll">
            <div class="sec-label first"><span>Período</span></div>
            <div class="tree-node selected" data-rel="7d"><i class="ri-calendar-line ti"></i><span>Últimos 7 dias</span></div>
            <div class="tree-node" data-rel="30d"><i class="ri-calendar-line ti"></i><span>Este mês</span></div>
            <div class="tree-node" data-rel="q"><i class="ri-calendar-line ti"></i><span>Trimestre</span></div>
            <div class="tree-node" data-rel="y"><i class="ri-calendar-line ti"></i><span>Ano corrente</span></div>
            <div class="sec-label"><span>Módulo</span></div>
            <div class="tree-node selected" data-module="downloads"><i class="ri-download-2-line ti"></i><span>Downloads</span></div>
            <div class="tree-node" data-module="pendrive"><i class="ri-usb-line ti"></i><span>pendrive.DJ</span></div>
            <div class="tree-node" data-module="conversor"><i class="ri-loop-right-line ti"></i><span>Converso-Rio</span></div>
            <div class="tree-node" data-module="exportar"><i class="ri-upload-cloud-2-line ti"></i><span>Exportações</span></div>
            <div class="tree-node" data-module="analise"><i class="ri-bar-chart-2-line ti"></i><span>Análises</span></div>
            <div class="sec-label"><span>Exportar</span></div>
            <div class="tree-node" id="rel-export-pdf"><i class="ri-file-download-line ti"></i><span>PDF</span></div>
            <div class="tree-node" id="rel-export-xls"><i class="ri-file-excel-2-line ti"></i><span>Planilha</span></div>
          </div>
        </aside>
        <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
          <div class="content-hdr">
            <span class="ch-label">RELATÓRIOS</span>
            <span class="ch-count" id="rel-period-lbl">7 dias</span>
          </div>
          <div id="rel-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>
        </section>
      </div>`;

    const periodLabels = {
      '7d': '7 dias',
      '30d': 'este mês',
      'q': 'trimestre',
      'y': 'ano corrente'
    };
    const moduleLabels = {
      geral: 'Geral',
      downloads: 'Downloads',
      pendrive: 'pendrive.DJ',
      conversor: 'Converso-Rio',
      exportar: 'Exportações',
      analise: 'Análises'
    };
    const cols = [
      { id:'k', label:'Indicador', w:'2fr',   align:'left',  sortable:true, required:true },
      { id:'v', label:'Valor',     w:'120px', align:'right', sortable:true },
      { id:'d', label:'Variação',  w:'100px', align:'right', sortable:true },
      { id:'p', label:'Período',   w:'140px', align:'right', sortable:true }
    ];

    let currentPeriod = '7d';
    let currentModule = 'downloads';

    function emptyRows() {
      return [{
        k:'<span class="muted">Sem dados ainda — processe faixas para ver relatórios.</span>',
        v:'<span class="mono muted">—</span>',
        d:'<span class="tag tag-mute">—</span>',
        p:'<span class="mono muted">—</span>'
      }];
    }
    function mapRows(res) {
      if (!res || !res.rows || !res.rows.length || res.empty) return emptyRows();
      return res.rows.map(function (r) {
        return {
          k:'<span class="heading">' + (r.k || '') + '</span>',
          v:'<span class="mono">' + (r.v != null ? r.v : '—') + '</span>',
          d:'<span class="tag tag-mute">' + (r.d != null ? r.d : '—') + '</span>',
          p:'<span class="mono muted">' + (r.p != null ? r.p : '—') + '</span>'
        };
      });
    }
    function render() {
      const periodEl = document.getElementById('rel-period-lbl');
      if (periodEl) {
        periodEl.textContent = (moduleLabels[currentModule] || currentModule) + ' · ' + (periodLabels[currentPeriod] || currentPeriod);
      }
      const done = function (res) {
        const rows = mapRows(res);
        if (DataTable && DataTable.instances && DataTable.instances.rel) {
          DataTable.instances.rel.rows = rows;
          DataTable.render('rel');
        } else {
          DataTable.create('rel', document.getElementById('rel-host'), cols, rows);
        }
      };
      const ingest = window.pywebview && window.pywebview.api && window.pywebview.api.ingest;
      if (ingest && typeof ingest.get_report_stats === 'function') {
        ingest.get_report_stats(currentPeriod, currentModule).then(done).catch(function () { done(null); });
      } else {
        done(null);
      }
    }

    render();

    /* Period selection */
    mount.querySelectorAll('.tree-node[data-rel]').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node[data-rel]').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
        currentPeriod = n.dataset.rel;
        render();
      });
    });

    /* Module selection */
    mount.querySelectorAll('.tree-node[data-module]').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node[data-module]').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
        currentModule = n.dataset.module;
        render();
      });
    });

    /* Export stubs */
    const pdfBtn = document.getElementById('rel-export-pdf');
    const xlsBtn = document.getElementById('rel-export-xls');
    if (pdfBtn) pdfBtn.addEventListener('click', () => { if (window.App) App.toast('PDF gerado'); });
    if (xlsBtn) xlsBtn.addEventListener('click', () => { if (window.App) App.toast('Planilha exportada'); });
  };

})();
