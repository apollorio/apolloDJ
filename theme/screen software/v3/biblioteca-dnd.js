/**
 * apolloDJ v3 — Biblioteca DnD (pointer-only).
 * Ghost = full row replica at 100% opacity; all table rows muted while dragging.
 */
(function () {
  'use strict';

  var dragState = null;
  var activeHover = null;
  var ghostEl = null;
  var popperInstance = null;
  var popperReady = false;
  var popperLoading = false;
  var popperQueue = [];
  var DRAG_THRESH = 4;
  var GHOST_OFFSET = [-13, 8]; /* ADJUSTABLE GHOST DRAGGED BEHIND CURSOR -13px right · 8px below cursor */

  var ghostVirtualRef = {
    getBoundingClientRect: function () {
      var cx = dragState && dragState.cx != null ? dragState.cx : 0;
      var cy = dragState && dragState.cy != null ? dragState.cy : 0;
      return {
        width: 0,
        height: 0,
        top: cy,
        left: cx,
        right: cx,
        bottom: cy,
        x: cx,
        y: cy
      };
    }
  };

  function popperScriptUrl() {
    if (window.__APOLLO_LOCAL_CDN__) {
      return window.__APOLLO_LOCAL_CDN__ + 'js/popper.v2.11.8.min.js';
    }
    return 'https://cdn.apollo.rio.br/v1.0.0/js/popper.v2.11.8.min.js';
  }

  function ensurePopper(cb) {
    if (window.Popper && typeof window.Popper.createPopper === 'function') {
      popperReady = true;
      cb(window.Popper);
      return;
    }
    if (typeof cb === 'function') popperQueue.push(cb);
    if (popperLoading) return;
    popperLoading = true;
    var done = function () {
      popperLoading = false;
      popperReady = !!(window.Popper && window.Popper.createPopper);
      var q = popperQueue.slice();
      popperQueue.length = 0;
      q.forEach(function (fn) {
        if (typeof fn === 'function') fn(window.Popper);
      });
    };
    if (window.Apollo && typeof window.Apollo.loadJS === 'function') {
      window.Apollo.loadJS(popperScriptUrl(), done, true);
      return;
    }
    var s = document.createElement('script');
    s.src = popperScriptUrl();
    s.async = false;
    s.onload = done;
    s.onerror = done;
    (document.head || document.documentElement).appendChild(s);
  }

  function destroyPopperGhost() {
    if (popperInstance) {
      popperInstance.destroy();
      popperInstance = null;
    }
  }

  function startPopperGhost() {
    destroyPopperGhost();
    if (!ghostEl || !dragState) return;
    ensurePopper(function (Popper) {
      if (!Popper || !ghostEl || !dragState || !dragState.active) return;
      popperInstance = Popper.createPopper(ghostVirtualRef, ghostEl, {
        placement: 'bottom-start',
        strategy: 'fixed',
        modifiers: [
          { name: 'offset', options: { offset: GHOST_OFFSET } },
          { name: 'flip', enabled: false },
          { name: 'preventOverflow', enabled: false },
          { name: 'computeStyles', options: { adaptive: false, gpuAcceleration: true } }
        ]
      });
      popperInstance.update();
    });
  }

  function placeGhostFallback(clientX, clientY) {
    if (!ghostEl) return;
    ghostEl.style.left = Math.round(clientX + GHOST_OFFSET[0]) + 'px';
    ghostEl.style.top = Math.round(clientY + GHOST_OFFSET[1]) + 'px';
    ghostEl.style.transform = 'none';
  }

  function placeGhost(clientX, clientY) {
    if (!ghostEl || !dragState) return;
    dragState.cx = clientX;
    dragState.cy = clientY;
    if (popperInstance) {
      popperInstance.update();
    } else if (popperReady && window.Popper) {
      startPopperGhost();
    } else {
      placeGhostFallback(clientX, clientY);
      startPopperGhost();
    }
  }

  function ensureGhost() {
    if (ghostEl) return ghostEl;
    ghostEl = document.getElementById('biblio-dnd-ghost');
    if (!ghostEl) {
      ghostEl = document.createElement('div');
      ghostEl.id = 'biblio-dnd-ghost';
      ghostEl.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ghostEl);
    }
    return ghostEl;
  }

  function rowRect(row) {
    var cells = row.querySelectorAll('.dt-cell');
    if (!cells.length) return row.getBoundingClientRect();
    var first = cells[0].getBoundingClientRect();
    var left = first.left;
    var top = first.top;
    var right = first.right;
    var bottom = first.bottom;
    for (var i = 1; i < cells.length; i++) {
      var c = cells[i].getBoundingClientRect();
      if (c.left < left) left = c.left;
      if (c.top < top) top = c.top;
      if (c.right > right) right = c.right;
      if (c.bottom > bottom) bottom = c.bottom;
    }
    return {
      left: left,
      top: top,
      width: Math.max(right - left, 120),
      height: Math.max(bottom - top, 20)
    };
  }

  function rowMeta(row) {
    var dt = document.getElementById('dt-biblio');
    var titleEl = row.querySelector('.dt-cell:nth-child(4)') || row.querySelector('.dt-cell');
    var artistEl = row.querySelector('.dt-cell:nth-child(5)');
    var rows = dt ? dt.querySelectorAll('.dt-row') : [];
    var ix = Array.prototype.indexOf.call(rows, row);
    var inst = window.DataTable && DataTable.instances.biblio;
    var idx = inst && inst._rowIdx && inst._rowIdx[ix] !== undefined ? inst._rowIdx[ix] : ix;
    return {
      title: titleEl ? titleEl.textContent.trim() : 'Track',
      artist: artistEl ? artistEl.textContent.trim() : '',
      rowIdx: idx
    };
  }

  function setDragMode(on) {
    document.body.classList.toggle('biblio-is-dragging', on);
    document.body.classList.toggle('dragging-track', on);
  }

  function showGhost(row, clientX, clientY) {
    var ghost = ensureGhost();
    var rect = rowRect(row);
    var dt = document.getElementById('dt-biblio');
    var cols = dt ? (dt.style.gridTemplateColumns || getComputedStyle(dt).gridTemplateColumns) : '';
    var ox = clientX - rect.left;
    var oy = clientY - rect.top;
    var rowCls = row.className.replace(/\bdragging\b/g, '').trim();

    ghost.innerHTML =
      '<div class="biblio-ghost-grid dt ' + rowCls + '" style="display:grid;grid-template-columns:' + cols + '">' +
      row.innerHTML +
      '</div>';

    ghost.className = 'on';
    ghost.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'width:' + rect.width + 'px',
      'min-height:' + rect.height + 'px',
      'opacity:1',
      'visibility:visible',
      'display:block',
      'pointer-events:none',
      'z-index:999999',
      'margin:0',
      'will-change:transform'
    ].join(';');

    dragState.ox = ox;
    dragState.oy = oy;
    dragState.cx = clientX;
    dragState.cy = clientY;
    placeGhost(clientX, clientY);
  }

  function moveGhost(clientX, clientY) {
    placeGhost(clientX, clientY);
  }

  function hideGhost() {
    destroyPopperGhost();
    if (!ghostEl) return;
    ghostEl.className = '';
    ghostEl.style.cssText = '';
    ghostEl.innerHTML = '';
  }

  function clearDropHover() {
    document.querySelectorAll('.drop-hover').forEach(function (n) {
      n.classList.remove('drop-hover');
    });
    activeHover = null;
  }

  function clearDragUi() {
    setDragMode(false);
    document.querySelectorAll('.dragging').forEach(function (n) {
      n.classList.remove('dragging');
    });
    document.querySelectorAll('.drop-hot').forEach(function (n) {
      n.classList.remove('drop-hot');
    });
    clearDropHover();
    hideGhost();
    dragState = null;
  }

  function playlistCountEl(pl) {
    return pl.querySelector('span .ct') || pl.querySelector('.ct');
  }

  function syncPlaylistCount(viewKey) {
    if (!viewKey || !window.VIEWS_IDX || !Array.isArray(VIEWS_IDX[viewKey])) return;
    var count = VIEWS_IDX[viewKey].length;
    document.querySelectorAll('.target-playlist[data-view="' + viewKey + '"] .ct').forEach(function (ct) {
      ct.textContent = String(count);
    });
  }

  function addTrackToPlaylist(viewKey, trackIdx) {
    if (!viewKey || viewKey === 'all') return { added: false, count: 0 };
    if (!window.VIEWS_IDX) window.VIEWS_IDX = {};
    if (!Array.isArray(VIEWS_IDX[viewKey])) VIEWS_IDX[viewKey] = [];
    if (VIEWS_IDX[viewKey].indexOf(trackIdx) !== -1) {
      syncPlaylistCount(viewKey);
      return { added: false, count: VIEWS_IDX[viewKey].length };
    }
    VIEWS_IDX[viewKey].push(trackIdx);
    syncPlaylistCount(viewKey);
    if (window.ApolloState) {
      ApolloState.dispatch('playlist:track-added', { viewKey: viewKey, trackIdx: trackIdx, count: VIEWS_IDX[viewKey].length });
    }
    return { added: true, count: VIEWS_IDX[viewKey].length };
  }

  function playlistLabel(pl, viewKey) {
    var span = pl.querySelector(':scope > span') || pl.querySelector('span');
    if (!span) return viewKey || 'playlist';
    var clone = span.cloneNode(true);
    var ctEl = clone.querySelector('.ct');
    if (ctEl) ctEl.remove();
    return clone.textContent.replace(/\s+/g, ' ').trim() || viewKey || 'playlist';
  }

  function dropOnPlaylist(pl, meta) {
    var viewKey = pl.dataset.view || '';
    var label = playlistLabel(pl, viewKey);
    var ct = playlistCountEl(pl);
    if (ct && !viewKey) {
      var n = (parseInt(ct.textContent, 10) || 0) + 1;
      ct.textContent = String(n);
    }
    var result = addTrackToPlaylist(viewKey, meta.rowIdx);
    if (result.added && window.App) {
      App.toast('Drop → ' + label + ': ' + meta.title + ' (' + result.count + ')');
    } else if (window.App) {
      App.toast(result.added === false && result.count
        ? label + ' — faixa já na playlist (' + result.count + ')'
        : 'Drop → ' + label + (meta.title ? ': ' + meta.title : ''));
    }
  }

  function dropOnDeck(deck, meta) {
    var n = deck.classList.contains('deck-2') ? 2 : 1;
    if (window.loadTrackToDeck) {
      loadTrackToDeck(n, meta.rowIdx);
      if (window.App) App.toast('Deck ' + n + ' carregado');
    }
  }

  function hitDropTarget(clientX, clientY) {
    var stack = document.elementsFromPoint ? document.elementsFromPoint(clientX, clientY) : [document.elementFromPoint(clientX, clientY)];
    var el = null;
    for (var i = 0; i < stack.length; i++) {
      if (!stack[i]) continue;
      if (stack[i].id === 'biblio-dnd-ghost' || stack[i].closest('#biblio-dnd-ghost')) continue;
      el = stack[i];
      break;
    }
    if (!el || !dragState || !dragState.active) return null;
    var pl = el.closest('#dj-sidebar .target-playlist, .aside .target-playlist');
    if (pl) return { type: 'playlist', el: pl };
    var deck = el.closest('#dj-foot .deck');
    if (deck) return { type: 'deck', el: deck };
    return null;
  }

  function refreshDropHover(clientX, clientY) {
    var t = hitDropTarget(clientX, clientY);
    if (t && t.type === 'playlist') {
      if (activeHover !== t.el) {
        clearDropHover();
        t.el.classList.add('drop-hover');
        activeHover = t.el;
      }
      return;
    }
    clearDropHover();
    document.querySelectorAll('#dj-foot .deck.drop-hot').forEach(function (d) {
      d.classList.remove('drop-hot');
    });
    if (t && t.type === 'deck') t.el.classList.add('drop-hot');
  }

  function finishDrop(clientX, clientY) {
    var t = hitDropTarget(clientX, clientY);
    if (!t || !dragState || !dragState.row) return;
    var meta = rowMeta(dragState.row);
    if (t.type === 'playlist') dropOnPlaylist(t.el, meta);
    if (t.type === 'deck') dropOnDeck(t.el, meta);
  }

  function beginDrag(row, clientX, clientY) {
    dragState.active = true;
    dragState.row = row;
    dragState.ox = 0;
    dragState.oy = 0;
    setDragMode(true);
    row.classList.add('dragging');
    showGhost(row, clientX, clientY);
  }

  function onPointerDown(ev) {
    if (dragState) return;
    if (ev.button !== 0) return;
    var cell = ev.target.closest('#dt-biblio .dt-cell');
    if (!cell) return;
    if (ev.target.closest('.fav-btn, .dt-resizer, button, a, input')) return;
    var row = cell.closest('.dt-row');
    if (!row) return;

    dragState = {
      row: row,
      sx: ev.clientX,
      sy: ev.clientY,
      pid: ev.pointerId,
      active: false,
      ox: 0,
      oy: 0
    };
  }

  function onPointerMove(ev) {
    if (!dragState || ev.pointerId !== dragState.pid) return;
    var dx = ev.clientX - dragState.sx;
    var dy = ev.clientY - dragState.sy;

    if (!dragState.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESH) return;
      beginDrag(dragState.row, ev.clientX, ev.clientY);
    }

    ev.preventDefault();
    moveGhost(ev.clientX, ev.clientY);
    refreshDropHover(ev.clientX, ev.clientY);
  }

  function onPointerUp(ev) {
    if (!dragState || ev.pointerId !== dragState.pid) return;
    if (dragState.active) {
      ev.preventDefault();
      finishDrop(ev.clientX, ev.clientY);
      clearDragUi();
    } else {
      dragState = null;
    }
  }

  function bindRows() {
    if (window.V3Patches && typeof V3Patches.fixBibliotecaTreeDom === 'function') {
      V3Patches.fixBibliotecaTreeDom();
    }
    var dt = document.getElementById('dt-biblio');
    if (!dt) return;
    dt.querySelectorAll('.dt-row').forEach(function (row) {
      row.classList.add('track-row');
      row.removeAttribute('draggable');
    });
  }

  function init() {
    if (document.__biblioDndInit) return;
    document.__biblioDndInit = true;

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);

    ensureGhost();
    ensurePopper(function () {});
  }

  init();

  window.BibliotecaDnD = {
    bindRows: bindRows,
    clearDragUi: clearDragUi,
    addTrackToPlaylist: addTrackToPlaylist,
    syncPlaylistCount: syncPlaylistCount
  };
})();
