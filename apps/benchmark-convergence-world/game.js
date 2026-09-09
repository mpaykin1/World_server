(() => {
  'use strict';
  const canvas = document.getElementById('world');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const goal = document.getElementById('goal');
  const signals = document.getElementById('signals');
  const eventStatus = document.getElementById('eventStatus');
  const lore = document.getElementById('lore');
  const choice = document.getElementById('choice');
  const keys = new Set();
  let w = 1, h = 1, dpr = 1, last = performance.now(), started = false, choiceMade = '';
  const player = { x: 0, y: 0, r: 10, speed: 155 };
  const camera = { x: 0, y: 0 };
  const joystick = { x: 0, y: 0, pointer: null };
  const collected = new Set();
  const landmarks = [
    { id:'voxel', x:360, y:0, label:'Первый Куб', icon:'◇', event:'impact', color:'#8ee6ff' },
    { id:'wind', x:-340, y:120, label:'Башня Ветра', icon:'↟', event:'tornado', color:'#e2f1f7' },
    { id:'water', x:20, y:380, label:'Стена Воды', icon:'≈', event:'wave', color:'#65cfff' },
    { id:'impact', x:330, y:310, label:'Двор Удара', icon:'✦', event:'impact', color:'#ffd49c' },
    { id:'gravity', x:-390, y:-260, label:'Тёмная Линза', icon:'●', event:'lens', color:'#cfb6ff' },
    { id:'forest', x:10, y:-400, label:'Живой Лес', icon:'♠', event:'gust', color:'#8ff2aa' },
    { id:'solar', x:405, y:-315, label:'Орбитальные Часы', icon:'⊙', event:'orbit', color:'#ffe27e' }
  ];

  function resize(){ dpr=Math.min(devicePixelRatio||1,1.5); w=innerWidth; h=innerHeight; canvas.width=Math.floor(w*dpr); canvas.height=Math.floor(h*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); }
  addEventListener('resize',resize,{passive:true}); resize();

  function hash2(x,y){ let n=Math.imul(x|0,374761393)+Math.imul(y|0,668265263); n=(n^(n>>>13))*1274126177; return ((n^(n>>>16))>>>0)/4294967296; }
  function worldToScreen(x,y){ return {x:x-camera.x+w/2,y:y-camera.y+h/2}; }

  function drawGrid(){
    const cell=96, minX=Math.floor((camera.x-w/2)/cell)-1,maxX=Math.ceil((camera.x+w/2)/cell)+1,minY=Math.floor((camera.y-h/2)/cell)-1,maxY=Math.ceil((camera.y+h/2)/cell)+1;
    const bg=ctx.createRadialGradient(w*.5,h*.45,20,w*.5,h*.5,Math.max(w,h)*.72);bg.addColorStop(0,'#10263a');bg.addColorStop(.55,'#07111f');bg.addColorStop(1,'#02050b');ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    for(let gy=minY;gy<=maxY;gy++)for(let gx=minX;gx<=maxX;gx++){
      const s=worldToScreen(gx*cell,gy*cell),r=hash2(gx,gy);ctx.strokeStyle=`rgba(115,190,220,${.035+r*.035})`;ctx.lineWidth=1;ctx.strokeRect(s.x,s.y,cell,cell);
      if(r>.76){ctx.fillStyle=`rgba(${80+Math.floor(r*80)},${130+Math.floor(r*80)},210,${.08+r*.08})`;ctx.fillRect(s.x+18+r*30,s.y+20+(1-r)*35,2+r*3,2+r*3);}
    }
  }

  function drawLandmark(lm,now){
    const s=worldToScreen(lm.x,lm.y),d=Math.hypot(player.x-lm.x,player.y-lm.y),active=collected.has(lm.id);
    if(s.x<-120||s.x>w+120||s.y<-120||s.y>h+120)return;
    ctx.save();ctx.translate(s.x,s.y);const pulse=1+Math.sin(now*.003+lm.x)*.08;ctx.globalAlpha=active?.35:1;ctx.strokeStyle=lm.color;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,(22+(d<90?8:0))*pulse,0,Math.PI*2);ctx.stroke();ctx.fillStyle=lm.color;ctx.font='700 30px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(active?'✓':lm.icon,0,0);ctx.font='11px system-ui';ctx.fillStyle='#e7f5ff';ctx.fillText(lm.label,0,46);ctx.restore();
  }

  function drawPlayer(now){const s=worldToScreen(player.x,player.y);ctx.save();ctx.translate(s.x,s.y);const r=player.r+Math.sin(now*.006)*1.5;const g=ctx.createRadialGradient(0,0,1,0,0,r*2.5);g.addColorStop(0,'#fff');g.addColorStop(.28,'#a5eeff');g.addColorStop(1,'rgba(70,195,255,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r*2.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#dff9ff';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.restore();}

  function update(dt){
    let dx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystick.x;
    let dy=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+joystick.y;
    const len=Math.hypot(dx,dy);if(len>1){dx/=len;dy/=len;}player.x+=dx*player.speed*dt;player.y+=dy*player.speed*dt;
    camera.x+=(player.x-camera.x)*Math.min(1,dt*5.5);camera.y+=(player.y-camera.y)*Math.min(1,dt*5.5);
    for(const lm of landmarks){if(!collected.has(lm.id)&&Math.hypot(player.x-lm.x,player.y-lm.y)<52){collected.add(lm.id);WorldCapabilities?.trigger(lm.event,{power:.9,duration:5200});WorldCapabilities?.burst(w/2,h/2,lm.id==='impact'?'debris':'spark',28,1);eventStatus.textContent=`Сигнал: ${lm.label}`; updateGoal();}}
  }

  function updateGoal(){goal.textContent=`Сигналы: ${collected.size} / ${landmarks.length}`;signals.textContent=landmarks.map(x=>collected.has(x.id)?'●':'○').join(' ');if(collected.size===landmarks.length&&!choiceMade){choice.style.display='flex';goal.textContent='Все сигналы собраны. Выбери судьбу Схождения.';}}

  function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;if(started)update(dt);drawGrid();for(const lm of landmarks)drawLandmark(lm,now);drawPlayer(now);}
  requestAnimationFrame(frame);

  addEventListener('keydown',e=>{keys.add(e.code);if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();if(e.code==='Space')pulse();});addEventListener('keyup',e=>keys.delete(e.code));
  function pulse(){WorldCapabilities?.trigger('impact',{x:w/2,y:h/2,power:.65,duration:1800});WorldCapabilities?.burst(w/2,h/2,'spark',22,.8);}
  canvas.addEventListener('pointerdown',e=>{if(started&&e.pointerType==='mouse')pulse();});document.getElementById('pulse').addEventListener('click',pulse);
  document.getElementById('enter').addEventListener('click',()=>{lore.style.display='none';started=true;WorldCapabilities?.trigger('orbit',{power:.7,duration:4200});});
  choice.addEventListener('click',e=>{const button=e.target.closest('button');if(!button)return;choiceMade=button.dataset.choice;choice.style.display='none';if(choiceMade==='open'){eventStatus.textContent='Схождение открыто: законы миров смешиваются';WorldCapabilities?.trigger('lens',{power:1.4,duration:12000});goal.textContent='Ты открыл Схождение. Что теперь ответит из глубины?';}else{eventStatus.textContent='Границы стабилизированы';WorldCapabilities?.trigger('orbit',{power:1,duration:9000});goal.textContent='Границы удержаны. Но один восьмой сигнал всё ещё слышен.';}});

  const stick=document.getElementById('stick'),knob=document.getElementById('knob');
  function setStick(e){const r=stick.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let x=(e.clientX-cx)/(r.width*.36),y=(e.clientY-cy)/(r.height*.36),l=Math.hypot(x,y);if(l>1){x/=l;y/=l;}joystick.x=x;joystick.y=y;knob.style.transform=`translate(${x*34}px,${y*34}px)`;}
  stick.addEventListener('pointerdown',e=>{joystick.pointer=e.pointerId;stick.setPointerCapture(e.pointerId);setStick(e);});stick.addEventListener('pointermove',e=>{if(joystick.pointer===e.pointerId)setStick(e);});function clearStick(e){if(joystick.pointer!==e.pointerId)return;joystick.pointer=null;joystick.x=joystick.y=0;knob.style.transform='';}stick.addEventListener('pointerup',clearStick);stick.addEventListener('pointercancel',clearStick);
  updateGoal();
})();
