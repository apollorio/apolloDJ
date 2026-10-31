'use strict';
(function (w, d) {
  if (w.__ultimateLenis) return;
  w.__ultimateLenis = true;

  // ── PHASE 1 · BOOTSTRAP ──────────────────────────────────────────
  // iOS version probe: syncTouch is unstable below iOS 16 (Lenis docs)
  function iosVersion() {
    var m = (navigator.userAgent || '').match(/OS (\d+)_/);
    return m ? parseInt(m[1], 10) : 99; // 99 = non-iOS → treat as modern
  }
  var IOS_VER = iosVersion();
  var IS_IOS  = IOS_VER < 99;

  var initUltimate = function () {
    if (w.__apolloLenisInitialized) return;
    if (!w.gsap || !w.Lenis || !w.ScrollTrigger) return;
    w.__apolloLenisInitialized = true;

    // ── PHASE 2 · ENGINE ─────────────────────────────────────────
    // ScrollSmoother intentionally excluded — Lenis is the scroll engine.
    // Running both creates double input-capture and conflicting RAF loops.
    var plugins = [
      w.ScrollTrigger, w.Flip, w.Observer,
      w.SplitText, w.MotionPathPlugin, w.MorphSVGPlugin, w.TextPlugin,
    ].filter(Boolean);
    gsap.registerPlugin.apply(gsap, plugins);

    // No normalizeScroll — Lenis owns all touch/wheel normalization
    ScrollTrigger.config({
      ignoreMobileResize: true,
      limitCallbacks: true,
      autoRefreshEvents: 'DOMContentLoaded,load,resize',
    });
    gsap.config({ force3D: 'auto' });

    var lenis = new w.Lenis({
      autoRaf:            false,
      // syncTouch only on iOS 16+; older versions have documented instability (Lenis changelog)
      syncTouch:          IS_IOS && IOS_VER >= 16,
      syncTouchLerp:      0.1,
      lerp:               0.1,
      smoothWheel:        true,
      wheelMultiplier:    1.0,
      touchMultiplier:    1.0,
      overscroll:         false,
      gestureOrientation: 'vertical',
      // eventsTarget: d.documentElement,
      //   Leave unset (default: window) for standard pages.
      //   Set to d.documentElement ONLY when a custom cursor interface needs
      //   the root element to own all pointer/wheel capture.
    });

    w.lenis = lenis;
    lenis.on('scroll', ScrollTrigger.update);

    if (w.__apolloLenisTicker) gsap.ticker.remove(w.__apolloLenisTicker);
    w.__apolloLenisTicker = function (t) { lenis.raf(t * 1000); };
    gsap.ticker.add(w.__apolloLenisTicker, false, true);
    gsap.ticker.lagSmoothing(500, 33);

    ScrollTrigger.defaults({ scroller: lenis.wrapper || d.documentElement });

    // ── PHASE 3 · OVERLAYS — Popper registry ─────────────────────
    // Do NOT run Popper.update() every RAF frame. Update only when layout
    // actually changes: scroll-end, ScrollTrigger refresh, and debounced resize.
    w.__apolloPopperInstances = w.__apolloPopperInstances || [];
    function updateAllPoppers() {
      var list = w.__apolloPopperInstances;
      for (var i = 0; i < list.length; i++) {
        if (list[i] && typeof list[i].update === 'function') list[i].update();
      }
    }
    lenis.on('scroll', function (e) {
      if (e.velocity === 0) updateAllPoppers(); // fire only on scroll-end
    });
    ScrollTrigger.addEventListener('refresh', updateAllPoppers);
    if (w.Apollo && typeof w.Apollo === "object") {
      w.Apollo.registerPopper = function (instance) {
        if (instance && w.__apolloPopperInstances.indexOf(instance) === -1) {
          w.__apolloPopperInstances.push(instance);
        }
      };
    }

    // ── PHASE 4 · RESPONSIVE MOTION ──────────────────────────────
    // SplitText: opt-in only. [data-split-responsive] attribute gates splits.
    // autoSplit:true (GSAP 3.12+) re-splits on resize automatically — no
    // manual ResizeObserver or window.resize listener needed per element.
    if (w.SplitText) {
      d.querySelectorAll('[data-split-responsive]').forEach(function (el) {
        var type = el.dataset.splitResponsive || 'words';
        try {
          new w.SplitText(el, { type: type, autoSplit: true });
        } catch (_) {}
      });
    }
    // gsap.matchMedia() and ScrollTrigger pins/parallax/Flip transitions are
    // PAGE-LEVEL concerns. Each page/component creates its own gsap.context()
    // or gsap.matchMedia() and is responsible for its own cleanup.

    // ── PHASE 5 · CURSOR LAYER ───────────────────────────────────
    // Observer (gesture detection) is loaded globally in Tier 2b and available
    // as w.Observer. Draggable + InertiaPlugin are loaded only when
    // needsGsapMobile() is true (Tier 4 mobile gate). Desktop hover/cursor
    // states are page-level via Apollo.whenReady() — not registered globally here.

    // ── PHASE 6 · LIFECYCLE ──────────────────────────────────────
    var _resizeTimer = null;
    function onResize() {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(function () {
        // lenis.resize() recalculates scroll limits — call before ST.refresh()
        if (w.lenis) w.lenis.resize();
        ScrollTrigger.refresh();
        updateAllPoppers();
      }, 150);
    }
    w.addEventListener('resize', onResize, { passive: true });

    console.info('[Apollo] Lenis+GSAP ready — build ' + (w.Apollo && w.Apollo.config ? (w.Apollo.version || '') : ''));
  };

  var scheduleInit = function () {
    if (d.readyState === 'loading') {
      d.addEventListener('DOMContentLoaded', initUltimate, { once: true });
    } else {
      initUltimate();
    }
  };

  scheduleInit();
  w.addEventListener('apollo:ready', initUltimate, { once: true });
})(window, document);
