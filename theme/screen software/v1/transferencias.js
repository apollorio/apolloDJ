/* transferencias.js — Coletânea / Transferências — live Collab P2P download queue */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  const api = () => (window.pywebview && window.pywebview.api) || null;
  let _pollId = null;
  let _mount = null;
  let _view = 'downloading';
  let _lastRows = [];

  function toast(msg, opts) {
    if (window.App && typeof App.toast === 'function') App.toast(msg, opts);
  }

  function fmtSize(b) {
    const n = Number(b) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    return (n / 1e3).toFixed(0) + ' KB';
  }

  function bar(pct) {
    const p = Math.max(0, Math.min(100, pct));
    const col = p === 100 ? '#16a34a' : 'var(--ac, #e8820c)';
    return (
      '<div style="display:flex;align-items:center;gap:8px;width:100%">' +
        '<div style="flex:1;height:3px;background:var(--white-4);border-radius:99px;overflow:hidden">' +
          '<div style="width:' + p + '%;height:100%;background:' + col + ';border-radius:99px"></div>' +
        '</div>' +
        '<span class="mono" style="font-size:10px;color:var(--gray-1);min-width:32px;text-align:right">' + p + '%</span>' +
      '</div>'
    );
  }

  function mapStatus(s) {
    const x = String(s || '').toLowerCase();
    if (x === 'done' || x.includes('finish') || x.includes('complete')) return 'done';
    if (x === 'queued') return 'paused';
    if (x === 'error' || x.includes('fail')) return 'failed';
    return 'downloading';
  }

  function filterRows(rows) {
    if (_view === 'downloading') return rows.filter((r) => r._bucket === 'downloading');
    if (_view === 'paused') return rows.filter((r) => r._bucket === 'paused');
    if (_view === 'done') return rows.filter((r) => r._bucket === 'done');
    if (_view === 'failed') return rows.filter((r) => r._bucket === 'failed');
    return rows;
  }

  function normalizeDownloads(raw) {
    return (raw || []).map((d, i) => {
      const size = Number(d.size_bytes) || 0;
      const done = Number(d.bytes_done) || (d._bucket === 'done' ? size : 0);
      const pct = size ? Math.round((done / size) * 100) : 0;
      const bucket = mapStatus(d.status);
      return {
        filename: d.filename || d.full_path || '—',
        username: d.username || '—',
        size_bytes: size,
        pct: pct,
        _bucket: bucket,
        status: d.status,
        _idx: i,
      };
    });
  }

  function renderTable() {
    const host = _mount && _mount.querySelector('#trans-host');
    if (!host) return;
    const filtered = filterRows(_lastRows);
    const countEl = _mount.querySelector('#trans-count');
    if (countEl) countEl.textContent = filtered.length + ' na fila';

    const cols = [
      { id: 'name', label: 'Arquivo', w: '2fr', align: 'left', sortable: true, required: true },
      { id: 'src', label: 'Origem', w: '1fr', align: 'left', sortable: true },
      { id: 'sz', label: 'Tamanho', w: '80px', align: 'right', sortable: true },
      { id: 'pr', label: 'Progresso', w: '140px', align: 'left', sortable: true },
      { id: 'st', label: 'Status', w: '80px', align: 'center' },
    ];

    const dtRows = filtered.map((r) => ({
      name: '<span class="heading">' + r.filename + '</span>',
      src: '<span class="mono">' + r.username + '</span>',
      sz: '<span class="mono">' + fmtSize(r.size_bytes) + '</span>',
      pr: bar(r.pct),
      st: '<span class="tag ' + (r._bucket === 'done' ? 'tag-ok' : 'tag-mute') + '">' + r._bucket + '</span>',
    }));

    if (typeof DataTable !== 'undefined') {
      DataTable.create('trans', host, cols, dtRows);
    }
  }

  function pollDownloads() {
    const a = api();
    if (!a || typeof a.nicotine_get_downloads !== 'function') {
      _lastRows = [];
      renderTable();
      return;
    }
    a.nicotine_get_downloads()
      .then((raw) => {
        const prevDone = _lastRows.filter((r) => r._bucket === 'done').length;
        _lastRows = normalizeDownloads(Array.isArray(raw) ? raw : []);
        const nowDone = _lastRows.filter((r) => r._bucket === 'done').length;
        if (nowDone > prevDone) {
          toast('Download concluído — ingest automático na Coletânea', {
            variant: 'success',
            sub: 'Pipeline BPM · Key',
          });
        }
        renderTable();
      })
      .catch(() => {});
  }

  function startPoll() {
    stopPoll();
    pollDownloads();
    _pollId = setInterval(pollDownloads, 3000);
  }

  function stopPoll() {
    if (_pollId) {
      clearInterval(_pollId);
      _pollId = null;
    }
  }

  ApolloPages.transferencias = function (mount) {
    _mount = mount;
    _view = 'downloading';

    mount.innerHTML =
      '<div class="pane reveal">' +
        '<aside class="aside">' +
          '<div class="aside-head"><div class="aside-title">Filas</div></div>' +
          '<div class="aside-scroll">' +
            '<div class="tree-node selected" data-trans-view="downloading"><i class="ri-download-2-line ti"></i><span>Em download</span></div>' +
            '<div class="tree-node" data-trans-view="paused"><i class="ri-pause-line ti"></i><span>Pausados</span></div>' +
            '<div class="tree-node" data-trans-view="done"><i class="ri-check-line ti"></i><span>Concluídos</span></div>' +
            '<div class="tree-node" data-trans-view="failed"><i class="ri-close-circle-line ti"></i><span>Falharam</span></div>' +
          '</div>' +
        '</aside>' +
        '<section class="content" style="display:flex;flex-direction:column;overflow:hidden;">' +
          '<div class="content-hdr" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">' +
            '<span class="ch-label">TRANSFERÊNCIAS</span>' +
            '<span class="ch-count" id="trans-count">0 na fila</span>' +
            '<button type="button" class="btn-ghost btn-sm" id="trans-goto-colab" style="margin-left:auto;"><i class="ri-search-2-line"></i> Buscar em Collab</button>' +
            '<button type="button" class="btn-primary" id="trans-pause-all" style="flex-shrink:0;"><i class="ri-pause-line"></i> Pausar tudo</button>' +
          '</div>' +
          '<p style="padding:0 16px 8px;margin:0;font-size:11px;color:var(--tx2);line-height:1.5;">Busca P2P só em <strong>Collab.share</strong>. Aqui você acompanha downloads; ao concluir, o ingest renomeia e envia para Coletânea.</p>' +
          '<div id="trans-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>' +
        '</section>' +
      '</div>';

    mount.querySelectorAll('.tree-node[data-trans-view]').forEach((n) => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node[data-trans-view]').forEach((x) => x.classList.remove('selected'));
        n.classList.add('selected');
        _view = n.dataset.transView;
        renderTable();
      });
    });

    const gotoColab = mount.querySelector('#trans-goto-colab');
    if (gotoColab) {
      gotoColab.addEventListener('click', () => {
        if (window.App) App.goTo('coletanea', 'colab');
      });
    }

    const pauseAll = mount.querySelector('#trans-pause-all');
    if (pauseAll) {
      pauseAll.addEventListener('click', () => {
        try {
          const a = api();
          if (a && typeof a.nicotine_pause_all === 'function') a.nicotine_pause_all();
        } catch (e) {}
        toast('Downloads pausados', { variant: 'info' });
      });
    }

    startPoll();
    renderTable();
  };

  ApolloPages.transferencias.cleanup = function () {
    stopPoll();
    _mount = null;
    _lastRows = [];
  };
})();
