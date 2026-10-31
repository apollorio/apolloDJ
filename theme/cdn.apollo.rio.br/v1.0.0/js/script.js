/**
 * Apollo Theme Script v1.0.0
 * cdn.apollo.rio.br/v1.0.0/js/script.v1.0.0.js
 *
 * Modules:
 *  1.  Dark Mode
 *  2.  Clock Widget
 *  3.  Toggle System
 *  4.  Button Ripple
 *  5.  Select AS1  Form Inline
 *  6.  Select AS2  Palette Writable
 *  7.  Select AS3  Glass Panel
 *  8.  Dropdown Menus (data-dropdown)
 *  9.  FAB Menu
 *  10. Menu Sheet
 *  11. Toast Notification System
 *  12. Range Slider --val Sync
 *  13. EQ Value Tags
 *  14. Date/Time Picker Float
 *  15. Play/Pause Events
 *  16. GSAP Scroll Reveals
 *  17. Icon System Prep
 *
 * Dependencies: Popper.js v2 (optional)
 * Avoids: tooltip logic (handled by data-tooltip.v1.0.0.js)
 */
;(function(w, d) {
  'use strict';

  /* 
     SHARED HELPERS
      */
  var html = d.documentElement;
  var _clockInterval = null;
  var _scrollRevealsInited = false;

  function onOutside(root, closeFn, signal) {
    d.addEventListener('click', function(e) {
      if (!root.contains(e.target)) closeFn();
    }, signal ? { signal: signal } : undefined);
  }

  function navList(e, items, selectFn) {
    var vis = items.filter(function(o) { return !o.hidden; });
    if (!vis.length) return;
    var fi = vis.findIndex(function(o) { return o.classList.contains('is-focused'); });
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      var ni = fi < vis.length - 1 ? fi + 1 : 0;
      vis.forEach(function(o) { o.classList.remove('is-focused'); });        
      vis[ni].classList.add('is-focused');
      vis[ni].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      var pi = fi > 0 ? fi - 1 : vis.length - 1;
      vis.forEach(function(o) { o.classList.remove('is-focused'); });        
      vis[pi].classList.add('is-focused');
      vis[pi].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (vis[fi]) selectFn(vis[fi]);
    }
  }

  function fire(el, name, detail) {
    el.dispatchEvent(new CustomEvent(name, { bubbles: true, detail: detail ||
 {} }));
  }


  /*         
     1. DARK MODE
      */
  var DM_KEY = 'apollo-dark-mode';

  function applyDarkMode(on, persist) {
    html.classList.toggle('dark-mode', on);
    d.querySelectorAll('.dm-toggle .toggle-input, [data-dm-toggle]').forEach(function(el) {
      el.checked = on;
    });
    if (persist !== false) {
      try { localStorage.setItem(DM_KEY, on ? '1' : '0'); } catch (_) {}     
    }
    fire(html, 'apollo:dark-mode', { dark: on });
  }

  (function() {
    var saved = null;
    try { saved = localStorage.getItem(DM_KEY); } catch (_) {}
    if (saved === null) {
      saved = w.matchMedia('(prefers-color-scheme: dark)').matches ? '1' : '0';
    }
    applyDarkMode(saved === '1', false);
  })();

  w.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
    var stored = null;
    try { stored = localStorage.getItem(DM_KEY); } catch (_) {}
    if (stored === null) applyDarkMode(e.matches, false);
  });

  d.addEventListener('change', function(e) {
    var t = e.target;
    if (t.matches('.dm-toggle .toggle-input, [data-dm-toggle]')) {
      applyDarkMode(t.checked);
    }
  });

  w.ApolloTheme = w.ApolloTheme || {};
  w.ApolloTheme.darkMode = applyDarkMode;


  /*         
     2. CLOCK WIDGET
     
     Usage: <span class="apollo-clock" data-format="HH:mm:ss"></span>        
     Formats: HH:mm  |  HH:mm:ss  |  hh:mm a  |  hh:mm:ss a
  */
  function initClocks() {
    var clocks = d.querySelectorAll('.apollo-clock');
    if (!clocks.length) return;

    // ARIA: mark clocks as timers for screen readers
    clocks.forEach(function(el) {
      if (!el.getAttribute('role')) el.setAttribute('role', 'timer');
      if (!el.getAttribute('aria-live')) el.setAttribute('aria-live', 'off');
    });

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function tick() {
      // Refresh live NodeList — remove dangling refs for GC
      var live = d.querySelectorAll('.apollo-clock');
      if (!live.length) { clearInterval(_clockInterval); _clockInterval = null; return; }
      var now = new Date();
      live.forEach(function(el) {
        var fmt = (el.dataset.format || 'HH:mm').trim();
        var h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();  
        var out;
        if (fmt.indexOf('hh') === 0) {
          var ampm = h >= 12 ? 'PM' : 'AM';
          var h12 = h % 12 || 12;
          out = pad(h12) + ':' + pad(m);
          if (fmt.indexOf('ss') !== -1) out += ':' + pad(s);
          out += '\u2009' + ampm;
        } else {
          out = pad(h) + ':' + pad(m);
          if (fmt.indexOf('ss') !== -1) out += ':' + pad(s);
        }
        if (el.textContent !== out) el.textContent = out;
      });
    }

    tick();
    if (_clockInterval) clearInterval(_clockInterval);
    _clockInterval = setInterval(tick, 1000);
  }


  /*         
     3. TOGGLE SYSTEM
      */     
  // V1  CSS class toggle (.toggle-track click driven)
  d.addEventListener('click', function(e) {
    var track = e.target.closest('.toggle-track');
    if (!track) return;
    if (track.previousElementSibling && track.previousElementSibling.classList.contains('toggle-input')) return;
    track.classList.toggle('active');
    fire(track, 'apollo:toggle', { active: track.classList.contains('active')
 });
  });

  // V2  checkbox .toggle-input driven
  d.addEventListener('change', function(e) {
    var inp = e.target;
    if (!inp.classList.contains('toggle-input')) return;
    if (inp.closest('.dm-toggle') || inp.hasAttribute('data-dm-toggle')) return;
    fire(inp, 'apollo:toggle', { id: inp.id, checked: inp.checked });        
  });


  /*         
     4. BUTTON RIPPLE
      */     
  d.addEventListener('click', function(e) {
    var btn = e.target.closest('.btn');
    if (!btn) return;
    var r = d.createElement('span');
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    r.className = 'ripple';
    r.style.cssText = 'width:' + size + 'px;height:' + size + 'px;left:' +   
      (e.clientX - rect.left - size / 2) + 'px;top:' + (e.clientY - rect.top 
- size / 2) + 'px';
    btn.appendChild(r);
    r.addEventListener('animationend', function() { r.remove(); });
    // Fallback: remove ripple if animation is interrupted (e.g. display:none)
    setTimeout(function() { if (r.parentNode) r.remove(); }, 600);
  });


  /*         
     5. SELECT TYPE 1  FORM INLINE (AS1)
      */     
  function initAS1(root) {
    if (root._apolloAS1) return;
    root._apolloAS1 = true;
    var trigger = root.querySelector('.as1-trigger');
    var opts = root.querySelectorAll('.as1-opt');
    var valIcon = trigger ? trigger.querySelector('.as1-val-icon') : null;   
    var valText = trigger ? trigger.querySelector('.as1-val-text') : null;   
    if (!trigger) return;

    function open() {
      d.querySelectorAll('.as1.is-open').forEach(function(el) { if (el !== root) el.classList.remove('is-open'); });
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    function close() {
      root.classList.remove('is-open');
      opts.forEach(function(o) { o.classList.remove('is-focused'); });
      trigger.setAttribute('aria-expanded', 'false');
    }
    function toggle() { root.classList.contains('is-open') ? close() : open()
; }

    function select(opt) {
      opts.forEach(function(o) { o.classList.remove('is-selected'); });      
      opt.classList.add('is-selected');
      trigger.classList.remove('is-placeholder');
      root.classList.add('has-value');
      if (valText) valText.textContent = opt.dataset.name;
      if (valIcon) {
        valIcon.style.background = opt.dataset.iconBg || '';
        var iconEl = opt.querySelector('.as1-opt-icon');
        if (iconEl) valIcon.innerHTML = iconEl.innerHTML;
      }
      close();
      trigger.focus();
      fire(root, 'apollo:select', { type: 'as1', value: opt.dataset.value, name: opt.dataset.name });
    }

    trigger.addEventListener('click', toggle);
    trigger.addEventListener('keydown', function(e) {
      if (['ArrowDown', 'Enter', ' '].indexOf(e.key) !== -1) { e.preventDefault(); open(); }
      if (e.key === 'Escape') close();
    });
    opts.forEach(function(opt) {
      opt.addEventListener('click', function(e) { e.stopPropagation(); select
(opt); });
      opt.addEventListener('mouseenter', function() {
        opts.forEach(function(o) { o.classList.remove('is-focused'); });     
        opt.classList.add('is-focused');
      });
    });
    var _as1AC = new AbortController();
    root._apolloAS1AC = _as1AC;
    onOutside(root, function() { close(); trigger.focus(); }, _as1AC.signal);
  }


  /* 
     6. SELECT TYPE 2 PALETTE WRITABLE (AS2)
      */     
  function initAS2(root) {
    if (root._apolloAS2) return;
    root._apolloAS2 = true;
    var input = root.querySelector('.as2-input');
    var opts = root.querySelectorAll('.as2-opt');
    var empty = root.querySelector('.as2-empty');
    var swatch = root.querySelector('.as2-swatch');
    if (!input) return;

    function open() { root.classList.add('is-open'); if (input) input.setAttribute('aria-expanded', 'true'); }
    function close() {
      root.classList.remove('is-open');
      opts.forEach(function(o) { o.classList.remove('is-focused'); });
      if (input) input.setAttribute('aria-expanded', 'false');
    }

    function filter() {
      var q = input.value.toLowerCase().trim();
      var visible = 0;
      opts.forEach(function(opt) {
        var text = ((opt.dataset.name || '') + ' ' + (opt.dataset.desc || '')
).toLowerCase();
        var show = !q || text.indexOf(q) !== -1;
        opt.hidden = !show;
        if (show) visible++;
      });
      if (empty) empty.classList.toggle('is-visible', visible === 0);        
    }

    function select(opt) {
      opts.forEach(function(o) { o.classList.remove('is-selected'); });      
      opt.classList.add('is-selected');
      input.value = opt.dataset.name || '';
      root.classList.add('has-value');
      if (swatch) swatch.style.background = opt.dataset.value || '';
      close();
      fire(root, 'apollo:select', { type: 'as2', value: opt.dataset.value, name: opt.dataset.name });
    }

    input.addEventListener('focus', open);
    input.addEventListener('input', function() { open(); filter(); });       
    opts.forEach(function(opt) {
      opt.addEventListener('click', function(e) { e.stopPropagation(); select
(opt); });
      opt.addEventListener('mouseenter', function() {
        opts.forEach(function(o) { o.classList.remove('is-focused'); });     
        opt.classList.add('is-focused');
      });
    });
    input.addEventListener('keydown', function(e) {
      navList(e, Array.from(opts), select);
      if (e.key === 'Escape') { close(); input.blur(); }
    });
    var _as2AC = new AbortController();
    root._apolloAS2AC = _as2AC;
    onOutside(root, close, _as2AC.signal);
  }


  /*         
     7. SELECT TYPE 3  GLASS PANEL (AS3)
      */     
  function initAS3(root) {
    if (root._apolloAS3) return;
    root._apolloAS3 = true;
    var trigger = root.querySelector('.as3-trigger');
    var search = root.querySelector('.as3-search');
    var opts = root.querySelectorAll('.as3-opt');
    var empty = root.querySelector('.as3-empty');
    var swatchEl = root.querySelector('.as3-swatch');
    var labelEl = root.querySelector('.as3-label');
    if (!trigger) return;

    function open() {
      root.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      if (search) {
        search.value = '';
        filter();
        requestAnimationFrame(function() { search.focus(); });
      }
    }
    function close() {
      root.classList.remove('is-open');
      opts.forEach(function(o) { o.classList.remove('is-focused'); });
      trigger.setAttribute('aria-expanded', 'false');
    }
    function toggle() { root.classList.contains('is-open') ? close() : open()
; }

    function filter() {
      if (!search) return;
      var q = search.value.toLowerCase().trim();
      var visible = 0;
      opts.forEach(function(opt) {
        var text = ((opt.dataset.name || '') + ' ' + (opt.dataset.desc || '')
).toLowerCase();
        var show = !q || text.indexOf(q) !== -1;
        opt.hidden = !show;
        if (show) visible++;
      });
      if (empty) empty.classList.toggle('is-visible', visible === 0);        
      opts.forEach(function(o) { o.classList.remove('is-focused'); });       
    }

    function select(opt) {
      opts.forEach(function(o) { o.classList.remove('is-selected'); });      
      opt.classList.add('is-selected');
      trigger.classList.remove('is-placeholder');
      var name = opt.dataset.name || '';
      var desc = opt.dataset.desc || '';
      if (labelEl) {
        var _nameEl = d.createElement('span');
        _nameEl.className = 'as3-lbl-name';
        _nameEl.textContent = name;
        if (labelEl.replaceChildren) {
          labelEl.replaceChildren(_nameEl);
        } else {
          labelEl.innerHTML = '';
          labelEl.appendChild(_nameEl);
        }
        if (desc) {
          var _descEl = d.createElement('span');
          _descEl.className = 'as3-lbl-desc';
          _descEl.textContent = desc;
          labelEl.appendChild(_descEl);
        }
      }
      var optSw = opt.querySelector('.as3-opt-sw');
      if (swatchEl && optSw) swatchEl.style.background = optSw.style.background;
      close();
      trigger.focus();
      fire(root, 'apollo:select', { type: 'as3', value: opt.dataset.value, name: name });
    }

    trigger.addEventListener('click', toggle);
    trigger.addEventListener('keydown', function(e) {
      if (['ArrowDown', 'Enter', ' '].indexOf(e.key) !== -1) { e.preventDefault(); open(); }
      if (e.key === 'Escape') close();
    });
    if (search) {
      search.addEventListener('input', filter);
      search.addEventListener('keydown', function(e) {
        navList(e, Array.from(opts), select);
        if (e.key === 'Escape') { close(); trigger.focus(); }
      });
    }
    opts.forEach(function(opt) {
      opt.addEventListener('click', function() { select(opt); });
      opt.addEventListener('mouseenter', function() {
        opts.forEach(function(o) { o.classList.remove('is-focused'); });     
        opt.classList.add('is-focused');
      });
    });
    var _as3AC = new AbortController();
    root._apolloAS3AC = _as3AC;
    onOutside(root, function() { close(); trigger.focus(); }, _as3AC.signal);
  }


  /*         
     8. DROPDOWN MENUS (data-dropdown)
     Popper.js v2 if available, CSS fallback otherwise.
     NOTE: Tooltip logic handled by data-tooltip.v1.0.0.js  not here.
             
     Usage:
       <button data-dropdown="panel-id" aria-haspopup="true">Open</button>   
       <div class="nh-dropdown" id="panel-id" role="menu">...</div>
  */
  function initDropdown(trigger) {
    if (trigger._apolloDropdown) return;
    trigger._apolloDropdown = true;
    var _ddAC = new AbortController();
    trigger._apolloDropdownAC = _ddAC;
    var panelId = trigger.dataset.dropdown || trigger.getAttribute('aria-controls');
    var panel = panelId ? d.getElementById(panelId) : null;
    if (!panel) return;
    var popperInst = null;
    var isOpen = false;

    function openDrop() {
      d.querySelectorAll('.nh-dropdown.is-open').forEach(function(el) {      
        if (el !== panel) {
          el.classList.remove('is-open');
          var btn = d.querySelector('[aria-controls="' + el.id + '"]');      
          if (btn) btn.setAttribute('aria-expanded', 'false');
        }
      });
      isOpen = true;
      trigger.setAttribute('aria-expanded', 'true');
      panel.classList.add('is-open');
      if (w.Popper && !popperInst) {
        popperInst = Popper.createPopper(trigger, panel, {
          placement: 'bottom-start',
          modifiers: [{ name: 'offset', options: { offset: [0, 6] } },       
                      { name: 'preventOverflow', options: { padding: 8 } }]  
        });
      }
      if (popperInst) popperInst.update();
      if (w.gsap) {
        gsap.fromTo(panel,
          { opacity: 0, y: -8, scale: 0.97 },
          { opacity: 1, y: 0, scale: 1, duration: 0.26, ease: 'power2.out', overwrite: true }
        );
      }
    }

    function closeDrop() {
      isOpen = false;
      trigger.setAttribute('aria-expanded', 'false');
      if (w.gsap) {
        gsap.to(panel, { opacity: 0, y: -8, scale: 0.97, duration: 0.2, ease:
 'power1.in', overwrite: true,
          onComplete: function() { panel.classList.remove('is-open'); }      
        });
      } else {
        panel.classList.remove('is-open');
      }
    }

    trigger.addEventListener('click', function(e) { e.stopPropagation(); isOpen ? closeDrop() : openDrop(); });
    trigger.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); isOpen ? closeDrop() : openDrop(); }
      if (e.key === 'Escape') { closeDrop(); trigger.focus(); }
    });
    d.addEventListener('click', function(e) {
      if (isOpen && !panel.contains(e.target) && e.target !== trigger) closeDrop();
    }, { signal: _ddAC.signal });
  }


  /*         
     9. FAB MENU
      */     
  function initFab(fab) {
    if (fab._apolloFab) return;
    fab._apolloFab = true;
    var _fabAC = new AbortController();
    fab._apolloFabAC = _fabAC;
    var sheetId = fab.getAttribute('aria-controls');
    var sheet = sheetId ? d.getElementById(sheetId) : fab.parentElement.query
Selector('.nh-menu-sheet');
    var icon = fab.querySelector('i, svg');
    if (!sheet) return;
    var isOpen = false;

    function toggle() {
      isOpen = !isOpen;
      fab.setAttribute('aria-expanded', String(isOpen));
      fab.classList.toggle('is-open', isOpen);
      sheet.classList.toggle('is-open', isOpen);
      if (sheet.hasAttribute('aria-hidden')) sheet.setAttribute('aria-hidden'
, String(!isOpen));
      if (w.gsap) {
        if (icon) gsap.to(icon, { rotate: isOpen ? 45 : 0, duration: 0.32, ease: isOpen ? 'back.out(2.5)' : 'power2.out' });
        if (isOpen) gsap.fromTo(sheet, { y: 14, opacity: 0, scale: 0.95 },   
          { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.6)',
 clearProps: 'transform,opacity' });
      }
    }

    fab.addEventListener('click', toggle);
    d.addEventListener('click', function(e) {
      if (isOpen && !fab.contains(e.target) && !sheet.contains(e.target)) toggle();
    }, { signal: _fabAC.signal });
  }


  /*         
     10. MENU SHEET (standalone)
             
     Usage: <button data-sheet="sheet-id">Open</button>
            <div class="nh-menu-sheet" id="sheet-id">...</div>
  */
  function initSheet(trigger) {
    var sheetId = trigger.dataset.sheet || trigger.getAttribute('aria-controls');
    var panel = sheetId ? d.getElementById(sheetId) : null;
    if (!panel) return;
    var isOpen = panel.classList.contains('is-open');

    trigger.addEventListener('click', function() {
      isOpen = !isOpen;
      trigger.setAttribute('aria-expanded', String(isOpen));
      panel.classList.toggle('is-open', isOpen);
      if (isOpen && w.gsap) {
        gsap.fromTo(panel, { y: 14, opacity: 0, scale: 0.95 },
          { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.6)',
 clearProps: 'transform,opacity' });
      }
    });
  }


  /*         
     11. TOAST NOTIFICATION SYSTEM
             
     Usage: ApolloTheme.toast('Mensagem', 'success');
     Types: info | success | error | danger
  */
  var TOAST_CFG = {
    info:    { icon: 'ri-information-line',     color: 'var(--primary)' },   
    success: { icon: 'ri-checkbox-circle-line', color: '#22c55e' },
    error:   { icon: 'ri-error-warning-line',   color: '#fbbf24' },
    danger:  { icon: 'ri-close-circle-line',    color: 'var(--alert-red, #ef4444)' }
  };

  function dismissToast(el) {
    if (w.gsap) {
      gsap.to(el, { opacity: 0, x: 30, duration: 0.3, ease: 'power1.in',     
        onComplete: function() { if (el.parentNode) el.remove(); } });
    } else { el.remove(); }
  }

  w.ApolloTheme.toast = function(text, type, duration) {
    type = type || 'info';
    duration = duration || 4200;
    var cfg = TOAST_CFG[type] || TOAST_CFG.info;
    var stack = d.getElementById('toast-stack');
    if (!stack) {
      stack = d.createElement('div');
      stack.id = 'toast-stack';
      stack.style.cssText = 'position:fixed;bottom:calc(20px + var(--safe-bottom,0px));right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;max-width:420px;pointer-events:none;';
      d.body.appendChild(stack);
    }
    var el = d.createElement('div');
    el.className = 'toast-demo';
    el.style.cssText = 'pointer-events:auto;';
    el.setAttribute('role', 'alert');
    el.setAttribute('aria-live', (type === 'error' || type === 'danger') ? 'assertive' : 'polite');
    var _toastIcon = d.createElement('i');
    _toastIcon.className = cfg.icon;
    _toastIcon.style.cssText = 'color:' + cfg.color + ';flex-shrink:0;';
    var _toastMsg = d.createElement('span');
    _toastMsg.style.flex = '1';
    _toastMsg.textContent = String(text);
    var _toastBtn = d.createElement('button');
    _toastBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:inherit;opacity:.55;padding:0;margin-left:auto;';
    _toastBtn.setAttribute('aria-label', 'Fechar');
    var _toastX = d.createElement('i');
    _toastX.className = 'ri-close-line';
    _toastX.style.fontSize = '16px';
    _toastBtn.appendChild(_toastX);
    _toastBtn.addEventListener('click', function() { dismissToast(el); });
    el.appendChild(_toastIcon);
    el.appendChild(_toastMsg);
    el.appendChild(_toastBtn);
    stack.appendChild(el);
    if (w.gsap) gsap.fromTo(el, { opacity: 0, y: 20, scale: 0.95 }, { opacity
: 1, y: 0, scale: 1, duration: 0.42, ease: 'back.out(1.6)' });
    setTimeout(function() { if (el.parentNode) dismissToast(el); }, duration)
;
  };


  /*         
     12. RANGE SLIDER  --val SYNC
      */     
  function syncRangeVal(input) {
    var min = parseFloat(input.min) || 0;
    var max = parseFloat(input.max) || 100;
    var val = parseFloat(input.value) || 0;
    input.style.setProperty('--val', ((val - min) / (max - min) * 100) + '%')
;
  }

  d.addEventListener('input', function(e) {
    if (e.target.matches('input[type="range"]')) syncRangeVal(e.target);
  });


  /*         
     13. EQ VALUE TAGS
      */     
  function initEqTags() {
    d.querySelectorAll('.eq-slider-wrapper').forEach(function(wrapper) {     
      var input = wrapper.querySelector('input[type=range]');
      if (!input || wrapper.querySelector('.eq-val-tag')) return;
      var tag = d.createElement('span');
      tag.className = 'eq-val-tag';
      wrapper.appendChild(tag);
      function update() {
        var v = parseFloat(input.value);
        tag.textContent = (v > 0 ? '+' : '') + v.toFixed(1) + ' dB';
      }
      update();
      input.addEventListener('input', update);
    });
  }


  /*         
     14. DATE/TIME PICKER  FLOATING LABEL
             
     Adds .has-value to .input-group/.nh-field when a date/time
     input has a real value, so the label floats correctly.
  */
  function initDateTimeFields() {
    var sel = 'input[type="date"],input[type="time"],input[type="datetime-local"],input[type="month"],input[type="week"]';
    d.querySelectorAll(sel).forEach(function(input) {
      var group = input.closest('.input-group, .nh-field');
      if (!group) return;
      function checkFloat() {
        group.classList.toggle('has-value', !!input.value);
      }
      checkFloat();
      input.addEventListener('change', checkFloat);
      input.addEventListener('input', checkFloat);
    });
  }


  /*         
     15. PLAY/PAUSE EVENTS
      */     
  d.addEventListener('change', function(e) {
    if (!e.target.classList.contains('player-input')) return;
    fire(e.target, 'apollo:playback', { playing: e.target.checked });        
  });


  /*         
     16. GSAP SCROLL REVEALS
      */
  function initScrollReveals() {
    if (!w.gsap || !w.ScrollTrigger) return;
    if (_scrollRevealsInited) return;
    _scrollRevealsInited = true;
    gsap.registerPlugin(ScrollTrigger);

    // .reveal-up handled by reveal-up.js (CSS transition-based)

    var galleryCards = d.querySelectorAll('.gallery-reveal .gallery-card');  
    if (galleryCards.length) {
      gsap.from(galleryCards, {
        y: 36, opacity: 0, stagger: 0.13, duration: 0.75, ease: 'power3.out',
        scrollTrigger: { trigger: '.gallery-reveal', start: 'top 82%' }      
      });
    }

    var disclaimers = d.querySelectorAll('.disclaimer-reveal .nh-disclaimer')
;
    if (disclaimers.length) {
      gsap.from(disclaimers, {
        y: 20, opacity: 0, stagger: 0.14, duration: 0.65, ease: 'power2.out',
        scrollTrigger: { trigger: '.disclaimer-reveal', start: 'top 85%' }   
      });
    }
  }


  /*         
     17. ICON SYSTEM PREP
             
     Ensures custom Apollo icon elements (mask-based) get
     display:inline-block for correct rendering.
  */
  function initIconSystem() {
    d.querySelectorAll('i[class*="icon-"]').forEach(function(el) {
      if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
    });
  }


  /*         
     BOOT
      */     
  function boot() {
    d.querySelectorAll('.as1').forEach(initAS1);
    d.querySelectorAll('.as2').forEach(initAS2);
    d.querySelectorAll('.as3').forEach(initAS3);

    d.querySelectorAll('[data-dropdown]').forEach(initDropdown);
    d.querySelectorAll('[aria-controls][aria-haspopup="true"]').forEach(function(el) {
      var panel = d.getElementById(el.getAttribute('aria-controls'));        
      if (panel && panel.classList.contains('nh-dropdown') && !el.dataset.dropdown) {
        el.dataset.dropdown = el.getAttribute('aria-controls');
        initDropdown(el);
      }
    });

    d.querySelectorAll('.nh-menu-fab').forEach(initFab);
    d.querySelectorAll('[data-sheet]').forEach(initSheet);
    d.querySelectorAll('input[type="range"]').forEach(syncRangeVal);

    initEqTags();
    initClocks();
    initDateTimeFields();
    initIconSystem();

    // GSAP may already be loaded (core.js fires apollo:gsap-ready after Tier 4)
    if (w.gsap && w.ScrollTrigger) initScrollReveals();
  }

  if (d.readyState === 'loading') {
    d.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Also listen for late GSAP availability (fallback paths, deferred loads)
  w.addEventListener('apollo:gsap-ready', function() {
    if (d.readyState === 'loading') {
      d.addEventListener('DOMContentLoaded', initScrollReveals);
    } else {
      initScrollReveals();
    }
  }, { once: true });

})(window, document);
