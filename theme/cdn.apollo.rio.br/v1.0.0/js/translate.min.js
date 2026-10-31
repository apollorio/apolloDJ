/**
 *
 * TRANSLATE.JS v1.0.0 (i18n) Engine
 * Lightweight Language Detection & Translation Utility with UI Context Enhancements
 *
 * 
 * Optimized for 2026 best practices:
 * • Native Intl.PluralRules (no custom plural logic)
 * • Lazy dictionary loading via fetch
 * • Tone/cultural scoping ("formal", "young", "slang")
 * • Loanword preservation via regex patterns (with defaults for tech/English terms)
 * • requestIdleCallback for non-blocking operations
 * • Performance metrics (ApolloTrack integration)
 * • Zero FOUC (deferred initialization)
 * • <5KB gzipped target
 * • Added: Viewport/input detection & mirroring to body data-*
 * • Added: Scroll orchestration (observeScroll with IntersectionObserver for axis lock/gesture handling)
 * • WordPress/Apollo ecosystem integration: apollo:ready listener, ApolloTrack metrics, WP-friendly auto-init via data-translate-auto
 * 
 * @version 2.2.1
 * @license MIT
 * @updated 2026-01-22
 */

;((root, factory) => { 'use strict';
  // ES Module + UMD hybrid
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    root.Translate = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this, () => {
  'use strict';

  // 
  // ENVIRONMENT
  const doc = typeof document !== 'undefined' ? document : null;
  const docEl = doc?.documentElement;
  const win = typeof window !== 'undefined' ? window : {};
  const nav = typeof navigator !== 'undefined' ? navigator : {};

  const getBody = () => doc?.body;
  const hasIntlPlural = typeof Intl !== 'undefined' && Intl.PluralRules;
  const hasIdleCallback = 'requestIdleCallback' in win;
  const hasMutationObserver = typeof MutationObserver !== 'undefined';
  const hasIntersectionObserver = typeof IntersectionObserver !== 'undefined';
  const hasMatchMedia = 'matchMedia' in win;

  // Idle callback with fallback
  const rIC = hasIdleCallback 
    ? win.requestIdleCallback.bind(win) 
    : (fn) => setTimeout(fn, 1);

  // 
  // INTERNAL STATE (monomorphic objects for V8 optimization)
  /** @type {Map<string, Map<string, any>>} lang -> { key -> translation } */
  const _dicts = new Map();

  /** @type {Map<string, Promise<void>>} Pending dict fetches */
  const _pending = new Map();

  /** @type {Set<string>} Locked terms (lowercase) */
  const _locked = new Set();

  /** @type {Set<RegExp>} Locked patterns (for loanwords) */
  const _lockedPatterns = new Set();

  /** @type {Map<Element, MutationObserver>} Active observers */
  const _observers = new Map();

  /** @type {Set<Function>} Language change listeners */
  const _listeners = new Set();

  /** @type {Intl.PluralRules cache} */
  const _pluralCache = new Map();

  /** @type {Map<Element, IntersectionObserver>} Scroll observers */
  const _scrollObservers = new Map();

  let _lang = null;
  let _langManual = false;
  let _basePath = '/locales';
  let _defaultTone = 'default';
  let _metricsEnabled = false;
  let _metricsCallback = null;
  const _fallback = 'en';

  // Default loanword patterns (English tech terms for PT-BR/ES/FR etc.)
  const DEFAULT_LOANWORD_PATTERNS = [
    /\b(?:app|link|post|feed|like|share|story|selfie|login|logout|hashtag|follow|chat|dm|live|stream|upload|download|update|bug|fix|feature|api|sdk|ui|ux|web|mobile|appstore|playstore|iphone|android|google|whatsapp|instagram|facebook|twitter|x|online|offline|browser|server|client|code|debug|test|deploy|version|release|beta|alpha|pro|max|mini|plus|ultra)\b/gi
  ];

  // Apply defaults
  DEFAULT_LOANWORD_PATTERNS.forEach(p => _lockedPatterns.add(p));

  // UI Context state
  let _context = {
    viewport: { width: win.innerWidth || 0, height: win.innerHeight || 0, dpr: win.devicePixelRatio || 1 },
    input: { pointer: hasMatchMedia && win.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine' },
    scroll: { locked: false, axis: 'y' } // default vertical scroll
  };

  // 
  // DATA ATTRIBUTES
  const A = Object.freeze({
    TRANSLATE: 'data-translate',
    TRANSLATED: 'data-translated',
    ORIGINAL: 'data-original',
    LOCKED: 'data-locked',
    LANG: 'data-lang',
    VARS: 'data-vars',
    COUNT: 'data-count',
    TONE: 'data-tone',
    VIEWPORT_WIDTH: 'data-viewport-width',
    VIEWPORT_HEIGHT: 'data-viewport-height',
    DPR: 'data-dpr',
    POINTER: 'data-pointer',
    SCROLL_LOCK: 'data-scroll-lock',
    SCROLL_AXIS: 'data-scroll-axis'
  });

  // 
  // LANGUAGE DETECTION (no regex in hot path)
  /**
   * Normalize language code - optimized (no regex)
   * "en-US" -> "en", "pt-BR" -> "pt"
   */
  const normLang = (code) => {
    if (!code || typeof code !== 'string') return _fallback;
    const c = code.toLowerCase().trim();
    // Find separator position without regex
    const dash = c.indexOf('-');
    const under = c.indexOf('_');
    const sep = dash > -1 ? dash : under > -1 ? under : c.length;
    return c.slice(0, Math.min(sep, 2)) || _fallback;
  };

  /**
   * Detect language from environment
   */
  const detectLang = () => {
    if (_langManual && _lang) return _lang;
    try {
      const body = getBody();
      return normLang(
        body?.dataset?.lang ||
        docEl?.lang ||
        nav?.language ||
        _fallback
      );
    } catch {
      return _fallback;
    }
  };

  // 
  // UI CONTEXT DETECTION & MIRRORING
  /**
   * Detect and mirror UI context to body data-*
   */
  const detectContext = () => {
    const body = getBody();
    if (!body) return;

    // Viewport
    _context.viewport = {
      width: win.innerWidth,
      height: win.innerHeight,
      dpr: win.devicePixelRatio || 1
    };
    body.setAttribute(A.VIEWPORT_WIDTH, _context.viewport.width);
    body.setAttribute(A.VIEWPORT_HEIGHT, _context.viewport.height);
    body.setAttribute(A.DPR, _context.viewport.dpr);

    // Input (pointer: fine/coarse)
    _context.input.pointer = hasMatchMedia && win.matchMedia('(pointer: coarse)').matches ? 'coarse' : 'fine';
    body.setAttribute(A.POINTER, _context.input.pointer);

    // Scroll (initial unlocked)
    body.setAttribute(A.SCROLL_LOCK, 'false');
    body.setAttribute(A.SCROLL_AXIS, 'y');
  };

  /** Resize listener reference for cleanup */
  let _resizeHandler = null;

  /**
   * Listen for resize/orientation changes
   * @returns {Function} Cleanup function
   */
  const observeContext = () => {
    if (_resizeHandler) return () => {}; // Already observing
    
    _resizeHandler = debounce(detectContext, 200);
    win.addEventListener('resize', _resizeHandler);
    detectContext(); // initial
    
    return () => {
      if (_resizeHandler) {
        win.removeEventListener('resize', _resizeHandler);
        _resizeHandler = null;
      }
    };
  };

  // 
  // INTL PLURAL RULES (native, cached)
  /**
   * Get plural category using native Intl.PluralRules
   * Falls back to simple "one/other" if Intl unavailable
   */
  const getPlural = (count, lang) => {
    if (!hasIntlPlural) {
      return Math.abs(count) === 1 ? 'one' : 'other';
    }
    
    // Cache PluralRules instances
    if (!_pluralCache.has(lang)) {
      try {
        _pluralCache.set(lang, new Intl.PluralRules(lang));
      } catch {
        _pluralCache.set(lang, new Intl.PluralRules('en'));
      }
    }
    
    return _pluralCache.get(lang).select(count);
  };

  /**
   * Select plural form from object
   */
  const selectPlural = (forms, count, lang) => {
    if (typeof forms === 'string') return forms;
    if (!forms || typeof forms !== 'object') return '';
    
    const rule = getPlural(count, lang);
    return forms[rule] || forms.other || forms.one || Object.values(forms)[0] || '';
  };

  // 
  // INTERPOLATION (optimized, no regex in simple cases)
  /**
   * Interpolate {placeholders} in string
   * Optimized: skip regex if no { found
   */
  const interp = (str, vars) => {
    if (!vars || typeof vars !== 'object' || typeof str !== 'string' || str.indexOf('{') === -1) return str;
    
    // Use replace only when needed
    return str.replace(/\{(\w+)\}/g, (m, k) => 
      Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m
    );
  };

  // 
  // LOCKED TERMS
  const isLocked = (text) => {
    if (!text) return false;
    
    // Check exact terms
    if (_locked.size > 0) {
      const lower = text.toLowerCase();
      for (const term of _locked) {
        if (lower.indexOf(term) > -1) return true;
      }
    }
    
    // Check regex patterns (for loanwords)
    if (_lockedPatterns.size > 0) {
      for (const pattern of _lockedPatterns) {
        if (pattern.test(text)) return true;
      }
    }
    
    return false;
  };

  // 
  // LAZY DICTIONARY LOADING
  /**
   * Fetch dictionary from CDN/server
   * Caches in memory + localStorage
   */
  const fetchDict = async (lang, tone = _defaultTone) => {
    const key = `${lang}:${tone}`;
    
    // Already loaded
    if (_dicts.has(key)) return true;
    
    // Already fetching
    if (_pending.has(key)) {
      await _pending.get(key);
      return _dicts.has(key);
    }
    
    // Check localStorage cache
    const cacheKey = `translate:${key}`;
    try {
      const cached = win.localStorage?.getItem(cacheKey);
      if (cached) {
        const { data, ts } = JSON.parse(cached);
        // 24h TTL
        if (Date.now() - ts < 86400000) {
          _dicts.set(key, new Map(Object.entries(data)));
          return true;
        }
      }
    } catch {}
    
    // Fetch from server
    const promise = (async () => {
      try {
        const path = tone === 'default' 
          ? `${_basePath}/${lang}.json`
          : `${_basePath}/${lang}.${tone}.json`;
        
        const res = await fetch(path);
        if (!res.ok) throw new Error(res.status);
        
        const data = await res.json();
        _dicts.set(key, new Map(Object.entries(data)));
        
        // Cache to localStorage
        try {
          win.localStorage?.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() }));
        } catch {}
        
        return true;
      } catch (e) {
        warn(`Dict fetch failed: ${key}`, e);
        return false;
      } finally {
        _pending.delete(key);
      }
    })();
    
    _pending.set(key, promise);
    return promise;
  };

  // 
  // PERFORMANCE METRICS
  const metric = (name, data) => {
    if (!_metricsEnabled) return;
    
    try {
      // Custom callback first
      if (_metricsCallback) {
        _metricsCallback(name, data);
      } 
      // ApolloTrack integration (if available)
      else if (win.ApolloTrack?.event) {
        win.ApolloTrack.event(`translate:${name}`, data);
      }
      // Fallback to Performance API
      else if (win.performance?.mark) {
        win.performance.mark(`translate:${name}`, { detail: data });
      }
    } catch {}
  };

  // 
  // ERROR HANDLING
  // 

  const warn = (msg, e) => {
    if (typeof console !== 'undefined') {
      console.warn?.(`[translate] ${msg}`, e?.message || '');
    }
  };

  const safe = (fn, fallback) => {
    return function(...args) {
      try {
        return fn.apply(this, args);
      } catch (e) {
        warn('Error', e);
        return typeof fallback === 'function' ? fallback(...args) : fallback;
      }
    };
  };

  // 
  // DEBOUNCE (npm-free, optimized)
  // 

  const debounce = (fn, ms) => {
    let id;
    return (...args) => {
      clearTimeout(id);
      id = setTimeout(() => fn(...args), ms);
    };
  };

  // 
  // DOM TRANSLATION
  // 

  /**
   * Translate single element
   */
  const translateEl = (el, lang, tone) => {
    if (!el || el.dataset.translated === 'true') return false;
    
    const start = _metricsEnabled ? performance.now() : 0;
    
    const key = el.getAttribute(A.TRANSLATE);
    if (!key) return false;
    
    // Check locked
    const text = el.textContent || '';
    if (isLocked(text)) {
      el.setAttribute(A.LOCKED, 'true');
      return false;
    }
    
    // Get tone from element or default
    const elTone = el.getAttribute(A.TONE) || tone || _defaultTone;
    const dictKey = `${lang}:${elTone}`;
    
    // Try tone-specific, then default
    let dict = _dicts.get(dictKey);
    if (!dict && elTone !== 'default') {
      dict = _dicts.get(`${lang}:default`);
    }
    if (!dict) return false;
    
    let trans = dict.get(key);
    if (trans === undefined) return false;
    
    // Handle count/plural
    const countAttr = el.getAttribute(A.COUNT);
    if (countAttr !== null && typeof trans === 'object') {
      const count = parseInt(countAttr, 10);
      if (!isNaN(count)) {
        trans = selectPlural(trans, count, lang);
      }
    }
    
    // Resolve object/function
    if (typeof trans === 'object') {
      trans = trans.other ?? trans.one ?? String(trans);
    }
    if (typeof trans === 'function') {
      try { trans = trans(); } catch { return false; }
    }
    if (typeof trans !== 'string') return false;
    
    // Interpolate
    const varsAttr = el.getAttribute(A.VARS);
    if (varsAttr) {
      try {
        trans = interp(trans, JSON.parse(varsAttr));
      } catch {}
    }
    if (countAttr !== null) {
      trans = interp(trans, { count: countAttr });
    }
    
    // Skip if same
    if (trans === text) return false;
    
    // Store original
    if (!el.hasAttribute(A.ORIGINAL)) {
      el.setAttribute(A.ORIGINAL, text);
    }
    
    // Apply
    el.textContent = trans;
    el.setAttribute(A.TRANSLATED, 'true');
    
    // Accessibility
    if (el.hasAttribute('aria-label')) {
      el.setAttribute('aria-label', trans);
    }
    
    if (_metricsEnabled) {
      metric('element', { key, duration: performance.now() - start });
    }
    
    return true;
  };

  /**
   * Restore single element
   */
  const restoreEl = (el) => {
    if (!el || el.dataset.translated !== 'true') return false;
    
    const orig = el.getAttribute(A.ORIGINAL);
    if (orig === null) return false;
    
    el.textContent = orig;
    el.removeAttribute(A.TRANSLATED);
    el.removeAttribute(A.ORIGINAL);
    
    return true;
  };

  // 
  // SCROLL ORCHESTRATION
  // 

  /**
   * Observe scroll/sections with IntersectionObserver for axis lock/gesture handling
   * @param {Element} root - Container to observe
   * @param {Object} opts - { axis: 'x'|'y', lock: true|false, threshold: 0.1, onEnter: fn, onExit: fn }
   */
  const observeScroll = (root, opts = {}) => {
    const container = root || getBody();
    if (!container || !hasIntersectionObserver) return () => {};

    if (_scrollObservers.has(container)) return () => {};

    const { axis = 'y', lock = false, threshold = 0.1, onEnter, onExit } = opts;

    // Update global state
    _context.scroll.locked = lock;
    _context.scroll.axis = axis;
    const body = getBody();
    if (body) {
      body.setAttribute(A.SCROLL_LOCK, lock ? 'true' : 'false');
      body.setAttribute(A.SCROLL_AXIS, axis);
    }

    // Prevent default scroll if locked (e.g., for horizontal sections)
    const preventScroll = (e) => {
      if (_context.scroll.locked && axis === 'x') {
        if (e.deltaY !== 0) {
          e.preventDefault();
          container.scrollLeft += e.deltaY; // map vertical wheel to horizontal
        }
      }
    };
    if (lock) {
      win.addEventListener('wheel', preventScroll, { passive: false });
    }

    // Observe sections [data-section]
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (typeof onEnter === 'function') onEnter(entry.target);
        } else {
          if (typeof onExit === 'function') onExit(entry.target);
        }
      });
    }, { root: container, threshold });

    container.querySelectorAll('[data-section]').forEach(sec => observer.observe(sec));

    _scrollObservers.set(container, observer);

    return () => {
      observer.disconnect();
      _scrollObservers.delete(container);
      if (lock) win.removeEventListener('wheel', preventScroll);
    };
  };

  // 
  // PUBLIC API
  // 

  const API = {
    version: '2.2.1',

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIGURATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Configure translate.js
     * @param {Object} opts
     * @param {string} [opts.basePath] - Base path for dict fetching
     * @param {string} [opts.defaultTone] - Default tone ("default", "young", "formal")
     * @param {boolean} [opts.metrics] - Enable performance metrics
     * @param {Function} [opts.metricsCallback] - Custom metrics handler
     */
    config: safe(function(opts = {}) {
      if (opts.basePath) _basePath = opts.basePath;
      if (opts.defaultTone) _defaultTone = opts.defaultTone;
      if (opts.metrics !== undefined) _metricsEnabled = opts.metrics;
      if (opts.metricsCallback) _metricsCallback = opts.metricsCallback;
      return this;
    }, function() { return this; }),

    // ─────────────────────────────────────────────────────────────────────────
    // LANGUAGE
    // ─────────────────────────────────────────────────────────────────────────

    get lang() {
      if (!_lang) _lang = detectLang();
      return _lang;
    },

    set lang(code) {
      const norm = normLang(code);
      const old = _lang;
      _lang = norm;
      _langManual = true;
      
      const body = getBody();
      if (body) body.dataset.lang = norm;
      
      if (old !== norm) {
        _listeners.forEach(fn => { try { fn(norm, old); } catch {} });
      }
    },

    detect: safe(() => detectLang(), _fallback),

    /**
     * Frozen context snapshot (read-only state)
     */
    get context() {
      return Object.freeze({
        lang: API.lang,
        languages: API.languages,
        locked: API.locked,
        tones: Array.from(new Set(
          Array.from(_dicts.keys()).map(k => k.split(':')[1] || 'default')
        )),
        basePath: _basePath,
        defaultTone: _defaultTone,
        metricsEnabled: _metricsEnabled,
        viewport: { ..._context.viewport },
        input: { ..._context.input },
        scroll: { ..._context.scroll }
      });
    },

    get languages() {
      const langs = new Set();
      for (const key of _dicts.keys()) {
        langs.add(key.split(':')[0]);
      }
      return Array.from(langs);
    },

    supports: safe((lang) => {
      const norm = normLang(lang);
      for (const key of _dicts.keys()) {
        if (key.startsWith(norm + ':')) return true;
      }
      return false;
    }, false),

    onLangChange: safe((fn) => {
      if (typeof fn !== 'function') return () => {};
      _listeners.add(fn);
      return () => _listeners.delete(fn);
    }, () => () => {}),

    // ─────────────────────────────────────────────────────────────────────────
    // DICTIONARY MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Register translations synchronously
     */
    register: safe(function(lang, translations, tone = 'default') {
      const key = `${normLang(lang)}:${tone}`;
      
      if (!_dicts.has(key)) {
        _dicts.set(key, new Map());
      }
      
      const dict = _dicts.get(key);
      Object.entries(translations).forEach(([k, v]) => dict.set(k, v));
      
      return this;
    }, function() { return this; }),

    /**
     * Register multiple languages
     */
    registerAll: safe(function(map, tone = 'default') {
      Object.entries(map).forEach(([lang, trans]) => this.register(lang, trans, tone));
      return this;
    }, function() { return this; }),

    /**
     * Load dictionary from server (async)
     */
    load: safe(async (lang, tone = 'default') => {
      return fetchDict(normLang(lang), tone);
    }, async () => false),

    /**
     * Preload multiple languages
     */
    preload: safe(async (langs, tone = 'default') => {
      const arr = Array.isArray(langs) ? langs : [langs];
      await Promise.all(arr.map(l => fetchDict(normLang(l), tone)));
    }, async () => {}),

    clear: safe((lang, tone) => {
      if (tone) {
        return _dicts.delete(`${normLang(lang)}:${tone}`);
      }
      // Clear all tones for lang
      let cleared = false;
      for (const key of _dicts.keys()) {
        if (key.startsWith(normLang(lang) + ':')) {
          _dicts.delete(key);
          cleared = true;
        }
      }
      return cleared;
    }, false),

    clearAll: safe(function() {
      _dicts.clear();
      return this;
    }, function() { return this; }),

    reloadDict: safe(async (lang, tone = _defaultTone) => {
      API.clear(lang, tone);
      return API.load(lang, tone);
    }, async () => false),

    // ─────────────────────────────────────────────────────────────────────────
    // LOCKED TERMS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Lock terms or patterns from translation
     * @param {...(string|RegExp)} terms - Terms or regex patterns
     * @example
     * Translate.lock('iPhone', 'Google'); // Exact terms
     * Translate.lock(/\b(app|link|online)\b/i); // Loanwords regex
     */
    lock: safe(function(...terms) {
      terms.forEach(t => {
        if (t instanceof RegExp) {
          _lockedPatterns.add(t);
        } else if (typeof t === 'string' && t.trim()) {
          _locked.add(t.toLowerCase().trim());
        }
      });
      return this;
    }, function() { return this; }),

    unlock: safe((term) => {
      if (term instanceof RegExp) {
        _lockedPatterns.delete(term);
        return true;
      }
      return _locked.delete(term.toLowerCase().trim());
    }, false),

    /**
     * Clear all locked patterns (regex)
     */
    unlockPatterns: safe(function() {
      _lockedPatterns.clear();
      return this;
    }, function() { return this; }),

    disableAutoLoanwords: safe(function() {
      DEFAULT_LOANWORD_PATTERNS.forEach(p => _lockedPatterns.delete(p));
      return this;
    }, function() { return this; }),

    get locked() { return Array.from(_locked); },

    get lockedPatterns() { return Array.from(_lockedPatterns); },

    isLocked: safe(isLocked, false),

    // ─────────────────────────────────────────────────────────────────────────
    // TRANSLATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Get translation
     * @param {string} key
     * @param {Object} [opts] - { lang, tone, vars, count, fallback }
     */
    get: safe((key, opts = {}) => {
      const lang = opts.lang ? normLang(opts.lang) : API.lang;
      const tone = opts.tone || _defaultTone;
      const dictKey = `${lang}:${tone}`;
      
      let dict = _dicts.get(dictKey);
      if (!dict && tone !== 'default') {
        dict = _dicts.get(`${lang}:default`);
      }
      
      if (!dict) return opts.fallback ?? key;
      
      let trans = dict.get(key);
      if (trans === undefined) return opts.fallback ?? key;
      
      // Plural
      if (typeof opts.count === 'number' && typeof trans === 'object') {
        trans = selectPlural(trans, opts.count, lang);
      }
      
      // Resolve
      if (typeof trans === 'function') trans = trans(opts);
      if (typeof trans === 'object') trans = trans.other ?? trans.one ?? String(trans);
      
      trans = String(trans);
      
      // Interpolate
      if (opts.vars) trans = interp(trans, opts.vars);
      if (typeof opts.count === 'number') trans = interp(trans, { count: opts.count });
      
      return trans;
    }, (key) => key),

    /**
     * Get with async loading fallback
     */
    getAsync: safe(async (key, opts = {}) => {
      const lang = opts.lang ? normLang(opts.lang) : API.lang;
      const tone = opts.tone || _defaultTone;
      
      // Try load if not present
      if (!_dicts.has(`${lang}:${tone}`)) {
        await fetchDict(lang, tone);
      }
      
      return API.get(key, opts);
    }, async (key) => key),

    has: safe((key, lang, tone) => {
      const l = lang ? normLang(lang) : API.lang;
      const t = tone || _defaultTone;
      const dict = _dicts.get(`${l}:${t}`);
      return dict ? dict.has(key) : false;
    }, false),

    // ─────────────────────────────────────────────────────────────────────────
    // DOM
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Apply translations to DOM
     */
    apply: safe((root, lang, tone) => {
      const container = root || getBody();
      if (!container) return 0;
      
      const start = _metricsEnabled ? performance.now() : 0;
      
      const targetLang = lang ? normLang(lang) : API.lang;
      const contextLang = container.closest?.(`[${A.LANG}]`)?.getAttribute(A.LANG);
      const finalLang = contextLang ? normLang(contextLang) : targetLang;
      
      const els = container.querySelectorAll(`[${A.TRANSLATE}]:not([${A.TRANSLATED}="true"])`);
      let count = 0;
      
      els.forEach(el => {
        if (translateEl(el, finalLang, tone)) count++;
      });
      
      if (_metricsEnabled) {
        metric('apply', { count, duration: performance.now() - start });
      }
      
      return count;
    }, 0),

    /**
     * Apply with async dict loading
     */
    applyAsync: safe(async (root, lang, tone) => {
      const targetLang = lang ? normLang(lang) : API.lang;
      await fetchDict(targetLang, tone || _defaultTone);
      return API.apply(root, lang, tone);
    }, async () => 0),

    restore: safe((root) => {
      const container = root || getBody();
      if (!container) return 0;
      
      const els = container.querySelectorAll(`[${A.TRANSLATED}="true"]`);
      let count = 0;
      
      els.forEach(el => { if (restoreEl(el)) count++; });
      
      return count;
    }, 0),

    retranslate: safe((root, lang, tone) => {
      API.restore(root);
      return API.apply(root, lang, tone);
    }, 0),

    // ─────────────────────────────────────────────────────────────────────────
    // OBSERVATION
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Observe DOM for new translatable elements
     * Uses requestIdleCallback for non-blocking translations
     */
    observe: safe((root, opts = {}) => {
      const container = root || getBody();
      if (!container || !hasMutationObserver) return () => {};
      
      if (_observers.has(container)) {
        return () => {
          _observers.get(container)?.disconnect();
          _observers.delete(container);
        };
      }
      
      const { immediate = true, lang, tone } = opts;
      
      if (immediate) {
        API.apply(container, lang, tone);
      }
      
      // Debounced apply using idle callback
      const debouncedApply = debounce(() => {
        rIC(() => API.apply(container, lang || API.lang, tone));
      }, 100);
      
      const observer = new MutationObserver((mutations) => {
        let shouldTranslate = false;
        
        for (const m of mutations) {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1) {
              if (n.hasAttribute?.(A.TRANSLATE) || n.querySelector?.(`[${A.TRANSLATE}]`)) {
                shouldTranslate = true;
                break;
              }
            }
          }
          if (shouldTranslate) break;
        }
        
        if (shouldTranslate) debouncedApply();
      });
      
      observer.observe(container, { childList: true, subtree: true });
      _observers.set(container, observer);
      
      return () => {
        observer.disconnect();
        _observers.delete(container);
      };
    }, () => () => {}),

    unobserve: safe((root) => {
      const container = root || getBody();
      if (!container) return false;
      
      const obs = _observers.get(container);
      if (!obs) return false;
      
      obs.disconnect();
      _observers.delete(container);
      return true;
    }, false),

    unobserveAll: safe(() => {
      const count = _observers.size;
      _observers.forEach(o => o.disconnect());
      _observers.clear();
      return count;
    }, 0),

    // ─────────────────────────────────────────────────────────────────────────
    // SCROLL & CONTEXT
    // ─────────────────────────────────────────────────────────────────────────

    observeScroll: safe(observeScroll, () => () => {}),

    unobserveScroll: safe((root) => {
      const container = root || getBody();
      if (!container) return false;
      
      const obs = _scrollObservers.get(container);
      if (!obs) return false;
      
      obs.disconnect();
      _scrollObservers.delete(container);
      return true;
    }, false),

    detectContext: safe(detectContext, () => {}),

    /**
     * Start observing viewport/input changes
     * @returns {Function} Cleanup function
     */
    observeContext: safe(observeContext, () => () => {}),

    /**
     * Stop observing context changes
     */
    stopObserveContext: safe(() => {
      if (_resizeHandler) {
        win.removeEventListener('resize', _resizeHandler);
        _resizeHandler = null;
        return true;
      }
      return false;
    }, false),

    // ─────────────────────────────────────────────────────────────────────────
    // UTILITIES
    // ─────────────────────────────────────────────────────────────────────────

    interp: safe(interp, (s) => s),

    plural: safe((forms, count, lang) => selectPlural(forms, count, lang || API.lang), ''),

    /**
     * Scoped translator with tone
     */
    scope: safe((namespace, tone) => {
      const prefix = namespace.endsWith('.') ? namespace : `${namespace}.`;
      const t = tone || _defaultTone;
      
      return Object.freeze({
        get: (key, opts = {}) => API.get(`${prefix}${key}`, { ...opts, tone: t }),
        has: (key, lang) => API.has(`${prefix}${key}`, lang, t),
        tone: t
      });
    }, { get: (k) => k, has: () => false, tone: 'default' }),

    /**
     * Create tone-specific translator
     */
    tone: safe((toneName) => {
      return Object.freeze({
        get: (key, opts = {}) => API.get(key, { ...opts, tone: toneName }),
        has: (key, lang) => API.has(key, lang, toneName),
        apply: (root, lang) => API.apply(root, lang, toneName),
        scope: (ns) => API.scope(ns, toneName)
      });
    }, { get: (k) => k, has: () => false, apply: () => 0, scope: () => ({}) }),

    export: safe(() => {
      const result = {};
      _dicts.forEach((dict, key) => {
        result[key] = Object.fromEntries(dict);
      });
      return result;
    }, {}),

    import: safe(function(data) {
      Object.entries(data).forEach(([key, trans]) => {
        const [lang, tone = 'default'] = key.split(':');
        this.register(lang, trans, tone);
      });
      return this;
    }, function() { return this; }),

    /** Data attributes reference */
    ATTR: A
  };

  // 
  // INITIALIZATION (FOUC prevention)
  // 

  // Auto-init on DOMContentLoaded if body has data-translate-auto AND Apollo not present
  // (If Apollo exists, the inject script below handles init via apollo:ready)
  if (doc) {
    const init = () => {
      const body = getBody();
      // Only auto-init if Apollo CDN is NOT present (inject script handles that case)
      if (body?.dataset?.translateAuto !== undefined && !win.Apollo) {
        rIC(() => {
          API.observe();
          API.detectContext();
          observeContext();
        });
      }
    };
    
    if (doc.readyState === 'loading') {
      doc.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
      init();
    }
    
    // Apollo integration: when apollo:ready fires, apply translations
    win.addEventListener?.('apollo:ready', () => {
      rIC(() => {
        API.apply();
        if (!_resizeHandler) {
          API.detectContext();
          observeContext();
        }
      });
    }, { once: true });
  }

  return Object.freeze(API);
});

// ──────────────────────────────────────────────────────────────────────────────
// AUTO-INJECT TRANSLATE CONFIG BEFORE </body> — runs after apollo:ready (Apollo.ready shim in core.js)
// ──────────────────────────────────────────────────────────────────────────────
(function injectTranslateConfig() {
    function insertConfig() {
        if (typeof Translate === 'undefined' || typeof Apollo === 'undefined') {
            // Not ready yet — retry in next idle/microtask
            setTimeout(insertConfig, 50);
            return;
        }
        
        // Skip if already initialized (check if observe is running)
        if (Translate._initialized) return;

        const script = document.createElement('script');
        script.textContent = `
            (function() {
                function bootTranslate() {
                    if (Translate._initialized) return;
                    Translate._initialized = true;
                    Translate.config({
                        defaultTone: 'young',
                        metrics: true
                    });
                    Translate.lock(
                        'Apollo', 'Rio', 'VLoikhi', '@fcknvll',
                        /\\b(app|feed|story|reel|live|post|chat|dm|online|link|selfie)\\b/gi
                    );
                    Translate.detectContext();
                    Translate.observeContext();
                    Translate.observe();
                }
                if (window.Apollo && window.Apollo.isReady) {
                    bootTranslate();
                } else {
                    window.addEventListener('apollo:ready', bootTranslate, { once: true });
                }
            })();
        `;

        // Find body and insert just before </body>
        const body = document.body || document.documentElement;
        if (body.lastChild && body.lastChild.nodeName === 'SCRIPT') {
            // If last child is already a script, insert before it to stay clean
            body.insertBefore(script, body.lastChild);
        } else {
            body.appendChild(script);
        }
    }

    // Start trying after DOM is usable
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', insertConfig, { once: true });
    } else {
        if (window.requestIdleCallback) {
            window.requestIdleCallback(insertConfig, { timeout: 1 });
        } else {
            setTimeout(insertConfig, 1);
        }
    }
})();