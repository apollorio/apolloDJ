/*!
 * apolloDJ v3 — strict boot (file:// dev preview + localhost / desktop shell)
 * Must load BEFORE core.js
 */
(function (win) {
  'use strict';

  var loc = win.location;
  var qs = loc.search || '';
  /* Desktop shell: ?apollo-desktop=1 in URL (set by launcher loopback server)
     OR window.pywebview is already injected by WebView2 bridge               */
  var isDesktopApp = /(?:^|[?&])apollo-desktop=1(?:&|$)/.test(qs)
                   || (typeof win.pywebview !== 'undefined' && !!win.pywebview);
  var isFile = loc.protocol === 'file:';
  var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(loc.hostname || '');
  /* isDev = true only for raw browser sessions, never for the desktop shell */
  var isDev = (isFile || isLocal) && !isDesktopApp;
  /** Raw file:// opened directly in browser — never true inside the PRO exe */
  var isDevFilePreview = isFile && !isDesktopApp;

  win.__APOLLO_DJ_SHELL__ = true;
  win.__APOLLO_DJ_PRO__ = isDesktopApp || (isLocal && !isDevFilePreview);
  win.__APOLLO_LOCAL_CDN__ = '../cdn.apollo.rio.br/v1.0.0/';

  win.apolloIconConfig = {
    remoteFetch: !!(isDesktopApp || isLocal),
    cdn: 'https://assets.apollo.rio.br',
    debug: false
  };

  /* App favicon — bundled icon.ico at repo root (HTTP/file) or CDN in prod web */
  (function injectAppIcons() {
    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head || head.querySelector('link[data-apollo-app-icon]')) return;
    var base;
    if (isLocal && !isFile) {
      base = '/';
    } else if (isFile) {
      base = '../../';
    } else {
      base = 'https://dj.apollo.rio.br/iconAPP/';
    }
    var ico = document.createElement('link');
    ico.rel = 'icon';
    ico.href = base + 'icon.ico';
    ico.sizes = 'any';
    ico.setAttribute('data-apollo-app-icon', '1');
    head.appendChild(ico);
    var png = document.createElement('link');
    png.rel = 'icon';
    png.type = 'image/png';
    png.href = base + 'icon.png';
    png.setAttribute('data-apollo-app-icon', '1');
    head.appendChild(png);
    var apple = document.createElement('link');
    apple.rel = 'apple-touch-icon';
    apple.href = base + 'icon.png';
    apple.setAttribute('data-apollo-app-icon', '1');
    head.appendChild(apple);
  })();

  if (isDev) {
    win.__APOLLO_PRECONFIG__ = {
      skipAppScripts: true,
      skipHigh: ['tracker', 'translate'],
      gsapLocal: true,
      noCrossOrigin: isFile
    };
  }

  if (isFile) {
    win.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        e.stopPropagation();
        win.open(href, '_blank', 'noopener,noreferrer');
      }
    }, true);
  }

  /* Dev-only banner when opening HTML directly via file:// — never in PRO .exe */
  if (isDevFilePreview) {
    document.addEventListener('DOMContentLoaded', function () {
      var bar = document.createElement('div');
      bar.setAttribute('role', 'alert');
      bar.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:99999;padding:10px 16px;' +
        'background:#1a1a1a;color:#fff;font:12px/1.4 system-ui,sans-serif;border-bottom:2px solid #E8820C';
      bar.innerHTML =
        'Preview em <strong>file://</strong> — assets locais ativos. ' +
        'Recomendado: <code style="background:#333;padding:2px 6px;border-radius:4px">' +
        'cd src_002/theme; python -m http.server 8765</code> → ' +
        '<a href="http://127.0.0.1:8765/screen%20software/apolloDJ.v3.html" ' +
        'target="_blank" rel="noopener noreferrer" style="color:#E8820C">' +
        'http://127.0.0.1:8765/screen%20software/apolloDJ.v3.html</a>';
      document.body.appendChild(bar);
    }, { once: true });
  }
})(typeof window !== 'undefined' ? window : this);
