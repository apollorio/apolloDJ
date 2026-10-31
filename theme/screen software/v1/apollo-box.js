/* ════════════════════════════════════════════════════════════
   apollo-box.js — Portable Liquid Glass Logo Widget v1.0.0
   Targets: <i class="apollo-box" [data-size="44"] [data-src="url"]></i>
   Injects: scoped CSS + unique SVG flute filter + 3D parallax card DOM
   Pattern: IIFE singleton — safe to load multiple times
════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* Singleton guard */
  if ( window.__apolloBoxRuntime ) { return; }
  window.__apolloBoxRuntime = true;

  var DEFAULT_SRC  = 'https://assets.apollo.rio.br/i/apollo-s.svg';
  var DEFAULT_SIZE = 44;

  /* ─── Inject scoped CSS once ──────────────────────────────── */
  function injectCSS() {
    if ( document.getElementById('apollo-box-css') ) { return; }
    var style = document.createElement('style');
    style.id  = 'apollo-box-css';
    style.textContent = [
      '.apollo-box-card{',
        'display:grid;',
        'grid-template-areas:"stack";',
        'position:relative;',
        '--tilt:22deg;',
      '}',
      '.apollo-box-card>*{',
        'grid-area:stack;',
        '--rx:calc(var(--y,0)*var(--tilt)*-1);',
        '--ry:calc(var(--x,0)*var(--tilt));',
        'transition:transform 1200ms cubic-bezier(.03,.98,.52,.99);',
        'transform:perspective(900px) rotateX(var(--rx)) rotateY(var(--ry)) translateZ(var(--depth,0));',
        'will-change:transform;',
      '}',
      '.apollo-box-card:not(:hover)>*{--rx:0deg;--ry:0deg;}',
      '.apollo-box-card img{',
        'width:100%;height:100%;',
        'object-fit:contain;',
        '--depth:-8px;',
        'pointer-events:none;',
        'display:block;',
      '}',
      '.apollo-box-glass{',
        'position:absolute;inset:0;',
        'border-radius:12px;',
        'background:rgba(8,8,8,.02);',
        'border:1px solid rgba(5,5,5,.04);',
        'overflow:hidden;',
        '--depth:6px;',
      '}'
    ].join('');
    document.head.appendChild( style );
  }

  /* ─── SVG filter defs container (shared, appended once) ───── */
  var _svgDefs = null;
  function getSvgDefs() {
    if ( _svgDefs ) { return _svgDefs; }
    _svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    _svgDefs.setAttribute('xmlns',  'http://www.w3.org/2000/svg');
    _svgDefs.setAttribute('height', '0');
    _svgDefs.setAttribute('width',  '0');
    _svgDefs.setAttribute('viewBox','0 0 1 1');
    _svgDefs.setAttribute('color-interpolation-filters','sRGB');
    _svgDefs.style.cssText = 'position:absolute;pointer-events:none;opacity:0;width:0;height:0;';
    document.body.appendChild( _svgDefs );
    return _svgDefs;
  }

  /* ─── Inject one unique flute filter per instance ─────────── */
  function injectFilter( filterId ) {
    /* Encoded SVG gradient pattern — Apollo orange palette */
    var patternSvg = [
      "%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'",
      "%20color-interpolation-filters%3D'sRGB'",
      "%20viewBox%3D'0%200%20500%20500'%20width%3D'500'%20height%3D'500'%3E",
      "%3Cdefs%3E",
      "%3ClinearGradient%20id%3D'rg'%3E",
      "%3Cstop%20offset%3D'0'%20stop-color%3D'%23ff5c00'%2F%3E",
      "%3Cstop%20offset%3D'1'%20stop-color%3D'%23ffc285'%2F%3E",
      "%3C%2FlinearGradient%3E",
      "%3Cpattern%20id%3D'flutes'%20patternTransform%3D'scale(0.2)'",
      "%20preserveAspectRatio%3D'xMidYMid%20slice'",
      "%20width%3D'100'%20height%3D'100'%20viewBox%3D'0%200%20100%20100'",
      "%20patternUnits%3D'userSpaceOnUse'%3E",
      "%3Crect%20width%3D'100'%20height%3D'100'%20style%3D'fill%3Aurl(%23rg)%3B'%2F%3E",
      "%3C%2Fpattern%3E",
      "%3C%2Fdefs%3E",
      "%3Crect%20id%3D'pattern'%20fill%3D'url(%23flutes)'%20width%3D'100%25'%20height%3D'100%25'%2F%3E",
      "%3C%2Fsvg%3E"
    ].join('');

    var ns     = 'http://www.w3.org/2000/svg';
    var filter = document.createElementNS( ns, 'filter' );
    filter.setAttribute('id',      filterId );
    filter.setAttribute('x',      '-25%'  );
    filter.setAttribute('y',      '-25%'  );
    filter.setAttribute('width',  '150%'  );
    filter.setAttribute('height', '150%'  );

    /* feGaussianBlur — background soften */
    var blur1 = document.createElementNS( ns, 'feGaussianBlur' );
    blur1.setAttribute('stdDeviation','6');
    blur1.setAttribute('result','srcBg');
    filter.appendChild( blur1 );

    /* feImage — gradient pattern for displacement */
    var img = document.createElementNS( ns, 'feImage' );
    img.setAttribute('href', 'data:image/svg+xml,' + patternSvg );
    img.setAttribute('preserveAspectRatio','xMidYMid slice');
    filter.appendChild( img );

    /* feGaussianBlur — smooth the displacement map */
    var blur2 = document.createElementNS( ns, 'feGaussianBlur' );
    blur2.setAttribute('stdDeviation','3');
    blur2.setAttribute('result','smoothness');
    filter.appendChild( blur2 );

    /* feDisplacementMap — refraction effect */
    var disp = document.createElementNS( ns, 'feDisplacementMap' );
    disp.setAttribute('scale','-90');
    disp.setAttribute('in','srcBg');
    disp.setAttribute('in2','smoothness');
    disp.setAttribute('xChannelSelector','R');
    disp.setAttribute('yChannelSelector','G');
    filter.appendChild( disp );

    /* feColorMatrix — pull from smoothness for fresnel tint */
    var cm = document.createElementNS( ns, 'feColorMatrix' );
    cm.setAttribute('in','smoothness');
    cm.setAttribute('values','1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 1 0');
    filter.appendChild( cm );

    /* feComponentTransfer — alpha for fresnel opacity */
    var ct = document.createElementNS( ns, 'feComponentTransfer' );
    var fA = document.createElementNS( ns, 'feFuncA' );
    fA.setAttribute('type','linear');
    fA.setAttribute('slope','0.25');
    ct.appendChild( fA );
    filter.appendChild( ct );

    getSvgDefs().appendChild( filter );
  }

  /* ─── Build one brand card from an <i> element ─────────────── */
  var _instanceCount = 0;
  function buildCard( el ) {
    var size    = parseInt( el.getAttribute('data-size'), 10 ) || DEFAULT_SIZE;
    var src     = el.getAttribute('data-src')  || DEFAULT_SRC;
    var idx     = ++_instanceCount;
    var filtId  = 'flute-box-' + idx;

    injectFilter( filtId );

    /* Card wrapper — replaces the <i> */
    var card     = document.createElement('div');
    card.className = 'apollo-box-card';
    card.style.cssText = 'width:' + size + 'px;height:' + size + 'px;';
    card.style.setProperty('--x', '0');
    card.style.setProperty('--y', '0');

    /* Image layer (pushed back) */
    var img      = document.createElement('img');
    img.src      = src;
    img.alt      = 'apollo logo';
    img.width    = size;
    img.height   = size;
    card.appendChild( img );

    /* Glass layer (pushed forward, refraction filter) */
    var glass    = document.createElement('div');
    glass.className = 'apollo-box-glass';
    glass.style.cssText = 'backdrop-filter:url(#' + filtId + ');-webkit-backdrop-filter:blur(2px);';
    card.appendChild( glass );

    /* Pointer events — update card --x/--y on mousemove */
    var round = function ( n ) { return Math.round( n * 100 ) / 100; };
    var onMove = function ( e ) {
      var touch   = e.touches ? e.touches[0] : e;
      var bb      = card.getBoundingClientRect();
      /* If card is tiny, expand sensitivity zone to parent */
      var cx      = bb.x + bb.width  / 2;
      var cy      = bb.y + bb.height / 2;
      var range   = Math.max( bb.width * 3, 100 );
      var ox      = ( touch.clientX - cx ) / range;
      var oy      = ( touch.clientY - cy ) / range;
      var x       = round( Math.max( -1, Math.min( 1, ox ) ) );
      var y       = round( Math.max( -1, Math.min( 1, oy ) ) );
      card.style.setProperty('--x', x);
      card.style.setProperty('--y', y);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });

    /* Replace the <i> element */
    el.parentNode.replaceChild( card, el );
  }

  /* ─── Init ─────────────────────────────────────────────────── */
  function init() {
    injectCSS();
    var targets = document.querySelectorAll('i.apollo-box');
    if ( !targets.length ) { return; }
    for ( var i = 0; i < targets.length; i++ ) {
      buildCard( targets[i] );
    }
  }

  if ( document.readyState === 'loading' ) {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
