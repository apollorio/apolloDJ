/* ════════════════════════════════════════════════════════════
   converso-rio.js — PAGE: Ferramentas / Converso-Rio
   Format converter: history/in-progress aside + queue DataTable
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.conversoRio = function (mount) {
    mount.innerHTML = `
      <div class="pane reveal">
        <aside class="aside">
          <div class="aside-head"><div class="aside-title">Conversão</div></div>
          <div class="aside-scroll">
            <div class="tree-node selected" data-conv="history">
              <i class="ri-history-line ti"></i><span>Histórico</span>
            </div>
            <div class="tree-node" data-conv="running">
              <i class="ri-loader-2-line ti"></i><span>Em processo</span>
            </div>
            <div class="tree-node" data-conv="done">
              <i class="ri-check-line ti"></i><span>Concluídas</span>
            </div>
            <div class="sec-label"><span>Formato saída</span></div>
            <div class="tree-node"><i class="ri-music-2-line ti"></i><span>WAV Lossless</span></div>
            <div class="tree-node"><i class="ri-music-2-line ti"></i><span>AIFF Lossless</span></div>
            <div class="tree-node"><i class="ri-music-2-line ti"></i><span>MP3 320k</span></div>
          </div>
        </aside>
        <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
          <div class="content-hdr">
            <span class="ch-label">CONVERSO-RIO</span>
            <span class="ch-count">0 recentes</span>
          </div>
          <div id="conv-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>
        </section>
      </div>`;

    mount.querySelectorAll('.tree-node').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
      });
    });

    const cols = [
      { id:'name', label:'Arquivo',   w:'1.6fr', align:'left',   sortable:true, required:true },
      { id:'fmt',  label:'De → Para', w:'1fr',   align:'left',   sortable:true },
      { id:'sz',   label:'Tamanho',   w:'90px',  align:'right',  sortable:true },
      { id:'time', label:'Hora',      w:'90px',  align:'right',  sortable:true },
      { id:'st',   label:'Status',    w:'80px',  align:'center', sortable:true }
    ];
    const rows = [];
    DataTable.create('conv', document.getElementById('conv-host'), cols, rows);
  };

})();
