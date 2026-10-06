/* World Emergence: touch/desktop macro placement board. No framework or GPU required. */
(function () {
  'use strict';

  const KINDS = [
    ['city','🏙️','Город'],['forest','🌲','Природа'],['river','🌊','Река'],
    ['mountains','⛰️','Горы'],['volcano','🌋','Вулкан'],['village','🏡','Поселение'],
    ['dragon','🐉','Дракон'],['ruins','🏛️','Руины'],['desert','🏜️','Пустыня'],
    ['ocean','🌅','Море'],['snow','❄️','Снег']
  ];
  const META = Object.fromEntries(KINDS.map(([kind, emoji, name]) => [kind,{emoji,name}]));
  const RANGE = 88;
  const coord = n => Math.round(n * 10) / 10;

  function mount({ getState, getPlayer, onPlace, onGrow, onOpen } = {}) {
    if (typeof getState !== 'function' || typeof onPlace !== 'function') throw new TypeError('WorldEmergenceBoard requires state and placement callbacks');
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.id = 'vwWorldBoardOpen';
    toggle.textContent = '🧩 Соедини две вещи'; toggle.setAttribute('aria-haspopup','dialog');
    toggle.setAttribute('aria-expanded','false');
    const backdrop = document.createElement('div');
    backdrop.id = 'vwWorldBoardBackdrop'; backdrop.hidden = true;
    backdrop.innerHTML = '<section class="we-sheet" role="dialog" aria-modal="true" aria-label="Конструктор миров">' +
      '<header class="we-head"><div><strong>Создай невозможный мир</strong><small>Перетащи две большие вещи рядом и увидишь, что родится между ними</small></div><button type="button" class="we-close" aria-label="Закрыть конструктор">✕</button></header>' +
      '<div class="we-palette" role="group" aria-label="Выбери большую вещь"></div>' +
      '<div class="we-instruction" aria-live="polite">Выбери большую вещь и коснись карты — или перетащи её сюда.</div>' +
      '<div class="we-map" role="group" aria-label="Карта мира. Нажми для размещения выбранной вещи" tabindex="0">' +
      '<svg class="we-links" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"></svg>' +
      '<div class="we-map-objects"></div><div class="we-player" title="Твоя позиция">● <span>ты</span></div>' +
      '<div class="we-north">СЕВЕР ↑</div></div>' +
      '<div class="we-story" role="status" aria-live="polite">Поставь две большие вещи: например, город и природу.</div>' +
      '<footer class="we-foot"><div class="we-progress">Развитие: <strong>0/5</strong><div class="we-progressbar"><span></span></div></div>' +
      '<button type="button" class="we-grow" disabled>✨ Следующий этап</button></footer>' +
      '<div class="we-hint">Два игрока могут развивать один мир вместе. Всё сохраняется на сервере.</div>' +
      '</section><div class="we-ghost" aria-hidden="true"></div>';
    document.body.append(toggle, backdrop);
    const close = backdrop.querySelector('.we-close');
    const palette = backdrop.querySelector('.we-palette');
    const map = backdrop.querySelector('.we-map');
    const mapObjects = backdrop.querySelector('.we-map-objects');
    const lines = backdrop.querySelector('.we-links');
    const story = backdrop.querySelector('.we-story');
    const instruction = backdrop.querySelector('.we-instruction');
    const progress = backdrop.querySelector('.we-progress');
    const grow = backdrop.querySelector('.we-grow');
    const ghost = backdrop.querySelector('.we-ghost');
    const playerMarker = backdrop.querySelector('.we-player');
    let opened=false, selected=null, dragging=null, busy=false, state=getState()||null;
    let origin={x:0,z:0}, boardRange=RANGE, lastFeatures=new Set();

    const pixel = (x,z) => ({x:50+(x-origin.x)/boardRange*50, y:50+(z-origin.z)/boardRange*50});
    const point = (clientX,clientY) => {
      const r=map.getBoundingClientRect();
      if(!r.width||!r.height || clientX<r.left||clientX>r.right||clientY<r.top||clientY>r.bottom) return null;
      return {x:coord(origin.x+(clientX-r.left)/r.width*boardRange*2-boardRange),
        z:coord(origin.z+(clientY-r.top)/r.height*boardRange*2-boardRange)};
    };
    const emojiFor = kind => META[kind]?.emoji || '🌍';
    const labelFor = kind => META[kind]?.name || kind;
    function tell(message){ instruction.textContent = message; }
    function choose(kind){
      selected=kind;
      for(const button of palette.querySelectorAll('[data-kind]')) {
        const active=button.dataset.kind===kind;
        button.classList.toggle('is-selected',active);
        button.setAttribute('aria-pressed',String(active));
      }
      tell('Выбрано: '+labelFor(kind)+'. Перетащи на карту или коснись места.');
    }
    function redraw(){
      const current=state||{}, entities=current.entities||[], relations=current.relations||[], features=current.features||[];
      const positions=Object.fromEntries(entities.map(e=>[e.id,e]));
      const me=getPlayer?.()||{x:origin.x,z:origin.z};
      const p=pixel(Number(me.x)||0,Number(me.z)||0);
      playerMarker.style.left=p.x+'%'; playerMarker.style.top=p.y+'%';
      lines.replaceChildren();
      for(const relation of relations){
        const a=positions[relation.a],b=positions[relation.b]; if(!a||!b)continue;
        const ap=pixel(a.x,a.z),bp=pixel(b.x,b.z);
        const line=document.createElementNS('http://www.w3.org/2000/svg','line');
        line.setAttribute('x1',ap.x*10);line.setAttribute('y1',ap.y*10);
        line.setAttribute('x2',bp.x*10);line.setAttribute('y2',bp.y*10);
        line.setAttribute('stroke','#ffd58b');line.setAttribute('stroke-width','9');
        line.setAttribute('stroke-linecap','round');line.setAttribute('stroke-dasharray','16 12');
        lines.appendChild(line);
      }
      mapObjects.replaceChildren();
      for(const f of features){
        const p=pixel(f.x,f.z);if(p.x<0||p.x>100||p.y<0||p.y>100)continue;
        const dot=document.createElement('div');dot.className='we-detail';dot.style.left=p.x+'%';dot.style.top=p.y+'%';
        dot.title=f.label||f.kind;dot.textContent=String(f.stage||'✦');mapObjects.appendChild(dot);
      }
      for(const e of entities){
        const p=pixel(e.x,e.z); if(p.x < -10||p.x>110||p.y < -10||p.y>110)continue;
        const el=document.createElement('button');el.type='button';el.className='we-entity';
        el.dataset.id=e.id;el.dataset.kind=e.type;el.style.left=p.x+'%';el.style.top=p.y+'%';
        el.innerHTML='<span aria-hidden="true">'+emojiFor(e.type)+'</span><small></small>';
        el.querySelector('small').textContent=e.label||labelFor(e.type);
        el.title='Перетащи, чтобы переместить '+labelFor(e.type);
        el.addEventListener('pointerdown',event=>{
          if(busy||event.button>0)return;
          event.preventDefault();event.stopPropagation();
          dragging={kind:e.type,id:e.id,pointerId:event.pointerId};
          ghost.textContent=emojiFor(e.type);ghost.hidden=false;
          ghost.style.left=event.clientX+'px';ghost.style.top=event.clientY+'px';
          tell('Перетащи '+labelFor(e.type)+' в новое место.');
        });
        mapObjects.appendChild(el);
      }
      const stage=Number(current.growthStage)||0,max=Number(current.maxGrowthStage)||5;
      progress.querySelector('strong').textContent=stage+'/'+max;
      progress.querySelector('span').style.width=Math.min(100,stage/max*100)+'%';
      grow.disabled=busy||!relations.length||stage>=max;
      const latest=features.at(-1), mainRelation=relations.at(-1);
      story.textContent=mainRelation ?
        (mainRelation.summary+' '+(latest?'Новая деталь: '+latest.label.replaceAll('_',' ')+'.':'')) :
        (entities.length===1?'Теперь поставь вторую вещь рядом с '+labelFor(entities[0].type)+'.':
        'Поставь две большие вещи: например, город и природу.');
    }
    function setState(next) {
      const before=lastFeatures;
      state=next||null;
      lastFeatures=new Set((state?.features||[]).map(f=>f.id));
      redraw();
      const added=(state?.features||[]).filter(f=>!before.has(f.id));
      if(opened&&added.length&&before.size) {
        const newest=added.at(-1);
        tell('✨ Родилось: '+newest.label.replaceAll('_',' ')+'. Что изменится дальше?');
        story.classList.remove('we-flash');void story.offsetWidth;story.classList.add('we-flash');
      }
    }
    async function place(kind,position,id){
      if(!kind||!position||busy)return;
      busy=true;backdrop.classList.add('we-busy');tell('Размещаем '+labelFor(kind)+' и ищем связи…');
      try{await onPlace(kind,position.x,position.z,id||null);selected=null;
        for(const b of palette.querySelectorAll('[data-kind]')){b.classList.remove('is-selected');b.setAttribute('aria-pressed','false');}
        tell('Готово! Посмотри, как вещи меняют друг друга. Добавь третью.');
      }catch(error){tell('Не удалось поставить: '+String(error?.message||'Сервер недоступен').slice(0,130));}
      finally{busy=false;backdrop.classList.remove('we-busy');redraw();}
    }
    for(const [kind,emoji,name] of KINDS){
      const button=document.createElement('button');button.type='button';
      button.dataset.kind=kind;button.className='we-palette-item';button.innerHTML='<span aria-hidden="true">'+emoji+'</span><small></small>';
      button.querySelector('small').textContent=name;
      button.setAttribute('aria-label','Выбрать '+name);button.setAttribute('aria-pressed','false');
      button.addEventListener('click',()=>choose(kind));
      button.addEventListener('pointerdown',event=>{
        if(busy||event.button>0)return;
        choose(kind);dragging={kind,id:null,pointerId:event.pointerId};
        ghost.textContent=emoji;ghost.hidden=false;
        ghost.style.left=event.clientX+'px';ghost.style.top=event.clientY+'px';
      });
      palette.appendChild(button);
    }
    function recenter(){const p=getPlayer?.()||{x:0,z:0};origin={x:Number(p.x)||0,z:Number(p.z)||0};redraw();}
    function open(){
      if(opened)return;opened=true;backdrop.hidden=false;toggle.setAttribute('aria-expanded','true');
      document.exitPointerLock?.();recenter();onOpen?.();close.focus();
    }
    function hide(){
      opened=false;backdrop.hidden=true;toggle.setAttribute('aria-expanded','false');
      ghost.hidden=true;dragging=null;toggle.focus();
    }
    toggle.addEventListener('click',open);
    close.addEventListener('click',hide);
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)hide();});
    document.addEventListener('keydown',event=>{if(opened&&event.key==='Escape')hide();});
    map.addEventListener('pointerup',event=>{
      if(!opened||busy||dragging||!selected)return;
      const at=point(event.clientX,event.clientY);
      if(at)void place(selected,at);
    });
    map.addEventListener('keydown',event=>{
      if(busy||!selected||!['Enter',' '].includes(event.key))return;
      event.preventDefault();void place(selected,{x:origin.x,z:origin.z-20});
    });
    addEventListener('pointermove',event=>{
      if(!opened||!dragging||event.pointerId!==dragging.pointerId)return;
      ghost.style.left=event.clientX+'px';ghost.style.top=event.clientY+'px';
    });
    addEventListener('pointerup',event=>{
      if(!opened||!dragging||event.pointerId!==dragging.pointerId)return;
      const item=dragging;dragging=null;ghost.hidden=true;
      const at=point(event.clientX,event.clientY);
      if(at)void place(item.kind,at,item.id);
    });
    addEventListener('pointercancel',()=>{dragging=null;ghost.hidden=true;});
    grow.addEventListener('click',async()=>{
      if(busy||grow.disabled)return;busy=true;grow.disabled=true;
      try{await onGrow?.();}catch(error){tell(String(error?.message||error));}
      finally{busy=false;redraw();}
    });
    const center=document.createElement('button');center.type='button';center.className='we-recenter';center.textContent='⌾ Я здесь';
    center.addEventListener('click',recenter);map.appendChild(center);
    redraw();
    return {open,hide,setState,isOpen:()=>opened,showMessage:tell,destroy:()=>{toggle.remove();backdrop.remove();}};
  }
  window.WorldEmergenceBoard={mount};
})();