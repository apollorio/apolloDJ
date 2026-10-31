/**
 * Frameless pywebview window chrome — minimize / toggle-maximize / close via the
 * Python bridge (window.pywebview.api.window_*).
 *
 * The in-app #topbar header (crumb - subtabs - top-actions) is intentionally left
 * intact as its OWN row. We do NOT merge it into this bar (that hid the header).
 */
(function (global) {
  'use strict';

  function isDesktopShell() {
    return typeof global.pywebview !== 'undefined' && global.pywebview && global.pywebview.api;
  }

  function callWindow(action) {
    var api = global.pywebview && global.pywebview.api;
    if (!api) return;
    var fn = api['window_' + action];
    if (typeof fn === 'function') {
      try { fn(); } catch (e) { /* bridge not ready */ }
    }
  }

  function bindChrome() {
    var root = document.getElementById('shell-chrome');
    if (!root) return;
    if (isDesktopShell()) document.body.classList.add('apollo-desktop-shell');
    root.querySelectorAll('.shell-chrome-btn[data-action]').forEach(function (btn) {
      if (btn._apolloBound) return;
      btn._apolloBound = true;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        callWindow(btn.getAttribute('data-action'));
      });
    });
  }

  function init() {
    bindChrome();
    // After login the shell unlocks (body gains apollo-desktop-shell); re-bind.
    global.addEventListener('apollo:shell-unlocked', bindChrome);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);