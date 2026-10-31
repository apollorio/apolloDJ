/**
 * apolloDJ v3 — runtime patches (loaded only by apolloDJ.v3.html).
 * @fc id=FC-S5-V3PATCH stage=5 mermaid=UI source=FINAL_FLOWCHART.md
 * @fc wraps DataTable.render · row ctx FC-S6 · biblioteca DnD FC-S6
 */
(function () {
  'use strict';

  window.__APOLLO_V3__ = true;

  function auditApolloPages() {
    var cfg = window.__APOLLO_CONFIG__;
    if (!cfg || !cfg.tabs) return;
    var missing = [];
    cfg.tabs.forEach(function (tab) {
      tab.subtabs.forEach(function (sub) {
        if (!window.ApolloPages || typeof window.ApolloPages[sub.page] !== 'function') {
          missing.push(tab.id + '/' + sub.id + ' → ' + sub.page);
        }
      });
    });
    if (missing.length) {
      console.warn('[apolloDJ v3] ApolloPages missing: ' + missing.join('; '));
    }
  }

  window.V3Patches = window.V3Patches || {};

  V3Patches.syncBiblioRowIdx = function () {
    var inst = window.DataTable && DataTable.instances.biblio;
    if (!inst || !inst.rows) return;
    var n = inst.rows.length;
    if (!inst._rowIdx || inst._rowIdx.length !== n) {
      inst._rowIdx = [];
      for (var i = 0; i < n; i++) inst._rowIdx[i] = i;
    }
  };

  V3Patches.fixBibliotecaTreeDom = function () {
    var aside = document.querySelector('#main .aside');
    if (aside && aside.id !== 'dj-sidebar') {
      aside.id = 'dj-sidebar';
    }
    document.querySelectorAll('.tree-group-child .indent-1, .tree-group-child .indent-2').forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll('.tree-node[data-view^="playlist-"]').forEach(function (n) {
      n.classList.add('target-playlist');
      n.dataset.drop = 'playlist';
    });
    document.querySelectorAll('.tree-group-hdr i:not(.tia)').forEach(function (ic) {
      if (!ic.classList.contains('ti')) ic.classList.add('ti');
    });
  };

  V3Patches.afterDataTableRender = function (id) {
    if (id === 'biblio') {
      V3Patches.syncBiblioRowIdx();
      V3Patches.fixBibliotecaTreeDom();
      if (window.BibliotecaDnD && typeof BibliotecaDnD.bindRows === 'function') {
        BibliotecaDnD.bindRows();
      }
    }
  };

  function rowCtxEl() {
    return document.getElementById('row-ctx-v3');
  }

  function playlistNodes() {
    return Array.prototype.slice.call(document.querySelectorAll('.tree-node.target-playlist[data-view^="playlist-"]'));
  }

  function biblioTrackIndex(row) {
    var dt = document.getElementById('dt-biblio');
    if (!dt || !row) return 0;
    var rows = dt.querySelectorAll('.dt-row');
    var rowIndex = Array.prototype.indexOf.call(rows, row);
    if (rowIndex < 0) rowIndex = 0;
    var inst = window.DataTable && DataTable.instances.biblio;
    if (inst && inst._rowIdx && inst._rowIdx[rowIndex] !== undefined) {
      return inst._rowIdx[rowIndex];
    }
    return rowIndex;
  }

  var _ctxFlyout = null;

  function closePlaylistFlyout() {
    if (_ctxFlyout) {
      _ctxFlyout.hidden = true;
      _ctxFlyout.innerHTML = '';
    }
  }

  function openPlaylistFlyout(anchor, plItems) {
    if (!_ctxFlyout) {
      _ctxFlyout = document.createElement('div');
      _ctxFlyout.id = 'ctx-pl-flyout';
      _ctxFlyout.className = 'ctx ctx-flyout-pl';
      _ctxFlyout.hidden = true;
      document.body.appendChild(_ctxFlyout);
    }
    _ctxFlyout.innerHTML = plItems || '<div class="ctx-item muted">Nenhuma playlist</div>';
    _ctxFlyout.hidden = false;
    var ar = anchor.getBoundingClientRect();
    var fw = Math.min(240, window.innerWidth - 16);
    var fh = Math.min(320, window.innerHeight - 16);
    _ctxFlyout.style.width = fw + 'px';
    _ctxFlyout.style.maxHeight = fh + 'px';
    var left = ar.right + 4;
    if (left + fw > window.innerWidth - 8) left = ar.left - fw - 4;
    _ctxFlyout.style.left = Math.max(8, left) + 'px';
    _ctxFlyout.style.top = Math.min(ar.top, window.innerHeight - fh - 8) + 'px';
  }

  V3Patches.openBibliotecaRowCtx = function (row, x, y) {
    var ctx = rowCtxEl();
    if (!ctx) return;
    closePlaylistFlyout();
    var idx = biblioTrackIndex(row);
    var tr = (window.T || [])[idx];
    var title = tr ? (tr.title || 'Faixa') : 'Faixa ' + (idx + 1);

    var plItems = playlistNodes().map(function (n) {
      var key = n.dataset.view || '';
      var lab = (n.textContent || '').replace(/\s+/g, ' ').trim() || key;
      return '<div class="ctx-item row-ctx-act" data-act="addpl" data-pl="' + key.replace(/"/g, '&quot;') + '" data-idx="' + idx + '"><i class="ri-play-list-line" style="opacity:.55"></i><span style="overflow:hidden;text-overflow:ellipsis">' + lab + '</span></div>';
    }).join('');

    ctx.innerHTML =
      '<div class="ctx-head">' + title + '</div>' +
      '<div class="ctx-item row-ctx-act" data-act="d1" data-idx="' + idx + '"><i class="ri-disc-fill" style="opacity:.75"></i>Carregar no Deck 1</div>' +
      '<div class="ctx-item row-ctx-act" data-act="d2" data-idx="' + idx + '"><i class="ri-disc-fill" style="opacity:.75"></i>Carregar no Deck 2</div>' +
      '<div class="ctx-item row-ctx-act" data-act="wf" data-idx="' + idx + '"><i class="ri-sound-module-fill" style="opacity:.75"></i>Waveform</div>' +
      '<div class="ctx-item row-ctx-act" data-act="an" data-idx="' + idx + '"><i class="ri-bar-chart-box-line" style="opacity:.75"></i>Analisar track</div>' +
      '<div class="ctx-item ctx-has-sub row-ctx-sub" id="ctx-add-pl-trigger" data-idx="' + idx + '">' +
        '<span><i class="ri-play-list-add-line" style="opacity:.75;margin-right:8px"></i>Adicionar à playlist</span>' +
        '<i class="ri-arrow-right-s-line ctx-sub-chevron"></i></div>' +
      '<div class="ctx-item row-ctx-act" data-act="det" data-idx="' + idx + '"><i class="ri-information-line" style="opacity:.75"></i>Detalhes</div>';

    ctx._plItemsHtml = plItems;
    ctx._plIdx = idx;

    var cw = Math.min(260, window.innerWidth - 20);
    ctx.style.left = Math.min(x, window.innerWidth - cw - 10) + 'px';
    ctx.style.top = Math.min(y, window.innerHeight - 360) + 'px';
    ctx.classList.add('show');

    function close() {
      ctx.classList.remove('show');
      closePlaylistFlyout();
    }

    var sub = ctx.querySelector('#ctx-add-pl-trigger');
    if (sub) {
      sub.addEventListener('mouseenter', function () {
        openPlaylistFlyout(sub, ctx._plItemsHtml);
      });
      sub.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openPlaylistFlyout(sub, ctx._plItemsHtml);
      });
    }

    ctx.onclick = function (ev) {
      var el = ev.target.closest('.row-ctx-act');
      if (!el) return;
      ev.stopPropagation();
      var act = el.dataset.act;
      var i = parseInt(el.dataset.idx, 10);
      if (isNaN(i)) i = idx;
      close();
      if (act === 'd1' && window.loadTrackToDeck) loadTrackToDeck(1, i);
      if (act === 'd2' && window.loadTrackToDeck) loadTrackToDeck(2, i);
      if (act === 'wf') {
        if (window.loadTrackToDeck) loadTrackToDeck(1, i);
        if (window.App) App.goTo('extra', 'waveform');
      }
      if (act === 'an') {
        if (window.App) App.goTo('coletanea', 'analisador');
        setTimeout(function () {
          if (window.ApolloState) ApolloState.dispatch('analisador:load', { idx: i, track: (window.T || [])[i] });
        }, 100);
      }
      if (act === 'addpl') {
        var pk = el.dataset.pl || '';
        if (window.BibliotecaDnD && typeof BibliotecaDnD.addTrackToPlaylist === 'function') {
          BibliotecaDnD.addTrackToPlaylist(pk, i);
        }
        if (window.App) App.toast('Adicionado à ' + (pk || 'playlist'));
      }
      if (act === 'det') {
        var t = (window.T || [])[i];
        if (window.App && t) {
          App.toast(t.title + ' — ' + t.artist + ' · ' + t.bpm + ' BPM');
        } else if (window.App) App.toast('Faixa #' + (i + 1));
      }
    };

    if (_ctxFlyout) {
      _ctxFlyout.onclick = function (ev) {
        var el = ev.target.closest('.row-ctx-act');
        if (!el || el.dataset.act !== 'addpl') return;
        ev.stopPropagation();
        var i = parseInt(el.dataset.idx, 10);
        if (isNaN(i)) i = ctx._plIdx;
        var pk = el.dataset.pl || '';
        close();
        if (window.BibliotecaDnD && typeof BibliotecaDnD.addTrackToPlaylist === 'function') {
          BibliotecaDnD.addTrackToPlaylist(pk, i);
        }
        if (window.App) App.toast('Adicionado à ' + (pk || 'playlist'));
      };
    }
  };

  document.addEventListener('click', function (e) {
    var ctx = rowCtxEl();
    if (ctx && !ctx.contains(e.target) && (!_ctxFlyout || !_ctxFlyout.contains(e.target))) {
      ctx.classList.remove('show');
      closePlaylistFlyout();
    }
  });

  document.addEventListener('contextmenu', function (e) {
    var row = e.target.closest('#dt-biblio .dt-row');
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    V3Patches.openBibliotecaRowCtx(row, e.pageX, e.pageY);
  }, true);

  if (window.DataTable && !DataTable.__v3CreatePatched) {
    DataTable.__v3CreatePatched = true;
    var _create = DataTable.create.bind(DataTable);
    DataTable.create = function (id, host, spec, rows, opts) {
      opts = opts || {};
      if (id === 'collab') {
        opts = Object.assign({ compact: true }, opts);
      }
      return _create(id, host, spec, rows, opts);
    };
  }

  if (window.DataTable && !DataTable.__v3RenderPatched) {
    DataTable.__v3RenderPatched = true;
    var _render = DataTable.render.bind(DataTable);
    DataTable.render = function (id) {
      _render(id);
      if (window.V3Patches && typeof V3Patches.afterDataTableRender === 'function') {
        V3Patches.afterDataTableRender(id);
      }
    };
  }

  if (window.ApolloPages && ApolloPages.coletaneaLib && !ApolloPages.__v3ColetPatched) {
    ApolloPages.__v3ColetPatched = true;
    var _colet = ApolloPages.coletaneaLib;
    ApolloPages.coletaneaLib = function (mount) {
      _colet(mount);
      V3Patches.fixBibliotecaTreeDom();
      if (window.BibliotecaDnD && typeof BibliotecaDnD.bindRows === 'function') {
        setTimeout(function () { BibliotecaDnD.bindRows(); }, 0);
      }
    };
  }

  if (window.App && !App.__v3AfterRender) {
    App.__v3AfterRender = true;
    var _renderPage = App._renderPage.bind(App);
    App._renderPage = function () {
      _renderPage();
      if (App.state.tab === 'coletanea' && App.state.sub === 'biblioteca') {
        setTimeout(function () {
          if (window.V3Patches) V3Patches.fixBibliotecaTreeDom();
          if (window.BibliotecaDnD) BibliotecaDnD.bindRows();
        }, 50);
      }
    };
  }

  if (window.ApolloState && !window.__v3DeckPlayingBadge) {
    window.__v3DeckPlayingBadge = true;
    function refreshBiblioPlaying() {
      var inst = window.DataTable && DataTable.instances.biblio;
      if (!inst || !inst._rowIdx || typeof window.trackRows !== 'function') return;
      inst.rows = inst._rowIdx.map(function (gi, i) {
        var fresh = window.trackRows([gi])[0];
        return fresh ? Object.assign({}, inst.rows[i] || {}, fresh) : inst.rows[i];
      });
      DataTable.render('biblio');
    }
    ApolloState.subscribe('deck:play', refreshBiblioPlaying);
    ApolloState.subscribe('deck:highlight', refreshBiblioPlaying);
  }

  auditApolloPages();

  /* ── Atalhos de teclado globais (Remark 01) ──────────────────────────────
   * Ativos apenas quando o shell está visível (não durante login/splash).
   * Todos os atalhos são silenciosos se não houver seleção ativa.
   *
   * Tabela de atalhos (pt-BR):
   *  Delete / Backspace  — Excluir faixa(s) selecionada(s) da biblioteca
   *  Enter               — Carregar faixa selecionada no Deck 1
   *  Espaço              — Play/Pause deck ativo
   *  F2                  — Renomear faixa selecionada (abre editor de tags)
   *  Escape              — Fechar menu de contexto / modal aberto
   *  ArrowUp / ArrowDown — Navegar faixas na tabela da biblioteca
   *  Ctrl+A              — Selecionar todas as faixas visíveis
   *  Ctrl+F              — Focar campo de busca da biblioteca
   * ──────────────────────────────────────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    // Nunca interceptar quando o foco está em input/textarea/select/contenteditable
    var tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
    var editable = e.target && (e.target.isContentEditable || e.target.contentEditable === 'true');
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) return;

    // Shell precisa estar visível
    var shell = document.getElementById('shell');
    if (!shell || shell.style.opacity === '0' || shell.style.pointerEvents === 'none') return;

    var key = e.key;

    // ── Escape — fechar menu de contexto / modal ──────────────────────────
    if (key === 'Escape') {
      var ctx = document.getElementById('row-ctx-v3') || document.getElementById('ctx');
      if (ctx) ctx.classList.remove('show');
      var ctxFly = document.getElementById('ctx-pl-flyout');
      if (ctxFly) { ctxFly.hidden = true; ctxFly.innerHTML = ''; }
      return;
    }

    // ── Ctrl+F — focar campo de busca ─────────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'f') {
      var searchInp = document.getElementById('aside-search-inp')
                   || document.getElementById('colab-track-search');
      if (searchInp) { e.preventDefault(); searchInp.focus(); searchInp.select(); }
      return;
    }

    // ── Helpers de linha selecionada na biblioteca ────────────────────────
    function selectedBiblioRow() {
      var dt = document.getElementById('dt-biblio');
      return dt ? dt.querySelector('.dt-row.selected') : null;
    }
    function selectedBiblioIdx() {
      var row = selectedBiblioRow();
      if (!row) return -1;
      if (window.DataTable && DataTable.instances.biblio) {
        var rows = document.getElementById('dt-biblio').querySelectorAll('.dt-row');
        var ri = Array.prototype.indexOf.call(rows, row);
        var inst = DataTable.instances.biblio;
        return (inst._rowIdx && inst._rowIdx[ri] !== undefined) ? inst._rowIdx[ri] : ri;
      }
      return -1;
    }
    function selectBiblioRow(delta) {
      var dt = document.getElementById('dt-biblio');
      if (!dt) return;
      var rows = dt.querySelectorAll('.dt-row');
      if (!rows.length) return;
      var cur = dt.querySelector('.dt-row.selected');
      var curIdx = cur ? Array.prototype.indexOf.call(rows, cur) : -1;
      var next = Math.max(0, Math.min(rows.length - 1, curIdx + delta));
      rows.forEach(function (r) { r.classList.remove('selected'); });
      rows[next].classList.add('selected');
      rows[next].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    // ── Delete / Backspace — excluir faixa selecionada ────────────────────
    if (key === 'Delete' || key === 'Backspace') {
      var idx = selectedBiblioIdx();
      if (idx < 0) return;
      e.preventDefault();
      var track = (window.T || [])[idx];
      var label = track ? (track.title || 'faixa #' + (idx + 1)) : 'faixa #' + (idx + 1);
      // Confirmação em pt-BR antes de excluir
      if (!window.confirm('Excluir "' + label + '" da biblioteca?\nEssa ação não pode ser desfeita.')) return;
      if (window.pywebview && window.pywebview.api && typeof window.pywebview.api.delete_track === 'function') {
        window.pywebview.api.delete_track(idx).then(function (r) {
          if (r && r.ok !== false) {
            if (window.App) App.toast('Faixa excluída — ' + label);
            if (window.DataTable && DataTable.instances.biblio) {
              DataTable.instances.biblio.rows.splice(idx, 1);
              DataTable.render('biblio');
            }
          } else {
            if (window.App) App.toast('Erro ao excluir faixa.');
          }
        }).catch(function () { if (window.App) App.toast('Erro ao excluir faixa.'); });
      } else {
        // Preview HTTP — simular remoção visual
        if (window.DataTable && DataTable.instances.biblio) {
          DataTable.instances.biblio.rows.splice(idx, 1);
          DataTable.render('biblio');
        }
        if (window.App) App.toast('Excluir: ' + label + ' (bridge indisponível em preview)');
      }
      return;
    }

    // ── Enter — carregar faixa selecionada no Deck 1 ──────────────────────
    if (key === 'Enter') {
      var eIdx = selectedBiblioIdx();
      if (eIdx < 0) return;
      e.preventDefault();
      if (window.loadTrackToDeck) loadTrackToDeck(1, eIdx);
      if (window.App) {
        var t = (window.T || [])[eIdx];
        App.toast('Carregado no Deck 1 — ' + (t ? (t.title || 'faixa') : 'faixa'));
      }
      return;
    }

    // ── Espaço — play/pause deck ativo ────────────────────────────────────
    if (key === ' ') {
      e.preventDefault();
      if (window.ApolloState) ApolloState.dispatch('deck:toggle-play', {});
      else if (window.App) App.toast('Play/Pause (bridge indisponível)');
      return;
    }

    // ── F2 — editor de tags ───────────────────────────────────────────────
    if (key === 'F2') {
      var f2Idx = selectedBiblioIdx();
      if (f2Idx < 0) return;
      e.preventDefault();
      if (window.App) App.goTo('extra', 'editor-tags');
      if (window.ApolloState) {
        setTimeout(function () {
          ApolloState.dispatch('editor-tags:load', { idx: f2Idx, track: (window.T || [])[f2Idx] });
        }, 120);
      }
      return;
    }

    // ── ArrowUp / ArrowDown — navegar faixas ─────────────────────────────
    if (key === 'ArrowUp') { e.preventDefault(); selectBiblioRow(-1); return; }
    if (key === 'ArrowDown') { e.preventDefault(); selectBiblioRow(1); return; }

    // ── Ctrl+A — selecionar tudo ──────────────────────────────────────────
    if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'a') {
      var dtEl = document.getElementById('dt-biblio');
      if (!dtEl) return;
      e.preventDefault();
      dtEl.querySelectorAll('.dt-row').forEach(function (r) { r.classList.add('selected'); });
      if (window.App) App.toast('Todas as faixas selecionadas');
      return;
    }
  });
})();
