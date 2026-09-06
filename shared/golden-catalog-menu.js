'use strict';
(function () {
  function makeMenu(apps) {
    if (document.getElementById('goldenWorldMenu')) return;
    const style = document.createElement('style');
    style.textContent = `
      #goldenWorldMenu{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147482000;display:flex;gap:8px;max-width:min(94vw,900px);padding:8px;border-radius:14px;background:rgba(5,9,14,.78);border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(10px);overflow-x:auto;overscroll-behavior:contain}
      #goldenWorldMenu a{display:flex;align-items:center;justify-content:center;min-height:42px;min-width:128px;padding:7px 12px;border-radius:10px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.15);color:#fff;text-decoration:none;font:700 12px system-ui;text-align:center;white-space:nowrap}
      #goldenWorldMenu a:active{transform:scale(.97)}
      @media(pointer:coarse),(max-width:800px){#goldenWorldMenu{top:calc(max(10px,env(safe-area-inset-top)) + 54px);left:8px;right:8px;transform:none;max-width:none}#goldenWorldMenu a{min-width:112px;min-height:46px}}
    `;
    document.head.appendChild(style);
    const menu = document.createElement('nav');
    menu.id = 'goldenWorldMenu';
    menu.setAttribute('aria-label','Проверенные миры');
    for (const app of apps) {
      const a = document.createElement('a');
      a.href = app.url;
      a.textContent = `Играть: ${app.title}`;
      a.dataset.appId = app.id;
      menu.appendChild(a);
    }
    document.body.appendChild(menu);
  }

  async function boot() {
    try {
      const r = await fetch('/api/apps?certified=1',{cache:'no-store'});
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      makeMenu(Array.isArray(j.apps) ? j.apps : []);
    } catch (e) {
      console.error('[GOLDEN CATALOG]', e);
    }
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
