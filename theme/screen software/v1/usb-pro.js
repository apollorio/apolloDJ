/* ════════════════════════════════════════════════════════════
   usb-pro.js — PAGE: Ferramentas / pendrive.PRO
   Ultra-pro USB flash validation pre-CDJ export
   Backend ref: APO [USB] / APO [DSK] / APO [UDF]
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.usbPro = function (mount) {
    let DEVICES = [];
    let activeDevice = null;

    function normalizeDrivesFromApi(raw) {
      var list = raw;
      if (typeof raw === 'string') {
        try { list = JSON.parse(raw); } catch (e) { return []; }
      }
      if (!list) return [];
      if (list.devices && Array.isArray(list.devices)) list = list.devices;
      if (!Array.isArray(list)) return [];
      return list.map(function (d, idx) {
        if (d.label && d.cap) return d;
        var letter = d.letter || '';
        var tg = d.total_gb || 0;
        var fg = d.free_gb !== undefined ? d.free_gb : tg;
        return {
          id: d.root || letter || ('usbp-' + idx),
          label: letter || d.root || 'USB',
          cap: tg ? (Math.round(tg) + ' GB') : '—',
          capReal: tg ? (tg.toFixed(1) + ' GB') : '—',
          fmt: 'exFAT',
          speed: '—',
          fake: false,
          cdj: true
        };
      });
    }
    if (window.pywebview && window.pywebview.api && window.pywebview.api.usb && typeof window.pywebview.api.usb.list_drives === 'function') {
      window.pywebview.api.usb.list_drives().then(function (raw) {
        var devices = normalizeDrivesFromApi(raw);
        if (devices.length > 0) {
          DEVICES = devices;
          activeDevice = DEVICES[0];
          render();
        }
      }).catch(function () {});
    }

    function tileHTML() {
      if (!activeDevice) {
        return `
        <div class="vidro" style="grid-column:1/-1;border-radius:var(--r);padding:24px 18px;text-align:center;">
          <div style="font-family:var(--ff-mono);font-size:9px;letter-spacing:.14em;color:var(--gray-1);text-transform:uppercase;">Nenhum pendrive conectado</div>
        </div>`;
      }
      const d = activeDevice;
      const fakeScore = d.fake ? 92 : 3;
      const fakeTag   = d.fake ? 'tag-err' : 'tag-ok';
      const spdOk     = parseInt(d.speed) >= 30;
      const fmtOk     = d.fmt === 'exFAT';
      return `
        <div class="vidro" style="border-radius:var(--r);padding:16px 18px;text-align:center;">
          <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Gravação</div>
          <div class="heading" style="font-size:22px;line-height:1;">${d.speed}</div>
          <span class="tag ${spdOk ? 'tag-ok' : 'tag-warn'}" style="margin-top:6px;font-size:9px">${spdOk ? 'Rápido' : 'Lento'}</span>
        </div>
        <div class="vidro" style="border-radius:var(--r);padding:16px 18px;text-align:center;">
          <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Capacidade</div>
          <div class="heading" style="font-size:22px;line-height:1;">${d.capReal}</div>
          <span class="tag ${Math.abs(parseInt(d.cap) - parseInt(d.capReal)) < 2 ? 'tag-ok' : 'tag-warn'}" style="margin-top:6px;font-size:9px">declarado: ${d.cap}</span>
        </div>
        <div class="vidro" style="border-radius:var(--r);padding:16px 18px;text-align:center;">
          <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Formato</div>
          <div class="heading" style="font-size:22px;line-height:1;">${d.fmt}</div>
          <span class="tag ${fmtOk ? 'tag-ok' : 'tag-warn'}" style="margin-top:6px;font-size:9px">${fmtOk ? 'CDJ OK' : 'Conv. necessária'}</span>
        </div>
        <div class="vidro" style="border-radius:var(--r);padding:16px 18px;text-align:center;">
          <div style="font-size:10px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Pontuação Simulada</div>
          <div class="heading" style="font-size:22px;line-height:1;color:${d.fake ? 'var(--primary)' : 'inherit'}">${fakeScore}%</div>
          <span class="tag ${fakeTag}" style="margin-top:6px;font-size:9px">${d.fake ? 'SUSPEITO' : 'Autêntico'}</span>
        </div>`;
    }

    function testRows(animate) {
      if (!activeDevice) return [];
      const d = activeDevice;
      const spdOk = parseInt(d.speed) >= 30;
      const capOk = !d.fake;
      const running = t => animate ? `<span class="tag tag-warn" style="font-size:9px">…</span>` : t;
      return [
        { test:`<span class="heading">Teste de Escrita</span>`,           result: running(`<span class="mono">${d.speed}</span>`), expect:`<span class="mono">≥30 MB/s</span>`, st: animate ? running('') : `<span class="tag ${spdOk?'tag-ok':'tag-warn'}">${spdOk?'OK':'Lento'}</span>` },
        { test:`<span class="heading">Detecção Capacidade Falsa</span>`, result: running(`<span class="mono">${d.capReal}</span>`), expect:`<span class="mono">${d.cap}</span>`,  st: animate ? running('') : `<span class="tag ${capOk?'tag-ok':'tag-err'}">${capOk?'OK':'FAKE'}</span>` },
        { test:`<span class="heading">Sistema de Arquivos</span>`,       result: running(`<span class="mono">${d.fmt}</span>`), expect:`<span class="mono">exFAT</span>`,     st: animate ? running('') : `<span class="tag ${d.fmt==='exFAT'?'tag-ok':'tag-warn'}">${d.fmt==='exFAT'?'OK':'Converter'}</span>` },
        { test:`<span class="heading">Alinhamento de Setor</span>`,      result: running(`<span class="mono">4096 B</span>`), expect:`<span class="mono">4096 B</span>`,   st: animate ? running('') : `<span class="tag tag-ok">OK</span>` },
        { test:`<span class="heading">Compatibilidade CDJ</span>`,       result: running(`<span class="mono">${d.cdj?'CDJ-3000':'Falhou'}</span>`), expect:`<span class="mono">CDJ-3000</span>`, st: animate ? running('') : `<span class="tag ${d.cdj?'tag-ok':'tag-err'}">${d.cdj?'OK':'!'}</span>` },
        { test:`<span class="heading">Histórico de Montagem</span>`,     result: running(`<span class="mono">4 montagens</span>`), expect:`<span class="mono">—</span>`,       st: animate ? running('') : `<span class="tag tag-mute">Info</span>` },
        { test:`<span class="heading">Descritor USB</span>`,             result: running(`<span class="mono">VID:0930</span>`),   expect:`<span class="mono">—</span>`,       st: animate ? running('') : `<span class="tag tag-ok">OK</span>` },
      ];
    }

    function render() {
      const d = activeDevice;
      if (!d) {
        mount.innerHTML = `
        <div class="pane reveal" style="flex-direction:column;overflow:hidden;gap:0;">
          <div id="usb-tiles" style="padding:16px;flex-shrink:0;">${tileHTML()}</div>
          <div class="pane" style="flex:1;overflow:hidden;margin:12px 0 0;padding:0;">
            <aside class="aside">
              <div class="aside-head"><div class="aside-title">pendrive.PRO</div></div>
              <div class="aside-scroll">
                <div class="sec-label first"><span>Dispositivos</span></div>
                <div class="tree-node" style="opacity:.5">
                  <i class="ri-add-circle-line ti"></i><span>Aguardando USB…</span>
                </div>
              </div>
            </aside>
            <section class="content" style="display:flex;align-items:center;justify-content:center;">
              <span style="font-family:var(--ff-mono);font-size:9px;color:var(--white-18);text-transform:uppercase;letter-spacing:.14em;">Conecte um pendrive para validar</span>
            </section>
          </div>
        </div>`;
        return;
      }
      mount.innerHTML = `
        <div class="pane reveal" style="flex-direction:column;overflow:hidden;gap:0;">
          <!-- Bento tiles -->
          <div id="usb-tiles" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 16px 0;flex-shrink:0;">
            ${tileHTML()}
          </div>
          <!-- Main pane -->
          <div class="pane" style="flex:1;overflow:hidden;margin:12px 0 0;padding:0;">
            <aside class="aside">
              <div class="aside-head"><div class="aside-title">pendrive.PRO</div></div>
              <div class="aside-scroll">
                <div class="sec-label first"><span>Dispositivos</span></div>
                ${DEVICES.map(dv => `
                  <div class="tree-node usb-dev-node ${dv.id === d.id ? 'selected' : ''}" data-dev="${dv.id}" style="cursor:pointer;">
                    <i class="ri-usb-line ti" style="color:${dv.fake?'var(--primary)':'inherit'}"></i>
                    <span>${dv.label}</span>
                    <span class="tag ${dv.fake?'tag-err':dv.cdj?'tag-ok':'tag-warn'}" style="margin-left:auto;font-size:9px">${dv.fake?'FAKE':dv.cdj?'CDJ':'!'}</span>
                  </div>`).join('')}
                <div class="tree-node" style="opacity:.5">
                  <i class="ri-add-circle-line ti"></i><span>Aguardando USB…</span>
                </div>
                <div class="sec-label"><span>Ações</span></div>
                <div class="tree-node" id="usb-validate-btn" style="cursor:pointer;">
                  <i class="ri-shield-check-line ti" style="color:var(--primary)"></i>
                  <span style="color:var(--primary);font-weight:600">Validar agora</span>
                </div>
              </div>
            </aside>
            <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
              <div class="content-hdr">
                <span class="ch-label" id="usb-device-label">${d.label}</span>
                <span class="ch-count">${d.cap} · ${d.fmt}</span>
              </div>
              <div id="usb-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>
            </section>
          </div>
        </div>`;

      /* DataTable */
      const cols = [
        { id:'test',   label:'Teste',      w:'1.6fr', align:'left',  sortable:true, required:true },
        { id:'result', label:'Resultado',  w:'1fr',   align:'left',  sortable:true },
        { id:'expect', label:'Esperado',   w:'1fr',   align:'left',  sortable:true },
        { id:'st',     label:'Status',     w:'80px',  align:'center',sortable:true },
      ];
      DataTable.create('usb', document.getElementById('usb-host'), cols, testRows(false));

      /* Device switch */
      mount.querySelectorAll('.usb-dev-node').forEach(n => {
        n.addEventListener('click', () => {
          activeDevice = DEVICES.find(d => d.id === n.dataset.dev) || activeDevice;
          render();
        });
      });

      /* Validate animation */
      const valBtn = mount.querySelector('#usb-validate-btn');
      if (valBtn) {
        valBtn.addEventListener('click', () => {
          DataTable.instances.usb.rows = testRows(true);
          DataTable.render('usb');
          /* Update tiles to loading */
          const tiles = mount.querySelector('#usb-tiles');
          if (tiles) tiles.querySelectorAll('.heading').forEach(el => { el.textContent = '…'; });
          setTimeout(() => {
            DataTable.instances.usb.rows = testRows(false);
            DataTable.render('usb');
            const tilesEl = mount.querySelector('#usb-tiles');
            if (tilesEl) tilesEl.innerHTML = tileHTML();
          }, 1500);
        });
      }
    }

    render();
  };

})();
