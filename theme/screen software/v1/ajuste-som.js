/* ════════════════════════════════════════════════════════════
   ajuste-som.js — PAGE: Controladora / Ajuste.SOM
   Audio output settings: device profiles aside + KPI DataTable
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.ajusteSom = function (mount) {
    mount.innerHTML = `
      <div class="pane reveal">
        <aside class="aside">
          <div class="aside-head"><div class="aside-title">Saída</div></div>
          <div class="aside-scroll">
            <div class="tree-node selected" data-audio="djm">
              <i class="ri-sound-module-line ti"></i><span>Pioneer DJM-A9</span>
            </div>
            <div class="tree-node" data-audio="builtin">
              <i class="ri-volume-up-line ti"></i><span>Saída Integrada</span>
            </div>
            <div class="sec-label"><span>Perfis</span></div>
            <div class="tree-node" data-audio-profile="neutro">
              <i class="ri-equalizer-line ti"></i><span>Neutro</span>
            </div>
            <div class="tree-node" data-audio-profile="club">
              <i class="ri-equalizer-line ti"></i><span>Club</span>
            </div>
            <div class="tree-node" data-audio-profile="hp">
              <i class="ri-headphone-line ti"></i><span>Headphones</span>
            </div>
          </div>
        </aside>
        <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
          <div class="content-hdr">
            <span class="ch-label">AJUSTE DE SOM</span>
            <span class="ch-count" id="som-device-lbl">Pioneer DJM-A9</span>
          </div>
          <div id="som-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>
        </section>
      </div>`;

    const deviceNames = { djm:'Pioneer DJM-A9', builtin:'Saída Integrada' };
    mount.querySelectorAll('.tree-node[data-audio]').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
        const lbl = document.getElementById('som-device-lbl');
        if (lbl) lbl.textContent = deviceNames[n.dataset.audio] || n.dataset.audio;
      });
    });
    mount.querySelectorAll('.tree-node[data-audio-profile]').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
      });
    });

    const cols = [
      { id:'k',  label:'Parâmetro', w:'1.4fr', align:'left',   sortable:true, required:true },
      { id:'v',  label:'Valor',     w:'120px', align:'right',  sortable:true },
      { id:'u',  label:'Unidade',   w:'80px',  align:'left',   sortable:true },
      { id:'st', label:'Estado',    w:'90px',  align:'center', sortable:true }
    ];
    const rows = [
      { k:`<span class="heading">Latência</span>`,        v:`<span class="mono">3,2</span>`,    u:`<span class="muted">ms</span>`,        st:`<span class="tag tag-ok">OK</span>` },
      { k:`<span class="heading">Buffer</span>`,           v:`<span class="mono">256</span>`,    u:`<span class="muted">amostras</span>`,   st:`<span class="tag tag-ok">OK</span>` },
      { k:`<span class="heading">Sample Rate</span>`,      v:`<span class="mono">48</span>`,     u:`<span class="muted">kHz</span>`,       st:`<span class="tag tag-warn" title="CDJ exige 44.1 kHz">!</span>` },
      { k:`<span class="heading">Headroom Master</span>`,  v:`<span class="mono">-6</span>`,     u:`<span class="muted">dB</span>`,        st:`<span class="tag tag-ok">OK</span>` },
      { k:`<span class="heading">Limiter</span>`,          v:`<span class="mono">ON</span>`,     u:`<span class="muted">—</span>`,         st:`<span class="tag tag-ok">Ativo</span>` },
      { k:`<span class="heading" style="opacity:.4">──</span>`, v:``, u:``, st:`` },
      { k:`<span class="heading">EBU R128 Target</span>`,  v:`<span class="mono">-14</span>`,   u:`<span class="muted">LUFS</span>`,      st:`<span class="tag tag-ok">CDJ</span>` },
      { k:`<span class="heading">True Peak Limit</span>`,  v:`<span class="mono">-1</span>`,    u:`<span class="muted">dBTP</span>`,      st:`<span class="tag tag-ok">OK</span>` },
      { k:`<span class="heading">44.1 kHz Enforce</span>`, v:`<span class="mono">OFF</span>`,   u:`<span class="muted">ffmpeg</span>`,    st:`<span class="tag tag-warn">Atenção</span>` },
      { k:`<span class="heading">LUFS Médio Lib.</span>`,  v:`<span class="mono">-13,1</span>`, u:`<span class="muted">LUFS</span>`,      st:`<span class="tag tag-warn">!</span>` },
    ];
    DataTable.create('som', document.getElementById('som-host'), cols, rows);
  };

})();
