'use strict';
(function () {
  if (window.__WORLD_CATALOG_MENU_BOOTED__) return;
  window.__WORLD_CATALOG_MENU_BOOTED__ = true;

  const statusLabel = {
    certified: 'проверен',
    development: 'в разработке',
    quarantine: 'карантин',
    diagnostic: 'диагностика',
    tool: 'инструмент',
    system: 'система',
    unregistered: 'найден автоматически',
    'legacy-deployment': 'архивный деплой'
  };

  function addStyles() {
    if (document.getElementById('worldCatalogStyles')) return;
    const style = document.createElement('style');
    style.id = 'worldCatalogStyles';
    style.textContent = `
      #goldenWorldMenu{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147482000;display:flex;gap:8px;max-width:min(96vw,980px);padding:8px;border-radius:14px;background:rgba(5,9,14,.84);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(10px);overflow-x:auto;overscroll-behavior:contain}
      #goldenWorldMenu a,#goldenWorldMenu button{display:flex;align-items:center;justify-content:center;min-height:42px;min-width:116px;padding:7px 12px;border-radius:10px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.15);color:#fff;text-decoration:none;font:700 12px system-ui;text-align:center;white-space:nowrap;cursor:pointer}
      #goldenWorldMenu .allWorlds{background:rgba(29,162,255,.2);border-color:rgba(74,183,255,.55)}
      #worldCatalogPanel{position:fixed;z-index:2147481999;left:50%;top:76px;transform:translateX(-50%);width:min(94vw,920px);max-height:calc(100vh - 96px);overflow:auto;padding:14px;border-radius:16px;background:rgba(5,9,14,.96);border:1px solid rgba(255,255,255,.18);box-shadow:0 18px 60px rgba(0,0,0,.45);color:#fff;font:13px/1.35 system-ui}
      #worldCatalogPanel[hidden]{display:none!important}#worldCatalogPanel header{display:flex;align-items:center;justify-content:space-between;gap:12px;position:sticky;top:-14px;padding:12px 0;background:rgba(5,9,14,.96);z-index:2}#worldCatalogPanel h2{margin:0;font-size:18px}#worldCatalogPanel .close{min-width:42px;min-height:38px;border:1px solid #ffffff2e;border-radius:9px;background:#ffffff10;color:#fff;cursor:pointer}
      #worldCatalogList{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:9px}.worldCatalogItem{display:flex;flex-direction:column;gap:5px;padding:11px;border-radius:12px;background:#ffffff0b;border:1px solid #ffffff16}.worldCatalogItem a{color:#d8f1ff;font-weight:800;text-decoration:none}.worldCatalogItem .disabled{color:#9aa8b4;font-weight:800}.worldCatalogMeta{display:flex;gap:6px;flex-wrap:wrap}.worldCatalogBadge{padding:2px 7px;border-radius:999px;background:#ffffff12;border:1px solid #ffffff1f;font-size:10px;color:#cbd7df}.worldCatalogReason{font-size:11px;color:#aab8c2}
      @media(pointer:coarse),(max-width:800px){#goldenWorldMenu{top:max(8px,env(safe-area-inset-top));left:8px;right:8px;transform:none;max-width:none}#goldenWorldMenu a,#goldenWorldMenu button{min-width:108px;min-height:46px}#worldCatalogPanel{top:72px;width:calc(100vw - 16px);max-height:calc(100dvh - 82px)}}
    `;
    document.head.appendChild(style);
  }

  function buildPanel(inventory) {
    const panel = document.createElement('section');
    panel.id = 'worldCatalogPanel';
    panel.hidden = true;
    const head = document.createElement('header');
    const h = document.createElement('h2'); h.textContent = `Все миры и проекты (${inventory.length})`;
    const close = document.createElement('button'); close.className = 'close'; close.textContent = '✕'; close.setAttribute('aria-label','Закрыть');
    head.append(h, close); panel.appendChild(head);
    const list = document.createElement('div'); list.id = 'worldCatalogList';
    for (const item of inventory) {
      const card = document.createElement('div'); card.className = 'worldCatalogItem';
      const title = item.url ? document.createElement('a') : document.createElement('span');
      if (item.url) { title.href = item.url; if (item.external) { title.target = '_blank'; title.rel = 'noopener noreferrer'; } }
      else title.className = 'disabled';
      title.textContent = item.title || item.id;
      const meta = document.createElement('div'); meta.className = 'worldCatalogMeta';
      for (const text of [statusLabel[item.status] || item.status, item.kind, item.external ? 'Vercel' : 'World_server']) {
        if (!text) continue; const b = document.createElement('span'); b.className = 'worldCatalogBadge'; b.textContent = text; meta.appendChild(b);
      }
      card.append(title, meta);
      if (item.reason) { const reason = document.createElement('div'); reason.className = 'worldCatalogReason'; reason.textContent = item.reason; card.appendChild(reason); }
      list.appendChild(card);
    }
    panel.appendChild(list); document.body.appendChild(panel);
    close.onclick = () => { panel.hidden = true; };
    addEventListener('keydown', e => { if (e.key === 'Escape') panel.hidden = true; });
    return panel;
  }

  function makeMenu(apps, inventory) {
    if (document.getElementById('goldenWorldMenu')) return;
    addStyles();
    const menu = document.createElement('nav'); menu.id = 'goldenWorldMenu'; menu.setAttribute('aria-label','Навигация по мирам');
    const catalog = document.createElement('a'); catalog.href = '/apps/catalog/'; catalog.textContent = '← Все миры'; menu.appendChild(catalog);
    for (const app of apps) { const a = document.createElement('a'); a.href = app.url; a.textContent = `Играть: ${app.title}`; a.dataset.appId = app.id; menu.appendChild(a); }
    const panel = buildPanel(inventory);
    const all = document.createElement('button'); all.type = 'button'; all.className = 'allWorlds'; all.textContent = `Каталог (${inventory.length})`; all.onclick = () => { panel.hidden = !panel.hidden; }; menu.appendChild(all);
    document.body.appendChild(menu);
  }

  async function boot() {
    try {
      const r = await fetch('/api/apps?all=1', { cache:'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      makeMenu(Array.isArray(j.apps) ? j.apps : [], Array.isArray(j.inventory) ? j.inventory : []);
    } catch (e) { console.error('[WORLD CATALOG]', e); }
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot, { once:true }); else boot();
})();
