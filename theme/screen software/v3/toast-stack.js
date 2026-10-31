/* toast-stack.js — Vogue × Apple notification stack (below profile) */
(function (global) {
  'use strict';

  const DEFAULT_MS = 4200;
  const MAX_VISIBLE = 12;

  const ICONS = {
    success: 'ri-check-line',
    info: 'ri-information-line',
    warn: 'ri-error-warning-line',
    p2p: 'ri-p2p-fill',
    error: 'ri-close-circle-line',
  };

  function ensureStack() {
    let el = document.getElementById('toast-stack');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'toast-stack';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    const topbar = document.getElementById('topbar');
    if (topbar) topbar.appendChild(el);
    else document.body.appendChild(el);
    return el;
  }

  function parseInput(msg, opts) {
    if (msg && typeof msg === 'object') {
      opts = msg;
      msg = opts.message || opts.msg || '';
    }
    opts = opts || {};
    return {
      message: String(msg || ''),
      variant: opts.variant || 'success',
      sub: opts.sub ? String(opts.sub) : '',
      persist: !!opts.persist,
      duration: typeof opts.duration === 'number' ? opts.duration : DEFAULT_MS,
    };
  }

  function dismissToast(node) {
    if (!node || node._toastDismissed) return;
    node._toastDismissed = true;
    node.classList.add('is-out');
    setTimeout(() => node.remove(), 480);
  }

  function push(msg, opts) {
    const p = parseInput(msg, opts);
    if (!p.message && !p.sub) return null;

    const stack = ensureStack();
    const node = document.createElement('div');
    node.className = 'toast-item toast-item--' + p.variant;
    const icon = ICONS[p.variant] || ICONS.info;

    node.innerHTML =
      '<button type="button" class="toast-item__x" aria-label="Fechar"><i class="ri-close-line"></i></button>' +
      '<i class="' + icon + ' toast-item__ico" aria-hidden="true"></i>' +
      '<div class="toast-item__body">' +
        '<span class="toast-item__msg"></span>' +
        (p.sub ? '<span class="toast-item__sub"></span>' : '') +
      '</div>';

    node.querySelector('.toast-item__msg').textContent = p.message;
    if (p.sub) node.querySelector('.toast-item__sub').textContent = p.sub;

    node.querySelector('.toast-item__x').addEventListener('click', (e) => {
      e.stopPropagation();
      dismissToast(node);
    });

    stack.prepend(node);

    while (stack.children.length > MAX_VISIBLE) {
      dismissToast(stack.lastElementChild);
    }

    if (!p.persist) {
      node._toastTimer = setTimeout(() => dismissToast(node), p.duration);
    }

    return node;
  }

  function clear() {
    const stack = document.getElementById('toast-stack');
    if (!stack) return;
    Array.from(stack.children).forEach((c) => dismissToast(c));
  }

  global.ApolloToast = { push, dismiss: dismissToast, clear, ensureStack };
})(window);
