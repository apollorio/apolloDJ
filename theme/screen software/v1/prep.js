/* ════════════════════════════════════════════════════════════
   prep.js — PAGE: DJ Prep Pipeline (PREP PRO layout)
   Bridge: pywebview.api.ingest.dj_prep_pro_folder(path, weak, commit)
   Bento toggles sync hidden #opt-* checkboxes (commit = Smart Rename).
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  window.ApolloPages = window.ApolloPages || {};

  function syncPrepOptsFromMount(mount) {
    var map = {
      lufs: 'opt-lufs',
      trim: 'opt-trim',
      scan: 'opt-detect',
      rename: 'opt-rename',
      export: 'opt-export',
    };
    mount.querySelectorAll('.prep-btn[data-prep-opt]').forEach(function (btn) {
      var key = btn.getAttribute('data-prep-opt');
      var id = map[key];
      if (!id) return;
      var el = document.getElementById(id);
      if (el) el.checked = btn.classList.contains('is-active');
    });
  }

  function bindPrepPro(mount) {
    mount.addEventListener('click', function (e) {
      var chip = e.target.closest('.pl-chip');
      if (chip && mount.contains(chip)) {
        chip.classList.toggle('is-active');
        return;
      }
      var btn = e.target.closest('.prep-btn[data-prep-opt]');
      if (btn && mount.contains(btn)) {
        btn.classList.toggle('is-active');
        syncPrepOptsFromMount(mount);
      }
    });
    syncPrepOptsFromMount(mount);
  }

  ApolloPages.prep = function (mount) {
    mount.innerHTML = `
<div class="pane reveal prep-pro-root" id="prep-pro-root" style="flex:1;min-height:0;display:flex;flex-direction:column;">
<style id="main-prep-pro">
  /* Pills / dots / primary pill CTA stay geometrically round */
  .prep-pro-root .pl-chip,
  .prep-pro-root .pl-chip .dot,
  .prep-pro-root .prep-execute-btn {
    corner-shape: round !important;
  }

  .prep-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 16px 20px 24px;
    gap: 28px;
    background: var(--bg);
    overflow-y: auto;
    min-height: 0;
  }

  .prep-sec-title {
    font-family: var(--ff-mono, monospace);
    font-size: calc(10px * var(--fs-r, 1));
    letter-spacing: 0.2em;
    color: var(--tx2);
    text-transform: uppercase;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .prep-sec-title::after {
    content: '';
    flex: 1;
    height: 1px;
    min-width: 40px;
    background: linear-gradient(90deg, var(--s3) 0%, transparent 100%);
  }
  .prep-sec-title .prep-count-inline {
    margin-left: auto;
    font-size: calc(11px * var(--fs-r, 1));
    letter-spacing: 0.04em;
    color: var(--tx1);
    text-transform: none;
    font-family: var(--ff-main, system-ui, sans-serif);
  }

  .pl-chip-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .pl-chip {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 999px;
    background: var(--s1);
    color: var(--tx1);
    font-size: calc(12px * var(--fs-r, 1));
    font-weight: 500;
    cursor: pointer;
    box-shadow: inset 0 1px 0 0 var(--gh), inset 0 0 0 1px var(--s2), inset 0 -2px 6px var(--s1);
    transition: background 0.4s ease, color 0.4s ease, box-shadow 0.4s ease;
  }
  .pl-chip .pl-count {
    font-family: var(--ff-mono, monospace);
    font-size: calc(10px * var(--fs-r, 1));
    color: var(--tx2);
    transition: color 0.4s ease;
  }
  .pl-chip .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--tx2);
    transition: background 0.4s ease;
  }
  .pl-chip:hover {
    background: var(--s2);
    color: var(--tx0);
    box-shadow: inset 0 1px 0 0 var(--gh), inset 0 0 0 1px var(--s3), inset 0 -2px 6px var(--s2);
  }
  .pl-chip.is-active,
  .pl-chip.active {
    background: var(--bg);
    color: var(--tx0);
    box-shadow: inset 0 1px 3px rgba(0,0,0,.04), inset 0 0 0 1px var(--s2), inset 3px 0 0 var(--ac);
  }
  .pl-chip.is-active .dot,
  .pl-chip.active .dot { background: var(--ac); }
  .pl-chip.is-active .pl-count,
  .pl-chip.active .pl-count { color: var(--tx1); }

  .prep-bento {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 16px;
  }
  .prep-btn {
    all: unset;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    background: var(--s1);
    border-radius: 16px;
    padding: 24px 16px;
    cursor: pointer;
    box-shadow: inset 0 1px 0 0 var(--gh), inset 0 0 0 1px var(--s2), inset 0 -8px 24px var(--s1);
    transition: background 0.4s ease, box-shadow 0.4s ease;
  }
  .prep-btn:hover {
    background: var(--s2);
    box-shadow: inset 0 1px 0 0 var(--gh), inset 0 0 0 1px var(--s3), inset 0 -8px 24px var(--s2);
  }
  .prep-btn i {
    font-size: calc(26px * var(--fs-r, 1));
    color: var(--tx2);
    margin-bottom: 12px;
    transition: color 0.4s ease;
  }
  .prep-btn .lbl {
    font-size: calc(11px * var(--fs-r, 1));
    font-weight: 700;
    color: var(--tx0);
    letter-spacing: 0.08em;
    margin-bottom: 6px;
  }
  .prep-btn .desc {
    font-size: calc(10px * var(--fs-r, 1));
    color: var(--tx1);
    line-height: 1.3;
  }
  .prep-btn.is-active,
  .prep-btn.active {
    background: var(--bg);
    box-shadow: inset 0 2px 8px rgba(0,0,0,.03), inset 0 0 0 1px var(--s2), inset 0 -3px 0 var(--ac);
  }
  .prep-btn.is-active i,
  .prep-btn.active i { color: var(--tx0); }

  .prep-footer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    margin-top: auto;
    padding-top: 16px;
  }
  .prep-execute-btn.btn-primary {
    height: 48px;
    min-height: 48px;
    max-height: none;
    min-width: 280px;
    padding: 0 32px;
    font-size: calc(13px * var(--fs-r, 1));
    gap: 12px;
  }
  .prep-execute-btn {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 48px;
    min-width: 280px;
    padding: 0 32px;
    border-radius: 999px;
    background: var(--tx0);
    color: var(--bg);
    font-size: calc(13px * var(--fs-r, 1));
    font-weight: 600;
    letter-spacing: 0.06em;
    cursor: pointer;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.2), inset 0 -2px 0 rgba(0,0,0,.4);
    transition: background 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease;
  }
  .prep-execute-btn:disabled { opacity: 0.72; cursor: default; }
  .prep-execute-btn i { font-size: calc(18px * var(--fs-r, 1)); color: var(--ac); }
  .prep-execute-btn:hover:not(:disabled) {
    box-shadow: inset 0 1px 0 rgba(255,255,255,.3), inset 0 -1px 0 rgba(0,0,0,.2);
  }
  .prep-execute-btn:active:not(:disabled) {
    box-shadow: inset 0 3px 8px rgba(0,0,0,.6);
  }

  .prep-log-console {
    width: 100%;
    background: var(--s1);
    border-radius: 16px;
    padding: 16px 20px;
    font-family: var(--ff-mono, monospace);
    font-size: calc(10.5px * var(--fs-r, 1));
    color: var(--tx1);
    line-height: 1.6;
    box-shadow: inset 0 0 0 1px var(--s2), inset 0 2px 12px rgba(0,0,0,.03);
    display: none;
    max-height: 200px;
    overflow-y: auto;
  }
  .prep-log-console .log-time { color: var(--tx2); margin-right: 8px; }
  .prep-log-console .log-ok { color: #16a34a; }
  .prep-log-console .log-warn { color: var(--ac); }
  .prep-log-console .log-err { color: #dc2626; }
  .prep-log-console .log-hl { color: var(--tx0); font-weight: 600; }

  .prep-execute-btn i.spinning {
    animation: spin 1s linear infinite;
    display: inline-block;
  }

  .prep-pro-root .prep-folder-row {
    margin-bottom: 4px;
  }
  .prep-pro-root .file-picker {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--s1);
    border-radius: var(--r);
    cursor: pointer;
    transition: background 0.3s ease, box-shadow 0.3s ease;
    box-shadow: inset 0 1px 0 0 var(--gh), inset 0 0 0 1px var(--s2);
  }
  .prep-pro-root .file-picker:hover,
  .prep-pro-root .file-picker.loaded {
    background: var(--s2);
  }
  .prep-pro-root .file-picker i { font-size: calc(20px * var(--fs-r, 1)); color: var(--tx2); }
  .prep-pro-root .file-picker span {
    font-size: calc(13px * var(--fs-r, 1));
    color: var(--tx1);
    flex: 1;
  }

  .prep-opt-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>

<div class="content glass" style="flex:1;display:flex;flex-direction:column;min-height:0;overflow:hidden;">
  <div class="prep-wrapper">
    <section class="prep-folder-row">
      <div class="prep-sec-title">
        Pasta de faixas
        <span class="prep-count-inline" id="prep-count">0 faixas</span>
      </div>
      <div class="file-picker" id="prep-picker" role="button" tabindex="0"
        onclick="pickPrepFolder()">
        <i class="ri-folder-3-line"></i>
        <span>Selecionar pasta com faixas…</span>
      </div>
    </section>

    <section>
      <div class="prep-sec-title">Alvo: Playlists selecionadas</div>
      <div class="pl-chip-grid btn-row">
        <button type="button" class="btn-secondary btn-sm pl-chip is-active">
          <span class="dot"></span> Playlist A <span class="pl-count">0</span>
        </button>
        <button type="button" class="btn-secondary btn-sm pl-chip">
          <span class="dot"></span> Favoritos <span class="pl-count">0</span>
        </button>
        <button type="button" class="btn-secondary btn-sm pl-chip">
          <span class="dot"></span> Chill Vibes <span class="pl-count">0</span>
        </button>
        <button type="button" class="btn-secondary btn-sm pl-chip">
          <span class="dot"></span> Warmup <span class="pl-count">0</span>
        </button>
      </div>
    </section>

    <section>
      <div class="prep-sec-title">Ajustar músicas em lote</div>
      <div class="prep-bento">
        <button type="button" class="prep-btn is-active" data-prep-opt="lufs">
          <i class="ri-volume-up-line"></i>
          <span class="lbl">LUFS normal</span>
          <span class="desc">Nivela áudios em 14 LUFS</span>
        </button>
        <button type="button" class="prep-btn is-active" data-prep-opt="trim">
          <i class="ri-scissors-line"></i>
          <span class="lbl">Cortar silêncio</span>
          <span class="desc">Aparar início e final</span>
        </button>
        <button type="button" class="prep-btn is-active" data-prep-opt="scan">
          <i class="ri-magic-line"></i>
          <span class="lbl">Scan inteligente</span>
          <span class="desc">BPM, key e hotcues A–H</span>
        </button>
        <button type="button" class="prep-btn" data-prep-opt="rename">
          <i class="ri-edit-2-line"></i>
          <span class="lbl">Smart rename</span>
          <span class="desc">Formato {Artista} − {Título}</span>
        </button>
        <button type="button" class="prep-btn is-active" data-prep-opt="export">
          <i class="ri-upload-cloud-2-line"></i>
          <span class="lbl">CDJ ready</span>
          <span class="desc">Export Rekordbox / audit</span>
        </button>
      </div>
    </section>

    <div class="prep-footer">
      <button type="button" class="btn-primary prep-execute-btn" id="prep-execute" onclick="runPrepPro()">
        <i class="ri-play-fill"></i>
        <span>Ajustar músicas em lote</span>
      </button>
      <div class="prep-log-console" id="prep-log" aria-live="polite"></div>
    </div>

    <div class="prep-opt-hidden" aria-hidden="true">
      <input type="checkbox" id="opt-lufs" checked>
      <input type="checkbox" id="opt-trim" checked>
      <input type="checkbox" id="opt-detect" checked>
      <input type="checkbox" id="opt-rename">
      <input type="checkbox" id="opt-export" checked>
    </div>
  </div>
</div>
</div>`;

    bindPrepPro(mount.querySelector('#prep-pro-root') || mount);
    updatePrepCount(0);
  };

  window.pickPrepFolder = function () {
    var picker = document.getElementById('prep-picker');
    if (!picker) return;
    var ingestApi = window.pywebview && window.pywebview.api && window.pywebview.api.ingest;
    if (ingestApi && typeof ingestApi.pick_folder === 'function') {
      ingestApi.pick_folder().then(function (path) {
        if (!path) return;
        picker.dataset.prepPath = path;
        picker.classList.add('loaded');
        var span = picker.querySelector('span');
        if (span) span.textContent = path;
        updatePrepCount(0);
      }).catch(function () {
        if (typeof App !== 'undefined' && App.toast) App.toast('Erro ao selecionar pasta');
      });
      return;
    }
    if (typeof App !== 'undefined' && App.toast) App.toast('Bridge indisponível — conecte ao apollo::dj');
  };

  function updatePrepCount(count) {
    var countEl = document.getElementById('prep-count');
    if (countEl) {
      countEl.textContent = count + ' faixa' + (count !== 1 ? 's' : '');
    }
  }

  function appendPrepLog(log, html) {
    var t = new Date().toLocaleTimeString('pt-BR', { hour12: false });
    log.innerHTML += '<div><span class="log-time">[' + t + ']</span> ' + html + '</div>';
    log.scrollTop = log.scrollHeight;
  }

  window.executePrepPipeline = function () {
    var log = document.getElementById('prep-log');
    var executeBtn = document.getElementById('prep-execute');
    var picker = document.getElementById('prep-picker');
    var root = document.getElementById('prep-pro-root');
    if (root) syncPrepOptsFromMount(root);

    if (!log || !executeBtn) return;

    var folderPath = picker && picker.dataset.prepPath ? picker.dataset.prepPath : '';
    var renameEl = document.getElementById('opt-rename');
    var commit = !!(renameEl && renameEl.checked);

    executeBtn.disabled = true;
    executeBtn.innerHTML = '<i class="ri-loader-4-line spinning"></i><span>RODANDO…</span>';

    log.style.display = 'block';
    log.innerHTML = '';

    var ingestApi = window.pywebview && window.pywebview.api && window.pywebview.api.ingest;

    if (!folderPath) {
      appendPrepLog(log, '<span class="log-warn">!</span> Selecione uma pasta com faixas para iniciar.');
      executeBtn.disabled = false;
      executeBtn.innerHTML = '<i class="ri-play-fill"></i><span>Ajustar músicas em lote</span>';
      return;
    }

    if (!ingestApi || typeof ingestApi.dj_prep_pro_folder !== 'function') {
      appendPrepLog(log, '<span class="log-err">✖</span> Bridge indisponível — pywebview.api.ingest não encontrado.');
      executeBtn.disabled = false;
      executeBtn.innerHTML = '<i class="ri-play-fill"></i><span>Ajustar músicas em lote</span>';
      return;
    }

    ingestApi.dj_prep_pro_folder(folderPath, false, commit).then(function (res) {
      if (!res || !res.success) {
        appendPrepLog(
          log,
          '<span class="log-err">✖</span> Bridge: ' + (res && res.error ? String(res.error) : 'falhou')
        );
        executeBtn.disabled = false;
        executeBtn.innerHTML = '<i class="ri-play-fill"></i><span>Ajustar músicas em lote</span>';
        return;
      }
      var reps = res.reports || [];
      var n = typeof res.processed === 'number' ? res.processed : reps.length;
      appendPrepLog(log, '<span class="log-hl">apollo::dj PREP PRO</span> — ' + n + ' faixa(s) via ingest');
      reps.forEach(function (r, i) {
        var verdict = r && r.verdict ? r.verdict : '?';
        var inp = r && r.input ? r.input : '';
        appendPrepLog(
          log,
          '<span class="log-ok">✔</span> [' + (i + 1) + '/' + reps.length + '] <span class="log-hl">' + inp + '</span> — ' + verdict
        );
      });
      appendPrepLog(log, '<span class="log-ok">Pipeline concluído.</span> Dados disponíveis no relatório.');
      executeBtn.disabled = false;
      executeBtn.innerHTML = '<i class="ri-play-fill"></i><span>Ajustar músicas em lote</span>';
      if (typeof App !== 'undefined' && App.toast) App.toast('Pipeline concluído');
    }).catch(function (err) {
      appendPrepLog(log, '<span class="log-err">✖</span> Erro na bridge: ' + (err && err.message ? err.message : 'desconhecido'));
      executeBtn.disabled = false;
      executeBtn.innerHTML = '<i class="ri-play-fill"></i><span>Ajustar músicas em lote</span>';
    });
  };

  window.runPrepPro = function () {
    window.executePrepPipeline();
  };
})();
