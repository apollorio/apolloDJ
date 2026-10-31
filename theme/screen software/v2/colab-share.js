/* colab-share.js — Coletânea / Collab P2P — search + download (apolloDJ embedded backend) */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  const api = () => (window.pywebview && window.pywebview.api) || null;

  let _results = [];
  let _selectedIdx = -1;
  let _downloading = new Set();
  let _mount = null;

  function fmtSize(b) {
    const n = Number(b) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1) + ' MB';
    return (n / 1e3).toFixed(0) + ' KB';
  }

  function toast(msg, opts) {
    if (window.App && typeof App.toast === 'function') App.toast(msg, opts);
    else if (window.ApolloToast) ApolloToast.push(msg, opts);
  }

  function normalizeRow(r, i) {
    const path = r.full_path || r.filename || '';
    const name = path.split(/[/\\]/).pop() || path;
    const ext = (r.ext || name.split('.').pop() || '').toLowerCase().replace(/^\./, '');
    return {
      id: r.id || 'row-' + i,
      username: r.username || '',
      filename: name,
      full_path: path,
      ext: ext,
      size_bytes: Number(r.size_bytes) || 0,
      speed_kbps: Number(r.speed_kbps) || 0,
      free_slots: Number(r.free_slots) || 0,
      bitrate_kbps: Number(r.bitrate_kbps) || 0,
    };
  }

  function renderCards() {
    const list = _mount && _mount.querySelector('#colab-result-list');
    if (!list) return;
    if (!_results.length) {
      list.innerHTML = '<div class="colab-empty-state">Nenhum resultado · 320kbps+</div>';
      return;
    }
    list.innerHTML = _results.map((r, i) => {
      const q = r.bitrate_kbps >= 320 ? '320k' : (r.ext === 'flac' || r.ext === 'wav' || r.ext === 'aiff' ? r.ext.toUpperCase() : '—');
      return (
        '<div class="colab-result-card' + (i === _selectedIdx ? ' selected' : '') + '" data-idx="' + i + '">' +
          '<span class="stat-dot" style="background:var(--ac);flex-shrink:0;margin-top:4px;"></span>' +
          '<div style="flex:1;min-width:0;">' +
            '<div class="colab-result-card__name">' + r.filename + '</div>' +
            '<div class="colab-result-card__meta">' + (r.username || '—') + ' · ' + fmtSize(r.size_bytes) + ' · ' + q + '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    list.querySelectorAll('.colab-result-card').forEach((card) => {
      card.addEventListener('mouseenter', () => {
        const aside = _mount.querySelector('.colab-aside');
        if (aside) aside.classList.add('colab-aside-compact');
      });
      card.addEventListener('mouseleave', () => {
        const aside = _mount.querySelector('.colab-aside');
        if (aside) aside.classList.remove('colab-aside-compact');
      });
      card.addEventListener('click', () => {
        _selectedIdx = parseInt(card.dataset.idx, 10);
        renderCards();
        renderTable();
      });
    });
  }

  function dlIconHtml(idx) {
    const key = 'dl-' + idx;
    if (_downloading.has(key)) {
      return '<i class="ri-p2p-fill colab-dl-icon is-p2p" data-dl-idx="' + idx + '" title="Baixando…"></i>';
    }
    return '<i class="ri-download-cloud-2-line colab-dl-icon" data-dl-idx="' + idx + '" style="cursor:pointer;font-size:15px;color:var(--s18);" title="Baixar"></i>';
  }

  function renderTable() {
    const host = document.getElementById('collab-host');
    if (!host) return;
    const rows = _results.length ? _results : [];
    const countEl = _mount.querySelector('#colab-ch-count');
    if (countEl) countEl.textContent = rows.length + ' resultado' + (rows.length !== 1 ? 's' : '');

    const cols = [
      { id: 'name', label: 'Arquivo', w: '3fr', align: 'left', required: true },
      { id: 'ext', label: 'FMT', w: '54px', align: 'center' },
      { id: 'size', label: 'Tamanho', w: '76px', align: 'right', sortable: true },
      { id: 'speed', label: 'Velocidade', w: '82px', align: 'right', sortable: true },
      { id: 'slots', label: 'Slots', w: '54px', align: 'center', sortable: true },
      { id: 'dl', label: '', w: '44px', align: 'center', required: true },
    ];

    const dtRows = rows.map((r, i) => ({
      name: '<span style="overflow:hidden;text-overflow:ellipsis;color:var(--tx-heading)">' + r.filename + '</span>',
      ext: '<span class="tag tag-mute">' + (r.ext || '').toUpperCase() + '</span>',
      size: '<span class="mono">' + fmtSize(r.size_bytes) + '</span>',
      speed: '<span class="mono">' + (r.speed_kbps || 0) + ' kbps</span>',
      slots: r.free_slots > 0
        ? '<span class="tag tag-ok">' + r.free_slots + '</span>'
        : '<span class="tag tag-mute">0</span>',
      dl: dlIconHtml(i),
      _idx: i,
    }));

    if (typeof DataTable !== 'undefined') {
      DataTable.create('collab', host, cols, dtRows);
      host.querySelectorAll('.colab-dl-icon').forEach((ico) => {
        ico.addEventListener('click', (e) => {
          e.stopPropagation();
          downloadAt(parseInt(ico.dataset.dlIdx, 10));
        });
      });
      host.querySelectorAll('tbody tr').forEach((tr, i) => {
        tr.addEventListener('dblclick', () => downloadAt(i));
        tr.style.cursor = 'pointer';
      });
    }
  }

  function downloadAt(idx) {
    const r = _results[idx];
    if (!r) return;
    const key = 'dl-' + idx;
    if (_downloading.has(key)) return;

    const a = api();
    if (!a || typeof a.nicotine_download !== 'function') {
      toast('Simulação: download de ' + r.filename, { variant: 'p2p' });
      _downloading.add(key);
      renderTable();
      setTimeout(() => {
        _downloading.delete(key);
        renderTable();
      }, 3000);
      return;
    }

    _downloading.add(key);
    renderTable();
    toast('Baixando…', { variant: 'p2p', sub: r.filename, persist: true });

    a.nicotine_download(JSON.stringify(r))
      .then((res) => {
        if (res && res.error) {
          toast(res.error, { variant: 'error' });
        } else {
          toast('Download na fila', {
            variant: 'p2p',
            sub: 'Acompanhe em Transferências',
          });
        }
      })
      .catch(() => toast('Erro ao baixar', { variant: 'error' }))
      .finally(() => {
        _downloading.delete(key);
        renderTable();
      });
  }

  function doSearch() {
    const inp = _mount.querySelector('#colab-track-search');
    const q = (inp && inp.value || '').trim();
    if (!q) {
      toast('Digite artista ou faixa', { variant: 'warn' });
      return;
    }
    const btn = _mount.querySelector('#colab-search-btn');
    if (btn) btn.disabled = true;
    toast('Buscando…', { variant: 'info', sub: q });

    const a = api();
    if (!a || typeof a.nicotine_search !== 'function') {
      if (btn) btn.disabled = false;
      toast('Bridge indisponível — busca P2P requer apollo::dj', { variant: 'warn' });
      _results = [];
      _selectedIdx = -1;
      renderCards();
      renderTable();
      return;
    }

    a.nicotine_search(q)
      .then((res) => {
        let rows = res;
        if (typeof rows === 'string') {
          try { rows = JSON.parse(rows); } catch (_) { rows = []; }
        }
        if (rows && rows.error) {
          toast(String(rows.error), { variant: 'error' });
          rows = [];
        }
        _results = (Array.isArray(rows) ? rows : []).map(normalizeRow);
        _selectedIdx = _results.length ? 0 : -1;
        renderCards();
        renderTable();
        if (!_results.length) {
          toast('Nenhum resultado — filtro 320kbps+', { variant: 'warn' });
        }
      })
      .catch(() => toast('Erro na busca P2P', { variant: 'error' }))
      .finally(() => { if (btn) btn.disabled = false; });
  }

  ApolloPages.colabShare = function (mount) {
    _mount = mount;
    _results = [];
    _selectedIdx = -1;
    _downloading.clear();

    mount.innerHTML =
      '<div class="pane reveal" id="colab-pane">' +
        '<aside class="aside colab-aside">' +
          '<div class="colab-search-wrap aside-head-search-only">' +
            '<label class="sec-label first" style="padding:8px 2px 4px;"><span>Buscar faixa</span></label>' +
            '<input type="text" class="colab-search-input" id="colab-track-search" placeholder="Artista ou faixa…" autocomplete="off">' +
            '<div class="colab-search-actions">' +
              '<button type="button" class="btn-primary btn-sm" id="colab-search-btn"><i class="ri-search-2-line"></i> Buscar</button>' +
            '</div>' +
          '</div>' +
          '<div class="sec-label" style="flex-shrink:0;"><span>Resultados</span><span class="sec-hint">P2P · 320+</span></div>' +
          '<div class="aside-scroll" id="colab-result-list" style="padding:0 6px;">' +
            '<div class="colab-empty-state">Busque artista ou faixa</div>' +
          '</div>' +
        '</aside>' +
        '<section class="content" style="display:flex;flex-direction:column;overflow:hidden;">' +
          '<div class="content-hdr">' +
            '<span class="ch-label" id="colab-ch-label">BUSCAR</span>' +
            '<span class="ch-count" id="colab-ch-count">0 resultados</span>' +
          '</div>' +
          '<div id="collab-host" style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;"></div>' +
        '</section>' +
      '</div>';

    const searchBtn = mount.querySelector('#colab-search-btn');
    const searchInp = mount.querySelector('#colab-track-search');
    if (searchBtn) searchBtn.addEventListener('click', doSearch);
    if (searchInp) {
      searchInp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
      });
    }

    renderTable();

    if (typeof gsap !== 'undefined') {
      gsap.to('#colab-pane', { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out' });
    }
  };

  ApolloPages.colabShare.cleanup = function () {
    _mount = null;
    _results = [];
    _downloading.clear();
  };
})();
