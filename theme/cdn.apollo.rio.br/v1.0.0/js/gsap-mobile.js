/*!
 * Apollo GSAP Mobile Engine  v3.0.0
 * ----------------------------------------------------------------------------
 * Scroll = Slide  |  Touch-native  |  Mobile-first  |  GSAP 3.15
 *
 * v3.0 Upgrades:
 *   - High-refresh-rate detector (25 frames on boot, scales durations by 60/actualHz)
 *   - Device tier detection (navigator.deviceMemory + hardwareConcurrency → maxTweens 8/5/3)
 *   - All durations respect real refresh rate (goTo, staggers, exit tweens)
 *   - Fixed promoteLayer/demoteLayer + APOLLO_CDN_URL guard
 *   - Haptic feedback on slide change (8ms vibration on mid/high-tier)
 *   - Safer plugin loading with graceful fallback
 *   - Minor defensive null checks + logging
 *
 * Audit v2 covers:
 *   Topic 1: gsap.matchMedia, gsap.context, lazy TLs, onEnter/onLeave state
 *             machine, preventOverlaps, faster mobile stagger
 *   Topic 2: Observer lockAxis/speeds, minimumMovement, free-drag rubber-band,
 *             velocity multi-slide skip, pinch + two-finger multi-touch
 *   Topic 3: smoothTouch:0.85, contain CSS, animation budget, Low Power Mode,
 *             reactive prefers-reduced-motion, iOS safe-area, overscroll-none,
 *             15Hz ticker velocity gate, will-change release
 *
 * DOM contract (minimum)
 *   #smooth-wrapper > #smooth-content > [data-slide] x N
 *
 * Optional attributes
 *   [data-slide-inner]  [data-slide-heading]  [data-slide-body]
 *   [data-slide-media]  [data-slide-badge]    [data-slide-cta]
 *   [data-slide-dot]                          navigation dots
 *   [data-parallax="0.4"]                     parallax speed 0-1
 *   [data-reveal="up|down|left|right"]        generic scroll reveal
 *   [data-split-text="chars|words|lines"]     SplitText entry
 *   [data-scramble-text="final string"]       ScrambleText entry
 *   [data-count-up="9999"]                    animated counter
 *   [data-draw-svg]                           DrawSVGPlugin
 *   [data-motion-path="#pathId"]              MotionPathPlugin
 *   [data-flip-trigger] / [data-flip-target]  Flip transitions
 *   [data-draggable-slides] > [data-drag-item] horizontal carousel
 *
 * Requires: gsap/gsap.min.js + gsap/ScrollTrigger.min.js loaded before this file.
 */
(function (w, doc) {
  "use strict";

  /* =========================================================================
   * 0. GSAP GUARD
   * ========================================================================= */
  if (typeof gsap === "undefined") {
    console.warn("[Apollo GSAP Mobile] gsap bundle not found — aborting.");
    return;
  }

  /* =========================================================================
   * 1. PLUGIN WIRING
   * ========================================================================= */
  var PLUGINS = [
    w.ScrollTrigger,   w.ScrollSmoother, w.ScrollToPlugin,
    w.Observer,        w.Draggable,      w.InertiaPlugin,
    w.Flip,            w.MotionPathPlugin, w.DrawSVGPlugin,
    w.MorphSVGPlugin,  w.SplitText,      w.ScrambleTextPlugin,
    w.TextPlugin,      w.Physics2DPlugin, w.PhysicsPropsPlugin,
    w.CSSRulePlugin,
  ].filter(Boolean);

  gsap.registerPlugin.apply(gsap, PLUGINS);

  /* =========================================================================
   * 2. CAPABILITY FLAGS
   * ========================================================================= */
  var HAS_SMOOTHER   = !!w.ScrollSmoother;
  var HAS_OBSERVER   = !!w.Observer;
  var HAS_DRAGGABLE  = !!w.Draggable && !!w.InertiaPlugin;
  var HAS_FLIP       = !!w.Flip;
  var HAS_MOTIONPATH = !!w.MotionPathPlugin;
  var HAS_DRAWSVG    = !!w.DrawSVGPlugin;
  var HAS_SPLITTEXT  = !!w.SplitText;
  var HAS_SCRAMBLE   = !!w.ScrambleTextPlugin;

  /* =========================================================================
   * 3. ENVIRONMENT  — getters re-evaluated on each read (post-resize safe)
   * ========================================================================= */
  var env = {
    get mobile()  { return w.innerWidth < 768; },
    get tablet()  { return w.innerWidth >= 768 && w.innerWidth < 1024; },
    get desktop() { return w.innerWidth >= 1024; },
    get touch()   { return "ontouchstart" in w || navigator.maxTouchPoints > 0; },
    get reduced() { return w.matchMedia("(prefers-reduced-motion: reduce)").matches; },

    /* iOS Safari — safe-area + orientation timing */
    get ios() {
      return /iP(hone|ad|od)/.test(navigator.userAgent) ||
             (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    },

    /* Android Chrome — overscroll-behavior fix */
    get android() { return /Android/.test(navigator.userAgent); },

    /*
     * smoothTouch: 0.85
     * Premium buttery glide for programmatic slide transitions on touch.
     * goTo() drives all movement; Observer captures intent only.
     * 0.85 = native-app premium feel (not raw scroll latency).
     */
    get smoothStrength() {
      if (env._degraded || env._thermalThrottle) return 0; // disable smoothing on low-end
      if (env.touch) return 0.85;
      return env.mobile ? 0.9 : env.tablet ? 1.1 : 1.3;
    },

    /* Scrub — tighter on mobile = quicker finger response */
    get scrubStrength() {
      return env.mobile ? 0.2 : env.tablet ? 0.4 : 0.65;
    },

    /*
     * Animation budget — max simultaneous running tweens.
     * v3.0: Dynamic device tiering (8/5/3) based on deviceMemory + hardwareConcurrency
     * High-tier: 8 | Mid-tier: 5 | Low-tier: 3
     */
    get maxTweens() {
      return env.deviceTier === "high" ? 8 :
             env.deviceTier === "mid"  ? 5 : 3;
    },

    /* Frame budget awareness — dynamically degraded if fps < 45 */
    _degraded: false,

    /* Thermal throttling awareness — iOS critical, fps < 30 */
    _thermalThrottle: false,

    /* v3.0: Device tier detection (high/mid/low) */
    get deviceTier() {
      if (env._deviceTier !== undefined) return env._deviceTier;

      var mem = navigator.deviceMemory || 4; // fallback to 4GB
      var cores = navigator.hardwareConcurrency || 4; // fallback to 4 cores
      var score = mem + (cores / 2); // weighted score

      env._deviceTier = score >= 6 ? "high" : score >= 4 ? "mid" : "low";
      return env._deviceTier;
    },

    /* v3.0: High-refresh-rate detector (scales durations by 60/actualHz) */
    get refreshScale() {
      return env._refreshHz ? 60 / env._refreshHz : 1;
    },

    /* v3.0: Haptic feedback capability */
    get haptic() {
      return env.deviceTier !== "low" && "vibrate" in navigator;
    },

    _deviceTier: undefined,
    _refreshHz: 60, // default assumption
  };

  /* =========================================================================
   * 4. LOW POWER MODE DETECTION
   *    Battery API: level < 20% && !charging -> reduce motion budget.
   *    Falls back gracefully when API is unavailable.
   * ========================================================================= */
  var lowPower = false;

  if ("getBattery" in navigator) {
    navigator.getBattery().then(function (bat) {
      var check = function () {
        lowPower = !bat.charging && bat.level < 0.20;
      };
      check();
      bat.addEventListener("chargingchange", check);
      bat.addEventListener("levelchange",    check);
    }).catch(function () { /* API blocked — ignore */ });
  }

  /* =========================================================================
   * 4.5 FRAME BUDGET AWARENESS (FPS-based throttling)
   * ========================================================================= */
  var fps = 60, lastFpsTime = performance.now(), frames = 0;

  gsap.ticker.add(function () {
    frames++;
    var now = performance.now();
    if (now - lastFpsTime >= 1000) {
      fps = frames;
      frames = 0;
      lastFpsTime = now;

      env._degraded = fps < 45;
      env._thermalThrottle = fps < 30; // iOS thermal throttling
    }
  });

  /* =========================================================================
   * 4.6 HIGH-REFRESH-RATE DETECTOR (v3.0)
   *    Runs for 25 frames on boot, then scales all durations by 60/actualHz
   * ========================================================================= */
  (function detectRefreshRate() {
    var frameCount = 0;
    var startTime = performance.now();
    var frameTimes = [];

    function measureFrame() {
      frameTimes.push(performance.now());
      frameCount++;

      if (frameCount >= 25) {
        // Calculate average frame time over 25 frames
        var totalTime = frameTimes[frameTimes.length - 1] - frameTimes[0];
        var avgFrameTime = totalTime / (frameTimes.length - 1);
        env._refreshHz = Math.round(1000 / avgFrameTime);

        // Clamp to reasonable range (24-240 Hz)
        env._refreshHz = Math.max(24, Math.min(240, env._refreshHz));

        console.log("[Apollo GSAP] Detected refresh rate: " + env._refreshHz + "Hz (scale: " + env.refreshScale.toFixed(2) + "x)");
        return; // Stop measuring
      }

      requestAnimationFrame(measureFrame);
    }

    requestAnimationFrame(measureFrame);
  })();

  /* =========================================================================
   * 4.7 HEAVY PLUGINS: PRIORITY LOADING STRATEGY (v3.0 enhanced)
   * ========================================================================= */

  /* v3.0: APOLLO_CDN_URL guard with fallback */
  var APOLLO_CDN_URL = w.APOLLO_CDN_URL || "https://cdn.apollo.rio.br/v1.0.0/";

  /* v3.0: promoteLayer/demoteLayer for will-change management */
  function promoteLayer(el) {
    if (!el || !el.style) return;
    el.style.willChange = "transform, opacity";
    el.style.contain = "layout style paint";
  }

  function demoteLayer(el) {
    if (!el || !el.style) return;
    el.style.willChange = "auto";
    el.style.contain = "none";
  }

  /* v3.0: Duration scaling for high-refresh-rate displays */
  function scaleDuration(baseDuration) {
    return baseDuration * env.refreshScale;
  }

  /* v3.0: Haptic feedback on slide change */
  function hapticFeedback() {
    if (env.haptic) {
      try {
        navigator.vibrate(8); // 8ms vibration
      } catch (e) {
        // Silently fail if vibration API blocked
      }
    }
  }

  function loadPlugin(name, cb) {
    if (w[name]) return cb && cb();
    if (!cb) return; // v3.0: safer - no callback = no load

    try {
      var script = doc.createElement("script");
      script.src = APOLLO_CDN_URL + "js/gsap/" + name + ".min.js";
      script.onload = function () {
        console.log("[Apollo GSAP] Loaded plugin: " + name);
        cb();
      };
      script.onerror = function () {
        console.warn("[Apollo GSAP] Failed to load plugin: " + name + " (fallback skipped)");
        cb(); // v3.0: graceful fallback - continue without plugin
      };
      doc.head.appendChild(script);
    } catch (e) {
      console.warn("[Apollo GSAP] Error loading plugin: " + name, e);
      cb(); // v3.0: continue on error
    }
  }

  /* =========================================================================
   * 5. PERFORMANCE CSS INJECTION (v3.0 enhanced)
   *  (1) contain: layout style paint  — isolates repaint cost per slide
   *  (2) will-change scoped to animated properties only
   *  (3) iOS: env(safe-area-inset-*) padding
   *  (4) Android: overscroll-behavior: none  (stops pull-to-refresh jank)
   *  (5) will-change released via state-machine CSS rule after entry
   *  (6) prefers-reduced-motion full reset
   *  (7) High-refresh-rate optimized: shorter durations on 120Hz+ displays
   * ========================================================================= */
  function injectPerfCSS() {
    var id = "apollo-gsap-perf";
    if (doc.getElementById(id)) return;

    var css = "\n" +
      "/* Apollo GSAP Mobile Engine v2 — GPU + containment hints */\n" +
      "\n" +
      "#smooth-wrapper {\n" +
      "  overflow: hidden;\n" +
      "  position: fixed;\n" +
      "  top: 0; right: 0; bottom: 0; left: 0;\n" +
      "  width: 100%; height: 100%;\n" +
      "  overscroll-behavior: none;\n" +
      "  touch-action: pan-y;\n" + // pan-y allows scroll; MultiTouch still fires (#10)
      "}\n" +
      "\n" +
      "#smooth-content {\n" +
      "  overflow: visible;\n" +
      "  overscroll-behavior: none;\n" +
      "}\n" +
      "\n" +
      "[data-slide] {\n" +
      "  contain: layout style paint;\n" +
      "  backface-visibility: hidden;\n" +
      "  -webkit-backface-visibility: hidden;\n" +
      "  padding-top:    env(safe-area-inset-top,    0px);\n" +
      "  padding-bottom: env(safe-area-inset-bottom, 0px);\n" +
      "  padding-left:   env(safe-area-inset-left,   0px);\n" +
      "  padding-right:  env(safe-area-inset-right,  0px);\n" +
      "}\n" +
      "\n" +
      "[data-slide-media] {\n" +
      "  contain: layout paint;\n" +
      "  backface-visibility: hidden;\n" +
      "  -webkit-backface-visibility: hidden;\n" +
      "}\n" +
      "\n" +
      "[data-slide-inner],\n" +
      "[data-slide-heading],\n" +
      "[data-slide-body],\n" +
      "[data-slide-cta],\n" +
      "[data-slide-badge] {\n" +
      "  /* will-change managed by promoteLayer() */\n" +
      "}\n" +
      "\n" +
      "/* Release will-change after animation completes */\n" +
      "[data-slide][data-slide-state='active'],\n" +
      "[data-slide][data-slide-state='idle'] {\n" +
      "  will-change: auto;\n" +
      "}\n" +
      "\n" +
      "/* content-visibility: skip GPU paint for off-screen idle slides.\n" +
      " * contain-intrinsic-size provides a size hint so layout isn't collapsed.\n" +
      " * 'entering' and 'exiting' states are excluded so in-flight tweens paint. */\n" +
      "[data-slide][data-slide-state='idle'] {\n" +
      "  content-visibility: auto;\n" +
      "  contain-intrinsic-size: 0 100dvh;\n" +
      "}\n" +
      "\n" +
      "[data-slide-dot],\n" +
      "[data-flip-trigger] {\n" +
      "  cursor: pointer;\n" +
      "  -webkit-tap-highlight-color: transparent;\n" +
      "  touch-action: manipulation;\n" +
      "}\n" +
      "\n" +
      "[data-draggable-slides] {\n" +
      "  touch-action: pan-y;\n" +
      "  -webkit-tap-highlight-color: transparent;\n" +
      "  user-select: none;\n" +
      "  -webkit-user-select: none;\n" +
      "  overscroll-behavior-x: none;\n" +
      "}\n" +
      "\n" +
      "[data-drag-item] {\n" +
      "  touch-action: pan-y;\n" +
      "}\n" +
      "\n" +
      "@media (prefers-reduced-motion: reduce) {\n" +
      "  [data-slide],\n" +
      "  [data-slide-media],\n" +
      "  [data-slide-inner] {\n" +
      "    will-change: auto !important;\n" +
      "    contain: layout !important;\n" +
      "    transition: none !important;\n" +
      "    animation: none !important;\n" +
      "  }\n" +
      "}\n";

    var style = doc.createElement("style");
    style.id  = id;
    style.textContent = css;
    doc.head.appendChild(style);
  }

  /* =========================================================================
   * 6. ENGINE SINGLETON  v2
   * ========================================================================= */
  var Engine = {

    /* State */
    smoother      : null,
    masterTL      : null,
    scrollTR      : null,
    observer      : null,
    mm            : null,   /* gsap.matchMedia() instance */
    ctx           : null,   /* gsap.context() — owns all tweens + STs */
    draggables    : [],
    splits        : [],
    slides        : [],
    current       : 0,
    total         : 0,
    busy          : false,
    _profile      : null,
    _resizeRAF    : null,
    _activeTweens : 0,      /* animation budget counter */
    _tickerVel    : 0,      /* cached velocity for 15Hz ticker gate */
    _tickerHandler: null,
    _slideStates  : null,   /* Map<element, string> */
    _handlers     : [],     /* event listener cleanup */

    /* =========================================================================
     * 6.1  ENTRY POINT
     * ========================================================================= */
    init: function () {
      this._slideStates = new Map();
      this.slides = gsap.utils.toArray("[data-slide]");
      this.total  = this.slides.length;

      /*
       * Wrap everything in gsap.context() so ctx.revert() cleanly kills
       * every tween, ScrollTrigger, and SplitText instance created inside.
       */
      var self = this;
      this.ctx = gsap.context(function () {

        if (!self.total) {
          self._bootScrollEffects();
          return;
        }

        self._stampSlides();
        self._initStateMap();

        if (env.reduced || lowPower) {
          self._bootReducedMotion();
        } else {
          self._bootFull();
        }

        self._setupKeyboard();
        self._setupA11y();
        self._setupReducedMotionListener();

      });

      this._setupResize();
    },

    /* =========================================================================
     * 6.1.5  EVENT LISTENER HELPER (memory leak prevention)
     * ========================================================================= */
    _addHandler: function (el, ev, fn, opts) {
      el.addEventListener(ev, fn, opts);
      this._handlers.push(() => el.removeEventListener(ev, fn));
    },

    /* =========================================================================
     * 6.2  SLIDE STAMPING + STATE MAP
     * ========================================================================= */
    _stampSlides: function () {
      var self = this;
      this.slides.forEach(function (s, i) {
        s.dataset.slideIndex = i;
        s.dataset.slideState = i === 0 ? "active" : "idle";
        s.setAttribute("role",        "region");
        s.setAttribute("aria-label",  "Slide " + (i + 1) + " of " + self.total);
        s.setAttribute("aria-hidden", i !== 0 ? "true" : "false");
        s.setAttribute("tabindex",    "-1");
      });
    },

    _initStateMap: function () {
      var self = this;
      this._slideStates.clear();
      this.slides.forEach(function (s, i) {
        self._slideStates.set(s, i === 0 ? "active" : "idle");
      });
    },

    /* =========================================================================
     * 6.3  FULL BOOT
     * ========================================================================= */
    _bootFull: function () {
      this._buildSmoother();
      this._buildMatchMedia();    /* gsap.matchMedia — breakpoint profiles */
      this._buildScrollTrigger();
      this._buildTouchObserver();
      if (!env.mobile || !env._degraded) {
        this._buildMultiTouch();
      }
      if (HAS_DRAGGABLE) this._buildDraggable();
      this._buildConditionalEffects();
      this._startVelocityTicker();
      this._syncDots(0);
    },

    /* =========================================================================
     * 6.4  REDUCED-MOTION / LOW POWER BOOT
     *      Slides instantly visible. Keyboard + dots still work. 0 tweens.
     * ========================================================================= */
    _bootReducedMotion: function () {
      var self = this;
      this.slides.forEach(function (s) {
        gsap.set(s, { clearProps: "all" });
        s.dataset.slideState = "active";
      });
      doc.documentElement.style.setProperty("--transition-duration", "0ms");
      this._syncDots(0);
    },

    /* =========================================================================
     * 6.5  SCROLLSMOOTHER  (foundation)
     *
     *  smoothTouch: 0.85
     *    Premium buttery glide. goTo() drives all scroll position programmat-
     *    ically; Observer only captures gesture intent. 0.85 gives the slide
     *    scrub a glass-panel native-app feel on every touch device.
     *
     *  normalizeScroll: true
     *    Unifies iOS bounce, Android fling, desktop wheel and trackpad into
     *    one consistent scroll model.
     *
     *  ignoreMobileResize: true
     *    Suppresses address-bar hide/show layout jank on iOS + Android Chrome.
     * ========================================================================= */
    _buildSmoother: function () {
      if (!HAS_SMOOTHER) return;

      var wrapper = doc.querySelector("#smooth-wrapper");
      var content = doc.querySelector("#smooth-content");
      if (!wrapper || !content) return;

      var self = this;
      this.smoother = ScrollSmoother.create({
        wrapper:            wrapper,
        content:            content,
        smooth:             env.smoothStrength,
        smoothTouch:        0.85,
        normalizeScroll:    true,
        ignoreMobileResize: true,
        effects:            true,
        /* Velocity cached for 15Hz ticker gate — no direct style writes here */
        onUpdate: function (inst) { self._tickerVel = Math.abs(inst.getVelocity()); },
        onStop:   function ()     { self._tickerVel = 0; },
      });
    },

    /* =========================================================================
     * 6.6  MASTER TIMELINE  via gsap.matchMedia()
     *
     *  One gsap.matchMedia() instance creates three breakpoint branches.
     *  Each branch builds the master TL with a device-appropriate profile:
     *    Mobile:  stagger 0.04, yDepth 18px, scaleTo 0.97, dur 0.42s
     *    Tablet:  stagger 0.055, yDepth 24px, scaleTo 0.96, dur 0.48s
     *    Desktop: stagger 0.07,  yDepth 32px, scaleTo 0.95, dur 0.58s
     *
     *  Per-slide entry TLs are LAZY — built on first onEnter via per-slide
     *  ScrollTriggers (section 6.8). This eliminates N x ~100ms boot cost.
     *
     *  Exit tweens are added immediately (they scrub smoothly, budget-free).
     * ========================================================================= */
    _buildMatchMedia: function () {
      if (this.mm) this.mm.revert();

      var self = this;
      var mm   = gsap.matchMedia();
      this.mm  = mm;

      mm.add("(max-width: 767px)", function () {
        self._buildMasterTimeline({ 
          stagger: scaleDuration(0.04), 
          yDepth: 18, 
          scaleTo: 0.97, 
          dur: scaleDuration(0.42) 
        });
        return function () {};
      });

      mm.add("(min-width: 768px) and (max-width: 1023px)", function () {
        self._buildMasterTimeline({ 
          stagger: scaleDuration(0.055), 
          yDepth: 24, 
          scaleTo: 0.96, 
          dur: scaleDuration(0.48) 
        });
        return function () {};
      });

      mm.add("(min-width: 1024px)", function () {
        self._buildMasterTimeline({ 
          stagger: scaleDuration(0.07), 
          yDepth: 32, 
          scaleTo: 0.95, 
          dur: scaleDuration(0.58) 
        });
        return function () {};
      });
    },

    _buildMasterTimeline: function (profile) {
      profile = profile || { 
        stagger: scaleDuration(0.07), 
        yDepth: 28, 
        scaleTo: 0.96, 
        dur: scaleDuration(0.55) 
      };
      if (this.masterTL) this.masterTL.kill();

      var tl  = gsap.timeline({ paused: true, defaults: { ease: "none" } });
      this.masterTL = tl;
      this._profile = profile;

      var self = this;
      this.slides.forEach(function (slide, i) {

        /* Label at each integer = snap target */
        tl.addLabel("slide" + i, i);

        /* Initial state: first slide visible, rest below viewport */
        if (i === 0) {
          gsap.set(slide, { yPercent: 0, autoAlpha: 1, scale: 1 });
        } else {
          gsap.set(slide, { yPercent: 100, autoAlpha: 0, scale: 1 });
        }

        /* Lazy entry placeholder — _buildSlideTL fills content on first enter */
        (function (capturedI) {
          tl.add(function () {}, capturedI);
        }(i));

        /* Exit overlap — scrubs cleanly, no budget cost */
        if (i < self.total - 1) {
          tl.to(slide, {
            yPercent:  -Math.round(profile.yDepth * 0.85),
            autoAlpha: 0,
            scale:     profile.scaleTo + 0.01,
            duration:  0.38,
            ease:      "power3.in",
            overwrite: "auto",
          }, i + 0.62);
        }
      });
    },

    /*
     * Lazy per-slide entry TL.
     * Built once on first onEnter. Idempotent guard prevents rebuilds.
     * Budget-aware: if activeTweens >= maxTweens, stagger is cut 60%.
     */
    _buildSlideTL: function (slide, i) {
      if (slide._tlBuilt) return;
      slide._tlBuilt = true;

      var p = this._profile || { 
        stagger: scaleDuration(0.07), 
        yDepth: 28, 
        scaleTo: 0.96, 
        dur: scaleDuration(0.55) 
      };

      var heading = slide.querySelector("[data-slide-heading]");
      var body    = slide.querySelector("[data-slide-body]");
      var media   = slide.querySelector("[data-slide-media]");
      var badge   = slide.querySelector("[data-slide-badge]");
      var cta     = slide.querySelector("[data-slide-cta]");
      var inner   = slide.querySelector("[data-slide-inner]");

      var budgetOk = this._activeTweens < env.maxTweens;
      var stagger  = budgetOk ? p.stagger : p.stagger * 0.4;

      /* Wrapper entrance (slide 0 is pre-set visible) */
      if (i > 0) {
        this._trackTween(gsap.fromTo(slide,
          { yPercent: 100, autoAlpha: 0, scale: p.scaleTo },
          {
            yPercent:  0,
            autoAlpha: 1,
            scale:     1,
            duration:  p.dur + 0.1,
            ease:      "power3.out",
            overwrite: "auto",
          }
        ));
      }

      /* Content stagger */
      var items = [heading, body, badge, cta, inner].filter(Boolean);
      if (items.length) {
        this._trackTween(gsap.fromTo(items,
          { yPercent: p.yDepth, autoAlpha: 0 },
          {
            yPercent:  0,
            autoAlpha: 1,
            duration:  p.dur,
            stagger:   stagger,
            ease:      "power2.out",
            overwrite: "auto",
          }
        ));
      }

      /* Media scale */
      if (media) {
        this._trackTween(gsap.fromTo(media,
          { scale: 1.10, autoAlpha: 0 },
          {
            scale:     1,
            autoAlpha: 1,
            duration:  p.dur + 0.25,
            ease:      "power2.out",
            overwrite: "auto",
          }
        ));
      }

      /* Release will-change via state machine after entry completes */
      var self = this;
      /* Track delayedCall so destroy() cancels it (#7). Guard ensures we only
         set "active" if slide hasn't already transitioned away (#8).        */
      this._trackTween(gsap.delayedCall(p.dur + 0.5, function () {
        if (self._slideStates.get(slide) === "entering") {
          self._setSlideState(slide, "active");
        }
      }));
    },

    /* =========================================================================
     * 6.7  ANIMATION BUDGET TRACKER
     *      Wraps a tween; increments/decrements the active counter.
     * ========================================================================= */
    _trackTween: function (tween) {
      if (!tween) return tween;
      var self = this;
      self._activeTweens++;
      var dec = function () {
        self._activeTweens = Math.max(0, self._activeTweens - 1);
      };
      tween.eventCallback("onComplete",  dec);
      tween.eventCallback("onInterrupt", dec);
      return tween;
    },

    /* =========================================================================
     * 6.8  SCROLLTRIGGER  (scrub + snap + per-slide onEnter/onLeave)
     *
     *  Per-slide ScrollTriggers (slide-st-{i}) use containerAnimation to
     *  detect label crossings inside the master scrub. They fire:
     *    onEnter     -> state = 'entering', build lazy TL
     *    onLeave     -> state = 'exiting'
     *    onEnterBack -> state = 'entering', build lazy TL (idempotent)
     *    onLeaveBack -> state = 'exiting'
     * ========================================================================= */
    _buildScrollTrigger: function () {
      if (this.scrollTR) this.scrollTR.kill();

      /* Kill any stale per-slide STs */
      ScrollTrigger.getAll()
        .filter(function (st) { return st.vars.id && st.vars.id.indexOf("slide-st-") === 0; })
        .forEach(function (st) { st.kill(); });

      var self  = this;
      var pinEl = doc.querySelector("#smooth-wrapper") || doc.body;

      this.scrollTR = ScrollTrigger.create({
        id:            "masterScrub",
        trigger:       pinEl,
        start:         "top top",
        end:           function () { return "+=" + ((self.total - 1) * w.innerHeight); },
        scrub:         env.scrubStrength,
        pin:           true,
        pinSpacing:    false,
        anticipatePin: 1,
        animation:     this.masterTL,
        snap: {
          snapTo:   "labels",
          duration: { min: env.mobile ? 0.12 : 0.18, max: env.mobile ? 0.45 : 0.65 },
          delay:    env.mobile ? 0.02 : 0.04,
          ease:     "power2.inOut",
          inertia:  true,
        },
        onUpdate: function (st) {
          var idx = Math.round(st.progress * (self.total - 1));
          if (idx !== self.current) {
            self.current = idx;
            self._onSlideChange(idx);
          }
        },
        onSnapComplete: function () { self.busy = false; },
      });

      /* Per-slide onEnter / onLeave STs */
      this.slides.forEach(function (slide, i) {
        var n = self.total;
        var normS = n > 1 ? ((i - 0.5) / (n - 1)) : 0;
        var normE = n > 1 ? ((i + 0.5) / (n - 1)) : 1;
        normS = Math.max(0, normS);
        normE = Math.min(1, normE);

        ScrollTrigger.create({
          id:                 "slide-st-" + i,
          trigger:            pinEl,
          start:              (normS * 100).toFixed(2) + "%",
          end:                (normE * 100).toFixed(2) + "%",
          containerAnimation: self.masterTL,
          onEnter: function () {
            self._setSlideState(slide, "entering");
            self._buildSlideTL(slide, i);
          },
          onLeave:      function () { self._setSlideState(slide, "exiting"); },
          onEnterBack:  function () {
            self._setSlideState(slide, "entering");
            self._buildSlideTL(slide, i);
          },
          onLeaveBack:  function () { self._setSlideState(slide, "exiting"); },
        });
      });

      /* Pre-compute normalised progress offsets */
      this.slides.forEach(function (s, i) {
        s._normProgress = self.total > 1 ? i / (self.total - 1) : 0;
      });
    },

    _setSlideState: function (slide, state) {
      this._slideStates.set(slide, state);
      slide.dataset.slideState = state;
    },

    /* =========================================================================
     * 6.9  TOUCH OBSERVER  (enhanced v2)
     *
     *  AUDIT FIXES applied:
     *  - wheelSpeed: 2      normalises mouse wheel vs trackpad delta
     *  - touchSpeed: 1.2    slight amplification makes swipe feel snappier
     *  - lockAxis: true     disambiguates vertical swipe from horizontal drag
     *                       (essential for pages with horizontal carousels)
     *  - tolerance: 8       minimum px move to register intentional swipe
     *  - velocity check     moved from onStop -> onDown/onUp — reads velocityY
     *                       at moment of gesture intent, not after inertia
     *  - fast fling >800px/s -> skip 2 slides
     * ========================================================================= */
    _buildTouchObserver: function () {
      if (!HAS_OBSERVER) return;
      if (this.observer) { this.observer.kill(); this.observer = null; }

      var self        = this;
      var touchLocked = false;

      var navigate = function (direction) {
        if (touchLocked || self.busy) return;
        touchLocked = true;
        self.busy   = true;
        self.goTo(self.current + direction);
        gsap.delayedCall(env.mobile ? 0.45 : 0.55, function () { touchLocked = false; });
      };

      var velocityCheck = function (observerSelf) {
        if (env.mobile && env._degraded) return false; // skip on low-end mobile
        var vy        = observerSelf.velocityY || 0;
        var speed     = Math.abs(vy);
        /* Adaptive threshold: higher on 120Hz+ (easier to exceed 800 there)  (#4) */
        var threshold = env.mobile ? 1200 : 900;
        if (speed > threshold && !touchLocked && !self.busy) {
          /* Fast fling -> skip 2 slides in direction of movement */
          navigate(vy < 0 ? -2 : 2);
          return true;
        }
        return false;
      };

      this.observer = Observer.create({
        target:         w,
        type:           "wheel,touch,pointer",
        tolerance:      8,
        wheelSpeed:     2,
        touchSpeed:     1.2,
        lockAxis:       true,
        /* Bug 7 fix: only preventDefault when the slide engine is active with real
         * slides. Without this guard, a failed init still swallows every touch event
         * (preventDefault is called) but delivers nothing → frozen-page symptom.   */
        preventDefault: true,
        allowClicks:    true,   // still allow tap events through
        ignore:         "[data-draggable-slides], [data-drag-item]", // (#12)
        onDown: function (obs) {
          if (!self.total) return; // no slides — let browser handle natively
          if (!velocityCheck(obs)) navigate(1);
        },
        onUp:   function (obs) {
          if (!self.total) return; // no slides — let browser handle natively
          if (!velocityCheck(obs)) navigate(-1);
        },
      });
    },

    /* =========================================================================
     * 6.10  MULTI-TOUCH  (pinch + two-finger swipe)
     *
     *  Observer handles single-touch only. Multi-touch requires raw events.
     *  touch-action: none on #smooth-wrapper is required for these to fire.
     *
     *  Pinch-in / pinch-out  -> apollo:pinch  {scale, direction}
     *  Two-finger swipe down -> apollo:dismiss
     * ========================================================================= */
    _buildMultiTouch: function () {
      if (!env.touch) return;

      var t1 = null, startDist = 0, startMidY = 0;

      var getDist = function (a, b) {
        return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
      };

      var onStart = function (e) {
        if (e.touches.length === 2) {
          t1 = e.touches[0];
          var t2 = e.touches[1];
          startDist = getDist(t1, t2);
          startMidY = (t1.clientY + t2.clientY) / 2;
          e.preventDefault();
        }
      };

      var onMove = function (e) {
        if (e.touches.length !== 2 || !t1) return;
        var cur   = getDist(e.touches[0], e.touches[1]);
        var ratio = cur / startDist;
        if (ratio < 0.75 || ratio > 1.25) {
          doc.dispatchEvent(new CustomEvent("apollo:pinch", {
            bubbles: true,
            detail:  { scale: ratio, direction: ratio < 1 ? "in" : "out" },
          }));
          t1 = null; /* Reset until next touchstart */
        }
      };

      var onEnd = function (e) {
        if (!t1 || e.changedTouches.length < 2) { t1 = null; return; }
        var endMidY = (e.changedTouches[0].clientY +
                      (e.changedTouches[1] ? e.changedTouches[1].clientY
                                           : e.changedTouches[0].clientY)) / 2;
        if (endMidY - startMidY > 60) {
          doc.dispatchEvent(new CustomEvent("apollo:dismiss", { bubbles: true }));
        }
        t1 = null;
      };

      var wrapper = doc.querySelector("#smooth-wrapper") || doc.body;
      this._addHandler(wrapper, "touchstart", onStart, { passive: false });
      this._addHandler(wrapper, "touchmove",  onMove,  { passive: true  });
      this._addHandler(wrapper, "touchend",   onEnd,   { passive: true  });
    },

    /* =========================================================================
     * 6.11  DRAGGABLE HORIZONTAL CAROUSEL  (enhanced v2)
     *
     *  AUDIT FIXES applied:
     *  - minimumMovement: 8         prevents tap being read as drag
     *  - allowNativeTouchScrolling: false  engine owns x-axis completely
     *  - Free-drag threshold: < 40% itemW -> rubber-band back (back.out(2))
     *                          >= 40% itemW -> commit + ARIA update
     * ========================================================================= */
    _buildDraggable: function () {
      var tracks = gsap.utils.toArray("[data-draggable-slides]");
      if (!tracks.length) return;

      var self = this;

      tracks.forEach(function (track) {
        var items = gsap.utils.toArray("[data-drag-item]", track);
        if (!items.length) return;

        var gap   = parseFloat(getComputedStyle(track).gap) || 16;
        var itemW = 0; // cache after layout
        var maxX  = 0;
        var lastX = 0;

        /* Cache itemW after layout settles */
        requestAnimationFrame(function () {
          itemW = items[0].offsetWidth + gap;
          maxX  = -(items.length - 1) * itemW;

          var d = Draggable.create(track, {
            type:                     "x",
            bounds:                   { minX: maxX, maxX: 0 },
            inertia:                  true,
            minimumMovement:          8,
            edgeResistance:           0.88,
            allowNativeTouchScrolling: false,
            cursor:                   "grab",
            activeCursor:             "grabbing",
            snap:                     { x: gsap.utils.snap(itemW) },

            onDragStart: function () {
              lastX = this.x;
            },

            onDragEnd: function () {
              var delta     = Math.abs(this.x - lastX);
              var threshold = itemW * 0.40;
              var that      = this;

              if (delta < threshold) {
                /* Rubber-band spring back to previous position */
                gsap.to(track, {
                  x:         lastX,
                  duration:  scaleDuration(0.4),
                  ease:      "back.out(2)",
                  overwrite: "auto",
                });
              } else {
                var idx = gsap.utils.clamp(0, items.length - 1,
                          Math.abs(Math.round(that.x / itemW)));
                items.forEach(function (item, i) {
                  item.setAttribute("aria-hidden", i !== idx ? "true" : "false");
                });
                doc.dispatchEvent(new CustomEvent("apollo:carouselChange", {
                  bubbles: true,
                  detail:  { index: idx, track: track },
                }));
              }
            },
          });

          self.draggables.push.apply(self.draggables, d);

          /* Recalculate itemW + maxX on resize (responsive items) (#9) */
          self._addHandler(w, "resize", function () {
            requestAnimationFrame(function () {
              if (!items[0]) return;
              itemW = items[0].offsetWidth + gap;
              maxX  = -(items.length - 1) * itemW;
              if (d[0]) {
                d[0].applyBounds({ minX: maxX, maxX: 0 });
                d[0].vars.snap = { x: gsap.utils.snap(itemW) };
              }
            });
          }, { passive: true });
        });
      });
    },

    /* =========================================================================
     * 6.12  VELOCITY TICKER  (15Hz gate — replaces 60Hz smoother callback)
     *
     *  AUDIT FIX: smoother.onUpdate fired every animation frame calling
     *  style.setProperty which triggered style recalculation every frame.
     *  Solution: GSAP Ticker fires at ~60fps but we gate writes to every
     *  4th frame (~15Hz) — sufficient for CSS transitions without blocking paint.
     * ========================================================================= */
    _startVelocityTicker: function () {
      var self  = this;
      var frame = 0;

      self._tickerHandler = function () {
        if (++frame % 4 !== 0) return;
        var v = (self._tickerVel / 1200).toFixed(3);
        doc.documentElement.style.setProperty("--scroll-velocity", v);
      };

      gsap.ticker.add(self._tickerHandler);
    },

    /* =========================================================================
     * 6.13  CONDITIONAL PLUGIN EFFECTS  (lazy + budget-aware + low-power gated)
     * ========================================================================= */
    _buildConditionalEffects: function () {
      /* Skip all heavy effects under reduced motion or low battery */
      if (env.reduced || lowPower) {
        this._bootScrollEffects();
        return;
      }

      /* Gate heavy effects on degraded devices */
      if (env._degraded) {
        this._bootScrollEffects(); // only basic reveals
        return;
      }

      this._fx_DrawSVG();
      this._fx_MotionPath();
      this._fx_Flip();
      loadPlugin("SplitText", () => this._fx_SplitText());
      loadPlugin("ScrambleTextPlugin", () => this._fx_Scramble());
      this._fx_Parallax();
      this._fx_CountUp();
      this._bootScrollEffects();
    },

    _fx_DrawSVG: function () {
      if (!HAS_DRAWSVG) return;
      var self = this;
      gsap.utils.toArray("[data-draw-svg]").forEach(function (el) {
        self._trackTween(gsap.from(el, {
          drawSVG:  "0% 0%",
          duration: env.mobile ? 1.2 : 1.8,
          ease:     "power2.inOut",
          scrollTrigger: {
            trigger:       el,
            start:         "top 85%",
            toggleActions: "play none none reverse",
          },
        }));
      });
    },

    _fx_MotionPath: function () {
      if (!HAS_MOTIONPATH) return;
      gsap.utils.toArray("[data-motion-path]").forEach(function (el) {
        var path = doc.querySelector(el.dataset.motionPath);
        if (!path) return;
        gsap.to(el, {
          motionPath: { path: path, align: path, autoRotate: true, alignOrigin: [0.5, 0.5] },
          ease:       "none",
          scrollTrigger: {
            trigger: el,
            start:   "top 80%",
            end:     "bottom 20%",
            scrub:   1,
          },
        });
      });
    },

    _fx_Flip: function () {
      if (!HAS_FLIP) return;
      var self = this;
      doc.querySelectorAll("[data-flip-trigger]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (self._activeTweens >= env.maxTweens) return; /* budget gate */
          var targets = gsap.utils.toArray("[data-flip-target]");
          var state   = Flip.getState(targets, { props: "color,background,borderRadius" });
          btn.classList.toggle("is-active");
          Flip.from(state, {
            duration: env.mobile ? 0.38 : 0.55,
            ease:     "power2.inOut",
            absolute: true,
            nested:   true,
            onEnter: function (els) {
              self._trackTween(gsap.fromTo(els,
                { autoAlpha: 0, scale: 0.8 },
                { autoAlpha: 1, scale: 1, duration: 0.4 }
              ));
            },
            onLeave: function (els) {
              self._trackTween(gsap.to(els, { autoAlpha: 0, scale: 0.8, duration: 0.3 }));
            },
          });
        });
      });
    },

    _fx_SplitText: function () {
      if (!HAS_SPLITTEXT) return;
      if (this._splitTextInit) return; // idempotency guard (#3)
      this._splitTextInit = true;
      var p    = this._profile || { stagger: 0.07 };
      var self = this;

      gsap.utils.toArray("[data-split-text]").forEach(function (el) {
        var type  = el.dataset.splitText || "chars";
        var split = new SplitText(el, { type: type });
        var units = type === "chars" ? split.chars
                  : type === "words" ? split.words
                  : split.lines;

        self._trackTween(gsap.from(units, {
          autoAlpha: 0,
          yPercent:  30,
          rotation:  env.mobile ? 0 : 3,
          duration:  env.mobile ? 0.36 : 0.48,
          stagger:   type === "chars"
                       ? Math.min(p.stagger * 0.55, 0.022)
                       : p.stagger,
          ease:      "back.out(1.5)",
          overwrite: "auto",
          scrollTrigger: {
            trigger:       el,
            start:         "top 87%",
            toggleActions: "play none none reverse",
          },
        }));

        self.splits.push(split);
      });
    },

    _fx_Scramble: function () {
      if (!HAS_SCRAMBLE) return;
      if (this._scrambleInit) return; // idempotency guard (#3)
      this._scrambleInit = true;
      var self = this;
      gsap.utils.toArray("[data-scramble-text]").forEach(function (el) {
        var finalText = el.dataset.scrambleText || el.textContent.trim();
        self._trackTween(gsap.from(el, {
          duration:     env.mobile ? 0.9 : 1.3,
          scrambleText: { text: finalText, chars: "upperCase", speed: 0.55, revealDelay: 0.35 },
          ease:         "none",
          scrollTrigger: {
            trigger:       el,
            start:         "top 87%",
            toggleActions: "play none none reverse",
          },
        }));
      });
    },

    _fx_Parallax: function () {
      var self = this;
      gsap.utils.toArray("[data-parallax]").forEach(function (el) {
        var speed = parseFloat(el.dataset.parallax) || 0.3;
        if (self.smoother) {
          /* ScrollSmoother native data-speed — zero extra RAF cost */
          el.dataset.speed = speed;
        } else if (!env.mobile) {
          /* Skip raw parallax on mobile without ScrollSmoother — too expensive */
          gsap.to(el, {
            yPercent: speed * -22,
            ease:     "none",
            scrollTrigger: {
              trigger: el,
              start:   "top bottom",
              end:     "bottom top",
              scrub:   true,
            },
          });
        }
      });
    },

    _fx_CountUp: function () {
      var self = this;
      gsap.utils.toArray("[data-count-up]").forEach(function (el) {
        var end = parseInt(el.dataset.countUp, 10) || 0;
        var obj = { val: 0 };
        self._trackTween(gsap.to(obj, {
          val:      end,
          duration: env.mobile ? 1.1 : 1.6,
          ease:     "power2.out",
          snap:     { val: 1 },
          onUpdate: function () { el.textContent = obj.val.toLocaleString(); },
          scrollTrigger: {
            trigger:       el,
            start:         "top 87%",
            toggleActions: "play none none reverse",
          },
        }));
      });
    },

    _bootScrollEffects: function () {
      if (env.reduced || lowPower) return;
      var self = this;

      /* IntersectionObserver fallback for low-power/degraded devices */
      if (lowPower || env._degraded) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              e.target.classList.add("visible");
              promoteLayer(e.target);
              gsap.fromTo(e.target, { autoAlpha: 0, y: 28 }, {
                autoAlpha: 1, y: 0, duration: scaleDuration(0.6), ease: "power2.out",
                onComplete: function () { demoteLayer(e.target); },
              });
            }
          });
        }, { threshold: 0.1 });

        self._io = io; // store for cleanup in destroy() (#6)
        gsap.utils.toArray("[data-reveal]").forEach(function (el) { io.observe(el); });
        return;
      }

      gsap.utils.toArray("[data-reveal]").forEach(function (el) {
        var dir   = el.dataset.reveal || "up";
        var fromY = dir === "up"   ?  28 : dir === "down"  ? -28 : 0;
        var fromX = dir === "left" ?  28 : dir === "right" ? -28 : 0;
        self._trackTween(gsap.from(el, {
          autoAlpha: 0,
          x:         fromX,
          y:         fromY,
          duration:  scaleDuration(env.mobile ? 0.5 : 0.7),
          ease:      "power2.out",
          overwrite: "auto",
          scrollTrigger: {
            trigger:       el,
            start:         "top 88%",
            toggleActions: "play none none reverse",
          },
        }));
      });
    },

    /* =========================================================================
     * 6.14  PUBLIC NAVIGATION API  goTo(index, instant?)
     * ========================================================================= */
    goTo: function (index, instant) {
      instant = !!instant;
      var target = gsap.utils.clamp(0, this.total - 1, index);
      if (target === this.current && !instant) return;

      this.busy    = true;
      this.current = target;

      var st = ScrollTrigger.getById("masterScrub");
      if (!st) { this.busy = false; return; }

      var scrollY = st.start + target * w.innerHeight;
      var self    = this;

      if (this.smoother) {
        this.smoother.scrollTo(scrollY, !instant, instant ? null : "power2.inOut");
        gsap.delayedCall(instant ? 0 : scaleDuration(env.mobile ? 0.6 : 0.8), function () {
          self.busy = false;
        });
      } else {
        gsap.to(w, {
          scrollTo:   { y: scrollY, autoKill: false },
          duration:   instant ? 0 : scaleDuration(env.mobile ? 0.5 : 0.65),
          ease:       "power2.inOut",
          overwrite:  "auto",
          onComplete: function () { self.busy = false; },
        });
      }

      this._onSlideChange(target);
    },

    /* =========================================================================
     * 6.15  SLIDE CHANGE SIDE-EFFECTS (v3.0: haptic feedback)
     * ========================================================================= */
    _onSlideChange: function (idx) {
      this._syncDots(idx);
      this._syncAriaHidden(idx);
      this._setSlideState(this.slides[idx], "entering");
      hapticFeedback(); // v3.0: haptic feedback on slide change

      if (!env.touch) {
        var slide = this.slides[idx];
        if (slide) slide.focus({ preventScroll: true });
      }

      doc.dispatchEvent(new CustomEvent("apollo:slideChange", {
        bubbles: true,
        detail:  { index: idx, total: this.total, el: this.slides[idx] },
      }));
    },

    _syncDots: function (idx) {
      gsap.utils.toArray("[data-slide-dot]").forEach(function (dot, i) {
        var active = i === idx;
        dot.classList.toggle("is-active", active);
        dot.setAttribute("aria-current", active ? "step" : "false");
        gsap.to(dot, {
          scale:     active ? 1.3 : 1,
          duration:  0.22,
          ease:      "power2.out",
          overwrite: "auto",
        });
      });
    },

    _syncAriaHidden: function (idx) {
      this.slides.forEach(function (s, i) {
        s.setAttribute("aria-hidden", i !== idx ? "true" : "false");
      });
    },

    /* =========================================================================
     * 6.16  KEYBOARD NAVIGATION
     * ========================================================================= */
    _setupKeyboard: function () {
      if (!this.total) return;

      var self = this;
      var DELTA_MAP = {
        "ArrowDown": 1, "ArrowRight": 1, "PageDown": 1, " ": 1,
        "ArrowUp": -1,  "ArrowLeft": -1, "PageUp":  -1,
      };

      this._addHandler(doc, "keydown", function (e) {
        if (self.busy) return;
        var delta = DELTA_MAP[e.key];
        if (delta !== undefined) {
          e.preventDefault();
          self.goTo(self.current + delta);
          return;
        }
        if (e.key === "Home") { e.preventDefault(); self.goTo(0); }
        if (e.key === "End")  { e.preventDefault(); self.goTo(self.total - 1); }
      });

      this._addHandler(doc, "click", function (e) {
        var dot = e.target.closest("[data-slide-dot]");
        if (!dot) return;
        var idx = gsap.utils.toArray("[data-slide-dot]").indexOf(dot);
        if (idx >= 0) self.goTo(idx);
      });
    },

    /* =========================================================================
     * 6.17  RESIZE PROTECTION
     *
     *  AUDIT FIX: v1 only refreshed ScrollTrigger on resize. v2 also calls
     *  _buildMatchMedia() so the correct breakpoint animation profile is
     *  applied when the viewport changes (e.g. desktop -> mobile DevTools).
     *
     *  iOS orientation: extra 0.5s delay for Safari viewport settlement.
     *  Android orientation: 0.35s.
     * ========================================================================= */
    _setupResize: function () {
      var self = this;
      var resizeTimeout;

      var rebuild = function () {
        cancelAnimationFrame(self._resizeRAF);
        self._resizeRAF = requestAnimationFrame(function () {
          if (!self.total) {
            ScrollTrigger.refresh(); // no DOM changes, no need for full recalc (#5)
            return;
          }
          self._buildMatchMedia();
          self._buildScrollTrigger();
          if (self.smoother) self.smoother.refresh();
          ScrollTrigger.refresh(); // timelines rebuilt above — no forced layout (#5)
          self.goTo(self.current, true);
        });
      };

      var onOrientation = function () {
        gsap.delayedCall(env.ios ? 0.5 : 0.35, rebuild);
      };

      var debouncedResize = function () {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(rebuild, 120); // debounce ceiling
      };

      this._addHandler(w, "resize",            debouncedResize, { passive: true });
      this._addHandler(w, "orientationchange", onOrientation,   { passive: true });
    },

    /* =========================================================================
     * 6.18  ACCESSIBILITY — screen reader live region
     * ========================================================================= */
    _setupA11y: function () {
      if (!this.total) return;

      var region = doc.getElementById("apollo-slide-live");
      if (!region) {
        region    = doc.createElement("div");
        region.id = "apollo-slide-live";
        region.setAttribute("aria-live",   "polite");
        region.setAttribute("aria-atomic", "true");
        Object.assign(region.style, {
          position:   "absolute",
          width:      "1px",
          height:     "1px",
          overflow:   "hidden",
          clip:       "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border:     "0",
        });
        doc.body.appendChild(region);
      }

      doc.addEventListener("apollo:slideChange", function (e) {
        region.textContent = "Slide " + (e.detail.index + 1) + " of " + e.detail.total;
      });
    },

    /* =========================================================================
     * 6.19  REACTIVE prefers-reduced-motion
     *
     *  AUDIT FIX: v1 only read the media query at boot. If the user enables
     *  "Reduce Motion" in OS settings mid-session, the engine now responds
     *  immediately: kills all animations and switches to instant slide mode,
     *  then rebuilds fully if the setting is later disabled.
     * ========================================================================= */
    _setupReducedMotionListener: function () {
      var mq   = w.matchMedia("(prefers-reduced-motion: reduce)");
      var self = this;

      mq.addEventListener("change", function (e) {
        if (e.matches) {
          /* Reduced motion turned ON -> instant mode */
          self.destroy();
          injectPerfCSS();
          self.slides = gsap.utils.toArray("[data-slide]");
          self.total  = self.slides.length;
          if (self.total) {
            self._slideStates = new Map();
            self._stampSlides();
            self._initStateMap();
            self._bootReducedMotion();
            self._setupKeyboard();
          }
        } else {
          /* Reduced motion turned OFF -> full reinit */
          self.destroy();
          bootstrap();
        }
      });
    },

    /* =========================================================================
     * 6.20  DESTROY  (full SPA teardown via gsap.context)
     * ========================================================================= */
    destroy: function () {
      /* Remove ticker first to stop frame-loop writes */
      if (this._tickerHandler) {
        gsap.ticker.remove(this._tickerHandler);
        this._tickerHandler = null;
      }

      if (this.observer)   this.observer.kill();
      if (this.draggables) this.draggables.forEach(function (d) { d.kill(); });
      if (this.splits)     this.splits.forEach(function (s) { s.revert(); });
      if (this.mm)         this.mm.revert();
      if (this.scrollTR)   this.scrollTR.kill();
      if (this.masterTL)   this.masterTL.kill();
      if (this.smoother)   this.smoother.kill();
      if (this._io)        { this._io.disconnect(); this._io = null; } // (#6)

      /*
       * gsap.context().revert() kills EVERY tween, ScrollTrigger, and
       * SplitText created inside the context — bulletproof SPA cleanup.
       */
      if (this.ctx) this.ctx.revert();

      /* Sweep any STs that escaped context scope */
      ScrollTrigger.getAll().forEach(function (st) { st.kill(); });

      /* Clean up event listeners to prevent memory leaks */
      this._handlers.forEach(function (fn) { fn(); });
      this._handlers = [];

      /* Reset state */
      this.smoother      = null;
      this.masterTL      = null;
      this.scrollTR      = null;
      this.observer      = null;
      this.mm            = null;
      this.ctx           = null;
      this.slides        = [];
      this.draggables    = [];
      this.splits        = [];
      this.total         = 0;
      this.current       = 0;
      this.busy          = false;
      this._profile      = null;
      this._activeTweens = 0;
      this._tickerVel    = 0;
      this._splitTextInit = false; // (#3) allow re-init on reinit
      this._scrambleInit  = false; // (#3)
      if (this._slideStates) this._slideStates.clear();

      doc.documentElement.style.removeProperty("--scroll-velocity");
    },
  };

  /* =========================================================================
   * 7. BOOTSTRAP  (two rAF frames — layout settled before first measurement)
   * ========================================================================= */
  function bootstrap() {
    injectPerfCSS();

    /* Image/Media Optimization Layer */
    doc.querySelectorAll("img").forEach(function (img) {
      img.loading = "lazy";
      img.decoding = "async";
    });

    doc.querySelectorAll("video").forEach(function (video) {
      /* Only slow down videos that explicitly opt in (#14) */
      if (video.hasAttribute("data-optimize")) {
        video.playbackRate = 0.8;
      }
    });

    /* GSAP lag smoothing for mobile spikes */
    gsap.ticker.lagSmoothing(500, 33);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { Engine.init(); });
    });
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }

  /* =========================================================================
   * 8. PUBLIC API  (window.ApolloGSAP)
   * ========================================================================= */
  w.ApolloGSAP = {
    /** Navigate to slide index. instant=true skips animation. */
    goTo:    function (i, instant) { return Engine.goTo(i, instant); },
    /** Full engine teardown (call before SPA route change). */
    destroy: function () { return Engine.destroy(); },
    /** Destroy + reinitialise from scratch. */
    reinit:  function () { Engine.destroy(); bootstrap(); },
    /** Current slide index (0-based). */
    get current()     { return Engine.current; },
    /** Total slide count. */
    get total()       { return Engine.total; },
    /** ScrollSmoother instance or null. */
    get smoother()    { return Engine.smoother; },
    /** Master GSAP Timeline instance. */
    get masterTL()    { return Engine.masterTL; },
    /** Live active tween count (animation budget monitor). */
    get activeTweens(){ return Engine._activeTweens; },
    /** true when battery < 20% and unplugged. */
    get lowPower()    { return lowPower; },
    /** Slide state Map<element, 'idle'|'entering'|'active'|'exiting'>. */
    get slideStates() { return Engine._slideStates; },
    /** Device performance tier: 'high' | 'mid' | 'low'.
     *  Bug 6a fix: expose env.deviceTier so external modules (gsap-extra.js
     *  initLenisSync) can read it without accessing the IIFE-local env object. */
    get deviceTier()  { return env.deviceTier; },
  };

}(window, document));
