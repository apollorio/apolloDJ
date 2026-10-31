/* ══ EDITOR-TAGS.JS — Metadata editor (Apollo Diamond compliant) ══ */
window.EditorTagsPage = (() => {
  'use strict';
  const api = () => window.pywebview?.api;
  let _files = [];
  let _selected = null;
  const SAFE_KEYS = ['title', 'artist', 'album', 'bpm', 'key', 'date', 'genre'];
  const LABELS = { title:'Título', artist:'Artista', album:'Álbum', bpm:'BPM', key:'Key', date:'Ano', genre:'Gênero' };

  function render(host) {
    host.innerHTML = `
      <div class="pane reveal" id="editor-pane">
        <aside class="aside">
          <div class="aside-head">
            <div class="aside-title">Arquivos</div>
            <div class="aside-search">
              <i class="ri-folder-add-line" id="editor-add-folder" title="Adicionar pasta"
                style="font-size:16px;color:var(--gray-1);cursor:pointer;transition:color .3s ease;"></i>
            </div>
          </div>
          <div class="aside-scroll" id="editor-file-list">
            <div style="padding:20px 10px;text-align:center;">
              <span style="font-family:var(--ff-mono);font-size:9px;color:var(--white-18);text-transform:uppercase;letter-spacing:.14em;">Nenhum arquivo</span>
            </div>
          </div>
        </aside>
        <section class="content" style="overflow-y:auto;">
          <div id="editor-form-area" style="flex:1;padding:16px 20px;display:flex;flex-direction:column;gap:16px;">
            <div style="padding:40px 0;text-align:center;">
              <span style="font-family:var(--ff-mono);font-size:9px;color:var(--white-18);text-transform:uppercase;letter-spacing:.14em;">Selecione um arquivo</span>
            </div>
          </div>
        </section>
      </div>`;

    const addBtn = document.getElementById('editor-add-folder');
    if (addBtn) {
      addBtn.addEventListener('click', _addFolder);
      addBtn.addEventListener('mouseenter', e => e.target.style.color = 'var(--txt-heading)');
      addBtn.addEventListener('mouseleave', e => e.target.style.color = 'var(--gray-1)');
    }

    if (typeof gsap !== 'undefined') {
      gsap.to('#editor-pane', { opacity:1, y:0, duration:.55, ease:'power2.out' });
    } else {
      const p = document.getElementById('editor-pane');
      if (p) { p.style.opacity = '1'; p.style.transform = 'none'; }
    }

  }

  function _addFolder() {
    if (!api()) {
      App.toast('Bridge indisponível — conecte ao apollo::dj');
      return;
    }
    api().open_folder_dialog().then(folder => {
      if (!folder) return null;
      return api().scan_folder_for_audio ? api().scan_folder_for_audio(folder) : [];
    }).then(paths => {
      if (!paths) return;
      if (typeof paths === 'string') {
        try { paths = JSON.parse(paths); } catch (_) { paths = []; }
      }
      if (!Array.isArray(paths)) paths = [];
      _files = paths.map(item => {
        if (item && typeof item === 'object') {
          const p = String(item.path || '').trim();
          return {
            path: p,
            name: item.name ? String(item.name) : p.split(/[\\/]/).pop(),
            ext: item.ext ? String(item.ext).replace(/^\./, '') : '',
          };
        }
        return { path: String(item || '') };
      }).filter(f => f.path);
      _renderFileList();
    }).catch(() => App.toast('Erro ao abrir pasta'));
  }

  function _renderFileList() {
    const list = document.getElementById('editor-file-list');
    if (!list) return;
    if (!_files.length) {
      list.innerHTML = '<div style="padding:20px 10px;text-align:center;"><span style="font-family:var(--ff-mono);font-size:9px;color:var(--white-18);text-transform:uppercase;letter-spacing:.14em;">Nenhum arquivo</span></div>';
      return;
    }
    list.innerHTML = _files.map((f, i) => {
      const name = f.path.split(/[\\/]/).pop();
      return `<div class="tree-node${f === _selected ? ' selected' : ''}" onclick="EditorTagsPage._selectFile(${i})">
        <i class="ri-file-music-line ti"></i>
        <span title="${f.path}">${name}</span>
      </div>`;
    }).join('');
  }

  function _selectFile(idx) {
    _selected = _files[idx];
    document.querySelectorAll('#editor-file-list .tree-node').forEach((n, i) => n.classList.toggle('selected', i === idx));
    if (_selected.title !== undefined) { _renderForm(_selected); return; }
    if (!api()) { _renderForm(_selected); return; }
    api().parse_metadata(_selected.path).then(meta => {
      if (meta && !meta.error) Object.assign(_selected, meta);
      _renderForm(_selected);
    }).catch(() => _renderForm(_selected));
  }

  function _renderForm(f) {
    const area = document.getElementById('editor-form-area');
    if (!area) return;
    const fname = f.path.split(/[\\/]/).pop();
    area.innerHTML = `
      <div class="content-hdr" style="padding:0 0 12px;">
        <span class="ch-label">Metadados</span>
        <span class="ch-count" style="overflow:hidden;text-overflow:ellipsis;max-width:300px;">${fname}</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;">
        ${SAFE_KEYS.map(k => `
          <div style="display:flex;flex-direction:column;gap:5px;">
            <label style="font-family:var(--ff-mono);font-size:9px;letter-spacing:.14em;color:var(--gray-1);text-transform:uppercase;">${LABELS[k]}</label>
            <input type="text" id="etag-${k}" value="${(f[k] || '').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"
              style="height:34px;padding:0 14px;border-radius:12px;background:var(--white-2);border:0;outline:0;font-size:13px;color:var(--txt-heading);transition:box-shadow .3s ease;"
              onfocus="this.style.boxShadow='0 0 0 3px rgba(255,152,32,.12)'"
              onblur="this.style.boxShadow=''">
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;align-items:center;">
        <button class="btn-primary" onclick="EditorTagsPage._save()"><i class="ri-save-2-line"></i> Salvar</button>
        <button class="btn-ghost" onclick="EditorTagsPage._batchApply()" id="editor-batch-btn"><i class="ri-stack-line"></i> Aplicar a Selecionados</button>
      </div>
      <div id="editor-batch-progress" style="display:none;margin-top:12px;">
        <div style="font-family:var(--ff-mono);font-size:9px;color:var(--gray-1);text-transform:uppercase;letter-spacing:.14em;margin-bottom:6px;">Progresso</div>
        <div style="height:3px;background:var(--white-4);border-radius:999px;overflow:hidden;">
          <div id="editor-batch-fill" style="height:100%;width:0%;background:var(--primary);border-radius:999px;transition:width .3s ease;"></div>
        </div>
        <span id="editor-batch-pct" style="font-family:var(--ff-mono);font-size:9px;color:var(--gray-1);">0%</span>
      </div>`;

    window.updateBatchEditProgress = pct => {
      const fill = document.getElementById('editor-batch-fill');
      const lbl = document.getElementById('editor-batch-pct');
      if (fill) fill.style.width = pct + '%';
      if (lbl) lbl.textContent = pct + '%';
      if (pct >= 100) { setTimeout(() => { const bar = document.getElementById('editor-batch-progress'); if (bar) bar.style.display = 'none'; }, 1200); }
    };
  }

  function _save() {
    if (!_selected) return;
    const tags = {};
    SAFE_KEYS.forEach(k => { const el = document.getElementById('etag-' + k); if (el) tags[k] = el.value.trim(); });
    if (!api()) { App.toast('Bridge indisponível — conecte ao apollo::dj'); return; }
    api().edit_metadata(_selected.path, JSON.stringify(tags)).then(r => {
      if (r && !r.error) { Object.assign(_selected, r); App.toast('Metadados salvos'); }
      else App.toast('Erro: ' + (r?.error || 'desconhecido'));
    }).catch(() => App.toast('Erro ao salvar'));
  }

  function _batchApply() {
    if (!_files.length) return;
    const tags = {};
    SAFE_KEYS.forEach(k => { const el = document.getElementById('etag-' + k); if (el && el.value.trim()) tags[k] = el.value.trim(); });
    if (!Object.keys(tags).length) { App.toast('Preencha ao menos um campo'); return; }
    const bar = document.getElementById('editor-batch-progress');
    if (bar) bar.style.display = 'block';
    const paths = _files.map(f => f.path);
    if (!api()) {
      App.toast('Bridge indisponível — conecte ao apollo::dj');
      return;
    }
    api().batch_edit_metadata(JSON.stringify(paths), JSON.stringify(tags))
      .then(() => App.toast('Batch concluído'))
      .catch(() => App.toast('Erro no batch'));
  }

  return { render, _selectFile, _save, _batchApply };
})();

/* ─── register in ApolloPages dispatch ─── */
window.ApolloPages = window.ApolloPages || {};
ApolloPages.editorTags = mount => EditorTagsPage.render(mount);
