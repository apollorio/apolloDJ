/**
 * Apollo Data Tooltip v1.0.1 — data-tooltip="Official Global Tooltip"
 * Desktop hover + Mobile long-press + Accessibility + Zero flicker
 */

const CSS_URL = 'https://cdn.apollo.rio.br/v1.0.0/css/data-tooltip.css';
if (!document.querySelector('link[href*="data-tooltip.css"]')) {
  const link = document.createElement('link'); link.rel='stylesheet'; link.href=CSS_URL; document.head.appendChild(link);
}

const forceCSS = document.createElement('style');
forceCSS.textContent = `body .tooltip-popper{ font-size: 10px !important ; font-weight: 600 ; color: #f8fafc !important; white-space: nowrap !important; letter-spacing: -.01em !important; background: rgba(5, 5, 5, 0.88) !important; background-origin: padding-box !important; padding: 7px 9px !important; border: .5px solid rgba(5, 5, 5, 0.04) !important; border-radius: 15px !important; pointer-events: none !important; box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.15), 0 4px 12px -4px rgba(5, 5, 5, 0.03), 0 12px 24px -8px rgba(5, 5, 5, 0.04) !important; z-index:9999!important; backdrop-filter:blur(12px)!important; pointer-events:none!important; opacity:0; transition:all .25s cubic-bezier(0.23,1,0.32,1)!important; }
body .tooltip-force-show .tooltip-popper{opacity:1!important;}`;
document.head.appendChild(forceCSS);

const tooltipEl = document.createElement('div');
tooltipEl.id = 'global-tooltip';
tooltipEl.className = 'tooltip-popper';
document.body.appendChild(tooltipEl);

const isMobile = () => window.matchMedia('(pointer: coarse)').matches;
let popperInstance = null;
let timeout = null;
let hoverTimeout = null;

function showTooltip(el) {
  if (typeof Popper === 'undefined') return;
  tooltipEl.textContent = el.getAttribute('data-tooltip');
  tooltipEl.style.opacity = '1';
  if (popperInstance) popperInstance.destroy();
  popperInstance = Popper.createPopper(el, tooltipEl, {placement:'top',modifiers:[{name:'offset',options:{offset:[0,12]}},{name:'flip',options:{fallbackPlacements:['bottom']}}]});
  el.classList.add('tooltip-force-show');
  el.setAttribute('aria-describedby', 'global-tooltip');
}

function hideTooltip() {
  tooltipEl.style.opacity = '0';
  document.querySelectorAll('.tooltip-force-show').forEach(e=>e.classList.remove('tooltip-force-show'));
  if (popperInstance) {popperInstance.destroy(); popperInstance=null;}
}

// Desktop hover (with intent delay)
document.addEventListener('mouseover', e => {
  const el = e.target.closest('[data-tooltip]');
  if (!el || isMobile()) return;
  clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => showTooltip(el), 100);
});

document.addEventListener('mouseout', e => {
  const el = e.target.closest('[data-tooltip]');
  if (!el || isMobile() || el.contains(e.relatedTarget)) return;
  clearTimeout(hoverTimeout);
  hideTooltip();
});

// Mobile long-press
document.addEventListener('touchstart', e => {
  const el = e.target.closest('[data-tooltip]');
  if (!el || !isMobile()) return;
  clearTimeout(timeout);
  showTooltip(el);
  timeout = (el.tagName==='A' && el.href) ? setTimeout(()=>{location.href=el.href;},1000) : setTimeout(hideTooltip,2000);
});

document.addEventListener('touchend', () => {clearTimeout(timeout); hideTooltip();});
document.addEventListener('touchmove', () => clearTimeout(timeout));

// Keyboard accessibility
document.addEventListener('focusin', e => {const el=e.target.closest('[data-tooltip]'); if(el) showTooltip(el);});
document.addEventListener('focusout', hideTooltip);
