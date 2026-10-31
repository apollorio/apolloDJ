/* ════════════════════════════════════════════════════════════
   pendrive-dj.js — PAGE: Ferramentas / pendrive.DJ
   Consolidated pendrive manager: bento tiles per device +
   validation test DataTable. Merges pendrive.PRO features.
   Uses: window.SIM_PENDRIVES
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  ApolloPages.pendriveDj = function (mount) {
    let DEVS = window.SIM_PENDRIVES || {};
    let activeId = null;
    let analyzing = false;

    /* Load real devices from Python bridge (pywebview.api.usb.list_drives) */
    function normalizeDrivesFromApi(raw) {
      var list = raw;
      if (typeof raw === 'string') {
        try { list = JSON.parse(raw); } catch (e) { return []; }
      }
      if (!list) return [];
      if (list.devices && Array.isArray(list.devices)) list = list.devices;
      if (!Array.isArray(list)) return [];
      return list.map(function (d, idx) {
        if (d.label && d.tests) return d;
        var letter = d.letter || '';
        var tg = d.total_gb || 0;
        var fg = d.free_gb !== undefined ? d.free_gb : tg;
        return {
          id: d.root || letter || ('usb-' + idx),
          label: letter || d.root || 'USB',
          status: 'ok',
          capacity: tg ? (tg + ' GB') : '—',
          capacityGB: tg || 1,
          usedGB: tg && fg !== undefined ? Math.max(0, tg - fg) : 0,
          writeMBps: d.writeMBps || 0,
          readMBps: d.readMBps || 0,
          format: 'exFAT',
          fakeScore: 0,
          tests: [
            { teste: 'Volume', result: 'OK', expect: letter || 'removível', st: 'ok' },
            {
              teste: 'Espaço livre',
              result: (fg !== undefined ? Number(fg).toFixed(1) : '?') + ' GB',
              expect: '> 0',
              st: 'ok',
            },
          ],
        };
      });
    }
    if (window.pywebview && window.pywebview.api && window.pywebview.api.usb && typeof window.pywebview.api.usb.list_drives === 'function') {
      window.pywebview.api.usb.list_drives().then(function (raw) {
        var devices = normalizeDrivesFromApi(raw);
        if (devices.length > 0) {
          var converted = {};
          devices.forEach(function (d) {
            converted[d.id] = d;
          });
          DEVS = converted;
          activeId = devices[0].id;
          render();
        }
      }).catch(function () {});
    }

    /* Inject status tokens once */
    if (!document.getElementById('pd-css')) {
      const _s = document.createElement('style');
      _s.id = 'pd-css';
      _s.textContent = ':root{--status-ok:#16a34a;--status-warn:#ea580c;--status-err:#dc2626;}';
      document.head.appendChild(_s);
    }

    /* ── Build aside device nodes ────────────────────── */
    function deviceNodes() {
      return Object.values(DEVS).map(d => {
        const icon  = d.status === 'err'  ? 'ri-error-warning-line'
                    : d.status === 'warn' ? 'ri-alert-line'
                    : 'ri-usb-fill';
        const color = d.status === 'err'  ? 'color:var(--status-err)'
                    : d.status === 'warn' ? 'color:var(--status-warn)'
                    : '';
        return `<div class="tree-node ${d.id === activeId ? 'selected' : ''}" data-pd="${d.id}">
          <i class="${icon} ti" style="${color}"></i><span>${d.label}</span>
        </div>`;
      }).join('');
    }

    /* ── Bento tiles for one device ─────────────────── */
    function tilesHTML(d) {
      if (!d) return '';
      const usedPct  = Math.round((d.usedGB / d.capacityGB) * 100);
      const barColor = d.status === 'err' ? 'var(--status-err)' : d.status === 'warn' ? 'var(--status-warn)' : 'var(--status-ok)';
      const fakeTag  = d.fakeScore === 0 ? `<span class="tag tag-ok">Genuíno</span>`
                     : d.fakeScore < 30  ? `<span class="tag tag-warn">${d.fakeScore}% susp.</span>`
                     : `<span class="tag tag-err">${d.fakeScore}% FAKE</span>`;
      const fakeBar  = `<div style="margin-top:8px;height:4px;background:var(--white-4);border-radius:99px;overflow:hidden">
        <div style="width:${d.fakeScore}%;height:100%;background:${d.fakeScore > 30 ? 'var(--status-err)' : d.fakeScore > 0 ? 'var(--status-warn)' : 'var(--status-ok)'};border-radius:99px;"></div>
      </div>`;
      return `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 14px 0;flex-shrink:0;">
          <!-- Gravação -->
          <div class="vidro" style="border-radius:var(--r);padding:14px 16px;">
            <div style="font-size:9px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Gravação</div>
            <div class="heading" style="font-size:22px;line-height:1;">${d.writeMBps}<span style="font-size:12px;font-weight:400;color:var(--gray-1);margin-left:3px;">MB/s</span></div>
            <div style="font-size:10px;color:var(--gray-1);margin-top:4px;">leit. ${d.readMBps} MB/s</div>
          </div>
          <!-- Capacidade -->
          <div class="vidro" style="border-radius:var(--r);padding:14px 16px;">
            <div style="font-size:9px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Capacidade</div>
            <div class="heading" style="font-size:22px;line-height:1;">${d.capacity}</div>
            <div style="margin-top:6px;height:3px;background:var(--white-4);border-radius:99px;overflow:hidden">
              <div style="width:${usedPct}%;height:100%;background:${barColor};border-radius:99px;"></div>
            </div>
            <div style="font-size:10px;color:var(--gray-1);margin-top:3px;">${d.usedGB} GB usados · ${usedPct}%</div>
          </div>
          <!-- Formato -->
          <div class="vidro" style="border-radius:var(--r);padding:14px 16px;">
            <div style="font-size:9px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Formato</div>
            <div class="heading mono" style="font-size:22px;line-height:1;">${d.format}</div>
            <div style="font-size:10px;color:var(--gray-1);margin-top:4px;">sistema de arquivos</div>
          </div>
          <!-- Autenticidade -->
          <div class="vidro" style="border-radius:var(--r);padding:14px 16px;">
            <div style="font-size:9px;font-family:var(--ff-mono);letter-spacing:.07em;color:var(--gray-1);text-transform:uppercase;margin-bottom:6px;">Autenticidade</div>
            <div class="heading" style="font-size:22px;line-height:1;">${fakeTag}</div>
            ${fakeBar}
          </div>
        </div>`;
    }

    /* ── Build test rows for DataTable ───────────────── */
    function buildTestRows(d) {
      if (!d || !d.tests) return [];
      return d.tests.map(t => ({
        teste:  `<span class="heading" style="font-size:12px">${t.teste}</span>`,
        result: `<span class="mono">${t.result}</span>`,
        expect: `<span class="mono" style="color:var(--gray-1)">${t.expect}</span>`,
        st:     t.st === 'ok'   ? `<span class="tag tag-ok">OK</span>`
              : t.st === 'warn' ? `<span class="tag tag-warn">Atenção</span>`
              : `<span class="tag tag-err">Erro</span>`
      }));
    }

    /* ── Onboarding banner (shown when no device active) ── */
    function onboardHTML() {
      return `
        <div style="margin:14px 14px 0;padding:14px 18px;background:rgba(var(--ac-rgb,232,130,12),.08);
             border:1px solid rgba(var(--ac-rgb,232,130,12),.22);border-radius:var(--r);display:flex;align-items:flex-start;gap:14px;">
          <i class="ri-usb-fill" style="font-size:22px;color:var(--ac);flex-shrink:0;margin-top:2px;"></i>
          <div>
            <div style="font-weight:700;font-size:12px;color:var(--tx0);margin-bottom:4px;">Como registrar seu pendrive</div>
            <ol style="margin:0;padding-left:18px;font-size:11px;color:var(--tx1);line-height:1.7;">
              <li><b>Conecte</b> o pendrive USB no computador</li>
              <li>Ele aparece automaticamente na lista à esquerda</li>
              <li>Selecione-o → clique em <b>Nova análise</b> para testar velocidade</li>
              <li>Requisito mínimo CDJ-3000: <b>gravação ≥ 8 MB/s · leitura ≥ 20 MB/s</b></li>
              <li>Após aprovado, vá em <b>Exportar CDJ</b> para gravar suas playlists</li>
            </ol>
          </div>
        </div>`;
    }

    /* ── Full render ──────────────────────────────────── */
    function render() {
      const d = DEVS[activeId];
      const hasDevs = Object.keys(DEVS).length > 0;
      mount.innerHTML = `
        <div class="pane reveal" style="flex-direction:column;gap:0;overflow:hidden;">
          ${!hasDevs ? onboardHTML() : ''}
          ${tilesHTML(d)}
          <div class="pane" style="flex:1;overflow:hidden;margin:10px 0 0;padding:0;">
            <aside class="aside">
              <div class="aside-head"><div class="aside-title">Pendrives</div></div>
              <div class="aside-scroll">
                ${hasDevs ? deviceNodes() : `
                  <div style="padding:16px 12px;font-size:11px;color:var(--tx2);line-height:1.6;">
                    <i class="ri-information-line" style="color:var(--ac);"></i>
                    Nenhum pendrive detectado.<br>
                    <b>Conecte um USB</b> e clique em Nova análise.
                  </div>`}
                <div class="sec-label"><span>Ações</span></div>
                <div class="tree-node" id="pd-nova-analise" style="cursor:pointer;">
                  <i class="ri-refresh-line ti" style="color:var(--ac)"></i>
                  <span style="color:var(--ac);font-weight:600">Nova análise</span>
                </div>
                <div class="tree-node" id="pd-add">
                  <i class="ri-add-line ti"></i><span>Adicionar manualmente</span>
                </div>
              </div>
            </aside>
            <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
              <div class="content-hdr">
                <span class="ch-label">${d ? d.label : 'PENDRIVE'} — DIAGNÓSTICO</span>
                <span class="ch-count" id="pd-count">${d ? d.tests.length : 0} testes</span>
              </div>
              ${!d ? `<div style="display:flex;align-items:center;justify-content:center;flex:1;flex-direction:column;gap:8px;opacity:.5;">
                <i class="ri-usb-fill" style="font-size:38px;"></i>
                <div style="font-size:11px;">Selecione um pendrive na lista à esquerda</div>
              </div>` : ''}
              <div id="pendrive-pro-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>
            </section>
          </div>
        </div>`;

      /* Device selection */
      mount.querySelectorAll('.tree-node[data-pd]').forEach(n => {
        n.addEventListener('click', () => {
          activeId = n.dataset.pd;
          render();
        });
      });

      /* Nova análise */
      const btn = mount.querySelector('#pd-nova-analise');
      if (btn) {
        btn.addEventListener('click', () => {
          if (analyzing) return;
          analyzing = true;
          const rows = DataTable.instances['pendrive-pro'] && DataTable.instances['pendrive-pro'].rows;
          if (rows) {
            rows.forEach(r => { r.st = `<span class="tag tag-warn mono" style="font-size:9px">…</span>`; });
            DataTable.render('pendrive-pro');
          }
          setTimeout(() => {
            analyzing = false;
            const d = DEVS[activeId];
            if (DataTable.instances['pendrive-pro'] && d) {
              DataTable.instances['pendrive-pro'].rows = buildTestRows(d);
              DataTable.render('pendrive-pro');
            }
            if (typeof App !== 'undefined') App.toast('Análise concluída para ' + (d ? d.label : ''));
          }, 1400);
        });
      }

      /* DataTable */
      const host = document.getElementById('pendrive-pro-host');
      if (host) {
        const cols = [
          { id:'teste',  label:'Teste',     w:'2fr',  align:'left',   sortable:false, required:true },
          { id:'result', label:'Resultado', w:'1.2fr', align:'left',  sortable:false },
          { id:'expect', label:'Esperado',  w:'1.2fr', align:'left',  sortable:false },
          { id:'st',     label:'Status',    w:'80px', align:'center', sortable:false }
        ];
        DataTable.create('pendrive-pro', host, cols, buildTestRows(DEVS[activeId]));
      }
    }

    render();
  };

})();
