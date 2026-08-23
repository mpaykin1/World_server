'use strict';
(function(){
  if(window.__GOLDEN_UI_SHELL_V1__) return;
  window.__GOLDEN_UI_SHELL_V1__=true;

  const path=location.pathname;
  const configs=[
    {match:'/apps/catalog/', title:'Миры', selectors:['.app-title','.topHint','#miniMap']},
    {match:'/apps/voxel-world/', title:'Voxel World', selectors:['#vwHud','#vwHelp','#vwBack']},
    {match:'/apps/ai3d-voxel-city/', title:'Voxel City', selectors:['header','.controls','.metrics']},
    {match:'/apps/survival/', title:'Survival', selectors:['.app-title','.topHint']},
    {match:'/apps/world-sharabass/', title:'World', selectors:['.app-title','.topHint']}
  ];
  const cfg=configs.find(c=>path.startsWith(c.match))||{title:'World',selectors:[]};

  function svg(paths){
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  }
  const icons={
    menu:svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    worlds:svg('<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.4 2.2 3.5 4.9 3.5 8S14.4 17.8 12 20M12 4c-2.4 2.2-3.5 4.9-3.5 8S9.6 17.8 12 20"/>'),
    settings:svg('<circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7L10.5 2h-3l-.7 2.3-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2.3h3l.7-2.3 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7z" transform="translate(1.5 0) scale(.82)"/>'),
    info:svg('<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/>'),
    close:svg('<path d="M6 6l12 12M18 6L6 18"/>')
  };

  const root=document.createElement('div');
  root.id='goldenUiShell';
  root.innerHTML=`
    <nav id="goldenToolbar" aria-label="Игровое меню">
      <button data-golden-tab="menu" aria-label="Меню">${icons.menu}</button>
      <button data-golden-tab="worlds" aria-label="Миры">${icons.worlds}</button>
      <button data-golden-tab="settings" aria-label="Настройки">${icons.settings}</button>
      <button data-golden-tab="info" aria-label="Информация">${icons.info}</button>
    </nav>
    <section id="goldenDrawer" aria-hidden="true">
      <header><strong id="goldenDrawerTitle">${cfg.title}</strong><button id="goldenDrawerClose" aria-label="Закрыть">${icons.close}</button></header>
      <div class="goldenTab" data-tab="menu"><div id="goldenPackedPanels"></div></div>
      <div class="goldenTab" data-tab="worlds"><div id="goldenWorldList">Загрузка миров…</div></div>
      <div class="goldenTab" data-tab="settings">
        <button id="goldenFullscreen" class="goldenAction">Полный экран</button>
        <button id="goldenMinimalUi" class="goldenAction" aria-pressed="false">Минимальный HUD</button>
      </div>
      <div class="goldenTab" data-tab="info">
        <p>Системная информация и вторичные элементы находятся внутри этого меню и не перекрывают игру.</p>
        <div id="goldenQualityStatus">Quality Gate: active</div>
      </div>
    </section>`;
  document.body.appendChild(root);

  const drawer=root.querySelector('#goldenDrawer');
  const title=root.querySelector('#goldenDrawerTitle');
  const packed=root.querySelector('#goldenPackedPanels');
  let active='menu';

  function select(tab){
    active=tab;
    title.textContent=tab==='worlds'?'Миры':tab==='settings'?'Настройки':tab==='info'?'Информация':cfg.title;
    for(const el of root.querySelectorAll('.goldenTab')) el.hidden=el.dataset.tab!==tab;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden','false');
  }
  function close(){
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden','true');
  }
  for(const b of root.querySelectorAll('[data-golden-tab]')) b.addEventListener('click',()=>select(b.dataset.goldenTab));
  root.querySelector('#goldenDrawerClose').addEventListener('click',close);
  addEventListener('keydown',e=>{if(e.code==='Escape')close()});

  for(const selector of cfg.selectors){
    for(const node of [...document.querySelectorAll(selector)]){
      if(root.contains(node)) continue;
      node.dataset.goldenPacked='true';
      packed.appendChild(node);
    }
  }
  if(!packed.children.length){
    const empty=document.createElement('p');empty.textContent='Дополнительных системных панелей нет.';packed.appendChild(empty);
  }

  async function loadWorlds(){
    const host=root.querySelector('#goldenWorldList');
    try{
      const r=await fetch('/api/apps?certified=1',{cache:'no-store'}),j=await r.json();
      const apps=(j.apps||[]).filter(a=>a.status==='certified');
      host.replaceChildren();
      for(const app of apps){
        const a=document.createElement('a');
        a.className='goldenWorldLink';
        a.href=app.path||`/apps/${app.id}/`;
        a.textContent=app.title||app.id;
        host.appendChild(a);
      }
      if(!apps.length) host.textContent='Нет сертифицированных миров.';
    }catch(e){host.textContent='Не удалось загрузить список миров.'}
  }
  loadWorlds();

  root.querySelector('#goldenFullscreen').addEventListener('click',async()=>{
    try{
      if(!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
      else await document.exitFullscreen?.();
    }catch{}
  });
  root.querySelector('#goldenMinimalUi').addEventListener('click',e=>{
    const on=!document.documentElement.classList.contains('golden-minimal-ui');
    document.documentElement.classList.toggle('golden-minimal-ui',on);
    e.currentTarget.setAttribute('aria-pressed',String(on));
  });

  window.GoldenUIShell={open:select,close,root,packed,config:cfg};
})();