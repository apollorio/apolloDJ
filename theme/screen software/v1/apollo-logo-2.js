/*!
 * apollo-logo-2.js
 * apollo::rio (apollo.rio.br) — voluntary project
 *
 * Renders a glass-refraction logo in place of <i class="apollo-2"> tags.
 *
 * Usage:
 *   <i class="apollo-2"></i>                       -> glass + parallax
 *   <i class="apollo-2 noparallax"></i>            -> glass + icon, NO parallax
 *   <i class="apollo-2 noparalax"></i>             -> alias (typo-tolerant)
 *
 * Optional attributes:
 *   data-src="..."   override logo SVG/PNG URL
 *   data-tilt="30"   override tilt degrees (parallax variant only)
 *
 * The component sizes itself to the host <i> element. All glass refraction
 * parameters scale proportionally to the rendered box width, so the effect
 * stays coherent at any size — from a 16px favicon to a 1024px hero.
 *
 * Self-contained: no external CSS, no Tailwind, no GSAP, no Tweakpane.
 * Inlines its own SVG filter and styles into a Shadow DOM-free scoped wrapper.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuration (matches the perfected reference values)
  // ---------------------------------------------------------------------------
  var DEFAULT_LOGO = 'https://assets.apollo.rio.br/i/apollo-s.svg';
  var FILTER_ID_PREFIX = 'apollo2-flute-';
  var STYLE_ID = 'apollo2-styles';
  var instanceCounter = 0;

  // Reference config — these are the "perfect standard" values for a 192px box
  // (12rem at the demo's root font-size). All distance-based params scale
  // linearly with box width vs. this reference, so the visual stays consistent.
  var REFERENCE_BOX_PX = 192;
  var REF_CONFIG = {
    dispersion: 30,    // px — RGB channel offset
    refraction: -125,  // px — base displacement scale (mirror config)
    smoothness: 3.3,   // px — gaussian blur on displacement map
    frost: 7.5,        // px — backdrop frost blur
    fresnel: 0.3,      // 0..1 — edge falloff (unitless, NOT scaled)
    patternScale: 5,   // unitless — refraction pattern density
    rotation: 0,       // degrees
    tilt: 30           // degrees — parallax max tilt
  };

  // Minimum box size below which we clamp aggressively to keep the effect
  // from collapsing into noise (think: tiny map-pin sized renders).
  var MIN_BOX_PX = 12;

  // ---------------------------------------------------------------------------
  // One-time global stylesheet injection
  // ---------------------------------------------------------------------------
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      '.apollo2-host{' +
        'display:block;position:relative;width:100%;height:100%;' +
        'box-sizing:border-box;vertical-align:middle;line-height:0;' +
        'font-style:normal;' +
      '}' +
      '.apollo2-stage{' +
        'position:relative;display:flex;align-items:center;justify-content:center;' +
        'width:100%;height:100%;' +
      '}' +
      '.apollo2-stage>*{' +
        '--ax-rx:calc(var(--ax-y,0) * var(--ax-tilt,30deg) * -1);' +
        '--ax-ry:calc(var(--ax-x,0) * var(--ax-tilt,30deg));' +
        'transition:transform 1200ms cubic-bezier(.03,.98,.52,.99);' +
        'transform:perspective(900px) rotateX(var(--ax-rx)) rotateY(var(--ax-ry)) translateZ(var(--ax-depth,0));' +
        'will-change:transform;' +
      '}' +
      '.apollo2-stage:not(:hover)>*{--ax-rx:0deg;--ax-ry:0deg;}' +
      '.apollo2-host.apollo2-noparallax .apollo2-stage>*{' +
        '--ax-rx:0deg !important;--ax-ry:0deg !important;' +
      '}' +
      '.apollo2-img{' +
        'width:85%;height:85%;object-fit:contain;display:block;' +
        '--ax-depth:-2em;' +
      '}' +
      '.apollo2-glass{' +
        'position:absolute;inset:0;aspect-ratio:1/1;' +
        'background:#0001;box-shadow:0 8px 32px 0 #0003;' +
        'border:2px solid #0001;border-radius:14%;' +
        'overflow:hidden;--ax-depth:1em;' +
        'pointer-events:none;' +
      '}' +
      '.apollo2-defs{' +
        'position:absolute;width:0;height:0;pointer-events:none;opacity:0;' +
      '}';
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // Build the SVG filter for a given config
  // Returns an SVG <svg> element wrapping the <filter>, plus refs for live tweaks.
  // ---------------------------------------------------------------------------
  function buildFilterSVG(filterId, cfg) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('viewBox', '0 0 1 1');
    svg.setAttribute('color-interpolation-filters', 'sRGB');
    svg.setAttribute('class', 'apollo2-defs');

    var filter = document.createElementNS(ns, 'filter');
    filter.setAttribute('id', filterId);
    filter.setAttribute('x', '-25%');
    filter.setAttribute('y', '-25%');
    filter.setAttribute('width', '150%');
    filter.setAttribute('height', '150%');

    // Refraction pattern image (data URI built from cfg)
    var fePatt = document.createElementNS(ns, 'feImage');
    fePatt.setAttribute('href', buildPatternDataURI(cfg));
    fePatt.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    filter.appendChild(fePatt);

    // Smoothness blur on the pattern
    var feSm = document.createElementNS(ns, 'feGaussianBlur');
    feSm.setAttribute('stdDeviation', String(cfg.smoothness));
    feSm.setAttribute('result', 'smoothness');
    filter.appendChild(feSm);

    // Three displacement maps for chromatic dispersion (R/G/B mirror configs)
    var dispMaps = [];
    var colorMatrices = [
      '1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0', // R
      '0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0', // G
      '0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0'  // B
    ];
    var resultNames = ['R', 'G', 'B'];

    for (var i = 0; i < 3; i++) {
      var feDM = document.createElementNS(ns, 'feDisplacementMap');
      feDM.setAttribute('scale', String(cfg.refraction + (i - 1) * cfg.dispersion));
      feDM.setAttribute('in', 'SourceGraphic');  // Refract the logo itself
      feDM.setAttribute('in2', 'smoothness');
      feDM.setAttribute('xChannelSelector', 'R');
      feDM.setAttribute('yChannelSelector', 'G');
      filter.appendChild(feDM);
      dispMaps.push(feDM);

      var feCM = document.createElementNS(ns, 'feColorMatrix');
      feCM.setAttribute('result', resultNames[i]);
      feCM.setAttribute('type', 'matrix');
      feCM.setAttribute('values', colorMatrices[i]);
      filter.appendChild(feCM);
    }

    // Blend R+G, then +B
    var feBlend1 = document.createElementNS(ns, 'feBlend');
    feBlend1.setAttribute('in', 'R');
    feBlend1.setAttribute('in2', 'G');
    feBlend1.setAttribute('mode', 'screen');
    filter.appendChild(feBlend1);

    var feBlend2 = document.createElementNS(ns, 'feBlend');
    feBlend2.setAttribute('in2', 'B');
    feBlend2.setAttribute('mode', 'screen');
    feBlend2.setAttribute('result', 'displaced');
    filter.appendChild(feBlend2);

    // Fresnel via desaturated smoothness alpha
    var feCMFres = document.createElementNS(ns, 'feColorMatrix');
    feCMFres.setAttribute('in', 'smoothness');
    feCMFres.setAttribute('values', '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 1 0');
    filter.appendChild(feCMFres);

    var feCT = document.createElementNS(ns, 'feComponentTransfer');
    var feFA = document.createElementNS(ns, 'feFuncA');
    feFA.setAttribute('type', 'linear');
    feFA.setAttribute('slope', String(cfg.fresnel));
    feCT.appendChild(feFA);
    filter.appendChild(feCT);

    var feBlend3 = document.createElementNS(ns, 'feBlend');
    feBlend3.setAttribute('in2', 'displaced');
    feBlend3.setAttribute('mode', 'hard-light');
    filter.appendChild(feBlend3);

    svg.appendChild(filter);
    return { svg: svg, refs: { feSm: feSm, fePatt: fePatt, dispMaps: dispMaps, feFA: feFA } };
  }

  // ---------------------------------------------------------------------------
  // Build the orange/green refraction-pattern data URI
  // ---------------------------------------------------------------------------
  function buildPatternDataURI(cfg) {
    var inv = 1 / cfg.patternScale;
    var raw =
      "<svg xmlns='http://www.w3.org/2000/svg' " +
        "color-interpolation-filters='sRGB' " +
        "viewBox='0 0 500 500' width='500' height='500'>" +
        "<defs>" +
          "<linearGradient id='rg'>" +
            "<stop offset='0' stop-color='#ff8000'/>" +
            "<stop offset='1' stop-color='#008000'/>" +
          "</linearGradient>" +
          "<pattern id='flutes' " +
            "patternTransform='scale(" + inv + ") rotate(" + cfg.rotation + ")' " +
            "preserveAspectRatio='xMidYMid slice' " +
            "width='100' height='100' viewBox='0 0 100 100' " +
            "patternUnits='userSpaceOnUse'>" +
            "<rect width='100' height='100' style='fill: url(#rg);'/>" +
          "</pattern>" +
        "</defs>" +
        "<rect id='pattern' fill='url(#flutes)' width='100%' height='100%'/>" +
      "</svg>";
    return 'data:image/svg+xml,' + encodeURIComponent(raw);
  }

  // ---------------------------------------------------------------------------
  // Compute size-scaled config for a given box width (px)
  // Linear scaling vs. REFERENCE_BOX_PX, with a floor clamp so tiny renders
  // don't break. fresnel and rotation are unitless and unchanged.
  // ---------------------------------------------------------------------------
  function scaledConfig(boxPx) {
    var b = Math.max(MIN_BOX_PX, boxPx);
    var k = b / REFERENCE_BOX_PX;
    return {
      dispersion: REF_CONFIG.dispersion * k,
      refraction: REF_CONFIG.refraction * k,
      smoothness: Math.max(0.4, REF_CONFIG.smoothness * k),
      frost: Math.max(0.6, REF_CONFIG.frost * k),
      fresnel: REF_CONFIG.fresnel,
      patternScale: REF_CONFIG.patternScale, // density is intentionally density, not size
      rotation: REF_CONFIG.rotation,
      tilt: REF_CONFIG.tilt
    };
  }

  // ---------------------------------------------------------------------------
  // Apply a config to existing filter refs (for live resize updates)
  // ---------------------------------------------------------------------------
  function applyConfigToRefs(refs, cfg) {
    refs.feSm.setAttribute('stdDeviation', String(cfg.smoothness));
    refs.feFA.setAttribute('slope', String(cfg.fresnel));
    for (var i = 0; i < refs.dispMaps.length; i++) {
      refs.dispMaps[i].setAttribute(
        'scale',
        String(cfg.refraction + (i - 1) * cfg.dispersion)
      );
    }
    refs.fePatt.setAttribute('href', buildPatternDataURI(cfg));
  }

  // ---------------------------------------------------------------------------
  // Initialize a single <i.apollo-2> element
  // ---------------------------------------------------------------------------
  function initInstance(el) {
    if (el._apollo2Inited) return;
    el._apollo2Inited = true;

    var noParallax =
      el.classList.contains('noparallax') ||
      el.classList.contains('noparalax');

    var src = el.getAttribute('data-src') || DEFAULT_LOGO;
    var tiltDeg = parseFloat(el.getAttribute('data-tilt')) || REF_CONFIG.tilt;

    // Mark the host
    el.classList.add('apollo2-host');
    el.style.padding = '0';  // Remove any padding to fit parent exactly
    if (noParallax) el.classList.add('apollo2-noparallax');

    // Unique filter id per instance (so multiple sizes can coexist)
    instanceCounter++;
    var filterId = FILTER_ID_PREFIX + instanceCounter;

    // Initial config from current rendered size
    var initialBox = el.getBoundingClientRect().width || REFERENCE_BOX_PX;
    var cfg = scaledConfig(initialBox);

    // Build filter SVG
    var built = buildFilterSVG(filterId, cfg);

    // Build DOM
    var stage = document.createElement('span');
    stage.className = 'apollo2-stage';
    stage.style.setProperty('--ax-tilt', tiltDeg + 'deg');
    stage.style.setProperty('--ax-x', '0');
    stage.style.setProperty('--ax-y', '0');

    var img = document.createElement('img');
    img.className = 'apollo2-img';
    img.alt = el.getAttribute('aria-label') || 'apollo';
    img.src = src;
    img.setAttribute('draggable', 'false');
    img.style.filter = 'url(#' + filterId + ')';  // Apply refraction filter to the logo

    var glass = document.createElement('span');
    glass.className = 'apollo2-glass';
    glass.style.backdropFilter = 'blur(10px) saturate(150%)';
    glass.style.webkitBackdropFilter = 'blur(10px) saturate(150%)';

    stage.appendChild(img);
    stage.appendChild(glass);

    // Clear and mount
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(built.svg);
    el.appendChild(stage);

    // Parallax pointer tracking (only if not disabled)
    if (!noParallax) {
      var ptrUpdate = function (e) {
        var pointer = e.touches ? e.touches[0] : e;
        if (!pointer) return;
        var bb = el.getBoundingClientRect();
        if (!bb.width || !bb.height) return;
        var ox = (pointer.clientX - (bb.x + bb.width / 2)) / bb.width;
        var oy = (pointer.clientY - (bb.y + bb.height / 2)) / bb.height;
        ox = Math.round(ox * 100) / 100;
        oy = Math.round(oy * 100) / 100;
        stage.style.setProperty('--ax-x', ox);
        stage.style.setProperty('--ax-y', oy);
      };
      window.addEventListener('mousemove', ptrUpdate, { passive: true });
      window.addEventListener('touchmove', ptrUpdate, { passive: true });
      el._apollo2_ptrUpdate = ptrUpdate;
    } else {
      // Lock to neutral
      stage.style.setProperty('--ax-x', '0');
      stage.style.setProperty('--ax-y', '0');
    }

    // ResizeObserver to keep refraction in proportion at any rendered size
    if (typeof ResizeObserver !== 'undefined') {
      var lastApplied = -1;
      var ro = new ResizeObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var w = entries[i].contentRect.width;
          // Only re-apply when size shifts meaningfully (avoid thrash)
          if (Math.abs(w - lastApplied) < 1) continue;
          lastApplied = w;
          applyConfigToRefs(built.refs, scaledConfig(w));
        }
      });
      ro.observe(el);
      el._apollo2_ro = ro;
    } else {
      // Fallback: re-apply on window resize
      var onWinResize = function () {
        var w = el.getBoundingClientRect().width;
        applyConfigToRefs(built.refs, scaledConfig(w));
      };
      window.addEventListener('resize', onWinResize);
      el._apollo2_winResize = onWinResize;
    }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  function scan(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('i.apollo-2');
    for (var i = 0; i < nodes.length; i++) initInstance(nodes[i]);
  }

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    injectStyles();
    scan(document);

    // Watch for dynamically inserted <i.apollo-2> nodes
    if (typeof MutationObserver !== 'undefined') {
      var mo = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var added = mutations[i].addedNodes;
          for (var j = 0; j < added.length; j++) {
            var n = added[j];
            if (n.nodeType !== 1) continue;
            if (n.matches && n.matches('i.apollo-2')) initInstance(n);
            if (n.querySelectorAll) {
              var inner = n.querySelectorAll('i.apollo-2');
              for (var k = 0; k < inner.length; k++) initInstance(inner[k]);
            }
          }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  });

  // Expose a small API for manual control
  global.ApolloLogo2 = {
    scan: function (root) { injectStyles(); scan(root); },
    init: function (el) { injectStyles(); initInstance(el); },
    REF_CONFIG: REF_CONFIG
  };
})(typeof window !== 'undefined' ? window : this);
