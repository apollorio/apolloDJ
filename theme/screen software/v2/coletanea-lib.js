/* ════════════════════════════════════════════════════════════
   coletanea-lib.js — PAGE: Coletânea / Biblioteca
   Two structurally identical aside cards:
   ① COMPUTADOR  — arquivos locais da máquina
   ② PLAYLISTS   — arquivos tratados e analisados pelo ApolloDJ
   ③ EXPORTADO NESTE PENDRIVE — pendrive selector
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  if (!window._apolloIngestStateWired) {
    window._apolloIngestStateWired = true;
    window.addEventListener('apollo:ingest-state', function (ev) {
      var d = ev && ev.detail;
      if (!d || !window.App || typeof App.toast !== 'function') return;
      var src = (d.extra && d.extra.source)
        ? String(d.extra.source).split(/[/\\]/).pop()
        : '';
      if (d.state === 'READY') {
        App.toast('"' + (src || 'Faixa') + '" pronta na Coletânea ✓');
      } else if (d.state === 'REJECTED') {
        App.toast('"' + (src || 'Faixa') + '" reprovada na análise', 'warn');
      }
    });
  }

  function _usbDriveIcon(warn) {
    return '<i class="ri-usb-fill ti' + (warn ? ' pd-ico-warn' : '') + '" aria-hidden="true"></i>';
  }

  function _positionPdMenu(btn, menu) {
    if (!btn || !menu) return;
    var r = btn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = r.left + 'px';
    menu.style.top = (r.bottom + 3) + 'px';
    menu.style.width = Math.max(r.width, 168) + 'px';
    menu.style.right = 'auto';
    menu.style.zIndex = '9998';
  }

  function _bindPdOptEvents(menu, setSelectedFn, closeFn) {
    menu.querySelectorAll('.pd-select-opt').forEach(function (opt) {
      opt.onclick = function (e) {
        e.stopPropagation();
        setSelectedFn(opt.dataset.path, opt.dataset.label);
        if (closeFn) closeFn();
      };
    });
  }

  ApolloPages.coletaneaLib = function (mount) {
    /* Build registered pendrives list for the selector (pyBridge or SIM fallback) */
    function _registeredPendrives() {
      if (window.pyBridge && typeof window.pyBridge.usb_get_registered === 'function') {
        try { return JSON.parse(window.pyBridge.usb_get_registered() || '[]'); } catch (_) {}
      }
      return Object.values(window.SIM_PENDRIVES || {}).map(d => ({
        path: d.id || d.label, label: d.label, tag: d.tag || '', cdj_ok: d.status !== 'err',
        exported_playlists: d.exportedPlaylists || [],
      }));
    }

    function _pendriveMenuItems(drives) {
      if (!drives.length) {
        return '<div class="pd-select-empty">Nenhum pendrive registrado</div>';
      }
      return drives.map(function (d) {
        var tag = d.tag ? '<span class="pd-select-tag">' + d.tag + '</span>' : '';
        return '<button type="button" class="pd-select-opt" role="option" data-path="' + d.path + '" data-label="' + d.label + '">' +
          _usbDriveIcon(!d.cdj_ok) +
          '<span class="pd-select-opt-label">' + d.label + '</span>' + tag +
          '</button>';
      }).join('');
    }

    function _bindPendriveDropdown(mount, drivesList, onSelect) {
      var drives = drivesList;
      var wrap = mount.querySelector('#lib-pd-select-wrap');
      var btn = mount.querySelector('#lib-pd-select-btn');
      var menu = mount.querySelector('#lib-pd-select-menu');
      var labelEl = mount.querySelector('.pd-select-label');
      if (!wrap || !btn || !menu) return;

      menu.innerHTML = _pendriveMenuItems(drives);

      function setSelected(path, label) {
        wrap.dataset.value = path || '';
        wrap.classList.toggle('has-drive', !!path);
        if (labelEl) labelEl.textContent = label || 'Selecionar pendrive…';
        menu.querySelectorAll('.pd-select-opt').forEach(function (o) {
          o.classList.toggle('selected', o.dataset.path === path);
        });
        if (typeof onSelect === 'function') onSelect(path);
      }

      function closeMenu() {
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        wrap.classList.remove('open');
      }

      btn.onclick = function (e) {
        e.stopPropagation();
        if (menu.hidden) {
          menu.innerHTML = _pendriveMenuItems(drives);
          _bindPdOptEvents(menu, setSelected, closeMenu);
          menu.hidden = false;
          btn.setAttribute('aria-expanded', 'true');
          wrap.classList.add('open');
          _positionPdMenu(btn, menu);
        } else {
          closeMenu();
        }
      };

      if (!wrap.dataset.pdBound) {
        wrap.dataset.pdBound = '1';
        document.addEventListener('click', function () { closeMenu(); });
      }

      if (drives.length) setSelected(drives[0].path, drives[0].label);
      else setSelected('', 'Selecionar pendrive…');

      return { setSelected: setSelected, refresh: function (next) {
        drives = next;
        menu.innerHTML = _pendriveMenuItems(next);
        _bindPdOptEvents(menu, setSelected, closeMenu);
        if (next.length) setSelected(next[0].path, next[0].label);
        else setSelected('', 'Selecionar pendrive…');
      }};
    }

    const SIM_DRIVES = _registeredPendrives();

    mount.innerHTML = `
      <div class="pane reveal">
        <aside class="aside">
          <div class="aside-head aside-head-search-only" style="padding:0 8px 8px;">
            <div class="aside-search aside-search-lib">
              <i class="ri-search-line aside-search-ico" aria-hidden="true"></i>
              <input type="text" id="aside-search-inp" class="aside-search-inp" placeholder="Buscar.." autocomplete="off" spellcheck="false">
            </div>
          </div>

          <!-- ① COMPUTADOR — pastas locais da máquina (Downloads, Músicas, + fixas) -->
          <!-- @fc id=FC-S9-ASIDE-TOP stage=9 mermaid=CPT py=ingest/library.py html=#aside-top computer-folders -->
          <div id="aside-top" style="flex:0 0 130px;min-height:52px;overflow:hidden;display:flex;flex-direction:column;">
            <div class="sec-label first" style="flex-shrink:0;overflow:hidden;">
              <span>Computador</span>
              <div class="sl-acts">
                <i class="ri-eye-off-line" id="lib-toggle-hidden" title="Mostrar/ocultar pastas ocultas" style="cursor:pointer;"></i>
                <i class="ri-add-line" id="lib-add-folder-btn" title="Adicionar pasta fixa do computador" style="cursor:pointer;"></i>
              </div>
            </div>
            <div class="aside-scroll" id="lib-computer-list" style="flex:1;overflow-y:auto;overflow-x:hidden;">
              <!-- computer folders rendered by JS on mount -->
            </div>
          </div>

          <!-- Drag divider -->
          <!-- @fc id=FC-S6-RESIZE stage=6 mermaid=WATCHER ui=aside-drag-wrap resize=computador|playlists -->
          <div class="aside-resize-handle" id="aside-drag-wrap">
            <hr class="aside-drag-hr" id="aside-drag">
          </div>

          <!-- ② PLAYLISTS — arquivos tratados e analisados pelo ApolloDJ
               (estrutura visual IDÊNTICA ao card Computador) -->
          <!-- @fc id=FC-S9-ASIDE-MID stage=9 mermaid=RT1 html=#aside-mid playlists=target-playlist -->
          <div id="aside-mid" style="flex:1;min-height:52px;overflow:hidden;display:flex;flex-direction:column;">
            <div class="sec-label first" style="flex-shrink:0;overflow:hidden;">
              <span>Playlists</span>
              <div class="sl-acts"><i class="ri-add-line" title="Nova playlist"></i><i class="ri-more-2-line"></i></div>
            </div>
            <div class="aside-scroll" style="flex:1;overflow-y:auto;overflow-x:hidden;">
              <div class="tree-node" data-view="all">
                <i class="ri-folder-music-line ti"></i><span>Todas as faixas</span>
              </div>
              <div class="tree-node" data-view="favorites">
                <i class="ri-star-line ti"></i><span>Favoritas</span>
              </div>
              <div class="tree-node tree-group-hdr" data-group="gpl-1">
                <i class="ri-arrow-down-s-line tia"></i><i class="ri-folder-3-line ti"></i><span>Grupo de playlists 1</span>
              </div>
              <div class="tree-node tree-group-child target-playlist" data-child-of="gpl-1" data-view="playlist-a">
                <span class="indent-2"></span><i class="ri-play-list-line ti"></i><span>Playlist A <span class="ct">27</span></span>
              </div>
              <div class="tree-node tree-group-child target-playlist" data-child-of="gpl-1" data-view="playlist-b">
                <span class="indent-2"></span><i class="ri-play-list-line ti"></i><span>Playlist B <span class="ct">7</span></span>
              </div>
              <div class="tree-node tree-group-child target-playlist" data-child-of="gpl-1" data-view="playlist-c">
                <span class="indent-2"></span><i class="ri-play-list-line ti"></i><span>Playlist C <span class="ct">10</span></span>
              </div>
              <div class="tree-node tree-group-child target-playlist" data-child-of="gpl-1" data-view="playlist-d">
                <span class="indent-2"></span><i class="ri-play-list-line ti"></i><span>Playlist D <span class="ct">4</span></span>
              </div>
              <div class="tree-node tree-group-hdr" data-group="gpl-2">
                <i class="ri-arrow-down-s-line tia"></i><i class="ri-folder-3-line ti"></i><span>Grupo de playlists 2</span>
              </div>
              <div class="tree-node tree-group-child target-playlist" data-child-of="gpl-2" data-view="playlist-e">
                <span class="indent-2"></span><i class="ri-play-list-line ti"></i><span>Playlist E <span class="ct">8</span></span>
              </div>
              <div class="tree-node tree-group-child target-playlist" data-child-of="gpl-2" data-view="playlist-f">
                <span class="indent-2"></span><i class="ri-play-list-line ti"></i><span>Playlist F <span class="ct">7</span></span>
              </div>
              <div class="tree-node tree-group-child target-playlist" data-child-of="gpl-2" data-view="playlist-g">
                <span class="indent-2"></span><i class="ri-play-list-line ti"></i><span>Playlist G <span class="ct">6</span></span>
              </div>
            </div>
          </div>

          <!-- ③ EXPORTADO NESTE PENDRIVE -->
          <!-- @fc id=FC-S10-USB stage=10 mermaid=UEX py=usb_exporter.py bridge=UsbBridge html=#aside-bot #lib-pd-list -->
          <div class="aside-resize-handle" id="aside-drag-wrap-2">
            <hr class="aside-drag-hr" id="aside-drag-2">
          </div>
          <div id="aside-bot" style="flex:0 0 auto;overflow:hidden;display:flex;flex-direction:column;">
            <div class="sec-label first" style="flex-shrink:0;overflow:hidden;">
              <span>Exportados em..</span>
              <div class="sl-acts"><i class="ri-refresh-line" id="lib-pd-refresh" title="Atualizar lista" style="cursor:pointer;"></i></div>
            </div>
            <div style="padding:0 8px 6px;">
              <div class="pd-select-wrap" id="lib-pd-select-wrap" data-value="">
                <button type="button" class="pd-select-btn" id="lib-pd-select-btn" aria-expanded="false" aria-haspopup="listbox">
                  <i class="ri-usb-fill ti pd-select-ico" aria-hidden="true"></i>
                  <span class="pd-select-label">Selecionar pendrive…</span>
                  <i class="ri-arrow-down-s-line pd-select-caret" aria-hidden="true"></i>
                </button>
                <div class="pd-select-menu" id="lib-pd-select-menu" role="listbox" hidden></div>
              </div>
            </div>
            <div id="lib-pd-list" class="aside-scroll usb-pl-scroll" aria-label="Playlists no pendrive"></div>
          </div>

        </aside>

        <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0;">
          <section class="content" id="biblio-host"
            style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0;border-radius:var(--r);">
          </section>
        </div>
      </div>`;

    /* ── COMPUTADOR — computer folders (Downloads, Músicas, + user fixas) ──
       Source of truth model registered in registry.json → library_ui.computador.
       Default obvious folders are ALWAYS shown until the user hides them.
       [+] adds extra fixed local folders. Dropping / right-click "analisar"
       a folder or file into ANY playlist runs the full ingest flow
       (analyse → rename → save to ~/apolloDJ/Tracks/Coletânea) with BPM, energy,
       LUFS, gain EQ, energy-curve + waveform, and a club-playability quality gate
       that flags a yellow WARNING symbol on problems. */
    (function () {
      var listEl   = mount.querySelector('#lib-computer-list');
      var addBtn   = mount.querySelector('#lib-add-folder-btn');
      var hideBtn  = mount.querySelector('#lib-toggle-hidden');
      var PREFS_KEY = 'apollodj.computador.v1';
      var _showHidden = false;

      // Default "obvious locations" — always present, only hideable.
      var DEFAULTS = [
        { id: 'downloads', label: 'Downloads', icon: 'ri-download-2-line', path: '~/Downloads', fixed: true },
        { id: 'music',     label: 'Músicas',   icon: 'ri-music-2-line',    path: '~/Music',     fixed: true }
      ];

      function _loadPrefs() {
        try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); }
        catch (_) { return {}; }
      }
      function _savePrefs(p) {
        try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (_) {}
        // Mirror to backend if connected (registry.json → ingest/library.py).
        var api = window.pywebview && window.pywebview.api;
        if (api && api.ingest && typeof api.ingest.save_computer_folders === 'function') {
          try { api.ingest.save_computer_folders(p); } catch (_) {}
        }
      }

      // Merge defaults + user-added; apply hidden flags.
      function _model() {
        var p = _loadPrefs();
        var hidden = p.hidden || {};
        var added = Array.isArray(p.added) ? p.added : [];
        var out = DEFAULTS.map(function (d) {
          return { id: d.id, label: d.label, icon: d.icon, path: d.path, fixed: true, hidden: !!hidden[d.id] };
        });
        added.forEach(function (f, i) {
          var id = f.id || ('fixa-' + i);
          out.push({ id: id, label: f.label || f.path, icon: 'ri-folder-2-line', path: f.path, fixed: false, hidden: !!hidden[id] });
        });
        return out;
      }

      function _warnHtml(warn) {
        if (!warn) return '';
        var msg = (warn.msg || 'Possível problema de qualidade para club.').replace(/"/g, '&quot;');
        return '<span class="lib-cpt-warn" title="' + msg + '" aria-label="' + msg + '">' +
               '<i class="ri-error-warning-fill" aria-hidden="true"></i></span>';
      }

      function renderComputer() {
        if (!listEl) return;
        var model = _model();
        var visible = model.filter(function (f) { return _showHidden || !f.hidden; });
        if (hideBtn) hideBtn.className = _showHidden ? 'ri-eye-line' : 'ri-eye-off-line';
        listEl.innerHTML = visible.map(function (f) {
          var dimmed = f.hidden ? ' lib-cpt-hidden' : '';
          var removeIco = f.fixed ? '' :
            '<i class="ri-close-line lib-cpt-remove" data-id="' + f.id + '" title="Remover pasta"></i>';
          var eyeIco = f.hidden ? 'ri-eye-off-fill' : 'ri-eye-line';
          return '<div class="tree-node lib-cpt-node' + dimmed + '" draggable="true"' +
                   ' data-folder-id="' + f.id + '" data-path="' + f.path + '" title="' + f.path + '">' +
                   '<i class="' + f.icon + ' ti" aria-hidden="true"></i>' +
                   '<span>' + f.label + '</span>' +
                   _warnHtml(f.warn) +
                   '<span class="lib-cpt-acts">' +
                     '<i class="' + eyeIco + ' lib-cpt-hide" data-id="' + f.id + '" title="' + (f.hidden ? 'Mostrar' : 'Ocultar') + '"></i>' +
                     removeIco +
                   '</span>' +
                 '</div>';
        }).join('') || '<div class="lib-cpt-empty">Nenhuma pasta. Use <i class="ri-add-line"></i> para adicionar.</div>';
        _wireNodes();
      }

      function _setHidden(id, val) {
        var p = _loadPrefs(); p.hidden = p.hidden || {}; p.hidden[id] = val; _savePrefs(p); renderComputer();
      }
      function _removeFolder(id) {
        var p = _loadPrefs();
        p.added = (p.added || []).filter(function (f, i) { return (f.id || ('fixa-' + i)) !== id; });
        if (p.hidden) delete p.hidden[id];
        _savePrefs(p); renderComputer();
      }

      // Drop a computer folder/file onto a playlist → analyse + commit flow.
      function _sendToPlaylist(path, playlistView) {
        var api = window.pywebview && window.pywebview.api;
        if (api && api.ingest && typeof api.ingest.add_path_to_playlist === 'function') {
          try {
            api.ingest.add_path_to_playlist(path, playlistView || null).then(function (r) {
              if (window.App) App.toast('Analisando "' + (path.split(/[/\\]/).pop() || path) + '" → Coletânea…');
            }).catch(function () {});
          } catch (_) {}
        } else if (window.App) {
          App.toast('Conecte ao apollo::dj para analisar e adicionar à playlist.');
        }
      }
      window._coletaneaSendToPlaylist = _sendToPlaylist;

      function _wireNodes() {
        listEl.querySelectorAll('.lib-cpt-hide').forEach(function (el) {
          el.addEventListener('click', function (e) {
            e.stopPropagation();
            var id = el.dataset.id, p = _loadPrefs(), cur = (p.hidden || {})[id];
            _setHidden(id, !cur);
          });
        });
        listEl.querySelectorAll('.lib-cpt-remove').forEach(function (el) {
          el.addEventListener('click', function (e) { e.stopPropagation(); _removeFolder(el.dataset.id); });
        });
        listEl.querySelectorAll('.lib-cpt-node').forEach(function (node) {
          node.addEventListener('click', function () {
            mount.querySelectorAll('.tree-node').forEach(function (x) { x.classList.remove('selected'); });
            node.classList.add('selected');
          });
          node.addEventListener('dragstart', function (ev) {
            try {
              ev.dataTransfer.setData('application/x-apollo-folder', node.dataset.path);
              ev.dataTransfer.setData('text/plain', node.dataset.path);
              ev.dataTransfer.effectAllowed = 'copy';
            } catch (_) {}
            document.body.classList.add('dragging-folder');
          });
          node.addEventListener('dragend', function () { document.body.classList.remove('dragging-folder'); });
        });
      }

      // Playlists are valid drop targets for computer folders/files.
      mount.querySelectorAll('.target-playlist').forEach(function (pl) {
        pl.addEventListener('dragover', function (ev) {
          if (document.body.classList.contains('dragging-folder')) { ev.preventDefault(); pl.classList.add('drop-hover'); }
        });
        pl.addEventListener('dragleave', function () { pl.classList.remove('drop-hover'); });
        pl.addEventListener('drop', function (ev) {
          pl.classList.remove('drop-hover');
          var path = '';
          try { path = ev.dataTransfer.getData('application/x-apollo-folder') || ev.dataTransfer.getData('text/plain'); } catch (_) {}
          if (path) { ev.preventDefault(); _sendToPlaylist(path, pl.dataset.view); }
        });
      });

      // [+] add a fixed local folder (native picker via bridge, or prompt fallback).
      if (addBtn) {
        addBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          var api = window.pywebview && window.pywebview.api;
          if (api && api.ingest && typeof api.ingest.pick_folder === 'function') {
            try {
              api.ingest.pick_folder().then(function (r) {
                if (!r || !r.path) return;
                var p = _loadPrefs(); p.added = p.added || [];
                p.added.push({ id: 'fixa-' + Date.now(), label: r.label || r.path.split(/[/\\]/).pop(), path: r.path });
                _savePrefs(p); renderComputer();
              }).catch(function () {});
            } catch (_) {}
            return;
          }
          var path = window.prompt('Caminho da pasta fixa do computador:');
          if (path) {
            var p2 = _loadPrefs(); p2.added = p2.added || [];
            p2.added.push({ id: 'fixa-' + Date.now(), label: path.split(/[/\\]/).pop() || path, path: path });
            _savePrefs(p2); renderComputer();
          }
        });
      }

      if (hideBtn) {
        hideBtn.addEventListener('click', function (e) { e.stopPropagation(); _showHidden = !_showHidden; renderComputer(); });
      }

      renderComputer();
      // Refresh from backend if it exposes a richer folder list (with warnings).
      (function () {
        var api = window.pywebview && window.pywebview.api;
        if (api && api.ingest && typeof api.ingest.list_computer_folders === 'function') {
          try {
            api.ingest.list_computer_folders().then(function (r) {
              if (r && Array.isArray(r.folders) && r.folders.length && listEl) {
                listEl.innerHTML = r.folders.filter(function (f) { return _showHidden || !f.hidden; }).map(function (f) {
                  return '<div class="tree-node lib-cpt-node' + (f.hidden ? ' lib-cpt-hidden' : '') + '" draggable="true"' +
                         ' data-folder-id="' + (f.id || '') + '" data-path="' + (f.path || '') + '" title="' + (f.path || '') + '">' +
                         '<i class="' + (f.icon || 'ri-folder-2-line') + ' ti"></i><span>' + (f.label || f.path) + '</span>' +
                         _warnHtml(f.warn) + '</div>';
                }).join('');
                _wireNodes();
              }
            }).catch(function () {});
          } catch (_) {}
        }
      })();

      // ── Post-analysis helpers (kept for downstream callers) ───────────────
      // ── (C) Post-analysis: save standardised tags for one file ───────────
      window._saveStandardizedTags = function (filePath, meta) {
        var api = window.pywebview && window.pywebview.api;
        if (!api || !api.ingest) return;
        try {
          api.ingest.save_standardized_tags(filePath, meta || {})
            .then(function (r) {
              if (r && r.saved && window.App)
                App.toast('Tags salvas — ' + (filePath.split(/[/\\]/).pop() || filePath));
            }).catch(function () {});
        } catch (_) {}
      };

      // ── (D) Post-analysis: full metadata + tag-write for one file ────────
      window._extractAndSaveMetadata = function (filePath) {
        var api = window.pywebview && window.pywebview.api;
        if (!api || !api.ingest) return;
        try {
          api.ingest.extract_advanced_metadata(filePath)
            .then(function (meta) {
              if (!meta || meta.error) return;
              if (window.App && meta.bpm)
                App.toast('Meta salva: ' + (meta.artist||'') + ' – ' + (meta.title||'') + ' · ' + meta.bpm + ' BPM');
            }).catch(function () {});
        } catch (_) {}
      };

      /**
       * Gate for every ingest action (drop, folder add, file drop).
       * Resolves the canonical path; shows a toast and rejects if outside Coletânea.
       * @param {string} droppedPath
       * @param {function} onValid  called with the canonical resolved path
       */
      window._coletaneaValidateDrop = function (droppedPath, onValid) {
        var api = window.pywebview && window.pywebview.api;
        if (!api || !api.ingest || typeof api.ingest.validate_drop_path !== 'function') {
          // No bridge (preview) — accept but note it.
          if (typeof onValid === 'function') onValid(droppedPath);
          return;
        }
        api.ingest.validate_drop_path(droppedPath).then(function (res) {
          if (res && res.valid) {
            if (typeof onValid === 'function') onValid(res.path);
          } else {
            var msg = (res && res.error) || 'Apenas Tracks/Coletânea é permitida como biblioteca.';
            if (window.App) App.toast('⚠️ ' + msg);
            console.warn('[apolloDJ] drop rejected:', droppedPath, msg);
          }
        }).catch(function (e) {
          console.warn('[apolloDJ] validate_drop_path error', e);
        });
      };

    })();

    /* ── Drag divider (COMPUTADOR ↔ PLAYLISTS) ────────────── */
    (function () {
      const asideTop  = mount.querySelector('#aside-top');
      const asideMid  = mount.querySelector('#aside-mid');
      const dragWrap  = mount.querySelector('#aside-drag-wrap') || mount.querySelector('#aside-drag');
      if (!asideTop || !asideMid || !dragWrap) return;

      dragWrap.addEventListener('mousedown', function (e) {
        e.preventDefault();
        const asideEl  = dragWrap.parentElement;
        const headH    = asideEl.querySelector('.aside-head') ? asideEl.querySelector('.aside-head').offsetHeight : 0;
        const hrH      = dragWrap.offsetHeight || 5;
        const totalH   = asideEl.clientHeight - headH - hrH;
        const startY   = e.clientY;
        const startTop = asideTop.offsetHeight;

        document.body.style.cursor = 's-resize';
        const onMove = ev => {
          const delta  = ev.clientY - startY;
          const newTop = Math.max(totalH * 0.10, Math.min(totalH * 0.70, startTop + delta));
          asideTop.style.flex = `0 0 ${newTop}px`;
        };
        const onUp = () => {
          document.body.style.cursor = '';
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    })();

    /* ── Aside interactions ─────────────────────────────── */
    mount.querySelectorAll('.tree-group-hdr').forEach(hdr => {
      const grp = hdr.dataset.group;
      const isOpen = grp === 'gpl-1' || grp === 'gpl-2' || grp === 'drive-d';
      mount.querySelectorAll(`.tree-group-child[data-child-of="${grp}"]`).forEach(ch => {
        ch.style.display = isOpen ? '' : 'none';
      });
      hdr.querySelector('.tia').className = isOpen
        ? 'ri-arrow-down-s-line tia'
        : 'ri-arrow-right-s-line tia';

      hdr.addEventListener('click', () => {
        const children = mount.querySelectorAll(`.tree-group-child[data-child-of="${grp}"]`);
        const arrow    = hdr.querySelector('.tia');
        const nowOpen  = children[0] && children[0].style.display !== 'none';
        children.forEach(ch => { ch.style.display = nowOpen ? 'none' : ''; });
        arrow.className = nowOpen ? 'ri-arrow-right-s-line tia' : 'ri-arrow-down-s-line tia';
        mount.querySelectorAll('.tree-node').forEach(x => x.classList.remove('selected'));
        hdr.classList.add('selected');
      });
    });

    mount.querySelectorAll('.tree-node[data-view]').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
        const ids = VIEWS_IDX[n.dataset.view];
        DataTable.instances.biblio.rows = buildLibRows(ids);
        DataTable.render('biblio');
      });
    });

    mount.querySelectorAll('.tree-node:not([data-view]):not(.tree-group-hdr)').forEach(n => {
      n.addEventListener('click', () => {
        mount.querySelectorAll('.tree-node').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
      });
    });

    const inp  = document.getElementById('aside-search-inp');
    if (inp) { setTimeout(() => inp.focus(), 0); }

    /* ── Live search filter ───────────────────────── */
    if (inp) {
      inp.addEventListener('input', () => {
        const q = inp.value.trim().toLowerCase();
        if (!q) {
          DataTable.instances.biblio.rows = buildLibRows();
        } else {
          DataTable.instances.biblio.rows = buildLibRows().filter(r => {
            return (r.title  || '').toLowerCase().includes(q)
                || (r.artist || '').toLowerCase().includes(q)
                || String(r.bpm || '').includes(q)
                || (r.key    || '').toLowerCase().includes(q);
          });
        }
        DataTable.render('biblio');
      });
    }

    /* ── Pendrive selector + right-click flyout ───────── */
    (function () {
      const listEl   = mount.querySelector('#lib-pd-list');
      const refresh  = mount.querySelector('#lib-pd-refresh');
      const asideBot = mount.querySelector('#aside-bot');
      let pdUi = null;
      let ctxFlyout = null;

      function renderPdPlaylists(path) {
        if (!listEl) return;
        if (!path) { listEl.innerHTML = ''; return; }
        let playlists = [];
        if (window.pyBridge && typeof window.pyBridge.usb_get_exported_playlists === 'function') {
          try { playlists = JSON.parse(window.pyBridge.usb_get_exported_playlists(path) || '[]'); } catch (_) {}
        } else {
          const d = (_registeredPendrives()).find(x => x.path === path);
          playlists = d ? (d.exported_playlists || []) : [];
        }
        if (!playlists.length) {
          listEl.innerHTML = '<div class="usb-pl-empty">Nenhuma playlist exportada.</div>';
          return;
        }
        listEl.innerHTML = playlists.map(p =>
          `<div class="tree-node usb-pl-item">
             <i class="ri-usb-fill ti"></i><span>${p}</span>
           </div>`
        ).join('');
      }

      function ensureCtxFlyout() {
        if (ctxFlyout) return ctxFlyout;
        ctxFlyout = document.createElement('div');
        ctxFlyout.id = 'lib-pd-ctx';
        ctxFlyout.className = 'pd-select-menu pd-ctx-flyout';
        ctxFlyout.hidden = true;
        ctxFlyout.setAttribute('role', 'menu');
        document.body.appendChild(ctxFlyout);
        return ctxFlyout;
      }

      function closePdCtx() {
        if (!ctxFlyout) return;
        ctxFlyout.hidden = true;
        ctxFlyout.innerHTML = '';
      }

      function bindCtxDriveItems(menuEl) {
        menuEl.querySelectorAll('.pd-select-opt').forEach(function (opt) {
          opt.addEventListener('mouseenter', function () {
            var path = opt.dataset.path;
            var label = opt.dataset.label;
            if (pdUi && pdUi.setSelected) pdUi.setSelected(path, label);
            else renderPdPlaylists(path);
          });
          opt.addEventListener('click', function (e) {
            e.stopPropagation();
            if (pdUi && pdUi.setSelected) pdUi.setSelected(opt.dataset.path, opt.dataset.label);
            closePdCtx();
          });
        });
      }

      function openPdCtx(x, y, drives) {
        var menu = ensureCtxFlyout();
        menu.innerHTML = _pendriveMenuItems(drives);
        menu.hidden = false;
        menu.style.position = 'fixed';
        menu.style.zIndex = '9998';
        var cw = Math.min(268, window.innerWidth - 16);
        menu.style.width = cw + 'px';
        menu.style.left = Math.min(x, window.innerWidth - cw - 8) + 'px';
        menu.style.top = Math.min(y, window.innerHeight - 160 - 8) + 'px';
        bindCtxDriveItems(menu);
      }

      pdUi = _bindPendriveDropdown(mount, SIM_DRIVES, renderPdPlaylists);

      function openPendriveTab() {
        if (typeof App !== 'undefined' && App.goTo) App.goTo('usb', 'pendrive');
        else if (typeof App !== 'undefined') { App.switchTab('usb'); App.switchSub('pendrive'); }
      }

      if (asideBot) {
        asideBot.addEventListener('click', function (e) {
          if (e.target.closest('#lib-pd-refresh')) return;
          if (e.target.closest('#lib-pd-select-wrap, .usb-pl-item, .pd-ctx-flyout')) {
            e.stopPropagation();
            openPendriveTab();
          }
        });
        asideBot.addEventListener('contextmenu', function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (e.target.closest('.usb-pl-item, #lib-pd-select-wrap')) {
            openPendriveTab();
            return;
          }
          openPdCtx(e.clientX, e.clientY, _registeredPendrives());
        });
      }

      document.addEventListener('click', function (e) {
        if (ctxFlyout && !ctxFlyout.contains(e.target)) closePdCtx();
      });

      if (refresh) {
        refresh.addEventListener('click', () => {
          const drives = _registeredPendrives();
          if (pdUi && pdUi.refresh) pdUi.refresh(drives);
          else pdUi = _bindPendriveDropdown(mount, drives, renderPdPlaylists);
        });
      }
    })();

    /* ── DataTable ──────────────────────────────────────── */
    const libCols = TrackCols.concat([
      { id:'lufs',  label:'LUFS',     w:'80px',  align:'right',  sortable:true, visible:false,
        headerText:'LUFS' },
      { id:'head',  label:'Headroom', w:'90px',  align:'right',  sortable:true, visible:false,
        headerText:'Headroom' },
      { id:'enrg',  label:'Energy',   w:'80px',  align:'center', sortable:true, visible:false,
        headerText:'Energy 1-10' },
    ]);

    function buildLibRows(ids) {
      return trackRows(ids).map((r, i) => {
        const actualIdx = ids ? ids[i] : i;
        const an = (window.AnalysisStore && AnalysisStore.get) ? AnalysisStore.get(actualIdx) : null;
        if (!an) return r;
        const lufsTag = an.lufs > -12 ? 'tag-warn' : 'tag-ok';
        r.lufs  = `<span class="tag ${lufsTag} mono">${an.lufs}</span>`;
        r.head  = `<span class="mono" style="color:var(--gray-1)">${an.headroom > 0 ? '+' : ''}${an.headroom}</span>`;
        r.enrg  = `<span class="tag ${an.energy >= 7 ? 'tag-ok' : an.energy >= 4 ? 'tag-mute' : 'tag-warn'} mono">${an.energy}</span>`;
        return r;
      });
    }

    DataTable.create('biblio', document.getElementById('biblio-host'), libCols, buildLibRows());

    let bibRowAttach = function () {
      const dt = document.getElementById('dt-biblio');
      if (!dt) return;
      dt.querySelectorAll('.dt-row').forEach((row, i) => {
        if (row.dataset.bibBound === '1') return;
        row.dataset.bibBound = '1';
        row.addEventListener('dblclick', () => {
          const idx = DataTable.instances.biblio._rowIdx ? DataTable.instances.biblio._rowIdx[i] : i;
          window.loadTrackToDeck && loadTrackToDeck(1, idx);
        });
      });
    };

    /* ── Row right-click context menu (Deck load) — v3 uses #row-ctx-v3 ── */
    if (!window.__APOLLO_V3__) {
    const rowCtx = document.getElementById('row-ctx') || (() => {
      const el = document.createElement('div');
      el.id = 'row-ctx';
      el.className = 'ctx';
      el.style.cssText = 'min-width:180px;z-index:9999;';
      document.body.appendChild(el);
      return el;
    })();

    function openRowCtx(trackIdx, x, y) {
      rowCtx.innerHTML = `
        <div class="ctx-head">Faixa ${trackIdx + 1}</div>
        <div class="ctx-item row-ctx-act" data-action="deck1" data-idx="${trackIdx}">
          <i class="ri-skip-forward-line" style="margin-right:6px;opacity:.6"></i>Carregar no Deck 1
        </div>
        <div class="ctx-item row-ctx-act" data-action="deck2" data-idx="${trackIdx}">
          <i class="ri-skip-forward-line" style="margin-right:6px;opacity:.6"></i>Carregar no Deck 2
        </div>
        <div class="ctx-item row-ctx-act" data-action="analisar" data-idx="${trackIdx}">
          <i class="ri-bar-chart-2-line" style="margin-right:6px;opacity:.6"></i>Analisar faixa
        </div>
        <div class="ctx-item row-ctx-act" data-action="hotcue" data-idx="${trackIdx}">
          <i class="ri-price-tag-3-line" style="margin-right:6px;opacity:.6"></i>Definir Hot Cues
        </div>
        <div class="ctx-item row-ctx-act" data-action="waveform" data-idx="${trackIdx}">
          <i class="ri-pulse-line" style="margin-right:6px;opacity:.6"></i>Ver Waveform
        </div>`;
      rowCtx.classList.add('show');
      const cw = 200;
      rowCtx.style.left = Math.min(x, window.innerWidth  - cw - 10) + 'px';
      rowCtx.style.top  = Math.min(y, window.innerHeight - 200) + 'px';
    }

    rowCtx.addEventListener('click', e => {
      const act = e.target.closest('.row-ctx-act');
      if (!act) return;
      const idx = parseInt(act.dataset.idx, 10);
      rowCtx.classList.remove('show');
      if (act.dataset.action === 'deck1') { window.loadTrackToDeck && loadTrackToDeck(1, idx); }
      if (act.dataset.action === 'deck2') { window.loadTrackToDeck && loadTrackToDeck(2, idx); }
      if (act.dataset.action === 'analisar') {
        const tr = (window.T || [])[idx];
        if (typeof App !== 'undefined') App.switchSub('analisador');
        setTimeout(() => {
          window.ApolloState && ApolloState.dispatch('analisador:load', { idx, track: tr });
        }, 100);
      }
      if (act.dataset.action === 'hotcue') {
        if (typeof App !== 'undefined') {
          App.switchTab('prep');
          setTimeout(() => App.switchSub('autohotcue'), 80);
        }
      }
      if (act.dataset.action === 'waveform') {
        window.loadTrackToDeck && loadTrackToDeck(1, idx);
        if (typeof App !== 'undefined') {
          App.switchTab('prep');
          setTimeout(() => App.switchSub('waveform'), 80);
        }
      }
    });

    document.addEventListener('click', e => {
      if (rowCtx && !rowCtx.contains(e.target)) rowCtx.classList.remove('show');
    });

    const _bibAttachLegacy = bibRowAttach;
    bibRowAttach = function () {
      _bibAttachLegacy();
      const dt = document.getElementById('dt-biblio');
      if (!dt) return;
      dt.querySelectorAll('.dt-row').forEach((row, i) => {
        row.addEventListener('contextmenu', e => {
          e.preventDefault();
          openRowCtx(DataTable.instances.biblio._rowIdx ? DataTable.instances.biblio._rowIdx[i] : i, e.pageX, e.pageY);
        });
      });
    };
    } /* end !__APOLLO_V3__ row ctx */

    bibRowAttach();

    mount.querySelectorAll('.tree-node.target-playlist[data-view]').forEach(n => {
      n.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        mount.querySelectorAll('.tree-node').forEach(x => x.classList.remove('selected'));
        n.classList.add('selected');
        const viewKey = n.dataset.view;
        const ids = window.VIEWS_IDX ? (window.VIEWS_IDX[viewKey] || null) : null;
        if (ids && DataTable.instances.biblio) {
          DataTable.instances.biblio.rows = buildLibRows(ids);
          DataTable.render('biblio');
        }
      });
    });

    if (window.ApolloState) {
      ApolloState.subscribe('deck:highlight', function ({ deck, trackIdx }) {
        const dt = document.getElementById('dt-biblio');
        if (!dt) return;
        const cls = deck === 1 ? 'deck1-active' : 'deck2-active';
        if (!document.getElementById('deck-row-styles')) {
          const s = document.createElement('style');
          s.id = 'deck-row-styles';
          s.textContent = `.deck1-active{border-left:3px solid var(--primary)!important;} .deck2-active{border-left:3px solid #0ea5e9!important;}`;
          document.head.appendChild(s);
        }
        dt.querySelectorAll('.dt-row').forEach((row, i) => { row.classList.remove(cls); if (i === trackIdx) row.classList.add(cls); });
      });
    }

    const _origRender = DataTable.render.bind(DataTable);
    DataTable.render = function (id) {
      _origRender(id);
      if (id === 'biblio') { setTimeout(bibRowAttach, 0); }
    };
  };

})();
