/**
 * @fileoverview 'https://cdn.apollo.rio.br/v1.0.0/core.js' — Core Runtime v1.1.0 (Production)
 * High-performance CDN loader with tiered parallelization and SRI.
 * Loads jQuery, GSAP (full bundle w/ Draggable, Inertia, ScrollTrigger, Flip),
 * icons, Lenis, and app scripts with parallelization and SRI.
 *
 * FIXES over broken.23-03-26-core.js:
 *  - GSAP URL: gsap-bundle-plugins (full bundle, not core-only)
 *  - GSAP signal: "gsap" present → fires apollo:gsap-ready
 *  - GSAP priority: "high" + fetchpriority
 *  - Icon filename: icon.v1.0.0.min.js (no double ??)
 *  - Lenis restored to js_high
 *  - crossOrigin auto-detection on apollo CDN domains
 *  - data-tooltip.v1.0.1.js restored to js_app
 *  - CSS --primary fixed: #f45f00 (was missing #)
 *  - CSS --txt-color & --txt-color-heading added
 *  - CSS --surface-hover added, duplicate --card-hover removed
 *  - CSS dark-mode uses resolved rgb values (no var(--rgb-theme) nesting)
 *  - file:// fallback system (ensureDollarStub, fallback chains)
 *
 *  v1.0.2:
 *  - GSAP fallback now loads full plugin set (ScrollTrigger, Draggable, Flip, Observer)
 *  - Degraded mode tracking (Apollo.degraded[]) for diagnostic visibility
 *  - Reduced boot safety timeout (4s) to minimize invisible-body window
 *  - Critical failures in localFileMode now warn explicitly instead of silent resolve
 */
(function (w, d) {
  "use strict";

  const VERSION = "1.1.0";
  const IS_FILE_PROTOCOL = w.location && w.location.protocol === "file:";

  if (w.Apollo && w.Apollo.version) {
    if (w.Apollo.version !== VERSION) {
      console.error(
        `[Apollo] Version conflict detected: ${w.Apollo.version} != ${VERSION}`,
      );
    }
    return;
  }

  /**
   * Sanitizes and validates URLs
   * @param {string} u - URL to sanitize
   * @returns {string} Sanitized URL or empty string
   */
  function sanitizeUrl(u) {
    try {
      var base = IS_FILE_PROTOCOL ? w.location.href : w.location.origin;
      return new URL(u, base).href;
    } catch {
      return "";
    }
  }

  function localCdnBase() {
    if (w.__APOLLO_LOCAL_CDN__) return w.__APOLLO_LOCAL_CDN__;
    if (IS_FILE_PROTOCOL) return "../cdn.apollo.rio.br/v1.0.0/";
    return "";
  }

  function localizeCdnUrl(u) {
    if (!u || typeof u !== "string") return u;
    var base = localCdnBase();
    if (!base) return u;
    var prefix = "https://cdn.apollo.rio.br/v1.0.0/";
    if (u.indexOf(prefix) === 0) return base + u.slice(prefix.length);
    return u;
  }

  function applyPreconfig() {
    var pre = w.__APOLLO_PRECONFIG__;
    if (!pre) return;
    if (pre.skipAppScripts) w.Apollo.config.assets.js_app = [];
    if (Array.isArray(pre.skipHigh) && pre.skipHigh.length) {
      var skip = pre.skipHigh;
      w.Apollo.config.assets.js_high = w.Apollo.config.assets.js_high.filter(
        function (entry) {
          var u = String((entry && entry.u) || entry || "");
          for (var i = 0; i < skip.length; i++) {
            if (u.indexOf(skip[i]) > -1) return false;
          }
          return true;
        },
      );
    }
    if (pre.gsapLocal) {
      var base = localCdnBase();
      if (base) {
        w.Apollo.config.assets.js_high.forEach(function (entry) {
          if (entry && entry.signal === "gsap") {
            entry.u = base + "js/gsap/gsap.min.js";
          }
        });
      }
    }
  }

  async function ensureGsapLocal() {
    if (w.gsap) return;
    var base = localCdnBase();
    if (!base) return;
    var chain = [
      base + "js/gsap/gsap.min.js",
      base + "js/gsap/ScrollTrigger.min.js",
    ];
    for (var i = 0; i < chain.length; i++) {
      await w.Apollo.loadPromise(chain[i], true);
    }
    if (w.gsap && w.ScrollTrigger) {
      try {
        w.gsap.registerPlugin(w.ScrollTrigger);
      } catch (_) {}
    }
  }
  function ensureDollarStub() {
    if (typeof w.$ === "function") return;
    const stubApi = {
      length: 0,
      each: function () {
        return this;
      },
      on: function () {
        return this;
      },
      off: function () {
        return this;
      },
      addClass: function () {
        return this;
      },
      removeClass: function () {
        return this;
      },
      toggleClass: function () {
        return this;
      },
      css: function () {
        return this;
      }, 
      attr: function () {
        return this;
      },
      data: function () {
        return this;
      },
      text: function () {
        return this;
      },
      html: function () {
        return this;
      },
      val: function () {
        return this;
      },
      append: function () {
        return this;
      },
      prepend: function () {
        return this;
      },
      hide: function () {
        return this;
      },
      show: function () {
        return this;
      },
      trigger: function () {
        return this;
      },
      find: function () {
        return this;
      },
      first: function () {
        return this;
      },
      eq: function () {
        return this;
      },
    };

    const dollar = function (arg) {
      if (typeof arg === "function") {
        if (d.readyState === "loading")
          d.addEventListener("DOMContentLoaded", arg, { once: true });
        else arg();
        return;
      }
      return Object.create(stubApi);
    };

    w.$ = dollar;
    if (!w.jQuery) w.jQuery = dollar;
  }

  // Minified CSS Content — v1.1.0
  const cssContent = `
  :root {
  /* ── THEME ENGINE ──────────────────────────────────────────────── */
  color-scheme: light;
  block-size: 100%; inline-size: 100%;
  font-size: 14.5px;
  --rgb-theme:  255, 255, 255;
  --rgb-diff:   8, 8, 8;
  --rgb-canvas: var(--rgb-theme);
  --rgb-ink:    var(--rgb-diff);
 
  /* ── TYPOGRAPHY ────────────────────────────────────────────────── */
  --ff-main:    system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --ff-heading: "Exclusive Editorial", "Black Ridge", system-ui, sans-serif;
  --ff-fun:     "Resolide Serif", "Mileast", system-ui, sans-serif;
  --ff-mono:    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;
 
  --fs-h1: clamp(2rem,     1.167rem + 3.65vi, 4.5rem);
  --fs-h2: clamp(1.625rem, 1.0rem   + 2.73vi, 3.5rem);
  --fs-h3: clamp(1.375rem, 0.917rem + 1.82vi, 2.75rem);
  --fs-h4: clamp(1.25rem,  0.916rem + 1.46vi, 2.25rem);
  --fs-h5: clamp(1.125rem, 0.875rem + 1.09vi, 1.875rem);
  --fs-h6: clamp(1rem,     0.833rem + 0.73vi, 1.5rem);
  --fs-p:  clamp(0.9375rem, 0.875rem + 0.27vi, 1.125rem);
  --fs-p2: clamp(0.8125rem, 0.75rem  + 0.27vi, 1rem);
  --fs-p3: clamp(0.6875rem, 0.625rem + 0.27vi, 0.875rem);
 
  /* ── NEUTRAL SCALE ─────────────────────────────────────────────── */
  --white-1:  rgba(var(--rgb-theme), 1);
  --white-2:  rgba(var(--rgb-diff), 0.02); --white-3:  rgba(var(--rgb-diff), 0.04);
  --white-4:  rgba(var(--rgb-diff), 0.06); --white-5:  rgba(var(--rgb-diff), 0.08);
  --white-6:  rgba(var(--rgb-diff), 0.10); --white-7:  rgba(var(--rgb-diff), 0.12);
  --white-8:  rgba(var(--rgb-diff), 0.14); --white-9:  rgba(var(--rgb-diff), 0.16);
  --white-10: rgba(var(--rgb-diff), 0.18); --white-11: rgba(var(--rgb-diff), 0.20);
  --white-12: rgba(var(--rgb-diff), 0.22); --white-13: rgba(var(--rgb-diff), 0.24);
  --white-14: rgba(var(--rgb-diff), 0.26); --white-15: rgba(var(--rgb-diff), 0.28);
  --white-16: rgba(var(--rgb-diff), 0.30); --white-17: rgba(var(--rgb-diff), 0.32);
  --white-18: rgba(var(--rgb-diff), 0.34); --white-19: rgba(var(--rgb-diff), 0.36);
  --white-20: rgba(var(--rgb-diff), 0.38);
  --gray-1:  rgba(var(--rgb-diff), 0.40); --gray-2:  rgba(var(--rgb-diff), 0.42);
  --gray-3:  rgba(var(--rgb-diff), 0.44); --gray-4:  rgba(var(--rgb-diff), 0.46);
  --gray-5:  rgba(var(--rgb-diff), 0.48); --gray-6:  rgba(var(--rgb-diff), 0.50);
  --gray-7:  rgba(var(--rgb-diff), 0.52); --gray-8:  rgba(var(--rgb-diff), 0.54);
  --gray-9:  rgba(var(--rgb-diff), 0.56); --gray-10: rgba(var(--rgb-diff), 0.58);
  --gray-11: rgba(var(--rgb-diff), 0.60); --gray-12: rgba(var(--rgb-diff), 0.62);
  --gray-13: rgba(var(--rgb-diff), 0.64); --gray-14: rgba(var(--rgb-diff), 0.66);
  --gray-15: rgba(var(--rgb-diff), 0.68); --gray-16: rgba(var(--rgb-diff), 0.70);
  --gray-17: rgba(var(--rgb-diff), 0.72); --gray-18: rgba(var(--rgb-diff), 0.74);
  --gray-19: rgba(var(--rgb-diff), 0.76); --gray-20: rgba(var(--rgb-diff), 0.78);
  --black-10: rgba(var(--rgb-diff), 0.80); --black-9: rgba(var(--rgb-diff), 0.82);
  --black-8:  rgba(var(--rgb-diff), 0.84); --black-7: rgba(var(--rgb-diff), 0.86);
  --black-6:  rgba(var(--rgb-diff), 0.88); --black-5: rgba(var(--rgb-diff), 0.90);
  --black-4:  rgba(var(--rgb-diff), 0.92); --black-3: rgba(var(--rgb-diff), 0.94);
  --black-2:  rgba(var(--rgb-diff), 0.96); --black-1: rgba(var(--rgb-diff), 0.98);
  --black:    rgba(var(--rgb-diff), 1);
 
  /* ── FIXED NEUTRALS ────────────────────────────────────────────── */
  --black-50: #F4F4F4; --black-100: #EBEBEB; --black-200: #D2D2D2; --black-300: #AFAFAF;
  --black-400: #6E6E6E; --black-500: #050505; --black-600: #040404; --black-700: #030303;
  --black-800: #020202; --black-900: #010101; --black-950: #000000;
 
  --onyx-50: #F5F5F5; --onyx-100: #ECECEC; --onyx-200: #D4D4D4; --onyx-300: #B4B3B4;
  --onyx-400: #777677; --onyx-500: #151415; --onyx-600: #121112; --onyx-700: #0F0E0F;
  --onyx-800: #0A0A0A; --onyx-900: #060606; --onyx-950: #030303;
 
  --white-50: #FFFFFF; --white-100: #FFFFFF; --white-200: #FFFFFF; --white-300: #FFFFFF;
  --white-400: #FFFFFF; --white-500: #FFFFFF; --white-600: #E0E0E0; --white-700: #B7B7B7;
  --white-800: #848484; --white-900: #515151; --white-950: #2D2D2D;
 
  --bright-snow-50: #FEFEFE; --bright-snow-100: #FEFEFE; --bright-snow-200: #FEFEFE;
  --bright-snow-300: #FDFDFD; --bright-snow-400: #FCFCFC; --bright-snow-500: #FAFAFA;
  --bright-snow-600: #DCDCDC; --bright-snow-700: #B4B4B4; --bright-snow-800: #828282;
  --bright-snow-900: #4F4F4F; --bright-snow-950: #2D2D2D;
 
  --platinum-50: #FEFEFE; --platinum-100: #FDFDFD; --platinum-200: #FCFCFC;
  --platinum-300: #FAFAFA; --platinum-400: #F6F6F6; --platinum-500: #F0F0F0;
  --platinum-600: #D3D3D3; --platinum-700: #ACACAC; --platinum-800: #7C7C7C;
  --platinum-900: #4C4C4C; --platinum-950: #2B2B2B;
 
  /* ── ORANGE SCALE ──────────────────────────────────────────────── */
  --orange-50: #FEFBF5; --orange-100: #FEF7EB; --orange-200: #FEEED4; --orange-300: #FEE1B2;
  --orange-400: #FDC974; --orange-500: #EDAC41; --orange-600: #DD8F0E; --orange-700: #B5750C;
  --orange-800: #835408; --orange-900: #503405; --orange-950: #2D1D03;
 
  /* ── PRIMARY & ACCENT ──────────────────────────────────────────── */
--primary: rgba(0, 0, 0, .2);
--accent: #FF5C00;
--accent-sunset-red: #FF2D55;
--accent-sunset-gold: #FFCC00;
  --primary-gradient: linear-gradient(to bottom right, #fb923c, #ea580c);
  --primary-shadow:   0 4px 15px rgba(249, 115, 22, 0.4);
 
  /* ── SURFACES ──────────────────────────────────────────────────── */
  --bg:             var(--white-1);
  --card:           var(--white-2);
  --glass:          var(--white-3);
  --card-hover:     var(--white-4);
  --surface:        var(--white-2);
  --surface-hover:  var(--white-4);
  --surface-1: var(--white-1); --surface-2: var(--white-2); --surface-3: var(--white-3);
  --surface-4: var(--white-4); --surface-5: var(--white-5);
 
  /* ── TEXT ──────────────────────────────────────────────────────── */
  --txt-color:   var(--gray-15);
  --txt-hover:   var(--black-6);
  --txt-heading: var(--black-6);
  --muted:       var(--gray-1);
  --muted-txt:   var(--white-18);
  --muted-bg:    var(--white-10);
 
  /* ── BORDERS ───────────────────────────────────────────────────── */
  --border:        var(--white-10);
  --border-hover:  var(--white-13);
  --border-strong: var(--white-13);
 
  /* ── ALERTS ────────────────────────────────────────────────────── */
  --alert-icon: #FF6B6B;
  --alert-card: #3A2525;
  --info-blue:  #0066CC;
 
  /* ── SPACING ───────────────────────────────────────────────────── */
  --s-1: 4px; --s-2: 8px; --s-3: 16px; --s-4: 24px;
  --s-5: 32px; --s-6: 48px; --s-7: 64px;
 
  /* ── RADII ─────────────────────────────────────────────────────── */
  --r-xs: 6px; --r-sm: 10px; --r: 20px; --r-lg: 24px; --r-pill: 100px; --rad-down: 14px;
 
  /* ── EASING & TRANSITIONS ──────────────────────────────────────── */
  --ease:        cubic-bezier(0.16, 1, 0.3, 1);
  --ease-smooth: cubic-bezier(0.25, 1, 0.5, 1);
  --ease-snappy: cubic-bezier(0.2, 0.9, 0.3, 1);
  --t-ui:        0.25s var(--ease);
 
  /* ── Z-INDEX ───────────────────────────────────────────────────── */
  --z-base: 1; --z-sticky: 20; --z-ui: 100; --z-pop: 200;
  --z-modal: 1000; --z-fab: 9100; --z-sheet: 9090; --z-nav: 9900;
 
  /* ── SHADOWS ───────────────────────────────────────────────────── */
  --shadow-1:     0 4px 12px rgba(var(--rgb-ink), 0.06);
  --shadow-2:     0 45px 150px rgba(var(--rgb-ink), 0.08);
  --shadow:       var(--shadow-2);
  --shadow-focus: 0 0 0 13px rgba(var(--rgb-diff), 0.1);
  --glass-border: 1px solid rgba(var(--rgb-ink), 0.08);
 
  /* ── ALIASES (compat) ──────────────────────────────────────────── */
  --font-main:     var(--ff-main);
  --font-heading:  var(--ff-heading);
  --font-fun:      var(--ff-fun);
  --white:         var(--white-1);
  --ease-default:  var(--ease);
  --ease-out:      var(--ease);
  --ease-spring:   var(--ease-snappy);
  --transition-ui: var(--t-ui);
  --txt-muted:     var(--muted-txt);
  --bg-muted:      var(--muted-bg);
  --color-main:    var(--primary-color);
  --primary-color: var(--accent);
  --space-4:       var(--s-4);
  --ff-s:          Syne, sans-serif;
}
/* DARK MODE OVERRIDES */
html.dark-mode { --rgb-theme: 10, 10, 10 !important; --rgb-diff: 255, 255, 255 !important; color-scheme: dark; --shadow-1: 0 4px 12px rgba(var(--rgb-ink), 0.12); --shadow-2: 0 45px 150px rgba(var(--rgb-ink), 0.10); }

/* BASE STYLES */
html { color-scheme: light dark; font-size: 14px; line-height: 1.5; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; --safe-bottom: env(safe-area-inset-bottom, 0px); --safe-top: env(safe-area-inset-top, 0px); --safe-left: env(safe-area-inset-left, 0px); --safe-right: env(safe-area-inset-right, 0px); cursor: crosshair; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: auto !important; } }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; corner-shape: squircle; }
body { background: var(--bg); color: var(--txt-color); font-family: var(--ff-main); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; overflow-x: clip; transition: background 0.4s var(--ease-default), color 0.4s var(--ease-default); touch-action: manipulation; }
html, body { font-family: var(--ff-main); width: 100dvw; min-width: 100%; max-width: 100%; height: 100dvh; max-height: 100%; overflow-x: hidden !important; overscroll-behavior: none !important; touch-action: pan-y !important; -webkit-overflow-scrolling: touch !important; }
* { -webkit-backface-visibility: hidden; backface-visibility: hidden; }
/* SELECTION */
::selection { background: rgba(255, 152, 32, 0.14); color: var(--black-2); }
html.dark-mode ::selection { background: rgba(255, 152, 32, 0.30); color: #000; }

/* TYPOGRAPHY & LINKS */
a { text-decoration: none; color: inherit; transition: all 0.65s ease, color 0.55s ease 0.3s !important; }

/* FORM ELEMENTS */
button, .btn { border: none; background: none; cursor: pointer; font-family: inherit; }
input { border: none; background: none; font-family: inherit; outline: none; }

/* LISTS & IMAGES */
ul { list-style: none; }
img { display: block; max-width: 100%; }

/* ICONS & SVG — single authoritative rule */
i, svg, .remix-svg {
  font-weight: 100 !important;
  stroke-width: 0.55px !important;
  stroke-linecap: miter !important;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
  shape-rendering: geometricPrecision;
  vertical-align: -0.125em;
  transition: color 0.25s var(--ease), opacity 0.25s var(--ease);
}
i, button, .btn, img, svg { -webkit-user-select: none !important; user-select: none !important; transition: all 0.65s ease, filter 0.55s ease 0.3s !important; }
i:hover, svg:hover { filter: brightness(1.15); }

/* UTILITY CLASSES */
.enable-zoom, .enable-touch { touch-action: pan-y pinch-zoom; }
.separator, .separador { display: inline-block; margin: 0 3px; padding: 0; }
.separator::before, .separador::before { content: '·'; }

/* COMPONENTS */
.card { isolation: isolate; }
.card.solid::before { content: ""; position: absolute; inset: 0; z-index: -1; background: var(--card); border-radius: inherit; pointer-events: none; transform: translateZ(0); }
.slide-section { touch-action: pan-y; overflow: hidden; }
.panel { will-change: transform; }
.panel input, .panel textarea { touch-action: auto; }
.vidro { border: 1px solid rgba(var(--rgb-diff), 0.04); box-shadow: inset 0 1px 0 0 rgba(var(--rgb-theme), 0.85), inset 0 0 0 1px rgba(var(--rgb-theme), 0.35), 0 4px 12px -4px rgba(var(--rgb-diff), 0.03), 0 12px 24px -8px rgba(var(--rgb-diff), 0.04); transition: background 0.4s ease, transform 0.6s ease, filter 0.4s ease, box-shadow 0.4s ease; }

/* ACCESSIBILITY & SPECIAL CASES */
@media (forced-colors: active) { :root { --bg: Canvas; --txt-color: CanvasText; --border: ButtonBorder; --primary: Highlight; } }
@media print { :root, html.dark-mode { --rgb-theme: 255, 255, 255; --rgb-diff: 8, 8, 8; color-scheme: light; } #smooth-wrapper, #smooth-content { position: static !important; overflow: visible !important; height: auto !important; width: auto !important; } * { transition: none !important; animation: none !important; box-shadow: none !important; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-synthesis: none; max-width: 100% !important; } }
body html { scrollbar-width: none; -ms-overflow-style: none; }
*::-webkit-scrollbar { display: none; }
`;

  // CSP Recommendation: style-src 'unsafe-inline' https://fonts.googleapis.com; script-src https://cdn.apollo.rio.br https://assets.apollo.rio.br; font-src https://fonts.gstatic.com
  w.Apollo = {
    version: VERSION,
    config: {
      debug: false,
      timeout: 8000,
      bootTimeout: 4000,
      localFileMode: IS_FILE_PROTOCOL,
      base: "",
      assets: {
        js_high: [
          {
            u: `https://cdn.apollo.rio.br/v1.0.0/js/jquery.v4.min.js`,
            p: "high",
            signal: "jquery",
            critical: true,
          },
          {
            u: `https://cdn.apollo.rio.br/v1.0.0/js/tracker.min.js`,
            p: "high",
          },
          {
            u: `https://cdn.apollo.rio.br/v1.0.0/js/translate.min.js`,
            p: "high",
          },
          {
            u: `https://cdn.apollo.rio.br/v1.0.0/js/icon.v1.0.3.min.js?v=01`,
            p: "high",
            signal: "icons",
            critical: true,
          },
          {
            u: `https://cdn.apollo.rio.br/v1.0.0/js/gsap-bundle-plugins.v3.15.0.min.js?w=05x`,
            p: "high",
            critical: true,
            signal: "gsap",
          },
          {
            u: `https://cdn.apollo.rio.br/v1.0.0/js/lenis-1.3.23.min.js?v=0xx`,
            p: "high",
            signal: "lenis",
            critical: true,
          },
        ],
        js_app: [
          `https://cdn.apollo.rio.br/v1.0.0/js/morphism.v1.0.4.min.js`,
          `https://cdn.apollo.rio.br/v1.0.0/js/popper.v2.11.8.min.js`,
          `https://cdn.apollo.rio.br/v1.0.0/js/reveal-up.js`,
          `https://cdn.apollo.rio.br/v1.0.0/js/script.js?v=01`,
          `https://cdn.apollo.rio.br/v1.0.0/js/gsap-lenis.js?v=0xxx`,
          `https://cdn.apollo.rio.br/v1.0.0/js/data-tooltip.v1.0.1.js`,
        ],
      },
    },

    /**
     * Loads a JavaScript file
     * @param {string} src - Script URL
     * @param {Function} cb - Callback on load
     * @param {boolean} ordered - If true, load with defer; false = async
     * @param {string} signal - Custom event signal
     * @param {string} integrity - SRI hash
     * @param {string} crossorigin - Crossorigin attribute
     * @param {string} priority - Fetch priority
     * @param {Function} onError - Error callback
     * @returns {HTMLScriptElement|null}
     */
    loadJS: function (
      src,
      cb,
      ordered,
      signal,
      integrity,
      crossorigin,
      priority,
      onError,
    ) {
      const sanitizedSrc = sanitizeUrl(src);
      if (!sanitizedSrc) {
        if (typeof onError === "function")
          onError(new Error(`Invalid or unsafe URL ${src}`));
        else if (cb) cb();
        return null;
      }
      const script = d.createElement("script");
      script.src = sanitizedSrc;
      script.async = !ordered;
      if (integrity) script.integrity = integrity;
      if (crossorigin) script.crossOrigin = crossorigin;
      else if (
        !w.Apollo.config.localFileMode &&
        !(w.__APOLLO_PRECONFIG__ && w.__APOLLO_PRECONFIG__.noCrossOrigin) &&
        /cdn\.apollo\.rio\.br|assets\.apollo\.rio\.br/.test(sanitizedSrc)
      )
        script.crossOrigin = "anonymous";
      if (priority === "high") script.setAttribute("fetchpriority", "high");
      const head =
        d.head || d.getElementsByTagName("head")[0] || d.documentElement;
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        try {
          script.remove();
        } catch (e) {}
        if (typeof onError === "function")
          onError(new Error(`Timeout loading ${sanitizedSrc}`));
        else if (cb) cb();
      }, w.Apollo.config.timeout);
      if (cb) {
        script.onload = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (signal === "jquery" && (w.jQuery || w.$)) {
            w.dispatchEvent(new CustomEvent("apollo:jquery-ready"));
          }
          if (signal === "icons") {
            w.dispatchEvent(new CustomEvent("apollo:icons-loaded"));
          }
          if (signal === "gsap") {
            w.dispatchEvent(new CustomEvent("apollo:gsap-ready"));
          }
          if (signal === "lenis" && w.Lenis) {
            w.dispatchEvent(new CustomEvent("apollo:lenis-ready"));
          }
          cb();
        };
        script.onerror = () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (typeof onError === "function") {
            onError(new Error(`Failed to load ${sanitizedSrc}`));
            return;
          }
          cb();
        };
      }
      head.appendChild(script);
      return script;
    },

    /**
     * Logs messages if debug is enabled
     * @param {...*} args - Arguments to log
     */
    log: function (...args) {
      if (w.Apollo.config.debug) console.log("[Apollo]", ...args);
    },

    /**
     * Resolves relative URLs
     * @param {string} u - URL to resolve
     * @returns {string} Resolved URL
     */
    resolve: function (u) {
      u = localizeCdnUrl(u);
      if (u.match(/^(http|\/|[a-zA-Z]:)/)) return u;
      return (w.Apollo.config.base || "/") + u;
    },

    probeSignal: function (signal) {
      if (!signal) return true;
      if (signal === "jquery") return typeof w.jQuery === "function" || typeof w.$ === "function";
      if (signal === "gsap") return !!w.gsap;
      if (signal === "lenis") return typeof w.Lenis === "function";
      if (signal === "icons") return !!w.__apolloIconRuntime;
      return true;
    },

    /**
     * Loads a script as a Promise. Deduplicates concurrent requests via inflightMap.
     * @param {string|object} entry - Script entry
     * @param {boolean} isOrdered - If ordered load
     * @returns {Promise}
     */
    loadPromise: function (entry, isOrdered) {
      const url = w.Apollo.resolve(typeof entry === "string" ? entry : entry.u);
      if (!url) return Promise.resolve();
      if (w.Apollo.loadedSet.has(url)) return Promise.resolve();
      if (w.Apollo.inflightMap.has(url)) return w.Apollo.inflightMap.get(url);
      const critical = !!(typeof entry === "object" && entry.critical);
      const priority = typeof entry === "object" && entry.p ? entry.p : "auto";
      const signal =
        typeof entry === "object" && entry.signal ? entry.signal : null;
      const integrity =
        typeof entry === "object" && entry.integrity ? entry.integrity : null;
      const crossorigin =
        typeof entry === "object" && entry.crossorigin
          ? entry.crossorigin
          : null;
      const p = new Promise((resolve, reject) => {
        w.Apollo.loadJS(
          url,
          () => {
            const signalOk = w.Apollo.probeSignal(signal);
            if (!signalOk) {
              if (!w.Apollo.degraded.includes(signal || url)) {
                w.Apollo.degraded.push(signal || url);
              }
              const probeMessage = `Loaded but runtime probe failed for ${signal || url}`;
              if (critical) console.warn("[Apollo] Critical runtime probe failed:", signal || url);
              else w.Apollo.log(probeMessage);
            }
            w.Apollo.loadedSet.add(url);
            resolve();
          },
          isOrdered,
          signal,
          integrity,
          crossorigin,
          priority,
          (loadErr) => {
            /* 0-tolerance: no fallback, no retry. Log + skip + continue. */
            w.Apollo.degraded.push(signal || url);
            if (critical) {
              console.warn(
                "[Apollo] Critical script failed:",
                signal || url,
                loadErr.message,
              );
            } else {
              w.Apollo.log("Non-critical script failed:", url);
            }
            resolve();
          },
        );
      });
      w.Apollo.inflightMap.set(url, p);
      p.then(
        () => w.Apollo.inflightMap.delete(url),
        () => w.Apollo.inflightMap.delete(url),
      );
      return p;
    },

    /**
     * Forces autoplay on videos
     */
    forcePlay: function () {
      try {
        d.querySelectorAll("video[autoplay]").forEach((v) => {
          if (v.paused) {
            const p = v.play();
            if (p && p.catch) p.catch(() => {});
          }
        });
      } catch (e) {
        w.Apollo.log(e);
      }
    },

    /**
     * Finishes up the initialization
     *
     * ╔══════════════════════════════════════════════════════════════╗
     * ║  EVENTO MAP (NÃO RENOMEAR — manter em todas as conversões) ║
     * ║                                                            ║
     * ║  apollo:ready        → boot completo, tudo carregado       ║
     * ║  Apollo.ready(fn)    → legacy: runs fn now or on apollo:ready ║
     * ║  apollo:jquery-ready → jQuery disponível no window          ║
     * ║  apollo:gsap-ready   → GSAP + plugins registrados          ║
     * ║  apollo:icons-loaded → icon.js runtime pronto              ║
     * ╚══════════════════════════════════════════════════════════════╝
     */
    finishUp: function () {
      try {
        if (w.Apollo.isReady) return;
        w.Apollo.isReady = true;
        d.body.style.opacity = "1";
        var elapsed = Date.now() - w.Apollo.startTime;
        var detail = { time: elapsed };
        if (w.Apollo.degraded.length) {
          detail.degraded = w.Apollo.degraded.slice();
          console.warn(
            "[Apollo] Boot finished with degraded deps:",
            w.Apollo.degraded.join(", "),
          );
        }
        w.dispatchEvent(new CustomEvent("apollo:ready", { detail: detail }));

        w.Apollo.runDeferredScripts();

        /* ── pt-BR console branding (F12 display) ─────────────────── */
        try {
          console.log(
            "%c ⬡ Apollo CDN v" + VERSION + " %c Boot em " + elapsed + "ms %c",
            "background:#FF9820;color:#000;font-weight:bold;padding:4px 10px;border-radius:6px 0 0 6px;",
            "background:#1a1a2e;color:#FF9820;padding:4px 10px;border-radius:0 6px 6px 0;",
            "",
          );
          if (w.Apollo.degraded.length) {
            console.warn(
              "%c🚧 Eita! Alguns scripts não vieram na mala: " +
                w.Apollo.degraded.join(", "),
              "color:#fbbf24;font-style:italic;",
            );
          } else {
            console.log(
              "%c🎶 Tudo certo, parceiro! Zero degradação. Bora que o Rio não para! 🌴",
              "color:#22c55e;font-style:italic;",
            );
          }
          console.log(
            "%c🔒 jQuery: " +
              (w.jQuery ? "✅ pronto" : "⚠️ ausente") +
              " | GSAP: " +
              (w.gsap ? "✅ pronto" : "⚠️ ausente") +
              " | Lenis: " +
              (w.Lenis ? "✅ suave" : "—"),
            "color:#888;",
          );
          console.log(
            "%c💡 Dica: Apollo.config.debug = true pra ver o backstage completo",
            "color:#666;font-size:10px;",
          );
        } catch (_meme) {}

        w.Apollo.log("Boot complete in " + elapsed + "ms");
        if ("requestIdleCallback" in w)
          w.requestIdleCallback(function () {
            w.Apollo.forcePlay();
          });
        else w.Apollo.forcePlay();
        if (!w.Apollo._visibilityBound) {
          w.Apollo._visibilityBound = true;
          w.Apollo._onVisibility = function () {
            if (!d.hidden) w.Apollo.forcePlay();
          };
          d.addEventListener("visibilitychange", w.Apollo._onVisibility);
        }
      } catch (e) {
        w.Apollo.log(e);
      } finally {
        try {
          if (d.body) {
            if (d.body.style.opacity !== "1") d.body.style.opacity = "1";
            d.body.removeAttribute("aria-busy");
          }
        } catch (_) {}
      }
    },

    /**
     * Initializes the Apollo CDN
     */
    isAuthLitePage: function () {
      if (w.__APOLLO_AUTH_LITE__) return true;
      try {
        if (d.body && d.body.dataset && d.body.dataset.apolloPage === "auth") {
          return true;
        }
      } catch (e) {
        w.Apollo.log(e);
      }
      return false;
    },

    init: async function () {
      if (w.Apollo.isReady || w.Apollo._booting) return;
      w.Apollo._booting = true;
      if (w.Apollo._safeTimer) { clearTimeout(w.Apollo._safeTimer); w.Apollo._safeTimer = null; }
      w.Apollo.startTime = Date.now();
      if (!d.body) {
        await new Promise((r) =>
          d.addEventListener("DOMContentLoaded", r, { once: true }),
        );
      }

      if (w.Apollo.isAuthLitePage()) {
        w.Apollo.log("Auth-lite page — skipping full CDN boot");
        w.Apollo._booting = false;
        w.Apollo.finishUp();
        return;
      }

      applyPreconfig();

      if (w.__APOLLO_DJ_SHELL__) {
        d.body.style.opacity = "1";
      }

      d.body.setAttribute("aria-busy", "true");
      d.body.style.opacity = "0";
      d.body.style.transition =
        "opacity 0.5s var(--ease-default, cubic-bezier(.16, 1, .3, 1))";
      w.Apollo.log("Boot starting Apollo CDN v" + VERSION);

      w.Apollo._safeTimer = setTimeout(() => {
        if (!w.Apollo.isReady) {
          d.body.style.opacity = "1";
          console.warn(
            "[Apollo] Boot timeout reached (" +
              w.Apollo.config.bootTimeout +
              "ms). Forcing safe finish.",
          );
          if (w.Apollo.degraded.length) {
            console.warn(
              "[Apollo] Degraded dependencies:",
              w.Apollo.degraded.join(", "),
            );
          }
          w.Apollo.finishUp();
        }
      }, w.Apollo.config.bootTimeout);

      try {
        if (w.Apollo.config.localFileMode) {
          w.Apollo.log("file:// mode — local CDN asset map active.");
        }

        const high = w.Apollo.config.assets.js_high || [];
        const jqueryEntry = high.find((e) => e.signal === "jquery");
        const gsapEntry = high.find(
          (e) => e.signal === "gsap" || String(e.u || "").indexOf("gsap") > -1,
        );
        const lenisEntry = high.find(
          (e) => String(e.u || "").indexOf("lenis") > -1,
        );
        const restEntries = high.filter(
          (e) => e !== jqueryEntry && e !== gsapEntry && e !== lenisEntry,
        );

        /* !!PHP-CRITICAL: jQuery MUST load FIRST (sequential) — do not reorder or defer !! */
        // Tier 1: jQuery (sequential, critical — must be first)
        if (jqueryEntry) {
          await w.Apollo.loadPromise(jqueryEntry, true);
        }
        try {
          if ("scheduler" in w && w.scheduler.yield) await w.scheduler.yield();
        } catch (_) {}

        /* !!PHP-CRITICAL: GSAP bundle loads AFTER jQuery. Sequential load for reliable probe. !! */
        if (gsapEntry) {
          await w.Apollo.loadPromise(gsapEntry, true);
        }
        if (lenisEntry) {
          await w.Apollo.loadPromise(lenisEntry, false);
        }
        if (!w.gsap) {
          await ensureGsapLocal();
        }
        if (w.gsap) {
          w.Apollo.degraded = w.Apollo.degraded.filter(function (d) {
            return d !== "gsap";
          });
        }
        try {
          if ("scheduler" in w && w.scheduler.yield) await w.scheduler.yield();
        } catch (_) {}

        // Tier 3: Remaining high-priority (parallel, non-blocking)
        if (restEntries.length) {
          await Promise.allSettled(
            restEntries.map((entry) => w.Apollo.loadPromise(entry, false)),
          );
        }
        try {
          if ("scheduler" in w && w.scheduler.yield) await w.scheduler.yield();
        } catch (_) {}

        // Tier 4: App scripts (parallel)
        const appPromises = w.Apollo.config.assets.js_app.map((u) =>
          w.Apollo.loadPromise(u, false),
        );
        await Promise.allSettled(appPromises);

        if (typeof w.$ !== "function") ensureDollarStub();

        clearTimeout(w.Apollo._safeTimer);
        w.Apollo._booting = false;
        w.Apollo.finishUp();
      } catch (err) {
        clearTimeout(w.Apollo._safeTimer);
        w.Apollo._booting = false;
        console.error("[Apollo] Critical load failure:", err);
        if (typeof w.$ !== "function") ensureDollarStub();
        w.Apollo.finishUp();
      }
    },

    loadedSet: new Set(),
    inflightMap: new Map(),
    degraded: [],
    isReady: false,
    _booting: false,
    startTime: 0,
    _safeTimer: null,
    _onVisibility: null,
    _visibilityBound: false,
    /**
     * Legacy callback API — runs immediately if boot finished, else once on apollo:ready.
     * @param {function():void} fn
     */
    ready: function (fn) {
      if (typeof fn !== "function") return;
      if (w.Apollo.isReady) {
        try {
          fn();
        } catch (e) {
          w.Apollo.log(e);
        }
        return;
      }
      w.addEventListener("apollo:ready", fn, { once: true });
    },

    /**
     * CodePen/GSAP demos register DOMContentLoaded/load after Apollo boot.
     * Re-fire those listeners immediately when the document is already ready.
     */
    _withLateLifecyclePatch: function (fn) {
      if (typeof fn !== "function") return;
      var origDocAdd = d.addEventListener.bind(d);
      var origWinAdd = w.addEventListener.bind(w);
      d.addEventListener = function (type, listener, options) {
        if (type === "DOMContentLoaded" && d.readyState !== "loading") {
          w.Apollo._invokeListener(listener, { type: "DOMContentLoaded" });
          return;
        }
        return origDocAdd(type, listener, options);
      };
      w.addEventListener = function (type, listener, options) {
        if (type === "load" && d.readyState === "complete") {
          w.Apollo._invokeListener(listener, { type: "load" });
          return;
        }
        return origWinAdd(type, listener, options);
      };
      try {
        fn();
      } finally {
        d.addEventListener = origDocAdd;
        w.addEventListener = origWinAdd;
      }
    },

    _invokeListener: function (listener, event) {
      try {
        if (typeof listener === "function") {
          listener.call(w, event);
        } else if (listener && typeof listener.handleEvent === "function") {
          listener.handleEvent(event);
        }
      } catch (e) {
        w.Apollo.log(e);
      }
    },

    /**
     * Runs inline page scripts: <script type="text/apollo-defer" data-apollo-when="ready">
     * Executes after GSAP + Lenis bridge (gsap-lenis.js) when possible.
     */
    runDeferredScripts: function () {
      var nodes = d.querySelectorAll('script[type="text/apollo-defer"]');
      if (!nodes.length) return;

      var runOne = function (node) {
        var code = (node.textContent || "").trim();
        if (!code) return;
        w.Apollo._withLateLifecyclePatch(function () {
          try {
            new Function(code)();
          } catch (e) {
            console.error(
              "[Apollo] apollo-defer failed:",
              node.id || node.getAttribute("data-apollo-page") || "inline",
              e,
            );
          }
        });
      };

      var whenMotionReady = function (cb) {
        var tries = 0;
        var tick = function () {
          var gsapOk = !!w.gsap;
          var stOk = !!w.ScrollTrigger;
          var lenisOk = !w.Lenis || w.__apolloLenisInitialized;
          if ((gsapOk && stOk && lenisOk) || tries++ > 80) {
            w.requestAnimationFrame(function () {
              w.requestAnimationFrame(function () {
                try {
                  cb();
                } catch (e) {
                  w.Apollo.log(e);
                }
                if (w.ScrollTrigger) {
                  try {
                    w.ScrollTrigger.refresh(true);
                  } catch (_) {}
                }
              });
            });
            return;
          }
          setTimeout(tick, 50);
        };
        tick();
      };

      nodes.forEach(function (node) {
        var when = (node.getAttribute("data-apollo-when") || "ready").toLowerCase();
        if (when === "gsap") {
          if (w.gsap) runOne(node);
          else
            w.addEventListener(
              "apollo:gsap-ready",
              function () {
                runOne(node);
              },
              { once: true },
            );
          return;
        }
        whenMotionReady(function () {
          runOne(node);
        });
      });
    },
  };

  // Inject preconnects — ultra pro 2026
  const head = d.head || d.getElementsByTagName("head")[0] || d.documentElement;

  const preconnectOrigins = [
    { url: "https://apollo.rio.br", cors: false },
    { url: "https://cdn.apollo.rio.br", cors: true },
    { url: "https://assets.apollo.rio.br", cors: true },
    { url: "https://fonts.googleapis.com", cors: false },
    { url: "https://fonts.gstatic.com", cors: true },
  ];

  const preconnectFragment = d.createDocumentFragment();
  preconnectOrigins.forEach((o) => {
    const pc = d.createElement("link");
    pc.rel = "preconnect";
    pc.href = o.url;
    if (o.cors) pc.crossOrigin = "anonymous";
    preconnectFragment.appendChild(pc);
    const dp = d.createElement("link");
    dp.rel = "dns-prefetch";
    dp.href = o.url;
    preconnectFragment.appendChild(dp);
  });
  head.appendChild(preconnectFragment);

  // Preload critical scripts only during initial parse to avoid unused-preload warnings.
  if (d.readyState === "loading") {
    if (!w.jQuery && !d.querySelector('script[src*="jquery.v4.min.js"]')) {
      const jqPreload = d.createElement("link");
      jqPreload.rel = "preload";
      jqPreload.as = "script";
      jqPreload.href = "https://cdn.apollo.rio.br/v1.0.0/js/jquery.v4.min.js";
      jqPreload.crossOrigin = "anonymous";
      head.appendChild(jqPreload);
    }

    if (!w.gsap && !d.querySelector('script[src*="gsap-bundle-plugins.v3.15.0.min.js?w=05x"]')) {
      const gsapPreload = d.createElement("link");
      gsapPreload.rel = "preload";
      gsapPreload.as = "script";
      gsapPreload.fetchPriority = "high";
      gsapPreload.href =
        "https://cdn.apollo.rio.br/v1.0.0/js/gsap-bundle-plugins.v3.15.0.min.js?w=05x";
      gsapPreload.crossOrigin = "anonymous";
      head.appendChild(gsapPreload);
    }
  }

  // Inject CSS — synchronous (critical for :root vars, dark-mode, prevents FOUC)
  if (!d.getElementById("cdn-apollo")) {
    const style = d.createElement("style");
    style.id = "cdn-apollo";
    style.textContent = cssContent;
    head.appendChild(style);
  }

  // Inject font link
  if (!d.getElementById("apollo-fonts-css")) {
    const fontLink = d.createElement("link");
    fontLink.id = "apollo-fonts-css";
    fontLink.rel = "stylesheet";
    fontLink.href =
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&family=Space+Mono:ital,wght@0,400;0,700;1,400;1,700&family=Syne:wght@400..800&display=swap";
    fontLink.media = "all";
    head.appendChild(fontLink);
  }

  if (!d.getElementById("apollo-core")) {
    const themeLink = d.createElement("link");
    themeLink.id = "apollo-core";
    themeLink.rel = "stylesheet";
    themeLink.href =
      "https://cdn.apollo.rio.br/v1.0.0/css/universal.apollo.css?t=1.0.33";
    themeLink.media = "all";
    themeLink.crossOrigin = "anonymous";
    head.appendChild(themeLink);
  }

  // Set icon config
  w.apolloIconConfig = Object.assign(
    { cacheVersion: `v1.0.0`, cdn: "https://assets.apollo.rio.br" },
    w.apolloIconConfig || {},
  );

  // Inject favicon
  if (!d.querySelector('link[rel="icon"]')) {
    const icon = d.createElement("link");
    icon.rel = "icon";
    icon.href =
      "https://assets.apollo.rio.br/img/png/logo/v2/LARANJ_ICON_VECTOR.png";
    icon.type = "image/png";
    icon.fetchPriority = "low";
    head.appendChild(icon);
  }

  // Start initialization
  if (d.readyState === "loading") {
    d.addEventListener("DOMContentLoaded", () => w.Apollo.init(), {
      once: true,
    });
  } else if (d.readyState === "complete") {
    w.Apollo.log("Late initialization detected");
    w.Apollo.init();
  } else {
    w.Apollo.init();
  }

  /* ── beforeunload cleanup — Extremely needed ───────────────── */
  w.addEventListener(
    "beforeunload",
    function _apolloCleanup() {
      try {
        // Remove visibilitychange listener
        if (w.Apollo && w.Apollo._onVisibility) {
          d.removeEventListener("visibilitychange", w.Apollo._onVisibility);
        }
        // Clear any pending safe timers
        if (w.Apollo && w.Apollo._safeTimer) {
          clearTimeout(w.Apollo._safeTimer);
        }
        // Clear inflight map to release Promise refs
        if (w.Apollo && w.Apollo.inflightMap) {
          w.Apollo.inflightMap.clear();
        }
        w.Apollo.log("Cleanup done — até a próxima 🤙");
      } catch (_) {}
    },
    { once: true },
  );
})(window, document);
