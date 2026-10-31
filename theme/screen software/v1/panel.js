/* ════════════════════════════════════════════════════════════
   panel.js — PAGE: Ajustes de Usuário (design · tema · texto · collab)
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  function collabSubtabVisible() {
    var tabs = (window.Config && window.Config.tabs) || [];
    var co = tabs.find(function (t) { return t.id === 'coletanea'; });
    return !!(co && co.subtabs && co.subtabs.some(function (s) { return s.id === 'buscar'; }));
  }

  function nicotineMemberOnline() {
    var f = window.apolloFeatures || (window.__APOLLO_BOOT_PAYLOAD__ && window.__APOLLO_BOOT_PAYLOAD__.features) || {};
    return f.nicotine_access === true
      || String(f.membership_tier || f.membership || '').toLowerCase().indexOf('apollodj-') === 0;
  }

  function readCollabPath() {
    try {
      var api = window.pywebview && window.pywebview.api;
      if (api && typeof api.get_user_preferences === 'function') {
        var p = JSON.parse(api.get_user_preferences() || '{}');
        return p.collaborative_share_folder || '';
      }
      if (window.pyBridge && typeof window.pyBridge.get_user_preferences === 'function') {
        var pb = JSON.parse(window.pyBridge.get_user_preferences() || '{}');
        return pb.collaborative_share_folder || '';
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  function saveCollabPath(path) {
    try {
      var api = window.pywebview && window.pywebview.api;
      if (api && typeof api.set_collaborative_share_folder === 'function') {
        api.set_collaborative_share_folder(path || '');
        return;
      }
      if (window.pyBridge && typeof window.pyBridge.set_collaborative_share_folder === 'function') {
        window.pyBridge.set_collaborative_share_folder(path || '');
      }
    } catch (e) { /* ignore */ }
  }

  function pickFolder(cb) {
    try {
      var api = window.pywebview && window.pywebview.api;
      if (api && typeof api.open_folder_dialog === 'function') {
        var raw = api.open_folder_dialog();
        if (raw && typeof raw.then === 'function') {
          raw.then(function (r) {
            var p = typeof r === 'string' ? JSON.parse(r || '""') : r;
            cb(p || '');
          });
          return;
        }
        cb(JSON.parse(raw || '""') || '');
        return;
      }
      if (window.pyBridge && typeof window.pyBridge.open_folder_dialog === 'function') {
        cb(JSON.parse(window.pyBridge.open_folder_dialog() || '""') || '');
        return;
      }
    } catch (e) { /* ignore */ }
    cb('');
  }

  ApolloPages.panel = function (mount) {
    var P = window.ApolloUserPrefs;
    var std = P ? P.STANDARD : 13;
    var curSize = P ? P.getTextSize() : std;
    var curTheme = P ? P.getTheme() : 'light';
    var showCollab = collabSubtabVisible();
    var collabPath = showCollab ? readCollabPath() : '';
    var showOnline = nicotineMemberOnline();

    var onlineBlock = showOnline
      ? '<div class="user-panel-section" id="panel-p2p-online">' +
          '<div class="user-panel-section-title">Collab P2P</div>' +
          '<div class="user-panel-row" style="align-items:center;gap:10px;">' +
            '<span class="stat-dot online" aria-hidden="true"></span>' +
            '<span style="font-size:12px;color:var(--tx1);">Online — motor embutido ativo</span>' +
          '</div>' +
          '<p class="user-panel-hint">Sem login manual: busca, download e pasta compartilhada só no backend apolloDJ.</p>' +
        '</div>'
      : '';

    var collabBlock = showCollab
      ? '<div class="user-panel-section" id="panel-collab-section">' +
          '<div class="user-panel-section-title">Pasta compartilhada</div>' +
          '<p class="user-panel-hint">Escolha a pasta que outros DJs podem baixar na rede (template-locked).</p>' +
          '<div class="user-panel-row">' +
            '<button type="button" class="btn-primary btn-sm" id="panel-collab-pick"><i class="ri-folder-open-line"></i> Escolher pasta</button>' +
            '<button type="button" class="btn-ghost btn-sm" id="panel-collab-clear"><i class="ri-close-circle-line"></i> Limpar</button>' +
          '</div>' +
          '<div class="mono user-panel-path" id="panel-collab-path">' +
            (collabPath || 'Nenhuma pasta selecionada.') +
          '</div>' +
        '</div>'
      : '';

    mount.innerHTML =
      '<div class="pane reveal">' +
        '<section class="content user-prefs-page">' +
          '<div class="content-hdr">' +
            '<span class="ch-label">Ajustes</span>' +
            '<span class="ch-count">Design &amp; interface</span>' +
          '</div>' +
          '<div class="user-panel-wrap">' +
            '<div class="user-panel-section">' +
              '<div class="user-panel-section-title">Design</div>' +
              '<div class="user-panel-row">' +
                '<label for="panel-theme-light">Tema</label>' +
                '<div class="user-panel-theme btn-row" role="group" aria-label="Tema">' +
                  '<button type="button" class="btn-secondary btn-sm' + (curTheme === 'light' ? ' is-active' : '') + '" id="panel-theme-light" data-theme="light"><i class="ri-sun-line"></i> Light</button>' +
                  '<button type="button" class="btn-secondary btn-sm' + (curTheme === 'dark' ? ' is-active' : '') + '" id="panel-theme-dark" data-theme="dark"><i class="ri-moon-line"></i> Dark</button>' +
                '</div>' +
              '</div>' +
              '<div class="user-panel-row user-panel-row--slider">' +
                '<label for="panel-text-size">Tamanho do texto</label>' +
                '<div class="inline-fader" id="panel-text-fader">' +
                  '<div class="inline-fader-rail">' +
                    '<input type="range" class="marks" id="panel-text-size" min="8" max="19" step="1" value="' + curSize + '" aria-label="Tamanho do texto" aria-valuemin="8" aria-valuemax="19" aria-valuenow="' + curSize + '">' +
                    '<span class="inline-fader-bubble" id="panel-text-bubble" aria-hidden="true">' + curSize + '<span class="inline-fader-unit">px</span></span>' +
                  '</div>' +
                  '<span class="inline-fader-hint">Padrão ' + std + 'px · 8–19px</span>' +
                '</div>' +
              '</div>' +
            '</div>' +
            collabBlock +
            onlineBlock +
          '</div>' +
        '</section>' +
      '</div>';

    var slider = mount.querySelector('#panel-text-size');
    var bubble = mount.querySelector('#panel-text-bubble');
    var btnLight = mount.querySelector('#panel-theme-light');
    var btnDark = mount.querySelector('#panel-theme-dark');
    var THUMB_W = 34;

    function syncThemeButtons(theme) {
      if (btnLight) btnLight.classList.toggle('is-active', theme === 'light');
      if (btnDark) btnDark.classList.toggle('is-active', theme === 'dark');
    }

    function syncBubble(px) {
      if (!slider || !bubble) return;
      var min = parseInt(slider.min, 10);
      var max = parseInt(slider.max, 10);
      var val = Math.max(min, Math.min(max, px));
      var pct = (val - min) / (max - min);
      var rail = slider.parentElement;
      if (rail && rail.offsetWidth > THUMB_W) {
        var x = pct * (rail.offsetWidth - THUMB_W) + (THUMB_W / 2);
        bubble.style.left = ((x / rail.offsetWidth) * 100) + '%';
      } else {
        bubble.style.left = (pct * 100) + '%';
      }
      bubble.innerHTML = String(val) + '<span class="inline-fader-unit">px</span>';
      slider.setAttribute('aria-valuenow', String(val));
    }

    if (slider && P) {
      requestAnimationFrame(function () { syncBubble(parseInt(slider.value, 10)); });
      slider.addEventListener('input', function () {
        var px = parseInt(slider.value, 10);
        syncBubble(px);
        P.setTextSize(px);
      });
      window.addEventListener('resize', function onResize() {
        if (!mount.isConnected) {
          window.removeEventListener('resize', onResize);
          return;
        }
        syncBubble(parseInt(slider.value, 10));
      });
    }

    function pickTheme(theme) {
      if (!P) return;
      P.setTheme(theme);
      syncThemeButtons(theme);
      if (window.App) App.toast('Tema: ' + (theme === 'dark' ? 'Dark' : 'Light'));
    }

    if (btnLight) btnLight.addEventListener('click', function () { pickTheme('light'); });
    if (btnDark) btnDark.addEventListener('click', function () { pickTheme('dark'); });

    var pathEl = mount.querySelector('#panel-collab-path');
    var btnPick = mount.querySelector('#panel-collab-pick');
    var btnClear = mount.querySelector('#panel-collab-clear');

    function renderCollabPath(p) {
      if (pathEl) pathEl.textContent = p || 'Nenhuma pasta selecionada.';
    }

    if (btnPick) {
      btnPick.addEventListener('click', function () {
        pickFolder(function (p) {
          if (!p) {
            if (window.App) App.toast('Nenhuma pasta escolhida');
            return;
          }
          saveCollabPath(p);
          renderCollabPath(p);
          if (window.App) App.toast('Pasta compartilhada salva');
        });
      });
    }
    if (btnClear) {
      btnClear.addEventListener('click', function () {
        saveCollabPath('');
        renderCollabPath('');
        if (window.App) App.toast('Pasta collab removida');
      });
    }
  };
})();
