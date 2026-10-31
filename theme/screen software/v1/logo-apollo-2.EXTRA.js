/* ════════════════════════════════════════════════════════════
   logo-apollo-2.js — Apollo Liquid Glass Logo v2.0
   Targets : <i class="apollo-2" [data-size="N"] [data-src="url"]>
   Replaces: target <i> with a premium glass card containing the logo

   WHY REWRITTEN:
   - backdrop-filter:url(#id) is unsupported in ALL browsers (prev bug)
   - old filter applied to blurred self, not to the logo content
   - no visible glass styling, no fallback for dead CDN images

   HOW IT WORKS NOW:
   - Self-contained SVG per card: feTurbulence+feDisplacementMap INSIDE
     the same SVG as the <image>, so url(#id) always resolves (no
     cross-document / cross-origin reference issues at all)
   - Fallback "A" glyph rendered below the <image> layer — always shows
     even if the CDN URL fails or has no internet connection
   - CSS glass: gradient + backdrop-filter + inset shadows (reliable)
   - Dynamic Fresnel shine: radial-gradient moves with mouse tilt
   - RAf-based 3D parallax: smooth, no jank
════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (window.__a2v2Runtime) return;
  window.__a2v2Runtime = true;

  var DEFAULT_SRC  = 'https://assets.apollo.rio.br/i/apollo-s.svg';
  var DEFAULT_SIZE = 40;

  /* ─── CSS — injected once ─────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('a2v2-css')) return;
    var s = document.createElement('style');
    s.id  = 'a2v2-css';

    /* NOTE: box-shadow is on .a2v2c (not inside it) so overflow:hidden
       does NOT clip it. backdrop-filter on .a2v2g blurs the wall behind. */
    s.textContent =

      /* ── host wrapper ── */
      '.a2v2h{display:inline-flex;align-items:center;justify-content:center;}' +

      /* ── card shell ── */
      '.a2v2c{' +
        'position:relative;' +
        'border-radius:20px;' +
        'overflow:hidden;' +
        'will-change:transform;' +
        'cursor:default;user-select:none;' +
        'box-shadow:' +
          'inset 0 1.5px 0 rgba(255,255,255,.72),' +
          'inset 0 -1px   0 rgba(0,0,0,.06),' +
          '0 0 0 .75px rgba(0,0,0,.10),' +
          '0 2px 10px rgba(0,0,0,.07),' +
          '0 0 18px rgba(255,92,0,.06);' +
        'transition:transform .9s cubic-bezier(.03,.98,.52,.99),box-shadow .35s ease;' +
      '}' +

      /* ── frosted glass background ── */
      '.a2v2g{' +
        'position:absolute;inset:0;' +
        'background:linear-gradient(148deg,' +
          'rgba(255,255,255,.88) 0%,' +
          'rgba(255,246,238,.78) 45%,' +
          'rgba(255,235,215,.82) 100%);' +
        'backdrop-filter:blur(10px) saturate(150%);' +
        '-webkit-backdrop-filter:blur(10px) saturate(150%);' +
        'z-index:0;' +
      '}' +

      /* ── SVG logo layer ── */
      '.a2v2s{position:relative;z-index:1;display:block;flex-shrink:0;}' +

      /* ── Fresnel shine (moves with pointer) ── */
      '.a2v2sh{' +
        'position:absolute;inset:0;' +
        'border-radius:20px;' +
        'background:radial-gradient(ellipse at 25% 22%,' +
          'rgba(255,255,255,.72) 0%,' +
          'rgba(255,255,255,.20) 28%,' +
          'transparent 55%);' +
        'z-index:2;pointer-events:none;mix-blend-mode:screen;' +
      '}' +

      /* ── Apollo orange counter-glow (bottom-right) ── */
      '.a2v2gw{' +
        'position:absolute;inset:0;' +
        'background:radial-gradient(ellipse at 72% 82%,' +
          'rgba(255,92,0,.24) 0%,' +
          'rgba(255,140,50,.10) 40%,' +
          'transparent 65%);' +
        'z-index:2;pointer-events:none;' +
      '}' +

      /* ── inner border frame ── */
      '.a2v2b{' +
        'position:absolute;inset:0;border-radius:20px;' +
        'border:1px solid rgba(255,255,255,.50);' +
        'box-shadow:inset 0 1px 0 rgba(255,255,255,.65),inset 0 -1px 0 rgba(0,0,0,.04);' +
        'z-index:3;pointer-events:none;' +
      '}';

    document.head.appendChild(s);
  }

  /* ─── Build self-contained SVG: inline filter + logo ───────── */
  /* Filter defined IN THE SAME SVG as the <image> — url(#id) is
     guaranteed to resolve regardless of file:// / CORS / context.  */
  function buildLogoSVG(size, src, filtId) {
    var ns    = 'http://www.w3.org/2000/svg';
    var pad   = Math.round(size * 0.14);   /* 14% inset each side */
    var inner = size - pad * 2;

    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('xmlns',       ns);
    svg.setAttribute('viewBox',     '0 0 ' + size + ' ' + size);
    svg.setAttribute('width',        size);
    svg.setAttribute('height',       size);
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('a2v2s');

    /* ── inline filter (feTurbulence → feDisplacementMap) ────── */
    var defs   = document.createElementNS(ns, 'defs');
    var filter = document.createElementNS(ns, 'filter');
    filter.setAttribute('id',      filtId);
    filter.setAttribute('x',      '-18%');
    filter.setAttribute('y',      '-18%');
    filter.setAttribute('width',  '136%');
    filter.setAttribute('height', '136%');
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    /* fractalNoise at low frequency = large organic glass waves */
    var turb = document.createElementNS(ns, 'feTurbulence');
    turb.setAttribute('type',          'fractalNoise');
    turb.setAttribute('baseFrequency', '0.018 0.026');
    turb.setAttribute('numOctaves',    '3');
    turb.setAttribute('seed',          '6');
    turb.setAttribute('result',        'warp');
    filter.appendChild(turb);

    /* displacement proportional to card size: ~15% gives visible glass */
    var disp = document.createElementNS(ns, 'feDisplacementMap');
    disp.setAttribute('in',               'SourceGraphic');
    disp.setAttribute('in2',             'warp');
    disp.setAttribute('scale',            String(+(size * 0.15).toFixed(1)));
    disp.setAttribute('xChannelSelector', 'R');
    disp.setAttribute('yChannelSelector', 'G');
    filter.appendChild(disp);

    defs.appendChild(filter);
    svg.appendChild(defs);

    /* ── fallback glyph "A" — painted BELOW the image ───────── */
    /* When <image> fails (bad URL / offline) it renders nothing,
       so this text shows through. When image loads it covers it. */
    var fb = document.createElementNS(ns, 'text');
    fb.setAttribute('x',            size / 2);
    fb.setAttribute('y',            size * 0.66);
    fb.setAttribute('text-anchor',  'middle');
    fb.setAttribute('font-family',  'system-ui,-apple-system,sans-serif');
    fb.setAttribute('font-weight',  '900');
    fb.setAttribute('font-size',    Math.round(size * 0.46));
    fb.setAttribute('letter-spacing', '-0.03em');
    fb.setAttribute('fill',         '#FF5C00');
    fb.setAttribute('opacity',      '0.90');
    fb.setAttribute('filter',       'url(#' + filtId + ')');
    fb.textContent = 'A';
    svg.appendChild(fb);

    /* ── logo <image> (painted on top — covers fallback) ─────── */
    var img = document.createElementNS(ns, 'image');
    img.setAttribute('href',                src);
    img.setAttribute('x',                   pad);
    img.setAttribute('y',                   pad);
    img.setAttribute('width',               inner);
    img.setAttribute('height',              inner);
    img.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    img.setAttribute('filter',              'url(#' + filtId + ')');
    svg.appendChild(img);

    return svg;
  }

  /* ─── Build one card ──────────────────────────────────────── */
  var _n = 0;
  function buildCard(el) {
    var size   = parseInt(el.getAttribute('data-size'), 10) || DEFAULT_SIZE;
    var src    = el.getAttribute('data-src') || DEFAULT_SRC;
    var elPad  = el.style.padding || '';
    var filtId = 'a2v2f' + (++_n);

    /* host carries original padding */
    var host = document.createElement('div');
    host.className = 'a2v2h';
    if (elPad) host.style.padding = elPad;

    /* card */
    var card = document.createElement('div');
    card.className = 'a2v2c';
    card.style.width  = size + 'px';
    card.style.height = size + 'px';

    /* layer stack */
    var glassBg = document.createElement('div'); glassBg.className = 'a2v2g';
    var logoSvg = buildLogoSVG(size, src, filtId);
    var shine   = document.createElement('div'); shine.className   = 'a2v2sh';
    var glow    = document.createElement('div'); glow.className    = 'a2v2gw';
    var border  = document.createElement('div'); border.className  = 'a2v2b';

    card.appendChild(glassBg);
    card.appendChild(logoSvg);
    card.appendChild(shine);
    card.appendChild(glow);
    card.appendChild(border);
    host.appendChild(card);

    /* ── RAF 3D parallax + dynamic Fresnel shine ───────────── */
    var TILT  = 16;
    var rafId = null;

    function r2(n) { return +n.toFixed(2); }

    function onMove(e) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(function () {
        var pt    = e.touches ? e.touches[0] : e;
        var bb    = card.getBoundingClientRect();
        if (!bb.width) return;
        var range = Math.max(bb.width * 2.8, 80);
        var cx    = bb.left + bb.width  / 2;
        var cy    = bb.top  + bb.height / 2;
        var nx    = r2(Math.max(-1, Math.min(1, (pt.clientX - cx) / range)));
        var ny    = r2(Math.max(-1, Math.min(1, (pt.clientY - cy) / range)));

        card.style.transition = 'transform .07s linear,box-shadow .18s ease';
        card.style.transform  =
          'perspective(900px) rotateX(' + r2(ny * -TILT) + 'deg)' +
          ' rotateY(' + r2(nx * TILT) + 'deg) scale(1.07)';
        card.style.boxShadow  =
          'inset 0 1.5px 0 rgba(255,255,255,.72),' +
          'inset 0 -1px   0 rgba(0,0,0,.06),' +
          '0 0 0 .75px rgba(0,0,0,.10),' +
          '0 8px 28px rgba(255,92,0,.22),' +
          '0 2px 8px rgba(0,0,0,.10)';

        /* shine origin = opposite of tilt — simulates a light source */
        var sx = Math.round(50 - nx * 42);
        var sy = Math.round(50 - ny * 42);
        shine.style.background =
          'radial-gradient(ellipse at ' + sx + '% ' + sy + '%,' +
          'rgba(255,255,255,.80) 0%,' +
          'rgba(255,255,255,.22) 28%,' +
          'transparent 58%)';
      });
    }

    function onLeave() {
      if (rafId) cancelAnimationFrame(rafId);
      card.style.transition =
        'transform .9s cubic-bezier(.03,.98,.52,.99),box-shadow .35s ease';
      card.style.transform  =
        'perspective(900px) rotateX(0deg) rotateY(0deg) scale(1)';
      card.style.boxShadow  =
        'inset 0 1.5px 0 rgba(255,255,255,.72),' +
        'inset 0 -1px   0 rgba(0,0,0,.06),' +
        '0 0 0 .75px rgba(0,0,0,.10),' +
        '0 2px 10px rgba(0,0,0,.07),' +
        '0 0 18px rgba(255,92,0,.06)';
      shine.style.background = '';
    }

    window.addEventListener('mousemove', onMove, { passive: true });
    card.addEventListener('mouseleave',  onLeave, { passive: true });

    el.parentNode.replaceChild(host, el);
  }

  /* ─── Init ─────────────────────────────────────────────────── */
  function init() {
    injectCSS();
    var targets = document.querySelectorAll('i.apollo-2');
    if (!targets.length) return;
    for (var i = 0; i < targets.length; i++) buildCard(targets[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
