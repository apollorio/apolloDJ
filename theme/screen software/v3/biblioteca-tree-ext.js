/**
 * apolloDJ v3 — Biblioteca tree extension filter + section enforcer.
 * @fc id=FC-S5-TREEXT stage=5 mermaid=UI source=mapped.md §4.5
 *
 * Two responsibilities, both idempotent + zero-cost when no-op:
 *
 * 1. COMPUTADOR section: when a tree-node represents a file leaf, accept
 *    ONLY .wav .aiff .flac .mp3 (set body.biblio-audio-only so CSS hides
 *    everything else without removing nodes — toggle is reversible).
 *
 * 2. PLAYLISTS section: ensure the canonical four-category structure is
 *    present — Favorited Tracks · All tracks · groups-of-playlists · playlists.
 *    Missing categories are injected as tree-group-hdr nodes so the user
 *    sees a consistent skeleton even on a fresh install.
 */
(function () {
  'use strict';

  var AUDIO_EXT = /\.(wav|aiff?|flac|mp3)$/i;

  // Tagged from the user image: required PLAYLISTS sections.
  var PLAYLIST_SECTIONS = [
    { key: 'favorites', label: 'Favoritas',              icon: 'ri-heart-3-line' },
    { key: 'all',       label: 'Todas as faixas',        icon: 'ri-music-2-line' },
    { key: 'groups',    label: 'Grupos de playlists',    icon: 'ri-folder-3-line' },
    { key: 'playlists', label: 'Playlists',              icon: 'ri-play-list-line' },
  ];

  function tagAudioLeaves() {
    document.querySelectorAll('.tree-node[data-path],.tree-node[data-file]').forEach(function (n) {
      var p = n.dataset.path || n.dataset.file || '';
      if (!p) return;
      n.classList.add('file-leaf');
      if (AUDIO_EXT.test(p)) n.classList.add('audio-file');
      else n.classList.remove('audio-file');
    });
  }

  function enforceComputerFilter(enable) {
    document.body.classList.toggle('biblio-audio-only', enable !== false);
    tagAudioLeaves();
  }

  function ensurePlaylistSections(playlistAside) {
    if (!playlistAside) return;
    /* coletanea-lib already ships a full tree — do not inject duplicate headers */
    if (playlistAside.querySelector('.target-playlist, .tree-group-hdr[data-group]')) return;
    PLAYLIST_SECTIONS.forEach(function (sec) {
      var existing = playlistAside.querySelector('.tree-group-hdr[data-section="' + sec.key + '"]');
      if (existing) return;
      var hdr = document.createElement('div');
      hdr.className = 'tree-group-hdr';
      hdr.dataset.section = sec.key;
      hdr.innerHTML = '<i class="ti ' + sec.icon + '"></i><span>' + sec.label + '</span>';
      playlistAside.appendChild(hdr);
    });
  }

  function findPlaylistAside() {
    return (
      document.querySelector('#main .aside [data-section-host="playlists"]') ||
      document.querySelector('.aside-pl-host') ||
      document.querySelector('.aside .sec-playlists') ||
      null
    );
  }

  function reapply() {
    enforceComputerFilter(true);
    ensurePlaylistSections(findPlaylistAside());
  }

  // Re-apply whenever the biblioteca DataTable re-renders (hooked by v3-patches.js).
  document.addEventListener('apollodj:tree:render', reapply);
  document.addEventListener('apollodj:biblio:render', reapply);
  if (window.V3Patches) {
    var prev = window.V3Patches.afterDataTableRender;
    window.V3Patches.afterDataTableRender = function (id) {
      if (typeof prev === 'function') prev(id);
      if (id === 'biblio') setTimeout(reapply, 30);
    };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reapply);
  } else {
    setTimeout(reapply, 80);
  }

  // Public API for manual toggles from the UI (e.g. "show non-audio" debug toggle).
  window.BibliotecaTreeExt = {
    enforceComputerFilter: enforceComputerFilter,
    ensurePlaylistSections: ensurePlaylistSections,
    reapply: reapply,
    AUDIO_EXT: AUDIO_EXT,
    SECTIONS: PLAYLIST_SECTIONS,
  };
})();
