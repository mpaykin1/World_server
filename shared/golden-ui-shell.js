'use strict';
(function(){
  if(window.__GOLDEN_UI_SHELL_V2__) return;
  window.__GOLDEN_UI_SHELL_V2__=true;
  const path=location.pathname;
  const configs=[
    {match:'/apps/catalog/',title:'Миры',worldId:'world-server-catalog-live',selectors:['.app-title','.topHint','#miniMap']},
    {match:'/apps/voxel-world/',title:'Voxel World',worldId:'voxel-world',selectors:['#vwHud','#vwHelp','#vwBack']},
    {match:'/apps/ai3d-voxel-city/',title:'Voxel City',worldId:'ai3d-voxel-city',selectors:['header','.controls','.metrics']},
    {match:'/apps/survival/',title:'Survival',worldId:'survival',selectors:['.app-title','.topHint']},
    {match:'/apps/world-sharabass/',title:'Мир Шарабас',worldId:'world-sharabass',selectors:['.app-title','.topHint']},
    {match:'/apps/dark-void-scene/',title:'Dark Void Navigator',worldId:'dark-void-scene',selectors:[]}
  ];
  const cfg=configs.find(c=>path.startsWith(c.match))||{title:'World',worldId:'',selectors:[]};
  const svg=paths=>`<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
  const icons={
    menu:svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
    worlds:svg('<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.4 2.2 3.5 4.9 3.5 8S14.4 17.8 12 20M12 4c-2.4 2.2-3.5 4.9-3.5 8S9.6 17.8 12 20"/>'),
    settings:svg('<circle cx="12" cy="12" r="3"/><path d="M19 13.5v-3l-2-.7-.7-1.7.9-1.9-2.1-2.1-1.9.9-1.7-.7L10.5 2h-3l-.7 2.3-1.7.7-1.9-.9-2.1 2.1.9 1.9-.7 1.7-2 .7v3l2 .7.7 1.7-.9 1.9 2.1 2.1 1.9-.9 1.7.7.7 2.3h3l.7-2.3 1.7-.7 1.9.9 2.1-2.1-.9-1.9.7-1.7z" transform="translate(1.5 0) scale(.82)"/>'),
    info:svg('<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 7h.01"/>'),
    close:svg('<path d="M6 6l12 12M18 6L6 18"/>')
  };
  const root=document.createElement('div'); root.id='goldenUiShell';
  root.innerHTML=`<nav id="goldenToolbar" aria-label="Игровое меню">
    <button data-golden-tab="menu" aria-label="Меню">${icons.menu}</button>
    <button data-golden-tab="worlds" aria-label="Миры">${icons.worlds}</button>
    <button data-golden-tab="settings" aria-label="Настройки">${icons.settings}</button>
    <button data-golden-tab="info" aria-label="Информация">${icons.info}</button>
  </nav><section id="goldenDrawer" aria-hidden="true">
    <header><strong id="goldenDrawerTitle">${cfg.title}</strong><button id="goldenDrawerClose" aria-label="Закрыть">${icons.close}</button></header>
    <div class="goldenTab" data-tab="menu"><div id="goldenPackedPanels"></div></div>
    <div class="goldenTab" data-tab="worlds"><div class="goldenWorldMode"><button class="active" data-world-view="newspaper">Газета миров</button><button data-world-view="connections">Связи миров</button></div><div id="goldenWorldList">Загрузка миров…</div><div id="goldenConnections"></div></div>
    <div class="goldenTab" data-tab="settings"><button id="goldenFullscreen" class="goldenAction">Полный экран</button><button id="goldenMinimalUi" class="goldenAction" aria-pressed="false">Минимальный HUD</button></div>
    <div class="goldenTab" data-tab="info"><div id="goldenLore"><p>Загрузка истории мира…</p></div><details id="goldenTechnicalInfo"><summary>Технически</summary><p>Quality Gate: active</p></details></div>
  </section>`;
  document.body.appendChild(root);
  const drawer=root.querySelector('#goldenDrawer'),title=root.querySelector('#goldenDrawerTitle'),packed=root.querySelector('#goldenPackedPanels');
  let active='menu',inventory=[];
  function emitDrawer(open){document.documentElement.classList.toggle('golden-drawer-open',open);dispatchEvent(new CustomEvent('goldendrawerchange',{detail:{open,tab:active}}));}
  function select(tab){if(drawer.classList.contains('open')&&active===tab){close();return;} active=tab; title.textContent=tab==='worlds'?'Миры':tab==='settings'?'Настройки':tab==='info'?'Информация':cfg.title; for(const el of root.querySelectorAll('.goldenTab'))el.hidden=el.dataset.tab!==tab; drawer.classList.add('open');drawer.setAttribute('aria-hidden','false');emitDrawer(true);}
  function close(){drawer.classList.remove('open');drawer.setAttribute('aria-hidden','true');emitDrawer(false);}
  for(const b of root.querySelectorAll('[data-golden-tab]')){b.addEventListener('pointerdown',e=>e.stopPropagation());b.addEventListener('click',e=>{e.stopPropagation();select(b.dataset.goldenTab);});}
  const closeButton=root.querySelector('#goldenDrawerClose');
  closeButton.addEventListener('pointerdown',e=>e.stopPropagation());
  closeButton.addEventListener('pointerup',e=>{e.stopPropagation();if(e.pointerType==='touch'||e.pointerType==='pen')close();});
  closeButton.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();close();});
  drawer.addEventListener('pointerdown',e=>e.stopPropagation());
  addEventListener('keydown',e=>{if(e.code==='Escape')close()});
  for(const selector of cfg.selectors){for(const node of [...document.querySelectorAll(selector)]){if(root.contains(node))continue;node.dataset.goldenPacked='true';packed.appendChild(node);}}
  if(!packed.children.length){const p=document.createElement('p');p.textContent='Дополнительных системных панелей нет.';packed.appendChild(p);}

  function fallbackInventory(registry){
    const local=Object.entries(registry.apps||{}).filter(([,m])=>m?.worldMenu?.show).map(([id,m])=>({id,title:m.title||id,url:`/apps/${id}/`,status:m.status||'unknown',kind:m.kind||'game',external:false,available:true,worldMenu:m.worldMenu}));
    const external=(registry.externalWorlds||[]).filter(x=>x?.worldMenu?.show!==false).map(x=>({...x,external:true,available:true}));
    return [...local,...external];
  }
  async function loadInventory(){
    try{const r=await fetch('/api/apps?all=1',{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);const j=await r.json();if(!Array.isArray(j.inventory))throw new Error('inventory missing');return j.inventory;}
    catch(apiError){console.warn('[GOLDEN WORLDS] API fallback',apiError);const r=await fetch('/shared/world-catalog-fallback.json',{cache:'no-store'});if(!r.ok)throw apiError;const j=await r.json();return Array.isArray(j.inventory)?j.inventory:[];}
  }
  function menuWorlds(){return inventory.filter(x=>x?.worldMenu?.show&&x.url&&['game','navigator','hub','experiment','experience'].includes(x.kind||'game'));}
  function mediaFor(card,item){const box=document.createElement('div');box.className='goldenPaperMedia';const src=item.worldMenu?.previewVideo;if(!src){box.classList.add('no-video');return box;}const v=document.createElement('video');v.muted=true;v.loop=true;v.playsInline=true;v.preload='none';v.dataset.src=src;v.setAttribute('aria-label',`Видео-превью ${item.title}`);v.addEventListener('error',()=>{v.remove();box.classList.add('no-video');},{once:true});box.appendChild(v);return box;}
  function activateLazyVideos(host){const videos=[...host.querySelectorAll('video[data-src]')];const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;if(!('IntersectionObserver'in window)){for(const v of videos){v.src=v.dataset.src;if(!reduced)v.play().catch(()=>{});}return;}const io=new IntersectionObserver(entries=>{for(const e of entries){const v=e.target;if(e.isIntersecting){if(!v.src)v.src=v.dataset.src;if(!reduced)v.play().catch(()=>{});}else v.pause();}},{root:drawer,threshold:.2});videos.forEach(v=>io.observe(v));}
  function renderNewspaper(){const host=root.querySelector('#goldenWorldList');host.replaceChildren();const worlds=menuWorlds();for(const item of worlds){const m=item.worldMenu||{};const card=document.createElement('article');card.className='goldenPaperCard';card.dataset.worldId=item.id;card.appendChild(mediaFor(card,item));const body=document.createElement('div');body.className='goldenPaperBody';const kicker=document.createElement('div');kicker.className='goldenKicker';kicker.textContent=item.external?'ЖИВОЙ ВНЕШНИЙ МИР':item.status==='certified'?'ПРОВЕРЕННЫЙ МИР':'МИР В КАТАЛОГЕ';const h=document.createElement('h3');h.className='goldenHeadline';h.textContent=m.headline||item.title;const story=document.createElement('p');story.className='goldenPaperStory';story.textContent=m.lore||item.description||'У этого мира скоро появится история.';const status=document.createElement('div');status.className='goldenWorldStatus';status.textContent=`${item.title} · ${item.status||'unknown'}`;const a=document.createElement('a');a.className='goldenWorldLink';a.href=item.url;a.textContent='Войти в мир →';body.append(kicker,h,story,status,a);card.append(body);host.append(card);}if(!worlds.length)host.textContent='Пока нет миров для газеты.';activateLazyVideos(host);}
  function findById(id){return inventory.find(x=>x.id===id||x.worldMenu?.familyId===id);}
  function bridgeStory(a,b){if(!a||!b)return 'Выбери два мира.';if(a.id===b.id)return 'Выбери два разных мира — тогда между ними появится мост.';const direct=(a.worldMenu?.connections||[]).find(x=>x.targetId===b.id||x.targetId===b.worldMenu?.familyId);if(direct?.story)return direct.story;const reverse=(b.worldMenu?.connections||[]).find(x=>x.targetId===a.id||x.targetId===a.worldMenu?.familyId);if(reverse?.story)return reverse.story;return `Между «${a.title}» и «${b.title}» появилась дверь. Герои могут пройти через неё, но каждый мир сохраняет свои правила и свою историю.`;}
  function renderConnections(){const host=root.querySelector('#goldenConnections');host.replaceChildren();const worlds=menuWorlds();const intro=document.createElement('p');intro.textContent='Связь — это мост между историями. Ничего не смешивается навсегда без подтверждения.';const picker=document.createElement('div');picker.className='goldenBridgePicker';const aSel=document.createElement('select'),bSel=document.createElement('select');for(const [i,w] of worlds.entries()){for(const sel of [aSel,bSel]){const o=document.createElement('option');o.value=w.id;o.textContent=w.title;sel.appendChild(o);}if(i===1)bSel.value=w.id;}picker.append(aSel,bSel);const story=document.createElement('div');story.className='goldenBridgeStory';const update=()=>{story.textContent=bridgeStory(findById(aSel.value),findById(bSel.value));};aSel.addEventListener('change',update);bSel.addEventListener('change',update);host.append(intro,picker,story);const list=document.createElement('div');list.className='goldenBridgeList';for(const w of worlds){for(const c of w.worldMenu?.connections||[]){const t=findById(c.targetId);if(!t)continue;const card=document.createElement('div');card.className='goldenBridgeCard';const strong=document.createElement('strong');strong.textContent=`${w.title} → ${t.title}`;const p=document.createElement('div');p.textContent=c.story;card.append(strong,p);list.append(card);}}host.append(list);update();}
  function renderInfo(){const host=root.querySelector('#goldenLore');const current=findById(cfg.worldId);host.replaceChildren();const h=document.createElement('h3');h.textContent='История этого мира';const lore=document.createElement('p');lore.textContent=current?.worldMenu?.lore||'Этот мир уже живёт на сервере. Его простая история ещё дописывается.';const hist=document.createElement('div');hist.className='goldenLoreHistory';hist.textContent=current?.worldMenu?.history||'Мир появился, чтобы стать частью общей истории IMPROVE WORLD.';host.append(h,lore,hist);}
  async function bootWorlds(){try{inventory=await loadInventory();renderNewspaper();renderConnections();renderInfo();}catch(e){console.error('[GOLDEN WORLDS]',e);root.querySelector('#goldenWorldList').textContent='Каталог временно недоступен, но текущий мир продолжает работать.';renderInfo();}}
  for(const b of root.querySelectorAll('[data-world-view]'))b.addEventListener('click',()=>{const connections=b.dataset.worldView==='connections';root.querySelector('[data-tab="worlds"]').classList.toggle('goldenConnectionsOpen',connections);for(const x of root.querySelectorAll('[data-world-view]'))x.classList.toggle('active',x===b);});
  root.querySelector('#goldenFullscreen').addEventListener('click',async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen?.();else await document.exitFullscreen?.();}catch{}});
  root.querySelector('#goldenMinimalUi').addEventListener('click',e=>{const on=!document.documentElement.classList.contains('golden-minimal-ui');document.documentElement.classList.toggle('golden-minimal-ui',on);e.currentTarget.setAttribute('aria-pressed',String(on));});
  bootWorlds();
  window.GoldenUIShell={open:select,close,root,packed,config:cfg,getInventory:()=>inventory.slice()};
})();
