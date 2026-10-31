/* ════════════════════════════════════════════════════════════
   shared.js — Apollo::DJ Shared Data + DataTable Engine
   Loaded FIRST before all subtab page files.
   All declarations are on window for file:// compatibility.
════════════════════════════════════════════════════════════ */

/* ─── Album cover pool (populated from bridge / ingest) ─── */
window.COVERS = [];

/* ─── Track master data (populated from bridge / library scan) ─── */
window.T = [];

/* ─── Playlist / view index maps ────────────────────────── */
window.VIEWS_IDX = {
  all: null,
  favorites: []
};

/* ─── Track column definitions ──────────────────────────── */
window.TrackCols = [
  { id:'num', label:'#',                               w:'34px',  align:'center', required:true,  headerText:'#' },
  { id:'img', label:'<i class="ri-image-line"></i>',   w:'40px',  align:'center', required:true,  headerText:'Capa' },
  { id:'fav', label:'<i class="ri-star-line"></i>',    w:'34px',  align:'center', required:true,  headerText:'Favorito' },
  { id:'tit', label:'Título',                          w:'2fr',   align:'left',   sortable:true,  headerText:'Título' },
  { id:'art', label:'Artista',                         w:'1.4fr', align:'left',   sortable:true,  headerText:'Artista' },
  { id:'cmt', label:'Comentários',                         w:'1.2fr', align:'left',   sortable:true,  headerText:'Comentários' },
  { id:'gen', label:'Gênero',                          w:'1fr',   align:'left',   sortable:true,  visible:false, headerText:'Gênero' },
  { id:'tim', label:'<i class="ri-time-line"></i>',    w:'58px',  align:'right',  sortable:true,  headerText:'Duração' },
  { id:'bpm', label:'BPM',                             w:'52px',  align:'right',  sortable:true,  headerText:'BPM' },
  { id:'key', label:'Key',                             w:'48px',  align:'right',  sortable:true,  headerText:'Key' },
  { id:'fmt', label:'FMT',                             w:'56px',  align:'center', sortable:true,  headerText:'Formato' },
  { id:'cld', label:'<i class="ri-cloud-line"></i>',   w:'38px',  align:'center', headerText:'Sync' },
  { id:'dat', label:'Data',                            w:'62px',  align:'right',  sortable:true,  headerText:'Data' },
  { id:'qlt', label:'Qlt',                             w:'42px',  align:'center', sortable:true,  headerText:'Qualidade' }
];

function _apolloPlayingIcon(globalIdx) {
  const st = window.ApolloState && ApolloState.state;
  if (!st) return '';
  const onDeck =
    (st.deck1 && st.deck1.track === globalIdx && st.deck1.playing) ||
    (st.deck2 && st.deck2.track === globalIdx && st.deck2.playing);
  if (!onDeck) return '';
  return '<i class="ri-rfid-line apo-playing-pulse" title="Tocando no apolloDJ" aria-label="Tocando"></i> ';
}

/* ─── Row builder ───────────────────────────────────────── */
window.trackRows = function ( ids ) {
  const list = ids ? ids.map(i => T[i]).filter(Boolean) : T;
  return list.map((tr, i) => {
    const globalIdx = ids ? ids[i] : i;
    return {
    num: `<span class="mono c-dim">${i+1}</span>`,
    img: COVERS[tr.c] ? `<div class="cover" style="background-image:url('${COVERS[tr.c]}')"></div>` : `<div class="cover cover-empty"><i class="ri-music-2-line"></i></div>`,
    fav: `<i class="fav-btn ri-star-smile-line"></i>`,
    tit: _apolloPlayingIcon(globalIdx) + `<span class="ell heading" style="font-weight:500">${tr.title}</span>`,
    art: `<span class="ell">${tr.artist}</span>`,
    cmt: `<span class="mono ell muted">${tr.cmt}</span>`,
    gen: `<span class="mono muted">${tr.gen}</span>`,
    tim: `<span class="mono">${tr.t}</span>`,
    bpm: `<span class="mono heading">${tr.bpm}</span>`,
    key: `<span class="mono">${tr.key}</span>`,
    fmt: tr.fmt === 'FLAC'
      ? `<span class="mono heading">FLAC</span>`
      : `<span class="mono">${tr.fmt}</span>`,
    cld: `<i class="${tr.cl ? 'ri-cloud-line' : 'ri-cloud-off-line'} c-dim" style="font-size:14px;"></i>`,
    dat: `<span class="mono muted">${tr.date}</span>`,
    qlt: tr.q === 'ok'
      ? `<span class="tag tag-ok tag-qlt">OK</span>`
      : `<span class="tag tag-warn tag-qlt">!</span>`
  };
  });
};

/* ─── BUSCAR policy helpers (WP-driven) ─────────────────── */
window.ApolloBusca = (function () {
  function _policy() {
    const feat = window.apolloFeatures || {};
    const raw = (feat && typeof feat === 'object' && feat.buscar_filter) ? feat.buscar_filter : {};
    const minDuration = Number(raw.min_duration_seconds || 240);
    const extensions = Array.isArray(raw.allowed_extensions) && raw.allowed_extensions.length
      ? raw.allowed_extensions.map(v => String(v).toLowerCase().replace('.', ''))
      : ['mp3', 'flac', 'wav', 'aiff'];
    const mp3Bitrate = Number(raw.mp3_required_bitrate_kbps || 320);
    return {
      min_duration_seconds: minDuration >= 60 ? minDuration : 240,
      allowed_extensions: extensions,
      mp3_required_bitrate_kbps: mp3Bitrate > 0 ? mp3Bitrate : 320
    };
  }

  function _toSeconds(mmss) {
    if (typeof mmss !== 'string') return 0;
    const p = mmss.split(':').map(Number);
    if (p.length !== 2 || Number.isNaN(p[0]) || Number.isNaN(p[1])) return 0;
    return (p[0] * 60) + p[1];
  }

  function _extension(track) {
    return String(track.fmt || '').toLowerCase().replace('.', '');
  }

  function _mp3Bitrate(track) {
    const explicit = Number(track.br || 0);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return String(track.q || '').toLowerCase() === 'warn' ? 192 : 320;
  }

  function trackAllowed(track) {
    const policy = _policy();
    const ext = _extension(track);
    if (!policy.allowed_extensions.includes(ext)) return false;
    if (_toSeconds(String(track.t || '00:00')) <= policy.min_duration_seconds) return false;
    if (ext === 'mp3' && _mp3Bitrate(track) !== policy.mp3_required_bitrate_kbps) return false;
    return true;
  }

  return {
    policy: _policy,
    toSeconds: _toSeconds,
    extension: _extension,
    trackAllowed: trackAllowed
  };
})();

/* ════════════════════════════════════════════════════════════
   DataTable Engine
════════════════════════════════════════════════════════════ */
window.DataTable = {
  instances: {},

  create(id, host, spec, rows) {
    this.instances[id] = { id, host, cols: spec.map(c => ({...c})), rows };
    this.render(id);
  },

  render(id) {
    const inst = this.instances[id];
    if (!inst) return;
    const visible = inst.cols.filter(c => c.visible !== false);
    const lastIdx = visible.length - 1;
    const tpl = visible.map((c, i) => i === lastIdx ? 'minmax(0,1fr)' : c.w).join(' ');
    const headerHTML = visible.map((c, i) => {
      const sort = c.sortable
        ? `<i class="sort-mark ri-arrow-${c.sort === 'desc' ? 'down' : 'up'}-s-line" style="visibility:${c.sort ? 'visible' : 'hidden'};"></i>`
        : '';
      /* Header alignment mirrors data column alignment */
      const hAlign = c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : '';
      return `<div class="dt-cell ${hAlign} ${c.sort ? 'sorted' : ''}" data-col="${c.id}">
                <span style="overflow:hidden;text-overflow:ellipsis">${c.label}</span>
                ${sort}
                ${i < lastIdx ? `<div class="dt-resizer" data-col="${c.id}"></div>` : ''}
              </div>`;
    }).join('');
    const rowsHTML = inst.rows.map((row, i) => {
      const cells = visible.map(c => {
        const v = row[c.id] !== undefined ? row[c.id] : '';
        const align = c.align === 'right' ? 'right' : c.align === 'center' ? 'center' : '';
        return `<div class="dt-cell ${align}">${v}</div>`;
      }).join('');
      return `<div class="dt-row ${i % 2 === 1 ? 'zebra' : ''}">${cells}</div>`;
    }).join('');
    inst.host.innerHTML = `
      <div class="dt-wrap">
        <div class="dt" id="dt-${id}" style="grid-template-columns:${tpl};">
          <div class="dt-header">${headerHTML}</div>
          ${rowsHTML}
        </div>
      </div>`;
    this.bind(id);
  },

  bind(id) {
    const inst = this.instances[id];
    const dt = document.getElementById('dt-' + id);
    if (!dt) return;
    dt.querySelectorAll('.dt-header .dt-cell').forEach(cell => {
      cell.addEventListener('contextmenu', e => {
        e.preventDefault();
        DataTable.openCtx(id, e.pageX, e.pageY);
      });
      cell.addEventListener('click', e => {
        if (e.target.classList.contains('dt-resizer')) return;
        const col = inst.cols.find(c => c.id === cell.dataset.col);
        if (!col || !col.sortable) return;
        const next = col.sort === 'desc' ? 'asc' : col.sort === 'asc' ? null : 'desc';
        inst.cols.forEach(c => c.sort = null);
        col.sort = next;
        DataTable.render(id);
      });
    });
    dt.querySelectorAll('.dt-resizer').forEach(handle => {
      handle.addEventListener('mousedown', e => {
        e.stopPropagation(); e.preventDefault();
        DataTable.startResize(id, handle.dataset.col, e.clientX);
      });
    });
    dt.querySelectorAll('.dt-row').forEach(r => {
      r.addEventListener('click', () => {
        dt.querySelectorAll('.dt-row').forEach(x => x.classList.remove('selected'));
        r.classList.add('selected');
      });
    });
    dt.querySelectorAll('.fav-btn').forEach(b => {
      b.addEventListener('click', e => {
        e.stopPropagation();
        b.classList.toggle('on');
        b.classList.toggle('ri-star-smile-line');
        b.classList.toggle('ri-star-smile-fill');
      });
    });
  },

  startResize(id, colId, startX) {
    const inst = this.instances[id];
    const dt = document.getElementById('dt-' + id);
    const col = inst.cols.find(c => c.id === colId);
    if (!col) return;
    const headerCell = dt.querySelector(`.dt-header .dt-cell[data-col="${colId}"]`);
    const startW = headerCell.getBoundingClientRect().width;
    document.body.classList.add('col-resizing');
    const visibleCols = inst.cols.filter(c => c.visible !== false);
    const lastIdx = visibleCols.length - 1;
    const onMove = ev => {
      const newW = Math.max(40, startW + (ev.clientX - startX));
      col.w = newW + 'px';
      dt.style.gridTemplateColumns = visibleCols.map((c, i) => i === lastIdx ? 'minmax(0,1fr)' : c.w).join(' ');
    };
    const onUp = () => {
      document.body.classList.remove('col-resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  openCtx(id, x, y) {
    const inst = this.instances[id];
    const ctx = document.getElementById('ctx');
    let html = `<div class="ctx-head">Visibilidade · Colunas</div>`;
    inst.cols.forEach((c, i) => {
      if (c.required) return;
      const labelTxt = (c.headerText || c.label || c.id)
        .toString().replace(/<[^>]+>/g, '').trim() || c.id.toUpperCase();
      html += `<label class="ctx-item">
        <input type="checkbox" ${c.visible !== false ? 'checked' : ''}
          onchange="DataTable.toggleCol('${id}', ${i}, this.checked)">
        <span>${labelTxt}</span>
      </label>`;
    });
    ctx.innerHTML = html;
    const cw = 240;
    const ch = Math.min(360, ctx.scrollHeight || 280);
    ctx.style.left = Math.min(x, window.innerWidth  - cw - 10) + 'px';
    ctx.style.top  = Math.min(y, window.innerHeight - ch - 10) + 'px';
    ctx.classList.add('show');
  },

  toggleCol(id, idx, vis) {
    this.instances[id].cols[idx].visible = vis;
    this.render(id);
  }
};

/* Ctx menu close on outside click */
document.addEventListener('click', e => {
  const ctx = document.getElementById('ctx');
  if (ctx && !ctx.contains(e.target)) ctx.classList.remove('show');
});

/* ════════════════════════════════════════════════════════════
   ApolloState — Global state bus (deck + analysis integration)
   All modules read/write here. Zero direct cross-module calls.
════════════════════════════════════════════════════════════ */
window.ApolloState = (function () {
  const _listeners = {};
  const state = {
    deck1: { track: null, playing: false, pos: 0, elapsed: 0 },
    deck2: { track: null, playing: false, pos: 0, elapsed: 0 },
  };
  function dispatch(event, data) {
    (_listeners[event] || []).forEach(fn => { try { fn(data); } catch(e) {} });
  }
  function subscribe(event, fn) {
    _listeners[event] = _listeners[event] || [];
    _listeners[event].push(fn);
  }
  function unsubscribe(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(f => f !== fn);
  }
  return { state, dispatch, subscribe, unsubscribe };
})();

/* ════════════════════════════════════════════════════════════
   AnalysisStore — per-track analysis data
   Key: track index (number), value: analysis object
════════════════════════════════════════════════════════════ */
window.AnalysisStore = (function () {
  const _store = {};

  return {
    get(idx)         { return _store[idx] || null; },
    set(idx, data)   { _store[idx] = { ..._store[idx], ...data }; ApolloState.dispatch('analysis:updated', { idx, data: _store[idx] }); },
    getAll()         { return _store; },
  };
})();

/* ════════════════════════════════════════════════════════════
   loadTrackToDeck — load a track from T[] into a deck
   Updates ApolloState, dispatches events, updates deck footer UI
════════════════════════════════════════════════════════════ */
window.loadTrackToDeck = function (deckNum, trackIdx) {
  const tr = (window.T || [])[trackIdx];
  if (!tr) return;
  const analysis = AnalysisStore.get(trackIdx);
  const key = deckNum === 1 ? 'deck1' : 'deck2';

  ApolloState.state[key] = { track: trackIdx, playing: false, pos: 0, elapsed: 0 };
  ApolloState.dispatch('deck:loaded', { deck: deckNum, trackIdx, track: tr, analysis });

  /* Update footer deck UI — uses IDs added to the footer elements */
  const d = deckNum;
  const titleEl  = document.getElementById('d' + d + '-title');
  const artistEl = document.getElementById('d' + d + '-artist');
  const timeEl   = document.getElementById('d' + d + '-time');
  const barFill  = document.getElementById('d' + d + '-fill');
  const bpmEl    = document.getElementById('d' + d + '-bpm');
  const keyEl    = document.getElementById('d' + d + '-key');
  if (titleEl)  titleEl.textContent  = tr.title;
  if (artistEl) artistEl.textContent = tr.artist;
  if (timeEl)   timeEl.textContent   = '00:00 / ' + tr.t;
  if (barFill)  barFill.style.width  = '0%';
  if (bpmEl && analysis)  bpmEl.textContent = analysis.bpm + ' BPM';
  if (keyEl && tr)        keyEl.textContent = tr.key;

  /* Highlight library row if biblio table exists */
  ApolloState.dispatch('deck:highlight', { deck: deckNum, trackIdx });
};

/* ════════════════════════════════════════════════════════════
   ApolloUserPrefs — tema + tamanho de texto global (--fs-r)
════════════════════════════════════════════════════════════ */
window.ApolloUserPrefs = (function () {
  'use strict';
  var STANDARD = 13;
  var KEY_THEME = 'apDJ_theme';
  var KEY_TEXT = 'apDJ_text_size';

  function getRaw(k, d) {
    try {
      var v = localStorage.getItem(k);
      return v !== null ? JSON.parse(v) : d;
    } catch (e) {
      return d;
    }
  }

  function setRaw(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  }

  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    /* theme is toggled in Ajustes panel; nav btn opens panel, not theme */
  }

  function applyTextSize(px) {
    px = Math.max(8, Math.min(19, parseInt(px, 10) || STANDARD));
    var r = px / STANDARD;
    document.documentElement.style.setProperty('--apollo-fs-base', String(px));
    document.documentElement.style.setProperty('--fs-r', String(r));
    document.documentElement.style.setProperty('--font-adjusts', String(r));
    setRaw(KEY_TEXT, px);
    return px;
  }

  function init() {
    applyTheme(getRaw(KEY_THEME, 'light'));
    applyTextSize(getRaw(KEY_TEXT, STANDARD));
  }

  return {
    STANDARD: STANDARD,
    init: init,
    getTheme: function () { return getRaw(KEY_THEME, 'light'); },
    setTheme: function (t) {
      t = t === 'dark' ? 'dark' : 'light';
      setRaw(KEY_THEME, t);
      applyTheme(t);
    },
    getTextSize: function () { return getRaw(KEY_TEXT, STANDARD); },
    setTextSize: applyTextSize
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { ApolloUserPrefs.init(); });
} else {
  ApolloUserPrefs.init();
}
