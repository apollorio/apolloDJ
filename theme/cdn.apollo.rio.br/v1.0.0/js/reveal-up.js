(() => {
    "use strict";

    if (document.getElementById("ap-ru-style")) return;

    const _s = document.createElement("style");
    _s.id = "ap-ru-style";
    _s.textContent =
        `.reveal-up{opacity:0;transform:translateY(44px);` +
        `transition:opacity .78s cubic-bezier(.5,0,0,1),transform .78s cubic-bezier(.5,0,0,1);` +
        `transition-delay:var(--ap-d,0ms);will-change:opacity,transform}` +
        `.reveal-up.ap-on{opacity:1!important;transform:translateY(0)!important}` +
        `.reveal-up.ap-skip{opacity:1!important;transform:none!important;transition:none!important}` +
        `@media(prefers-reduced-motion:reduce){` +
        `.reveal-up{opacity:1!important;transform:none!important;transition:none!important}}`;
    document.head.appendChild(_s);

    const _seen = new WeakSet();
    const _rm   = window.matchMedia("(prefers-reduced-motion:reduce)").matches;

    const _enterObs = new IntersectionObserver(entries => {
        if (_rm) return;
        entries.forEach(e => {
            if (e.isIntersecting) e.target.classList.add("ap-on");
        });
    }, { rootMargin: "-20% 0px -20% 0px", threshold: 0 });

    const _exitObs = new IntersectionObserver(entries => {
        if (_rm) return;
        entries.forEach(e => {
            if (!e.isIntersecting && e.target.classList.contains("ap-on")) {
                e.target.classList.remove("ap-on");
            }
        });
    }, { rootMargin: "-7.5% 0px -7.5% 0px", threshold: 0 });

    const _attach = el => {
        _seen.add(el);
        if (el.getBoundingClientRect().bottom < 0) {
            el.classList.add("ap-skip");
            return;
        }
        _enterObs.observe(el);
        _exitObs.observe(el);
    };

    let _raf;
    const _scan = () => {
        cancelAnimationFrame(_raf);
        _raf = requestAnimationFrame(() => {
            const batchMap = new Map();
            document.querySelectorAll(".reveal-up").forEach(el => {
                if (_seen.has(el)) return;
                const p = el.parentElement || document.body;
                if (!batchMap.has(p)) {
                    let base = 0;
                    p.querySelectorAll(":scope > .reveal-up").forEach(s => {
                        if (_seen.has(s)) base++;
                    });
                    batchMap.set(p, base);
                }
                const idx = batchMap.get(p);
                el.style.setProperty("--ap-d", `${idx * 115}ms`);
                batchMap.set(p, idx + 1);
                _attach(el);
            });
        });
    };

    const _mutObs = new MutationObserver(_scan);
    const _startObs = () => { if (document.body) _mutObs.observe(document.body, { childList: true, subtree: true }); };
    _startObs();

    document.readyState === "loading"
        ? document.addEventListener("DOMContentLoaded", () => { _startObs(); _scan(); }, { once: true })
        : _scan();
})();
