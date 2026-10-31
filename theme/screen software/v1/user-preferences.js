/* ════════════════════════════════════════════════════════════
   user-preferences.js — PAGE: User Preferences
   Local machine preferences + Collaborative.share folder setup.
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  // Collab P2P is membership-only: the server grants nicotine_access on login.
  // Non-members must NOT see the share-folder / P2P options anywhere.
  function nicotineMemberOnline() {
    var f = window.apolloFeatures || (window.__APOLLO_BOOT_PAYLOAD__ && window.__APOLLO_BOOT_PAYLOAD__.features) || {};
    return f.nicotine_access === true
      || String(f.membership_tier || f.membership || '').toLowerCase().indexOf('apollodj-') === 0;
  }

  ApolloPages.userPreferences = function (mount) {
    var isMember = nicotineMemberOnline();
    mount.innerHTML = `
      <div class="pane reveal">
        <aside class="aside">
          <div class="aside-head"><div class="aside-title">Preferências</div></div>
          <div class="aside-scroll">
            <div class="tree-node selected">
              <i class="ri-user-settings-line ti"></i><span>Preferências Locais</span>
            </div>
            ${isMember ? '<div class="tree-node"><i class="ri-folder-shared-line ti"></i><span>Collaborative.share</span></div>' : ''}
            <div class="tree-node">
              <i class="ri-eye-line ti"></i><span>Visualização</span>
            </div>
            ${isMember ? '<div class="tree-node"><i class="ri-search-eye-line ti"></i><span>Buscar P2P</span></div>' : ''}
          </div>
        </aside>
        <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
          <div class="content-hdr">
            <span class="ch-label">PREFERÊNCIAS</span>
            <span class="ch-count">Configuração local</span>
          </div>
          <div style="padding:16px;display:flex;flex-direction:column;gap:14px;overflow:auto;">
            ${isMember ? `<div class="vidro" style="border-radius:var(--r);padding:16px;">
              <div class="heading" style="font-size:14px;margin-bottom:8px;">Pasta compartilhada</div>
              <p style="margin:0 0 10px;color:var(--gray-1);font-size:12px;line-height:1.55;">
                Escolha a pasta compartilhada na rede P2P (backend headless — sem login manual).
              </p>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;">
                <span class="stat-dot online" id="prefs-p2p-online-dot" style="display:none;"></span>
                <span id="prefs-p2p-online-lbl" style="font-size:12px;color:var(--gray-1);display:none;">Online — backend ativo</span>
              </div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <button class="btn-primary" id="prefs-choose-folder">
                  <i class="ri-folder-open-line"></i>Escolher Pasta
                </button>
                <button class="btn-ghost" id="prefs-clear-folder">
                  <i class="ri-close-circle-line"></i>Limpar
                </button>
              </div>
              <div id="prefs-folder-path" class="mono" style="margin-top:10px;font-size:11px;color:var(--gray-1);word-break:break-all;">
                Nenhuma pasta selecionada.
              </div>
            </div>` : ''}

            <div class="vidro" style="border-radius:var(--r);padding:16px;">
              <div class="heading" style="font-size:14px;margin-bottom:8px;">Estrutura apolloDJ Local</div>
              <div id="prefs-paths" class="mono" style="font-size:11px;color:var(--gray-1);line-height:1.65;">
                Carregando pastas…
              </div>
            </div>

            <div class="vidro" style="border-radius:var(--r);padding:16px;">
              <div class="heading" style="font-size:14px;margin-bottom:8px;">Visualização — Waveform</div>
              <p style="margin:0 0 12px;color:var(--gray-1);font-size:12px;line-height:1.55;">
                Escolha o estilo de visualização das formas de onda nos decks.
              </p>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;" class="btn-row">
                <button type="button" class="btn-secondary btn-sm" id="prefs-wf-classic"><i class="ri-bar-chart-grouped-line"></i> Apollo Clássico</button>
                <button type="button" class="btn-secondary btn-sm" id="prefs-wf-cdj"><i class="ri-record-circle-line"></i> CDJ / Pioneer</button>
              </div>
              <div id="prefs-wf-current" class="mono" style="margin-top:8px;font-size:11px;color:var(--gray-1);">Atual: —</div>
            </div>
          </div>
        </section>
      </div>`;

    function getPrefs() {
      try {
        if (!window.pyBridge || typeof window.pyBridge.get_user_preferences !== 'function') {
          return { collaborative_share_folder: '' };
        }
        return JSON.parse(window.pyBridge.get_user_preferences() || '{}');
      } catch (e) {
        return { collaborative_share_folder: '' };
      }
    }

    function setCollabFolder(path) {
      try {
        if (!window.pyBridge || typeof window.pyBridge.set_collaborative_share_folder !== 'function') return;
        window.pyBridge.set_collaborative_share_folder(path || '');
      } catch (e) {}
    }

    function renderPaths() {
      const holder = document.getElementById('prefs-paths');
      if (!holder) return;
      try {
        if (!window.pyBridge || typeof window.pyBridge.get_app_paths !== 'function') {
          holder.textContent = 'API de pastas indisponível neste ambiente.';
          return;
        }
        const p = JSON.parse(window.pyBridge.get_app_paths() || '{}');
        holder.innerHTML = `
          <div>Root: ${p.root || '—'}</div>
          <div>Tracks: ${p.tracks || '—'}</div>
          <div>Transferências: ${p.transferencias || '—'}</div>
          <div>Corrompido: ${p.corrompido || '—'}</div>
          <div>Preferencias: ${p.preferencias || '—'}</div>
          <div>Relatórios: ${p.relatorios || '—'}</div>
        `;
      } catch (e) {
        holder.textContent = 'Não foi possível carregar as pastas locais.';
      }
    }

    function renderFolder() {
      const prefs = getPrefs();
      const target = document.getElementById('prefs-folder-path');
      if (!target) return;
      target.textContent = prefs.collaborative_share_folder || 'Nenhuma pasta selecionada.';
    }

    const chooseBtn = document.getElementById('prefs-choose-folder');
    if (chooseBtn) {
      chooseBtn.addEventListener('click', function () {
        try {
          if (!window.pyBridge || typeof window.pyBridge.open_folder_dialog !== 'function') {
            if (window.App) App.toast('Seletor de pasta indisponível');
            return;
          }
          const result = JSON.parse(window.pyBridge.open_folder_dialog() || '""');
          if (result) {
            setCollabFolder(result);
            renderFolder();
            if (window.App) App.toast('Pasta Collaborative.share salva');
          }
        } catch (e) {
          if (window.App) App.toast('Não foi possível salvar a pasta selecionada');
        }
      });
    }

    const clearBtn = document.getElementById('prefs-clear-folder');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        setCollabFolder('');
        renderFolder();
          if (window.App) App.toast('Pasta Collaborative.share removida');
      });
    }

    /* ── Waveform mode preference ───────────────────────────────── */
    const _AP = window.ApolloPrefs || {
      get(k, d) { const v = localStorage.getItem('apDJ_pref_' + k); return v !== null ? JSON.parse(v) : d; },
      set(k, v) { localStorage.setItem('apDJ_pref_' + k, JSON.stringify(v)); }
    };
    function _syncWfButtons(mode) {
      if (wfClassicBtn) wfClassicBtn.classList.toggle('is-active', mode === 'classic');
      if (wfCDJBtn)     wfCDJBtn.classList.toggle('is-active', mode === 'cdj');
    }
    function _renderWfMode() {
      const cur = _AP.get('wf_mode', 'classic');
      const el  = document.getElementById('prefs-wf-current');
      if (el) el.textContent = 'Atual: ' + (cur === 'cdj' ? 'CDJ / Pioneer' : 'Apollo Clássico');
      _syncWfButtons(cur);
    }
    const wfClassicBtn = document.getElementById('prefs-wf-classic');
    const wfCDJBtn     = document.getElementById('prefs-wf-cdj');
    if (wfClassicBtn) wfClassicBtn.addEventListener('click', () => { _AP.set('wf_mode', 'classic'); _renderWfMode(); });
    if (wfCDJBtn)     wfCDJBtn.addEventListener('click',    () => { _AP.set('wf_mode', 'cdj');     _renderWfMode(); });
    _renderWfMode();

    function renderOnlineBadge() {
      const f = (window.__APOLLO_BOOT_PAYLOAD__ && window.__APOLLO_BOOT_PAYLOAD__.features) || window.apolloFeatures || {};
      const on = f.nicotine_access === true || String(f.membership_tier || f.membership || '').toLowerCase().indexOf('apollodj-') === 0;
      const dot = document.getElementById('prefs-p2p-online-dot');
      const lbl = document.getElementById('prefs-p2p-online-lbl');
      if (dot) dot.style.display = on ? '' : 'none';
      if (lbl) lbl.style.display = on ? '' : 'none';
    }

    renderFolder();
    renderPaths();
    renderOnlineBadge();
  };
})();
