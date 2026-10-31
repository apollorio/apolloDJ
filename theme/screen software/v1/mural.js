/* ══ MURAL.JS — Community wall (Apollo Diamond compliant) ══ */
window.MuralPage = (() => {
  'use strict';
  const api = () => window.pywebview?.api;

  function _fmt(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' }) + ' · ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    } catch (e) { return iso; }
  }

  function _initials(name) {
    return (name || '?').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }

  function render(host) {
    host.innerHTML = `
      <div class="pane reveal" id="mural-pane">
        <aside class="aside">
          <div class="aside-head"><div class="aside-title">Mural</div></div>
          <div class="aside-scroll">
            <div class="tree-node selected"><i class="ri-global-line ti"></i><span>Cena::rio</span></div>
            <div class="tree-node"><i class="i-great-s ti"></i><span>GREATclub</span></div>
            <div class="tree-node"><i class="ri-user-line ti"></i><span>Minhas publicações</span></div>
          </div>
        </aside>
        <section class="content" style="display:flex;flex-direction:column;overflow:hidden;">
          <div id="mural-posts" style="flex:1;padding:12px 16px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;min-height:0;"></div>
          <div style="padding:12px 16px 16px;flex-shrink:0;display:flex;flex-direction:column;gap:8px;border-top:1px solid rgba(5,5,5,.04);">
            <textarea id="mural-input" placeholder="Compartilhe algo com a comunidade…" maxlength="1000"
              style="width:100%;box-sizing:border-box;height:72px;padding:12px 14px;border-radius:14px;background:var(--white-2);border:0;outline:0;resize:none;font-size:13px;color:var(--txt-heading);font-family:inherit;transition:box-shadow .3s ease;"
              onfocus="this.style.boxShadow='0 0 0 3px rgba(255,152,32,.12)'"
              onblur="this.style.boxShadow=''"></textarea>
            <div style="display:flex;justify-content:flex-end;">
              <button class="btn-primary" onclick="MuralPage.post()"><i class="ri-send-plane-line"></i> Publicar</button>
            </div>
          </div>
        </section>
      </div>`;

    if (typeof gsap !== 'undefined') {
      gsap.to('#mural-pane', { opacity:1, y:0, duration:.55, ease:'power2.out' });
    } else {
      const p = document.getElementById('mural-pane');
      if (p) { p.style.opacity = '1'; p.style.transform = 'none'; }
    }
    _loadPosts();
  }

  function _loadPosts() {
    const container = document.getElementById('mural-posts');
    if (!container) return;
    container.innerHTML = `<div style="padding:20px;text-align:center;font-family:var(--ff-mono);font-size:9px;color:var(--white-18);text-transform:uppercase;letter-spacing:.14em;">Carregando…</div>`;
    if (!api()) { _renderPosts([]); return; }
    api().get_mural(20).then(posts => {
      _renderPosts(Array.isArray(posts) ? posts : []);
    }).catch(() => _renderPosts([]));
  }

  function _renderPosts(posts) {
    const container = document.getElementById('mural-posts');
    if (!container) return;
    if (!posts.length) {
      container.innerHTML = `<div style="padding:40px;text-align:center;font-family:var(--ff-mono);font-size:9px;color:var(--white-18);text-transform:uppercase;letter-spacing:.14em;">Nenhuma publicação</div>`;
      return;
    }
    container.innerHTML = posts.map(p => `
      <div class="peer" style="flex-direction:column;align-items:flex-start;padding:12px 14px;gap:8px;cursor:default;background:var(--white-2);border-radius:14px;">
        <div style="display:flex;align-items:center;gap:10px;width:100%;">
          <div style="width:28px;height:28px;border-radius:50%;background:var(--white-4);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-family:var(--ff-mono);font-size:9px;font-weight:700;color:var(--gray-1);">${_initials(p.display_name || p.author)}</div>
          <div style="flex:1;min-width:0;">
            <div class="peer-name" style="font-size:13px;">${p.display_name || p.author || 'Anônimo'}</div>
            <div style="font-family:var(--ff-mono);font-size:9px;color:var(--white-18);">${_fmt(p.created_at || '')}</div>
          </div>
        </div>
        <div style="font-size:13px;color:var(--txt-color);line-height:1.5;padding-left:38px;">${(p.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>`).join('');
  }

  function post() {
    const input = document.getElementById('mural-input');
    const content = input?.value?.trim();
    if (!content) { App.toast('Digite algo para publicar'); return; }
    if (content.length > 1000) { App.toast('Máximo 1000 caracteres'); return; }
    if (!api()) {
      App.toast('Bridge indisponível — conecte ao apollo::dj');
      return;
    }
    api().post_mural_comment(content).then(r => {
      if (r && r.ok) { if (input) input.value = ''; _loadPosts(); App.toast('Publicado!'); }
      else App.toast('Erro: ' + (r?.error || 'desconhecido'));
    }).catch(() => App.toast('Erro ao publicar'));
  }

  return { render, post };
})();

/* ─── register in ApolloPages dispatch ─── */
window.ApolloPages = window.ApolloPages || {};
ApolloPages.mural = mount => MuralPage.render(mount);
