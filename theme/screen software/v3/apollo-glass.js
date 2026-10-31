/*!
 * Apollo Glass  v2.0.0
 * Premium glass-refract icon runtime.
 *
 *   <i class="apollo-glass"></i>                        — decorative (default)
 *   <i class="apollo-glass" aria-label="Apollo"></i>    — labelled
 *   <i class="apollo-glass" data-no-tilt></i>           — disable 3D tilt
 *   <i class="apollo-glass" style="font-size:48px"></i> — explicit size
 *
 * Audit fixes (vs v1.x):
 *  ─ Non-destructive: skips elements that already contain non-whitespace content.
 *  ─ A11y: chooses aria-hidden OR role="img" based on presence of label (never both).
 *  ─ Zero external deps: clip mask is inlined as data: URI built from icon path.
 *  ─ True dark-mode: follows BOTH .dark-mode class AND prefers-color-scheme.
 *  ─ One shared ResizeObserver (no per-element instances, no leaks).
 *  ─ MutationObserver disconnects ResizeObserver on element removal.
 *  ─ Iridescent fallback when backdrop-filter:url() is unsupported (Chrome Android, FB/IG webview).
 *  ─ touch-action: manipulation kills 300ms tap delay; pointermove never blocks scroll.
 */
'use strict';
(function (win) {
  if (!win || win.__apolloGlassV2) return;
  win.__apolloGlassV2 = true;

  var doc  = win.document;
  if (!doc) return;

  /* ── Constants ───────────────────────────────────────────────────── */
  var NS         = 'http://www.w3.org/2000/svg';
  var FILTER_ID  = 'apollo-glass-flute-v2';
  var CSS_ID     = 'apollo-glass-css-v2';
  var INNER      = 200;
  var EASE       = 'cubic-bezier(0.16,1,0.3,1)';

  /* Apollo logo path — used for BOTH the rendered mark AND the inline clip-mask.
     This eliminates the external https://assets.apollo.rio.br/i/apollo-s.svg dep. */
  var PATH =
    'M10.208521 14.887119l2.975605 0c2.878458 0 4.409489 0.720844 6.359568 ' +
    '2.627895c0.108236 0.105828 0.12279 0.278202 0.020394 0.389215l-2.484774 ' +
    '2.694557c-0.102376 0.110992 -0.286064 0.130942 -0.389215 0.020407l' +
    '-3.228883 -3.454773 0 4.553169c0 0.151587 -0.124013 0.2756 -0.2756 ' +
    '0.2756l-2.975605 0c-0.151574 0 -0.2756 -0.124013 -0.2756 -0.2756l0 ' +
    '-6.554906c0 -0.151574 0.124026 -0.275587 0.2756 -0.275587z' +
    'M9.106143 10.203854l0 2.975605c0 2.878458 -0.720832 4.409489 -2.627895 ' +
    '6.359581c-0.105828 0.108223 -0.278215 0.122777 -0.389215 0.020381l' +
    '-2.69457 -2.484774c-0.110979 -0.102376 -0.130929 -0.286064 -0.020407 ' +
    '-0.389215l3.454773 -3.228883 -4.553169 0c-0.151574 0 -0.275587 ' +
    '-0.124026 -0.275587 -0.275613l0 -2.975592c0 -0.151587 0.124013 -0.2756 ' +
    '0.275587 -0.2756l6.554906 0c0.151574 0 0.2756 0.124013 0.2756 0.2756z' +
    'M13.791479 9.115478l-2.975592 0c-2.878458 0 -4.409489 -0.720844 ' +
    '-6.359581 -2.627895c-0.108223 -0.105828 -0.122777 -0.278202 -0.020394 ' +
    '-0.389215l2.484774 -2.69457c0.102363 -0.110979 0.286051 -0.130929 ' +
    '0.389215 -0.020407l3.228883 3.454773 0 -4.553169c0 -0.151574 0.124026 ' +
    '-0.275587 0.2756 -0.275587l2.975592 0c0.151587 0 0.275613 0.124013 ' +
    '0.275613 0.275587l0 6.554906c0 0.151587 -0.124026 0.275613 -0.275613 ' +
    '0.275613z' +
    'M14.893857 13.783143l0 -2.975592c0 -2.878458 0.720832 -4.409489 ' +
    '2.627895 -6.359581c0.105828 -0.108236 0.278202 -0.12279 0.389215 ' +
    '-0.020394l2.694557 2.484774c0.110992 0.102376 0.130942 0.286064 0.02042 ' +
    '0.389215l-3.454786 3.228883 4.553182 0c0.151574 0 0.275587 0.124026 ' +
    '0.275587 0.275613l0 2.975592c0 0.151587 -0.124013 0.2756 -0.275587 ' +
    '0.2756l-6.554906 0c-0.151574 0 -0.275587 -0.124013 -0.275587 -0.2756z';

  /* Inline mask — base64 data URI (reliable in url() across Chrome/Safari/file://) */
  var MASK_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">' +
    '<path fill="#000" d="' + PATH + '"/></svg>';
  var MASK = 'data:image/svg+xml;base64,' + btoa(MASK_SVG);

  /* ── Feature detection ─────────────────────────────────────────── */
  /* CSS.supports is the only reliable test — Chrome Android reports the
     property name but silently fails to render url(#filter) backdrops.
     We additionally flag known-broken webviews on Android.            */
  var HAS_BDFILTER_URL = (function () {
    try {
      var prop = 'backdrop-filter: url(#x)';
      var prefixed = '-webkit-backdrop-filter: url(#x)';
      var supported = (win.CSS && win.CSS.supports) ?
        (win.CSS.supports(prop) || win.CSS.supports(prefixed)) : false;
      if (!supported) return false;
      /* Heuristic: Chrome/Android < 119 reports support but renders nothing. */
      var ua = (win.navigator && win.navigator.userAgent) ? win.navigator.userAgent : '';
      if (/Android/i.test(ua) && !/Firefox/i.test(ua)) {
        var m = ua.match(/Chrome\/(\d+)/);
        if (m && parseInt(m[1], 10) < 119) return false;
      }
      return true;
    } catch (e) { return false; }
  })();

  /* ── 1. Inject hidden SVG filter (once, body start) ─────────────── */
  function injectFilter() {
    if (doc.getElementById(FILTER_ID)) return;
    var svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('id', FILTER_ID + '-host');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.cssText =
      'position:absolute!important;top:0;left:0;width:0!important;' +
      'height:0!important;overflow:hidden;pointer-events:none;';

    var defs = doc.createElementNS(NS, 'defs');
    var flt  = doc.createElementNS(NS, 'filter');
    flt.setAttribute('id', FILTER_ID);
    flt.setAttribute('x', '-50%'); flt.setAttribute('y', '-50%');
    flt.setAttribute('width', '200%'); flt.setAttribute('height', '200%');
    flt.setAttribute('color-interpolation-filters', 'sRGB');

    var prims = [
      ['feGaussianBlur',{in:'SourceGraphic',stdDeviation:'4.5',result:'frost'}],
      ['feGaussianBlur',{in:'SourceGraphic',stdDeviation:'2.8',result:'smooth'}],
      ['feDisplacementMap',{in:'frost',in2:'smooth',scale:'-100',xChannelSelector:'R',yChannelSelector:'G',result:'dispR'}],
      ['feColorMatrix',{in:'dispR',type:'matrix',values:'1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',result:'R'}],
      ['feDisplacementMap',{in:'frost',in2:'smooth',scale:'-80',xChannelSelector:'R',yChannelSelector:'G',result:'dispG'}],
      ['feColorMatrix',{in:'dispG',type:'matrix',values:'0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',result:'G'}],
      ['feDisplacementMap',{in:'frost',in2:'smooth',scale:'-60',xChannelSelector:'R',yChannelSelector:'G',result:'dispB'}],
      ['feColorMatrix',{in:'dispB',type:'matrix',values:'0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',result:'B'}],
      ['feBlend',{in:'R',in2:'G',mode:'screen',result:'rg'}],
      ['feBlend',{in:'rg',in2:'B',mode:'screen',result:'final'}]
    ];
    for (var i = 0; i < prims.length; i++) {
      var p = doc.createElementNS(NS, prims[i][0]);
      var a = prims[i][1];
      for (var k in a) { if (a.hasOwnProperty(k)) p.setAttribute(k, a[k]); }
      flt.appendChild(p);
    }
    defs.appendChild(flt);
    svg.appendChild(defs);

    var root = doc.body || doc.documentElement;
    root.insertBefore(svg, root.firstChild);
  }

  /* ── 2. Inject CSS (once) ───────────────────────────────────────── */
  function injectCSS() {
    if (doc.getElementById(CSS_ID)) return;

    /* Iridescent fallback for the .ag-glass layer when backdrop-filter:url()
       is unsupported. Conic gradient + screen blend approximates refraction. */
    var fallbackBg =
      'background:' +
        'radial-gradient(circle at 30% 25%, rgba(255,0,128,.45), transparent 55%),' +
        'radial-gradient(circle at 75% 35%, rgba(255,200,0,.35),  transparent 55%),' +
        'radial-gradient(circle at 25% 80%, rgba(0,210,255,.45),  transparent 55%),' +
        'radial-gradient(circle at 80% 75%, rgba(150,0,255,.45),  transparent 55%),' +
        'rgba(255,255,255,.06);' +
      'mix-blend-mode:screen;';

    var css =
      /* outer host — drop-in icon, no overflow:hidden (breaks backdrop-filter) */
      '.apollo-glass{' +
        'display:inline-block;line-height:1;vertical-align:-.125em;' +
        'font-style:normal;font-size:1em;' +
        'position:relative;width:1em;height:1em;flex-shrink:0;' +
        'touch-action:manipulation;-webkit-tap-highlight-color:transparent;' +
      '}' +
      /* 200 px native render bridge, scaled to 1em via transform */
      '.apollo-glass>.ag-scale{' +
        'position:absolute;top:0;left:0;' +
        'width:' + INNER + 'px;height:' + INNER + 'px;' +
        'transform-origin:0 0;pointer-events:none;' +
        '-webkit-user-select:none;user-select:none;' +
      '}' +
      /* tilt target — mirrors original .apollo-refract */
      '.apollo-glass .ag-tilt{' +
        'width:100%;height:100%;position:relative;' +
        'background:#fff;' +
        '-webkit-mask-image:url(' + MASK + ');mask-image:url(' + MASK + ');' +
        '-webkit-mask-size:100% 100%;mask-size:100% 100%;' +
        '-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;' +
        '-webkit-mask-position:center;mask-position:center;' +
        'transform:perspective(1500px) rotateX(0deg) rotateY(0deg);' +
        'will-change:transform;' +
      '}' +
      '.apollo-glass .ag-ic{position:absolute;top:0;right:0;bottom:0;left:0;}' +
      '.apollo-glass .ag-logo{' +
        'position:absolute;top:0;right:0;bottom:0;left:0;' +
        'display:-webkit-flex;display:flex;' +
        '-webkit-align-items:center;align-items:center;' +
        '-webkit-justify-content:center;justify-content:center;z-index:1;' +
      '}' +
      '.apollo-glass .ag-logo svg{' +
        'width:100%;height:100%;color:#000;' +
        'filter:drop-shadow(0 2px 5px rgba(0,0,0,.05));overflow:visible;' +
      '}' +
      /* glass — primary: SVG backdrop-filter (Safari, modern Chrome) */
      '.apollo-glass .ag-glass{' +
        'position:absolute;top:0;right:0;bottom:0;left:0;z-index:2;' +
        '-webkit-backdrop-filter:url(#' + FILTER_ID + ');' +
        'backdrop-filter:url(#' + FILTER_ID + ');' +
        'background:rgba(255,255,255,.06);' +
      '}' +
      /* glass — fallback: gradient iridescence when url() filter unsupported */
      '.ag-no-bdfilter .apollo-glass .ag-glass{' +
        '-webkit-backdrop-filter:none;backdrop-filter:none;' + fallbackBg +
      '}' +
      /* ── DARK MODE: follows .dark-mode class OR prefers-color-scheme ── */
      '@media (prefers-color-scheme:dark){' +
        '.apollo-glass .ag-logo svg{color:#fff;}' +
      '}' +
      '.dark-mode .apollo-glass .ag-logo svg,' +
      'html.dark-mode .apollo-glass .ag-logo svg,' +
      'body.dark-mode .apollo-glass .ag-logo svg{color:#fff;}' +
      /* Light-mode class wins even on dark OS, for explicit overrides */
      '.light-mode .apollo-glass .ag-logo svg,' +
      'html.light-mode .apollo-glass .ag-logo svg{color:#000;}' +
      /* v3 shell — fixed accent fill (nav brand) */
      '.apollo-glass.ag-brand .ag-tilt{background:var(--ag-fill,var(--ac,#E8820C));}' +
      '.apollo-glass.ag-brand .ag-logo svg{color:var(--ag-fill,var(--ac,#E8820C));fill:currentColor;}' +
      '.apollo-glass.ag-live .ag-glass{' +
        'background:linear-gradient(135deg,rgba(255,140,0,.14),rgba(255,255,255,.08),rgba(0,180,120,.12));' +
        'background-size:220% 220%;animation:ag-chroma 7s ' + EASE + ' infinite;' +
      '}' +
      '@keyframes ag-chroma{' +
        '0%,100%{background-position:0% 50%;}' +
        '50%{background-position:100% 0%;}' +
      '}';

    var st = doc.createElement('style');
    st.id = CSS_ID;
    st.textContent = css;
    (doc.head || doc.documentElement).appendChild(st);

    if (!HAS_BDFILTER_URL) {
      doc.documentElement.classList.add('ag-no-bdfilter');
    }
  }

  /* ── 3. Build inner DOM ─────────────────────────────────────────── */
  function build() {
    var scale = doc.createElement('span'); scale.className = 'ag-scale';
    var tilt  = doc.createElement('span'); tilt.className  = 'ag-tilt';
    var ic    = doc.createElement('span'); ic.className    = 'ag-ic';
    var logo  = doc.createElement('span'); logo.className  = 'ag-logo';

    var svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill',   'currentColor');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '0.5');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = doc.createElementNS(NS, 'path');
    path.setAttribute('d', PATH);
    svg.appendChild(path);
    logo.appendChild(svg);

    var glass = doc.createElement('span'); glass.className = 'ag-glass';

    ic.appendChild(logo); ic.appendChild(glass);
    tilt.appendChild(ic);
    scale.appendChild(tilt);
    return { scale: scale, tilt: tilt };
  }

  /* ── 4. Empty-check (audit fix: non-destructive) ────────────────── */
  function isEmptyIsh(el) {
    for (var n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 1) {
        /* allow re-running over our own injected structure */
        if (n.classList && n.classList.contains('ag-scale')) continue;
        return false;
      }
      if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) return false;
    }
    return true;
  }

  /* ── 5. Scale helper (one shared ResizeObserver) ────────────────── */
  function applyScale(el) {
    var s = el._agScale;
    if (!s) return;
    var w = el.getBoundingClientRect().width;
    if (!w) w = parseFloat(getComputedStyle(el).width)    || 0;
    if (!w) w = parseFloat(getComputedStyle(el).fontSize) || 24;
    s.style.transform = 'scale(' + (w / INNER) + ')';
  }

  var sharedRO = (typeof ResizeObserver !== 'undefined') ?
    new ResizeObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) applyScale(entries[i].target);
    }) : null;

  /* ── 6. Tilt interaction (mobile-safe Pointer Events) ───────────── */
  function attachTilt(el) {
    if (el.hasAttribute('data-no-tilt') || el.classList.contains('ag-static')) return;
    var t = el._agTilt;
    if (!t) return;
    var resetTimer = 0;

    function onMove(e) {
      var r = el.getBoundingClientRect();
      if (!r.width) return;
      var x = (e.clientX - r.left) / r.width  - 0.5;
      var y = (e.clientY - r.top)  / r.height - 0.5;
      t.style.transition = '';
      t.style.transform  =
        'perspective(1500px) rotateX(' + (-y * 19) + 'deg) rotateY(' + (x * 16) + 'deg)';
    }
    function reset() {
      t.style.transition = 'transform 900ms ' + EASE;
      t.style.transform  = 'perspective(1500px) rotateX(0deg) rotateY(0deg)';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(function () { t.style.transition = ''; }, 900);
    }

    /* Pointer events: unified mouse + touch, never blocks scroll */
    el.addEventListener('pointermove',   onMove, { passive: true });
    el.addEventListener('pointerleave',  reset);
    el.addEventListener('pointercancel', reset);
    el.addEventListener('pointerup',     reset);
  }

  /* ── 7. A11y wiring (audit fix: no conflict) ────────────────────── */
  function applyA11y(el) {
    var hasLabel =
      el.hasAttribute('aria-label') ||
      el.hasAttribute('aria-labelledby') ||
      el.hasAttribute('title');
    if (hasLabel) {
      el.setAttribute('role', 'img');
      el.removeAttribute('aria-hidden');
    } else if (!el.hasAttribute('aria-hidden')) {
      /* decorative — no role, just hide from AT */
      el.setAttribute('aria-hidden', 'true');
    }
  }

  /* ── 8. Upgrade + cleanup ──────────────────────────────────────── */
  var upgraded = new WeakSet();

  function upgrade(el) {
    if (!el || el.nodeType !== 1) return;
    if (!el.classList || !el.classList.contains('apollo-glass')) return;
    if (upgraded.has(el)) return;
    if (!isEmptyIsh(el)) {
      /* preserve user content — opt out via class */
      if (win.console && win.console.warn) {
        win.console.warn('[ApolloGlass] skipping non-empty element', el);
      }
      return;
    }
    upgraded.add(el);

    var b = build();
    el._agScale = b.scale;
    el._agTilt  = b.tilt;

    el.setAttribute('data-apollo-glass-v2', '1');
    el.textContent = '';
    el.appendChild(b.scale);

    applyA11y(el);
    attachTilt(el);

    /* Defer scale until layout settled */
    win.requestAnimationFrame(function () { applyScale(el); });

    if (sharedRO) sharedRO.observe(el);
  }

  function teardown(el) {
    if (!upgraded.has(el)) return;
    if (sharedRO) { try { sharedRO.unobserve(el); } catch (e) {} }
    el._agScale = null;
    el._agTilt  = null;
    /* WeakSet has no .delete in old browsers; element will GC anyway */
    if (upgraded.delete) upgraded.delete(el);
  }

  function upgradeAll(root) {
    var scope = (root && root.querySelectorAll) ? root : doc;
    var els = scope.querySelectorAll('.apollo-glass');
    for (var i = 0; i < els.length; i++) upgrade(els[i]);
  }

  /* ── 9. Init ────────────────────────────────────────────────────── */
  function init() {
    injectFilter();
    injectCSS();
    upgradeAll(doc);

    if (typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          /* added nodes */
          var added = m.addedNodes;
          if (added) for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType !== 1) continue;
            if (n.classList && n.classList.contains('apollo-glass')) upgrade(n);
            if (n.querySelectorAll) {
              var sub = n.querySelectorAll('.apollo-glass');
              for (var k = 0; k < sub.length; k++) upgrade(sub[k]);
            }
          }
          /* removed nodes — clean up observers to prevent leaks */
          var removed = m.removedNodes;
          if (removed) for (var rj = 0; rj < removed.length; rj++) {
            var rn = removed[rj];
            if (rn.nodeType !== 1) continue;
            if (rn.classList && rn.classList.contains('apollo-glass')) teardown(rn);
            if (rn.querySelectorAll) {
              var rs = rn.querySelectorAll('.apollo-glass');
              for (var rk = 0; rk < rs.length; rk++) teardown(rs[rk]);
            }
          }
        }
      });
      mo.observe(doc.documentElement, { subtree: true, childList: true });
    }

    /* bfcache restore — re-measure */
    win.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      win.requestAnimationFrame(function () {
        var els = doc.querySelectorAll('.apollo-glass');
        for (var i = 0; i < els.length; i++) applyScale(els[i]);
      });
    });
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  /* ── Public API ────────────────────────────────────────────────── */
  win.apolloGlass = {
    version: '2.0.1',
    upgrade: upgrade,
    teardown: teardown,
    rescan: function (root) { upgradeAll(root); },
    reScale: applyScale,
    create: function (opts) {
      opts = opts || {};
      var el = doc.createElement('i');
      el.className = 'apollo-glass';
      if (opts.fontSize != null) {
        el.style.fontSize =
          typeof opts.fontSize === 'number' ? opts.fontSize + 'px' : opts.fontSize;
      }
      if (opts.className) el.className += ' ' + opts.className;
      if (opts.noTilt) el.setAttribute('data-no-tilt', '');
      upgrade(el);
      return el;
    },
    supportsBackdropFilter: HAS_BDFILTER_URL
  };
})(typeof window !== 'undefined' ? window : this);